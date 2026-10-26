"""Subset NISAR GCOV scenes for one event's tracks (science 'PR' products only).

Usage: fetch_gcov.py <event> [comma-separated tracks]
"""
import sys, time, csv
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import asf_search as asf, earthaccess
from shapely.geometry import box
from nisarflood.aoi import AOIS, utm_bounds
from nisarflood.events import EVENTS
from nisarflood.gcov import subset

EVENT = sys.argv[1]
ev = EVENTS[EVENT]
TRACKS = {int(t) for t in sys.argv[2].split(",")} if len(sys.argv) > 2 else set(ev["tracks"])
start, end = ev["fetch"]

out = Path(f"data/processed/gcov/{EVENT}"); out.mkdir(parents=True, exist_ok=True)
tag = "-".join(map(str, sorted(TRACKS)))

# One fetcher per track set: an OS lock dies with its process, so a crash never leaves it stale.
lock_fh = open(out / f".lock_T{tag}", "a+")
try:
    if sys.platform == "win32":
        import msvcrt; msvcrt.locking(lock_fh.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl; fcntl.flock(lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
    sys.exit(f"another fetcher for T{tag} is running")

earthaccess.login(strategy="netrc")
bounds = utm_bounds(EVENT)
r = asf.search(dataset=asf.DATASET.NISAR, processingLevel="GCOV",
               intersectsWith=box(*AOIS[EVENT]["bounds"]).wkt, start=start, end=end, maxResults=500)
scenes = {}
for g in r:
    p = g.properties
    if "_PR_" not in p["sceneName"] or p["pathNumber"] not in TRACKS:
        continue
    key = (p["pathNumber"], p["startTime"][:10])
    if key not in scenes or p["sceneName"] > scenes[key]["sceneName"]:  # keep latest reprocessing
        scenes[key] = p
log = out / f"manifest_T{tag}.csv"
new = not log.exists()
with open(log, "a", newline="") as fh:
    w = csv.writer(fh)
    if new:
        w.writerow(["track", "date", "mode", "file", "bands", "granule"])
    for (track, date), p in sorted(scenes.items()):
        mode = p["sceneName"].split("_")[9]
        dst = out / f"T{track:03d}_{date}_{mode}.tif"
        if dst.exists():
            continue
        t = time.time()
        part = dst.with_suffix(".part.tif")
        _, names = subset(p["url"], bounds, part)
        part.replace(dst)  # atomic: a scene file only exists once it is complete
        w.writerow([track, date, mode, dst.name, "|".join(names), p["sceneName"]]); fh.flush()
        print(f"{dst.name} {time.time()-t:.0f}s {names}", flush=True)
