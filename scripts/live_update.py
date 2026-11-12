"""Live NISAR watcher: find new passes over a live event, map them, record end-to-end latency.

Usage: live_update.py <event> [--pack data/live/<event>] [--max 4] [--check-only]

* Finds NISAR GCOV passes on the event's tracks after its last pre-flood date (ASF search).
  Science products (PR) are preferred; the low-latency Urgent Response product (UR) is used
  until the science product exists, then the pass is re-mapped from the science product.
* A pass is mapped once per granule: web/public/data/<event>/live.json is the processing history.
* Mapping uses the reference pack (build_refpack.py), so it runs without the full data folder.
* Latency is measured from NASA's own timestamps: acquisition (granule start time) and
  availability (CMR insert time), then our detection and map-ready times. Nothing is estimated.
Earthdata login: ~/.netrc locally, or EARTHDATA_USERNAME / EARTHDATA_PASSWORD (GitHub secret) in CI.
"""
import os, sys, json, argparse, tempfile, traceback, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio, requests

from nisarflood.events import EVENTS

ap = argparse.ArgumentParser()
ap.add_argument("event"); ap.add_argument("--pack"); ap.add_argument("--max", type=int, default=4)
ap.add_argument("--check-only", action="store_true", help="query and report, do not download or map")
ap.add_argument("--seed", action="store_true", help="record passes already mapped by the batch pipeline (backfill), then stop")
a = ap.parse_args()
AOI, ev = a.event, EVENTS[a.event]
PACK = Path(a.pack or f"data/live/{AOI}")
web = Path(f"web/public/data/{AOI}")
live_path = web / "live.json"
ISO = "%Y-%m-%dT%H:%M:%SZ"
now = lambda: dt.datetime.now(dt.timezone.utc).strftime(ISO)
parse = lambda s: dt.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=dt.timezone.utc)
hours = lambda t0, t1: round((parse(t1) - parse(t0)).total_seconds() / 3600, 2) if t0 and t1 else None

live = json.loads(live_path.read_text(encoding="utf-8")) if live_path.exists() else {"event": AOI, "passes": []}
# Mapped passes are never redone; a pass that failed three times is left for a human to look at.
done = {p["granule"] for p in live["passes"] if p["status"] == "Flood map generated" or p.get("attempts", 1) >= 3}
attempts = {p["granule"]: p.get("attempts", 1) for p in live["passes"]}
checked = now()

# ---- 1. what has NISAR observed since the flood season began? ---------------------------------------------
import asf_search as asf
from shapely.geometry import box
start = (dt.date.fromisoformat(ev["last_pre"]) + dt.timedelta(days=1)).isoformat()
end = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime("%Y-%m-%d")
res = asf.search(dataset=asf.DATASET.NISAR, processingLevel="GCOV", intersectsWith=box(*ev["bounds"]).wkt,
                 start=start, end=end, maxResults=500)
from nisarflood.gcov import best_products
cands, every = best_products([g.properties for g in res], set(ev["tracks"]))


# ---- 2. when did each product become public? (NASA CMR insert time) -------------------------------------
def cmr_insert_times():
    out = {}
    w, s, e, n = ev["bounds"]
    for coll in ("NISAR_UR_L2", "NISAR_L2_GCOV_V1", "NISAR_L2_GCOV_PROVISIONAL_V1"):
        try:
            r = requests.get("https://cmr.earthdata.nasa.gov/search/granules.umm_json", timeout=60,
                             params={"short_name": coll, "bounding_box": f"{w},{s},{e},{n}", "page_size": 500,
                                     "temporal": f"{start}T00:00:00Z,{end}T00:00:00Z"})
            for it in r.json().get("items", []):
                ur = it["umm"].get("GranuleUR", "")
                ins = [d["Date"] for d in it["umm"].get("ProviderDates", []) if d["Type"] == "Insert"]
                out[ur] = (ins[0] if ins else it["meta"].get("revision-date"))[:19] + "Z"
        except Exception as exc:  # latency is reported as unknown rather than guessed
            print("CMR query failed for", coll, exc)
    return out


