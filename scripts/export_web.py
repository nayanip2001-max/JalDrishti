"""Export detection results as static web assets (Web Mercator images + manifest.json).

Images are warped onto an EPSG:3857 grid so MapLibre can place them by their four
corners without distortion. Evidence PNGs carry log-odds in RGB (alpha stays 255 so
canvas readback is exact).
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, calculate_default_transform, transform_bounds
from PIL import Image
from nisarflood.aoi import grid
from nisarflood.stack import scenes, load
from nisarflood.detect import CLASSES
from nisarflood.events import EVENTS

AOI = sys.argv[1] if len(sys.argv) > 1 else "assam"
src_dir = Path(sys.argv[2] if len(sys.argv) > 2 else f"data/processed/flood/{AOI}")
web = Path(f"web/public/data/{AOI}")
for sub in ("cls", "prob", "sar", "ev"):
    (web / sub).mkdir(parents=True, exist_ok=True)

# Confident classes are near-opaque; "possible"/"uncertain" stay visible but recede, so the map reads
# confident flood first without hiding uncertainty.
COLORS = {0: (0, 0, 0, 0), 1: (0, 0, 0, 0), 2: (30, 64, 175, 170), 3: (34, 211, 238, 240),
          4: (245, 158, 11, 105), 5: (167, 139, 250, 240), 6: (217, 70, 239, 95), 7: (148, 163, 184, 70)}

crs, transform, w, h = grid(AOI)
west, south, east, north = rasterio.transform.array_bounds(h, w, transform)
dst_crs = "EPSG:3857"
dt, dw, dh = calculate_default_transform(crs, dst_crs, w, h, west, south, east, north, resolution=25)
db = rasterio.transform.array_bounds(dh, dw, dt)
lon0, lat0, lon1, lat1 = transform_bounds(dst_crs, "EPSG:4326", *db)
corners = [[lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]]


def warp(a, resampling, nodata=np.nan, factor=1):
    out = np.full((dh // factor, dw // factor), nodata, dtype=a.dtype)
    t = dt * rasterio.Affine.scale(factor)
    reproject(a, out, src_transform=transform, src_crs=crs, dst_transform=t, dst_crs=dst_crs,
              src_nodata=nodata, dst_nodata=nodata, resampling=resampling)
    return out


def enc(a, lo, hi):
    return np.clip(np.round((np.nan_to_num(a, nan=lo) - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)


def sar_img(hh_db, path):
    g = warp(hh_db, Resampling.average, factor=2)  # 50 m: speckle does not compress, and this is a backdrop
    v = enc(g, -24, 0)
    alpha = np.where(np.isfinite(g), 255, 0).astype(np.uint8)  # outside the swath stays transparent
    Image.fromarray(np.stack([v, v, v, alpha], -1), "RGBA").save(path, "WEBP", quality=72, alpha_quality=50, method=6)


summary = json.loads((src_dir / "summary.json").read_text())
ev = EVENTS[AOI]
EVENT = {"title": ev["title"], "subtitle": ev["subtitle"], "country": ev["country"], "context": ev["context"],
         "caveat": ev.get("caveat"),
         "window": list(ev["window"]), "marker": ev["marker"],
         "phases": [{"name": n, "from": a, "to": b, "color": c} for n, a, b, c in ev["phases"]]}
manifest = {"aoi": {"id": AOI, "corners": corners, "bounds": [lon0, lat0, lon1, lat1]}, "event": EVENT,
            "classes": {str(k): {"name": v, "color": "#%02x%02x%02x" % COLORS[k][:3]} for k, v in CLASSES.items()},
            "evidence_scale": {"l_now": [-8, 8], "l_before": [-8, 8], "l_terrain": [-12, 4], "d_hh": [-15, 15]},
            "scenes": [], "refs": {}}

for rec in summary:
    name = f"T{rec['track']:03d}_{rec['date']}" + ("_nullTest" if rec["kind"] == "null_test" else "")
    with rasterio.open(src_dir / f"{name}.tif") as r:
        L = {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
    cls = warp(L["class"].astype(np.uint8), Resampling.nearest, nodata=0)
    rgba = np.zeros(cls.shape + (4,), np.uint8)
    for k, c in COLORS.items():
        rgba[cls == k] = c
    Image.fromarray(rgba, "RGBA").save(web / "cls" / f"{name}.webp", "WEBP", lossless=True, method=6)

    p = warp(L["p_flood"], Resampling.average, factor=2)
    pr = np.zeros(p.shape + (4,), np.uint8)
    pv = np.nan_to_num(p)
    pr[..., 0] = enc(pv, 0, 1); pr[..., 1] = (80 + 120 * pv).astype(np.uint8); pr[..., 2] = 255
    pr[..., 3] = (np.clip((pv - 0.15) / 0.85, 0, 1) * 230).astype(np.uint8)
    Image.fromarray(pr, "RGBA").save(web / "prob" / f"{name}.webp", "WEBP", quality=70, alpha_quality=60, method=6)

    f = 4  # evidence at 100 m is plenty for a click-to-explain card (and it only loads on click)
    ev1 = np.stack([enc(warp(L["l_now"], Resampling.average, factor=f), -8, 8),
                    enc(warp(L["l_before"], Resampling.average, factor=f), -8, 8),
                    enc(warp(L["l_hand"] + L["l_slope"], Resampling.average, factor=f), -12, 4)], -1)
    ev2 = np.stack([enc(warp(L["p_open"], Resampling.average, factor=f), 0, 1),
                    enc(warp(L["p_veg"], Resampling.average, factor=f), 0, 1),
                    enc(warp(L["d_hh"], Resampling.average, factor=f), -15, 15)], -1)
    Image.fromarray(ev1, "RGB").save(web / "ev" / f"{name}_1.png", optimize=True)
    Image.fromarray(ev2, "RGB").save(web / "ev" / f"{name}_2.png", optimize=True)
    manifest["scenes"].append({"id": name, **{k: rec[k] for k in ("track", "date", "kind", "refs")},
                               "mode": rec.get("mode"), "areas_km2": rec["areas_km2"], "exposure": rec.get("exposure"),
                               "method": rec.get("method"),
                               "cls": f"cls/{name}.webp", "prob": f"prob/{name}.webp",
                               "sar": f"sar/T{rec['track']:03d}_{rec['date']}.webp",
                               "ev": [f"ev/{name}_1.png", f"ev/{name}_2.png"]})
    print("exported", name)

# SAR backdrops: every scene's HH, plus each track's pre-event reference median.
by_track = {}
for s in scenes(AOI):
    d = load(s, AOI, bands=("HHHH",))
    sar_img(d["HHHH"], web / "sar" / f"T{s['track']:03d}_{s['date']}.webp")
    by_track.setdefault(s["track"], []).append((s["date"], d["HHHH"]))
for rec in summary:
    t = rec["track"]
    if str(t) not in manifest["refs"]:
        refs = [a for dte, a in by_track[t] if dte in rec["refs"]]
        sar_img(np.nanmedian(np.stack(refs), 0), web / "sar" / f"T{t:03d}_ref.webp")
        manifest["refs"][str(t)] = {"sar": f"sar/T{t:03d}_ref.webp", "dates": rec["refs"]}

def overlap_bounds(tif):
    """lon/lat box around where either sensor mapped flood (agreement codes 2-4), central 90% of pixels."""
    with rasterio.open(tif) as r:
        rows, cols = np.nonzero(r.read(1) >= 2)
        r0, r1 = np.percentile(rows, [5, 95]); c0, c1 = np.percentile(cols, [5, 95])
        xs, ys = rasterio.transform.xy(r.transform, [r0, r1], [c0, c1])
        return list(transform_bounds(r.crs, "EPSG:4326", min(xs), min(ys), max(xs), max(ys)))


# Same-day sensor comparison (NISAR L-band vs Sentinel-1 C-band), if it was run for this event.
cmp_tif = Path(f"data/processed/flood/{AOI}_s1/agreement_2026-07-22.tif")
cmp_json = Path("outputs/eval/s1_vs_nisar.json")
if AOI == "assam" and cmp_tif.exists() and cmp_json.exists():
    (web / "compare").mkdir(exist_ok=True)
    with rasterio.open(cmp_tif) as r:
        ag = warp(r.read(1), Resampling.nearest, nodata=0)
    rgba = np.zeros(ag.shape + (4,), np.uint8)
    for k, c in {2: (34, 211, 238, 230), 3: (217, 70, 239, 240), 4: (251, 146, 60, 240)}.items():
        rgba[ag == k] = c
    Image.fromarray(rgba, "RGBA").save(web / "compare" / "agreement_2026-07-22.webp", "WEBP", lossless=True, method=6)
    c = json.loads(cmp_json.read_text())
    manifest["sensor_compare"] = {
        "date": "2026-07-22", "image": "compare/agreement_2026-07-22.webp", "nisar": c["nisar"], "s1": c["s1"],
        "scores": {t: {k: {m: v[m] for m in ("IoU", "precision", "recall")} | {"ci": v["ci95"]["IoU"]}
                       for k, v in d.items() if "IoU" in v} for t, d in c["scores"].items()},
        "cropland_km2": c["flood_by_landcover_km2"]["cropland"], "bounds": overlap_bounds(cmp_tif)}

# Held-out validation, straight from the evaluation outputs (nothing re-typed by hand).
# Each event gets rows (display name -> {fold -> scores}); "selected" marks the deployed rule.
pick = lambda v: {k: v[k] for k in ("IoU", "precision", "recall", "kappa")} | {"ci": v["ci95"]["IoU"]}
val = None
if AOI == "assam" and Path("outputs/eval/ensemble_lodo_rel02.json").exists():
    e = json.loads(Path("outputs/eval/ensemble_lodo_rel02.json").read_text())
    names = {"model OR (HH<-15 & HAND<10)": "JalDrishti hybrid (ML + physics)", "model p>0.5": "ML only (LightGBM)",
             "HH < -15 dB": "Fixed threshold −15 dB"}
    val = {"protocol": "Leave-one-date-out: trained on two NISAR/Sentinel-2 pairs, scored on the third (other date or track). "
                       "Reference: Sentinel-2 cloud-free open water. 95% CIs by spatial block bootstrap.",
           "rules": {names[k]: {f: pick(v) for f, v in e["rules"][k].items()} for k in names},
           "selected": names[e["selected"]]}
elif AOI == "thailand" and Path("outputs/eval/lgbm_adapt_th.json").exists():
    a = json.loads(Path("outputs/eval/lgbm_adapt_th.json").read_text())["test"]["thailand@112:2026-10-19:2026-10-19"]
    t = json.loads(Path("outputs/eval/lgbm_transfer_th_T112.json").read_text())["test"]["thailand@112:2026-10-19:2026-10-19"]
    f = "19 Oct T112"
    val = {"protocol": "Model trained in Assam plus ONE automatically labelled Thailand scene (7 Oct); scored on 19 Oct, "
                       "which it never saw. Reference: Sentinel-2 cloud-free open water, same day.",
           "rules": {"JalDrishti hybrid (adapted)": {f: pick(a["hybrid"])}, "ML, adapted with 1 local scene": {f: pick(a["lgbm"])},
                     "ML, Assam-only (no adaptation)": {f: pick(t["lgbm"])}, "Fixed threshold −15 dB": {f: pick(a["HH < -15 dB"])}},
           "selected": "JalDrishti hybrid (adapted)"}
if val:
    val["null_tests"] = [{"track": r["track"], "date": r["date"], "refs": r["refs"],
                          "false_flood_km2": round(r["areas_km2"]["flood (open water)"] + r["areas_km2"]["flooded vegetation"], 1),
                          "mapped_km2": round(sum(r["areas_km2"].values()))} for r in summary if r["kind"] == "null_test"]
    manifest["validation"] = val
(web / "manifest.json").write_text(json.dumps(manifest, indent=1))

# Events index for the app's event switcher (one entry per exported event).
idx_path = web.parent / "events.json"
idx = json.loads(idx_path.read_text()) if idx_path.exists() else []
peak = max((sc for sc in manifest["scenes"] if sc["kind"] == "post"), key=lambda sc: sc["areas_km2"]["flood (open water)"], default=None)
entry = {"id": AOI, "title": EVENT["title"], "subtitle": EVENT["subtitle"], "country": EVENT["country"],
         "center": [(lon0 + lon1) / 2, (lat0 + lat1) / 2],
         "peak_km2": peak and round(peak["areas_km2"]["flood (open water)"] + peak["areas_km2"]["flooded vegetation"])}
idx = [e for e in idx if e["id"] != AOI] + [entry]
order = list(EVENTS)
idx_path.write_text(json.dumps(sorted(idx, key=lambda e: order.index(e["id"])), indent=1))
print("corners", corners)
