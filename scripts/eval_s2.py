"""Score NISAR water/flood maps against Sentinel-2 open-water labels (cloud-free pixels only).

Two targets:
  water  - all open water (the S2 label as is)
  flood  - S2 water outside JRC permanent water (occurrence < 50%), i.e. flood/seasonal water
Methods compared: fixed -15 dB HH threshold, scene Otsu on HH, and our detector's layers.
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
import rasterio
from nisarflood.evaluate import evaluate, mcnemar, otsu
from nisarflood.stack import scenes, load

AOI = "assam"
PAIRS = [("2026-07-21", 40, "2026-07-22"), ("2026-08-10", 163, "2026-08-12"),
         ("2026-08-15", 40, "2026-08-15"), ("2026-08-22", 163, "2026-08-24")]
tag = sys.argv[1] if len(sys.argv) > 1 else "current"


def read(p):
    with rasterio.open(p) as r:
        return {d or "b1": r.read(i + 1) for i, d in enumerate(r.descriptions)}


anc = Path(f"data/processed/ancillary/{AOI}")
jrc = rasterio.open(anc / "jrc_occurrence.tif").read(1)
slope = rasterio.open(anc / "slope.tif").read(1)
results = {}
for s2d, track, nd in PAIRS:
    lab_p = Path(f"data/processed/labels/{AOI}/s2_{s2d}.tif")
    det_p = Path(f"data/processed/flood/{AOI}/T{track:03d}_{nd}.tif")
    if not (lab_p.exists() and det_p.exists()):
        continue
    lab = rasterio.open(lab_p).read(1)
    D = read(det_p)
    sc = [s for s in scenes(AOI) if s["track"] == track and s["date"] == nd][0]
    hh = load(sc, AOI, bands=("HHHH",))["HHHH"]

    base = (lab > 0) & np.isfinite(D["p_water_now"]) & np.isfinite(hh) & (np.nan_to_num(slope) < 10)
    ref_water = lab == 2
    preds = {
        "HH < -15 dB": hh < -15,
        "Otsu(HH)": hh < otsu(hh[np.isfinite(D["p_water_now"])]),
        "ours: p_water_now>0.5": D["p_water_now"] > 0.5,
    }
    out = {}
    for target, mask in (("water", base), ("flood", base & (np.nan_to_num(jrc) < 50))):
        out[target] = {k: evaluate(v, ref_water, mask) for k, v in preds.items()}
        out[target]["mcnemar ours vs Otsu"] = mcnemar(preds["ours: p_water_now>0.5"], preds["Otsu(HH)"], ref_water, mask)
    results[f"T{track:03d}_{nd} vs S2 {s2d}"] = out
    for target in out:
        print(f"\n{track} {nd} vs S2 {s2d} [{target}]")
        for k, v in out[target].items():
            if "IoU" in v:
                print(f"  {k:26s} IoU {v['IoU']:.3f} {v['ci95']['IoU']}  F1 {v['F1']:.3f}  P {v['precision']:.3f}  R {v['recall']:.3f}  k {v['kappa']:.3f}")
            else:
                print(f"  {k}: {v}")

out_dir = Path("outputs/eval"); out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / f"s2_{tag}.json").write_text(json.dumps(results, indent=1))