cmr = cmr_insert_times()
def available(scene):
    for ur, t in cmr.items():
        if ur.startswith(scene) or scene.startswith(ur):
            return t, "NASA CMR insert time"
    return None, None


if a.seed:  # passes the batch pipeline already mapped: real NASA timestamps, our processing marked as backfill
    ids = {s["id"] for s in json.loads((web / "manifest.json").read_text(encoding="utf-8"))["scenes"] if s["kind"] == "post"}
    for (tr, d), p in cands.items():
        if f"T{tr:03d}_{d}" not in ids or p["sceneName"] in done:
            continue
        av, src = available(p["sceneName"])
        first = min((x for x in (available(s)[0] for s in every[(tr, d)]) if x), default=av)
        acq = p["startTime"][:19] + "Z"
        live["passes"].append({"granule": p["sceneName"], "track": tr, "date": d, "product": p["sceneName"].split("_")[2],
                               "mode": p["sceneName"].split("_")[9], "acquired": acq, "available": av, "available_source": src,
                               "first_available": first, "detected": checked, "status": "Flood map generated", "backfill": True,
                               "latency_h": {"acquired_to_available": hours(acq, av), "acquired_to_first_product": hours(acq, first)}})
        done.add(p["sceneName"])
    live["passes"] = sorted(live["passes"], key=lambda q: q["acquired"])

new = [p for k, p in sorted(cands.items(), key=lambda kv: kv[0][1]) if p["sceneName"] not in done]
latest = max(cands.values(), key=lambda p: p["startTime"], default=None)
live.update({"event": AOI, "checked_at": checked, "tracks": list(ev["tracks"]),
             "latest_observation": latest and {"granule": latest["sceneName"], "track": latest["pathNumber"],
                                               "acquired": latest["startTime"][:19] + "Z",
                                               "product": latest["sceneName"].split("_")[2]},
             "new_this_check": len(new)})
print(f"{len(cands)} passes since {start}; {len(new)} not yet mapped")
for (tr, d), p in sorted(cands.items(), key=lambda kv: kv[0][1]):
    t_av = available(p["sceneName"])[0]
    print(f"  {d} T{tr:03d} {p['sceneName'].split('_')[2]} acquired {p['startTime'][:16]} available {t_av} "
          f"({hours(p['startTime'][:19] + 'Z', t_av)} h){'' if p['sceneName'] not in done else ' mapped'}")

if a.check_only or a.seed or not new:
    live["status"] = "No new observation" if not new else "New scene detected"
    live_path.write_text(json.dumps(live, indent=1), encoding="utf-8")
    sys.exit(0)

# ---- 3. map each new pass ----------------------------------------------------------------------------------
import earthaccess, lightgbm as lgb
from nisarflood.aoi import grid, utm_bounds
from nisarflood.gcov import subset
from nisarflood.stack import load
from nisarflood.detect import detect, CLASSES
from nisarflood.exposure import Exposure
from nisarflood.webgrid import WebGrid, save_sar
from nisarflood.webexport import pass_images, pass_extras, obs_meta

earthaccess.login(strategy="environment" if os.environ.get("EARTHDATA_USERNAME") else "netrc")
meta = json.loads((PACK / "refpack.json").read_text())
model = lgb.Booster(model_file=str(PACK / "model.txt"))
rd = lambda n: rasterio.open(PACK / "anc" / AOI / f"{n}.tif").read(1)
anc = {"hand": rd("hand"), "slope": rd("slope"), "jrc": rd("jrc_occurrence"), "worldcover": rd("worldcover")}
exposure = Exposure(AOI, root=PACK / "anc")
G = WebGrid(AOI)
_, transform, _, _ = grid(AOI)
px_km2 = abs(transform.a * transform.e) / 1e6
mpath = web / "manifest.json"
manifest = json.loads(mpath.read_text(encoding="utf-8"))
for sub in ("cls", "prob", "sar", "ev"):
    (web / sub).mkdir(parents=True, exist_ok=True)
