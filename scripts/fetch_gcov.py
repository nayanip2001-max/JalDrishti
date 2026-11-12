"""Subset NISAR GCOV scenes for one event's tracks.

Science products ('PR') are preferred. Where none exists yet, the low-latency Urgent
Response product ('UR', hours after the pass instead of days) is used and saved with a
'_UR' suffix; once the science product appears it is fetched too and takes precedence.

Usage: fetch_gcov.py <event> [comma-separated tracks]
"""
import sys, time, csv
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import asf_search as asf, earthaccess
from shapely.geometry import box
from nisarflood.aoi import AOIS, utm_bounds
from nisarflood.events import EVENTS
from nisarflood.gcov import subset, best_products

EVENT = sys.argv[1]
ev = EVENTS[EVENT]
TRACKS = {int(t) for t in sys.argv[2].split(",")} if len(sys.argv) > 2 else set(ev["tracks"])
start, end = ev["fetch"]
if end is None:  # open-ended (live) event: up to now
    import datetime as _dt; end = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=1)).strftime("%Y-%m-%d")

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
scenes, _ = best_products([g.properties for g in r], TRACKS)
log = out / f"manifest_T{tag}.csv"
new = not log.exists()
with open(log, "a", newline="") as fh:
    w = csv.writer(fh)
    if new:
        w.writerow(["track", "date", "mode", "file", "bands", "granule"])
    for (track, date), p in sorted(scenes.items()):
        mode = p["sceneName"].split("_")[9]
        ur = "_UR" if p["sceneName"].split("_")[2] == "UR" else ""
        dst = out / f"T{track:03d}_{date}_{mode}{ur}.tif"
        if dst.exists():
            continue
        t = time.time()
        part = dst.with_suffix(".part.tif")
        _, names = subset(p["url"], bounds, part)
        part.replace(dst)  # atomic: a scene file only exists once it is complete
        w.writerow([track, date, mode, dst.name, "|".join(names), p["sceneName"]]); fh.flush()
        print(f"{dst.name} {time.time()-t:.0f}s {names}", flush=True)
