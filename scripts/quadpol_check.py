"""Quad-pol physics check (NISAR-only capability): co-pol phase difference by land cover.

Double bounce (water surface -> trunk/stem -> radar) shifts the HH-VV phase towards
180 deg and raises HH over VV; surface/volume scattering stays near 0 deg. We test the
design decision to exclude cropland from "flooded vegetation": in July, transplanted rice
in standing water should already look like double bounce.
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio
from rasterio.warp import reproject, Resampling
from nisarflood.aoi import grid
from nisarflood.stack import scenes

AOI = "assam"
crs, transform, W, H = grid(AOI)
wc = rasterio.open(f"data/processed/ancillary/{AOI}/worldcover.tif").read(1)
CLASSES = {10: "trees", 30: "grassland", 40: "cropland", 50: "built-up", 80: "open water"}


def quad(scene):
    out = {}
    with rasterio.open(scene["path"]) as src:
        names = list(src.descriptions)
        for b in ("HHHH", "VVVV", "HHVV_re", "HHVV_im", "valid_frac"):
            a = np.full((H, W), np.nan, "float32")
            reproject(rasterio.band(src, names.index(b) + 1), a, dst_transform=transform, dst_crs=crs,
                      src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.average)
            out[b] = a
    valid = (np.nan_to_num(out["valid_frac"]) > 0.99) & (out["HHHH"] > 0) & (out["VVVV"] > 0)
    phase = np.degrees(np.arctan2(out["HHVV_im"], out["HHVV_re"]))           # arg <HH VV*>
    ratio = 10 * np.log10(np.clip(out["HHHH"], 1e-6, None) / np.clip(out["VVVV"], 1e-6, None))
    return valid, np.abs(phase), ratio


qp = {s["date"]: s for s in scenes(AOI) if s["mode"] == "QPDH"}
flood = rasterio.open(f"data/processed/flood/{AOI}_v2/T163_2026-08-24.tif").read(1)
res = {}
for date in ("2026-07-07", "2026-08-24"):
    valid, aphi, ratio = quad(qp[date])
    rows = {}
    for code, name in CLASSES.items():
        m = valid & (wc == code)
        if m.sum() < 1000:
            continue
        rows[name] = {"median_abs_phase_deg": round(float(np.median(aphi[m])), 1),
                      "share_phase_gt_90": round(float((aphi[m] > 90).mean()), 3),
                      "median_HH_over_VV_dB": round(float(np.median(ratio[m])), 2), "pixels": int(m.sum())}
    if date == "2026-08-24":
        for label, cls in (("cropland, mapped flood", (3, 4)), ("cropland, not flooded", (1,))):
            m = valid & (wc == 40) & np.isin(flood, cls)
            rows[label] = {"median_abs_phase_deg": round(float(np.median(aphi[m])), 1),
                           "share_phase_gt_90": round(float((aphi[m] > 90).mean()), 3),
                           "median_HH_over_VV_dB": round(float(np.median(ratio[m])), 2), "pixels": int(m.sum())}
    res[date] = rows
    print(f"\n{date} (quad-pol, track 163)")
    print(f"  {'class':24s} {'median|phase|':>14s} {'share >90°':>11s} {'HH/VV dB':>9s}")
    for k, v in rows.items():
        print(f"  {k:24s} {v['median_abs_phase_deg']:14.1f} {v['share_phase_gt_90']:11.3f} {v['median_HH_over_VV_dB']:9.2f}")
Path("outputs/eval/quadpol_check.json").write_text(json.dumps(res, indent=1))
