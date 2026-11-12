"""Compact "reference pack" so a new pass can be mapped without the full data folder (e.g. in GitHub Actions).

Usage: build_refpack.py <event> --model models/<model>.txt

Per track it stores what detection actually uses from the pre-flood passes: the median HH and HV
(dB, Lee-filtered) and the model's P(water before) (each reference pass judged against the others,
as run_detect does). Plus the ancillary/exposure layers and the model. Mapping a pass against the
pack gives the same result as against the full reference stack (detect() only uses the median).
Output: data/live/<event>/ (zip it for a release asset).
"""
import sys, json, shutil, argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio, lightgbm as lgb
from nisarflood.aoi import grid
from nisarflood.stack import scenes, load
from nisarflood.detect import predict_water
from nisarflood.events import EVENTS

ap = argparse.ArgumentParser(); ap.add_argument("event"); ap.add_argument("--model", required=True); a = ap.parse_args()
AOI, last_pre = a.event, EVENTS[a.event]["last_pre"]
model = lgb.Booster(model_file=a.model)
anc_dir = Path(f"data/processed/ancillary/{AOI}")
out = Path(f"data/live/{AOI}"); (out / "anc" / AOI).mkdir(parents=True, exist_ok=True)
rd = lambda n: rasterio.open(anc_dir / f"{n}.tif").read(1)
anc = {"hand": rd("hand"), "slope": rd("slope"), "jrc": rd("jrc_occurrence"), "worldcover": rd("worldcover")}
crs, transform, w, h = grid(AOI)
prof = dict(driver="GTiff", dtype="float32", count=3, width=w, height=h, crs=crs, transform=transform,
            nodata=np.nan, compress="deflate", predictor=3, tiled=True)

meta = {"event": AOI, "last_pre": last_pre, "model": Path(a.model).name, "tracks": {}}
by_track = {}
for s in scenes(AOI):
    if s["date"] <= last_pre:
        by_track.setdefault(s["track"], []).append(s)
for tr, ss in sorted(by_track.items()):
    refs = [load(s, AOI) for s in ss]
    if len(refs) < 2:
        print(f"T{tr}: only {len(refs)} reference pass, skipped"); continue
    p_before = np.nanmedian(np.stack([predict_water(model, r, [o for o in refs if o is not r], anc) for r in refs]), 0)
    hh = np.nanmedian(np.stack([r["HHHH"] for r in refs]), 0)
    hv = np.nanmedian(np.stack([r["HVHV"] for r in refs]), 0)
    with rasterio.open(out / f"ref_T{tr:03d}.tif", "w", **prof) as dst:
        for i, (k, v) in enumerate((("HHHH", hh), ("HVHV", hv), ("p_before", p_before)), 1):
            dst.write(v.astype("float32"), i); dst.set_band_description(i, k)
    meta["tracks"][str(tr)] = {"refs": [s["date"] for s in ss], "granules": [s["granule"] for s in ss]}
    print(f"T{tr}: {len(refs)} reference passes", flush=True)

for n in ("hand", "slope", "jrc_occurrence", "worldcover", "districts", "roads", "pop_wp2025"):
    shutil.copy(anc_dir / f"{n}.tif", out / "anc" / AOI / f"{n}.tif")
shutil.copy(anc_dir / "districts.geojson", out / "anc" / AOI / "districts.geojson")
shutil.copy(a.model, out / "model.txt")
(out / "refpack.json").write_text(json.dumps(meta, indent=1))
print("pack:", out, sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) // 2**20, "MB")
