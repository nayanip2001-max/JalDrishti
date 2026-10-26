"""Run flood detection for every post-event scene of each track, plus a pre-event false-alarm test.

Outputs per scene: data/processed/flood/<aoi>/T<track>_<date>.tif (bands named) and a
summary.json with class areas, so the frontend and the evaluation read the same numbers.
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
import rasterio
from nisarflood.aoi import grid
from nisarflood.stack import scenes, load
from nisarflood.detect import detect, predict_water, CLASSES
from nisarflood.exposure import Exposure
from nisarflood.events import EVENTS
import argparse, lightgbm as lgb

ap = argparse.ArgumentParser(); ap.add_argument("event", nargs="?", default="assam"); ap.add_argument("--model"); args = ap.parse_args()
model = lgb.Booster(model_file=args.model) if args.model else None
AOI = args.event
EVENT = EVENTS[AOI]["last_pre"]   # last date treated as "before the flood"
LAYERS = ["class", "p_flood", "p_open", "p_veg", "p_water_now", "p_water_before",
          "l_now", "l_before", "l_hand", "l_slope", "d_hh", "d_hv"]

anc_dir = Path(f"data/processed/ancillary/{AOI}")
def read(name):
    with rasterio.open(anc_dir / f"{name}.tif") as r:
        return r.read(1)
anc = {"hand": read("hand"), "slope": read("slope"), "jrc": read("jrc_occurrence"), "worldcover": read("worldcover")}

# v1 (physics) and v2 (hybrid) keep separate outputs so both can be compared and shown.
out = Path(f"data/processed/flood/{AOI}" + ("_v2" if model is not None else "")); out.mkdir(parents=True, exist_ok=True)
exposure = Exposure(AOI) if (anc_dir / "pop_wp2025.tif").exists() else None
crs, transform, w, h = grid(AOI)
px_km2 = abs(transform.a * transform.e) / 1e6


def save(name, res, meta):
    prof = dict(driver="GTiff", dtype="float32", count=len(LAYERS), width=w, height=h, crs=crs,
                transform=transform, nodata=np.nan, compress="deflate", predictor=3, tiled=True)
    with rasterio.open(out / f"{name}.tif", "w", **prof) as dst:
        for i, k in enumerate(LAYERS, 1):
            dst.write(res[k].astype("float32"), i)
            dst.set_band_description(i, k)
    areas = {CLASSES[c]: round(float((res["class"] == c).sum() * px_km2), 1) for c in CLASSES if c}
    rec = dict(meta, areas_km2=areas, gmm=res["gmm"])
    if exposure is not None and meta["kind"] == "post":
        rec["exposure"] = exposure.compute(res["class"])
    return rec


def ref_water(ref_scenes):
    """Median learned P(water) over reference passes, each judged against the others."""
    if model is None or len(ref_scenes) < 2:
        return None
    pb = [predict_water(model, r, [o for o in ref_scenes if o is not r], anc) for r in ref_scenes]
    return np.nanmedian(np.stack(pb), 0)


summary = []
by_track = {}
for s in scenes(AOI):
    by_track.setdefault(s["track"], []).append(s)

for track, ss in by_track.items():
    pre = [s for s in ss if s["date"] <= EVENT]
    post = [s for s in ss if s["date"] > EVENT]
    if not pre:
        print(f"T{track}: no pre-event scene yet, skipping"); continue
    cache = {s["date"]: load(s, AOI) for s in pre}
    refs = list(cache.values())
    p_before = ref_water(refs)

    # False-alarm test: latest pre-event date vs the earlier pre-event dates (no flood in between).
    if len(pre) >= 2:
        test = pre[-1]
        others = [cache[s["date"]] for s in pre[:-1]]
        pb = ref_water(others)
        res = detect(cache[test["date"]], others, anc, model if pb is not None else None, pb)
        rec = save(f"T{track:03d}_{test['date']}_nullTest", res,
                   {"track": track, "date": test["date"], "kind": "null_test", "refs": [s["date"] for s in pre[:-1]]})
        summary.append(rec); print("null test", track, test["date"], rec["areas_km2"])

    for s in post:
        res = detect(load(s, AOI), refs, anc, model if p_before is not None else None, p_before)
        rec = save(f"T{track:03d}_{s['date']}", res,
                   {"track": track, "date": s["date"], "mode": s["mode"], "kind": "post", "refs": [r["date"] for r in pre]})
        summary.append(rec); print(track, s["date"], rec["areas_km2"])

for rec in summary:
    rec["method"] = "v2-lgbm" if model is not None else "v1-physics"
(out / "summary.json").write_text(json.dumps(summary, indent=1))