tmp = Path(tempfile.mkdtemp())

for p in new[: a.max]:
    track, date, gran = p["pathNumber"], p["startTime"][:10], p["sceneName"]
    mode = gran.split("_")[9]
    avail, avail_src = available(gran)
    first = min((x for x in (available(s)[0] for s in every[(track, date)]) if x), default=avail)
    rec = {"granule": gran, "track": track, "date": date, "product": gran.split("_")[2], "mode": mode,
           "acquired": p["startTime"][:19] + "Z", "available": avail, "available_source": avail_src,
           "first_available": first,  # earliest public product of this pass (Urgent Response if one was made)
           "detected": checked, "status": "New scene detected", "attempts": attempts.get(gran, 0) + 1}
    try:
        if str(track) not in meta["tracks"]:
            raise RuntimeError(f"no reference pack for track {track}")
        rec["processing_start"] = now()
        tif = tmp / f"T{track:03d}_{date}.tif"
        subset(p["url"], utm_bounds(AOI), tif)
        post = load({"path": tif}, AOI)
        with rasterio.open(PACK / f"ref_T{track:03d}.tif") as r:
            ref = {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
        out = detect(post, [{"HHHH": ref["HHHH"], "HVHV": ref["HVHV"]}], anc, model, ref["p_before"])
        name = f"T{track:03d}_{date}"
        sc = {"id": name, "track": track, "date": date, "kind": "post", "refs": meta["tracks"][str(track)]["refs"],
              "mode": mode, "method": "v2-lgbm",
              "areas_km2": {CLASSES[c]: round(float((out["class"] == c).sum() * px_km2), 1) for c in CLASSES if c},
              "exposure": exposure.compute(out["class"]), **pass_images(G, web, name, out),
              "sar": f"sar/{name}.webp", "obs": obs_meta(gran, mode)}
        save_sar(G, post["HHHH"], web / "sar" / f"{name}.webp")
        pass_extras(G, web, sc, out, post, px_km2)
        rec["processing_end"] = now()
        rec.update(status="Flood map generated", flood_km2=round(sc["areas_km2"]["flood (open water)"]
                                                               + sc["areas_km2"]["flooded vegetation"], 1),
                   latency_h={"acquired_to_available": hours(rec["acquired"], avail),
                              "acquired_to_first_product": hours(rec["acquired"], first),
                              "available_to_detected": hours(avail, checked),
                              "processing": hours(rec["processing_start"], rec["processing_end"]),
                              "acquired_to_map": hours(rec["acquired"], rec["processing_end"])})
        sc["live"] = {k: rec[k] for k in ("acquired", "available", "processing_end", "latency_h", "product")}
        manifest["scenes"] = sorted([s for s in manifest["scenes"] if s["id"] != name] + [sc],
                                    key=lambda s: (s["track"], s["date"], s["kind"]))
        print("mapped", name, rec["product"], rec["flood_km2"], "km2", rec["latency_h"], flush=True)
    except Exception as exc:
        traceback.print_exc()
        rec.update(status="Processing failed", error=f"{type(exc).__name__}: {exc}"[:300], processing_end=now())
    live["passes"] = [q for q in live["passes"] if q["granule"] != gran] + [rec]

live["status"] = "Flood map generated" if any(q["detected"] == checked and q["status"] == "Flood map generated"
                                              for q in live["passes"]) else "Processing failed"
live["passes"] = sorted(live["passes"], key=lambda q: q["acquired"])
mpath.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
live_path.write_text(json.dumps(live, indent=1), encoding="utf-8")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
        fh.write(f"new={sum(q['detected'] == checked and q['status'] == 'Flood map generated' for q in live['passes'])}\n")
