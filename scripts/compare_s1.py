"""Same-day sensor comparison: NISAR L-band vs Sentinel-1 C-band, same algorithm, same labels.

NISAR T040 passed 22 Jul 23:05 UTC; Sentinel-1D orbit 77 passed 23:46 UTC (41 min later).
Both run the physics detector (v1) against three matching pre-flood references, and are
scored against Sentinel-2 open water of 21 Jul. Also maps where each band sees flood the
other misses, by land cover.
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio
from nisarflood.s1 import s1_scene
from nisarflood.stack import scenes, load
from nisarflood.detect import detect
from nisarflood.evaluate import evaluate, mcnemar
from nisarflood.ancillary import write

AOI = "assam"
anc_dir = Path(f"data/processed/ancillary/{AOI}")
rd = lambda n: rasterio.open(anc_dir / f"{n}.tif").read(1)
anc = {"hand": rd("hand"), "slope": rd("slope"), "jrc": rd("jrc_occurrence"), "worldcover": rd("worldcover")}

s1_refs = [s1_scene(AOI, d, 77) for d in ("2026-06-21", "2026-06-28", "2026-07-10")]
s1_post = s1_scene(AOI, "2026-07-22", 77)
s1 = detect(s1_post, s1_refs, anc)

sc = {s["date"]: s for s in scenes(AOI) if s["track"] == 40}
ni = detect(load(sc["2026-07-22"], AOI), [load(sc[d], AOI) for d in ("2026-06-16", "2026-06-28", "2026-07-10")], anc)

out = Path(f"data/processed/flood/{AOI}_s1"); out.mkdir(parents=True, exist_ok=True)
write(out / "S1_2026-07-22_class.tif", s1["class"], AOI, "Sentinel-1 C-band classes (same detector)", nodata=0)
write(out / "S1_2026-07-22_p_flood.tif", s1["p_flood"], AOI, "Sentinel-1 flood probability")

lab = rasterio.open(f"data/processed/labels/{AOI}/s2_2026-07-21.tif").read(1)
both_valid = s1_post["valid"] & np.isfinite(ni["p_water_now"]) & np.isfinite(s1["p_water_now"])
base = both_valid & (lab > 0) & (np.nan_to_num(anc["slope"]) < 10)
ref = lab == 2
res = {}
for target, mask in (("water", base), ("flood", base & (np.nan_to_num(anc["jrc"]) < 50))):
    a, b = ni["p_water_now"] > 0.5, s1["p_water_now"] > 0.5
    res[target] = {"NISAR L-band": evaluate(a, ref, mask), "Sentinel-1 C-band": evaluate(b, ref, mask),
                   "mcnemar L vs C": mcnemar(a, b, ref, mask)}
    for k, v in res[target].items():
        if "IoU" in v:
            print(f"[{target}] {k:18s} IoU {v['IoU']:.3f} {v['ci95']['IoU']}  P {v['precision']:.3f}  R {v['recall']:.3f}")
        else:
            print(f"[{target}] {k}: {v}")

# Where does each band see flood the other does not? (flood classes 3-6 over the common footprint)
fl_n = np.isin(ni["class"], (3, 5)) & both_valid
fl_s = np.isin(s1["class"], (3, 5)) & both_valid
names = {10: "trees", 20: "shrub", 30: "grass", 40: "cropland", 50: "built-up", 60: "bare", 80: "water", 90: "wetland"}
px = 0.0004
diff = {}
for k, n in names.items():
    m = anc["worldcover"] == k
    diff[n] = {"both": round(float((fl_n & fl_s & m).sum() * px), 1), "L_only": round(float((fl_n & ~fl_s & m).sum() * px), 1),
               "C_only": round(float((~fl_n & fl_s & m).sum() * px), 1)}
print("flood km² by land cover (L-band only / C-band only / both):")
for n, v in diff.items():
    if sum(v.values()) > 0.5:
        print(f"  {n:9s} L-only {v['L_only']:7.1f}   C-only {v['C_only']:7.1f}   both {v['both']:7.1f}")
agree = np.zeros(fl_n.shape, np.uint8)
agree[both_valid] = 1
agree[fl_n & fl_s] = 2; agree[fl_n & ~fl_s] = 3; agree[~fl_n & fl_s] = 4
write(out / "agreement_2026-07-22.tif", agree, AOI, "1 neither, 2 both, 3 NISAR only, 4 S1 only", nodata=0)
Path("outputs/eval/s1_vs_nisar.json").write_text(json.dumps({"scores": res, "flood_by_landcover_km2": diff,
    "nisar": "T040 2026-07-22T23:05Z", "s1": "S1D orbit 77 2026-07-22T23:46Z"}, indent=1))
