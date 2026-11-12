"""Map any region: flood map from NISAR for an area and date you choose, or from your own radar GeoTIFFs.

A) NISAR, fetched automatically (needs a free NASA Earthdata login in ~/.netrc):
   map_region.py --name kosi --bbox 86.6 25.9 87.2 26.5 --date 2026-08-20
   Finds the NISAR pass on that date (±1 day) that covers most of the box, uses earlier passes of the
   same track as the "before" reference, and runs the same pipeline as the validated events.

B) Your own data (manual upload):
   map_region.py --name mine --upload after_2026-08-20.tif --refs before_2026-07-27.tif before_2026-08-08.tif
   GeoTIFFs with HH and HV backscatter (linear power or dB; bands named HHHH/HVHV, or band 1 = HH, band 2 = HV),
   any projected CRS, pixel size up to 30 m. Dates are read from the file names (YYYY-MM-DD or YYYYMMDD).
   Every file is validated first; incompatible data stops with a clear error.

Outputs in outputs/regions/<name>/: flood GeoTIFF (class + probability), confident-flood GeoJSON, quicklook PNG,
summary.json (areas, inputs, provenance). Maps for new regions are NOT validated there: treat them accordingly.
"""
import sys, re, json, math, argparse, subprocess, datetime as dt
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import numpy as np
import rasterio

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--name", required=True, help="short name for the region (letters, digits, _)")
ap.add_argument("--bbox", nargs=4, type=float, metavar=("W", "S", "E", "N"))
ap.add_argument("--date", help="flood date YYYY-MM-DD (mode A)")
ap.add_argument("--before-days", type=int, default=75, help="how far back to look for reference passes (mode A)")
ap.add_argument("--upload", help="your post-event GeoTIFF (mode B)")
ap.add_argument("--refs", nargs="*", default=[], help="your pre-event GeoTIFFs (mode B), at least 2")
ap.add_argument("--model", default=str(ROOT / "models/lgbm_final_rel02.txt"))
ap.add_argument("--exposure", action="store_true", help="also count people/roads inside the flood (downloads WorldPop)")
ap.add_argument("--iso3", default="IND", help="country code for --exposure (WorldPop, district boundaries)")
a = ap.parse_args()

NAME = a.name
if not re.fullmatch(r"[a-z0-9_]{2,40}", NAME):
    sys.exit("--name: use 2-40 lowercase letters, digits or _")
REG = ROOT / "data/regions"; REG.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "outputs/regions" / NAME; OUT.mkdir(parents=True, exist_ok=True)
GC = ROOT / "data/processed/gcov" / NAME
PY = sys.executable


def fail(msg):
    sys.exit(f"\n[map_region] cannot continue: {msg}\n")


def utm_epsg(lon, lat):
    return (32600 if lat >= 0 else 32700) + int((lon + 180) // 6) + 1


def check_bbox(w, s, e, n):
    if not (-180 <= w < e <= 180 and -80 <= s < n <= 80):
        fail(f"bbox {w, s, e, n} is not W S E N in degrees")
    km2 = (e - w) * 111.32 * math.cos(math.radians((s + n) / 2)) * (n - s) * 110.57
    if km2 < 25 or km2 > 12_000:
        fail(f"area is {km2:,.0f} km²; use between 25 and 12,000 km² (split larger areas)")
    return km2


def write_region(bounds, tracks, refs, post, source):
    w, s, e, n = bounds
    first = min(refs)
    region = {"title": f"{NAME} · {post}", "subtitle": f"User region ({source})", "country": "", "iso3": a.iso3,
              "bounds": list(bounds), "epsg": utm_epsg((w + e) / 2, (s + n) / 2), "tracks": list(tracks),
              "fetch": [first, (dt.date.fromisoformat(post) + dt.timedelta(days=1)).isoformat()],
              "last_pre": max(refs), "window": [first, post], "marker": {"date": post, "label": "Requested date"},
              "phases": [["Before", first, max(refs), "#94a3b8"], ["After", max(refs), post, "#22d3ee"]],
              "context": f"User-requested map ({source}).", "source": source}
    (REG / f"{NAME}.json").write_text(json.dumps(region, indent=1), encoding="utf-8")
    return region


def run(script, *args):
    print(f"\n[map_region] {script} {' '.join(map(str, args))}", flush=True)
    r = subprocess.run([PY, str(ROOT / "scripts" / script), *map(str, args)], cwd=ROOT)
    if r.returncode:
        fail(f"{script} failed (exit {r.returncode}); see the messages above")


# ---- A) NISAR, fetched automatically ------------------------------------------------------------------------
def from_nisar():
    if not (a.bbox and a.date):
        fail("mode A needs --bbox W S E N and --date YYYY-MM-DD")
    km2 = check_bbox(*a.bbox)
    import asf_search as asf
    from shapely.geometry import box, shape
    aoi = box(*a.bbox)
    d = dt.date.fromisoformat(a.date)
    res = asf.search(dataset=asf.DATASET.NISAR, processingLevel="GCOV", intersectsWith=aoi.wkt,
                     start=(d - dt.timedelta(days=a.before_days)).isoformat(), end=(d + dt.timedelta(days=2)).isoformat(),
                     maxResults=1000)
    passes = [g for g in res if g.properties["sceneName"].split("_")[2] in ("PR", "UR")]
    near = [g for g in passes if abs((dt.date.fromisoformat(g.properties["startTime"][:10]) - d).days) <= 1]
    if not near:
        dates = sorted({g.properties["startTime"][:10] for g in passes})
        fail(f"no NISAR pass over this box within ±1 day of {a.date}. Passes in the search window: {', '.join(dates) or 'none'}")
    cover = lambda g: shape(g.geometry).intersection(aoi).area / aoi.area
    post = max(near, key=cover)
    track, pdate = post.properties["pathNumber"], post.properties["startTime"][:10]
    refs = sorted({g.properties["startTime"][:10] for g in passes if g.properties["pathNumber"] == track
                   and g.properties["startTime"][:10] <= (dt.date.fromisoformat(pdate) - dt.timedelta(days=6)).isoformat()})
    print(f"[map_region] {km2:,.0f} km²; pass {pdate} track {track} covers {cover(post):.0%} of the box; references {refs}")
    if len(refs) < 2:
        fail(f"track {track} has {len(refs)} earlier pass(es) within {a.before_days} days; need 2. Try --before-days 150")
    write_region(a.bbox, [track], refs, pdate, "NISAR GCOV via ASF")
    run("fetch_gcov.py", NAME)
    return pdate


# ---- B) user files ------------------------------------------------------------------------------------------
def file_date(p):
    m = re.search(r"(20\d\d)-?(\d\d)-?(\d\d)", Path(p).name)
    if not m:
        fail(f"{p}: put the acquisition date in the file name (YYYY-MM-DD or YYYYMMDD)")
    return f"{m[1]}-{m[2]}-{m[3]}"


def validate(path):
    """Check one user GeoTIFF; return (hh, hv, profile-ish info) in linear power, or stop with a clear error."""
    p = Path(path)
    if not p.exists():
        fail(f"{p}: file not found")
    try:
        src = rasterio.open(p)
    except Exception as exc:
        fail(f"{p}: not a readable GeoTIFF ({exc})")
    with src:
        if src.crs is None:
            fail(f"{p}: no coordinate reference system; export it georeferenced")
        if src.crs.is_geographic:
            fail(f"{p}: geographic (lat/lon) CRS; reproject to a metric CRS such as UTM first")
        res = abs(src.transform.a)
        if not (1 <= res <= 30):
            fail(f"{p}: pixel size {res:.1f} m; supported 1–30 m")
        names = [d or "" for d in src.descriptions]
        if "HHHH" in names and "HVHV" in names:
            ih, iv = names.index("HHHH") + 1, names.index("HVHV") + 1
        elif src.count >= 2:
            ih, iv = 1, 2
            print(f"[map_region] {p.name}: bands not named; assuming band 1 = HH, band 2 = HV")
        else:
            fail(f"{p}: needs HH and HV backscatter (2 bands); found {src.count}")
        hh, hv = src.read(ih).astype("float32"), src.read(iv).astype("float32")
        nd = src.nodata
        for b in (hh, hv):
            if nd is not None:
                b[b == nd] = np.nan
        ok = np.isfinite(hh) & np.isfinite(hv)
        if ok.mean() < 0.05:
            fail(f"{p}: less than 5% valid pixels")
        med = np.nanmedian(hh[ok])
        if med < 0:  # dB
            if not (-40 < med < 5):
                fail(f"{p}: HH median {med:.1f} dB is outside the plausible range for backscatter")
            hh, hv = 10 ** (hh / 10), 10 ** (hv / 10)
        elif not (1e-4 < med < 5):
            fail(f"{p}: HH median {med:.3g} is not plausible linear backscatter (expected ~0.001–1)")
        return hh, hv, ok, src.crs, src.transform, src.bounds


def from_upload():
    if len(a.refs) < 2:
        fail("mode B needs --refs with at least 2 pre-event GeoTIFFs")
    from rasterio.warp import transform_bounds
    from shapely.geometry import box
    files = [(a.upload, file_date(a.upload))] + [(r, file_date(r)) for r in a.refs]
    pdate = files[0][1]
    if any(d >= pdate for _, d in files[1:]):
        fail("every reference file must be dated before the post-event file")
    GC.mkdir(parents=True, exist_ok=True)
    rows, boxes = [], []
    for path, d in files:
        hh, hv, ok, crs, tr, b = validate(path)
        boxes.append(box(*transform_bounds(crs, "EPSG:4326", *b)))
        dst = GC / f"T000_{d}_DHDH.tif"
        prof = dict(driver="GTiff", dtype="float32", count=3, width=hh.shape[1], height=hh.shape[0], crs=crs,
                    transform=tr, nodata=np.nan, compress="deflate", tiled=True)
        with rasterio.open(dst, "w", **prof) as o:
            for i, (k, v) in enumerate((("HHHH", hh), ("HVHV", hv), ("valid_frac", ok.astype("float32"))), 1):
                o.write(np.where(ok, v, np.nan) if k != "valid_frac" else v, i); o.set_band_description(i, k)
        rows.append(f"0,{d},DHDH,{dst.name},HHHH|HVHV|valid_frac,user:{Path(path).name}")
        print(f"[map_region] {Path(path).name}: valid ({ok.mean():.0%} valid pixels)")
    common = boxes[0]
    for bx in boxes[1:]:
        common = common.intersection(bx)
    if common.is_empty or common.area < 0.5 * boxes[0].area:
        fail("the reference files cover less than half of the post-event file; they must show the same area")
    bounds = tuple(round(v, 5) for v in common.bounds)
    check_bbox(*bounds)
    (GC / "manifest_T0.csv").write_text("track,date,mode,file,bands,granule\n" + "\n".join(rows) + "\n")
    write_region(bounds, [0], [d for _, d in files[1:]], pdate, "user-uploaded GeoTIFFs")
    return pdate


# ---- shared: terrain, detection, outputs ---------------------------------------------------------------------
if bool(a.upload) == bool(a.bbox):
    fail("use either --bbox/--date (NISAR) or --upload/--refs (your files)")
pdate = from_upload() if a.upload else from_nisar()
run("build_ancillary.py", NAME)
if a.exposure:
    run("build_exposure_inputs.py", NAME)
run("run_detect.py", NAME, "--model", a.model)

from rasterio.features import shapes, sieve
from rasterio.warp import transform_geom
from nisarflood.detect import CLASSES
res_dir = ROOT / "data/processed/flood" / f"{NAME}_v2"
summary = json.loads((res_dir / "summary.json").read_text())
post = [r for r in summary if r["kind"] == "post" and r["date"] == pdate]
if not post:
    fail("no flood map was produced for the requested pass")
rec = post[0]
name = f"T{rec['track']:03d}_{pdate}"
src_tif = res_dir / f"{name}.tif"
with rasterio.open(src_tif) as r:
    L = {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
    prof, crs, tr = r.profile, r.crs, r.transform
prof.update(count=2)
with rasterio.open(OUT / f"flood_{pdate}.tif", "w", **prof) as o:
    o.write(L["class"].astype("float32"), 1); o.set_band_description(1, "class (" + "; ".join(f"{k}={v}" for k, v in CLASSES.items()) + ")")
    o.write(L["p_flood"], 2); o.set_band_description(2, "flood probability 0-1")

conf = np.isin(L["class"], (3, 5)).astype("uint8")
conf = sieve(conf, 10)
feats = [{"type": "Feature", "properties": {"class": "flood (confident)", "date": pdate},
          "geometry": transform_geom(crs, "EPSG:4326", g, precision=6)}
         for g, v in shapes(conf, mask=conf.astype(bool), transform=tr) if v == 1]
(OUT / f"flood_{pdate}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))

try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    from nisarflood.webexport import COLORS
    from nisarflood.stack import scenes, load
    sc = next(s for s in scenes(NAME) if s["date"] == pdate)
    hh = load(sc, NAME, bands=("HHHH",))["HHHH"]
    rgba = np.zeros(L["class"].shape + (4,), float)
    for k, c in COLORS.items():
        rgba[L["class"] == k] = np.array(c) / 255
    fig, ax = plt.subplots(figsize=(9, 9 * hh.shape[0] / hh.shape[1]), dpi=110)
    ax.imshow(hh, cmap="gray", vmin=-25, vmax=0); ax.imshow(rgba); ax.set_axis_off()
    ax.set_title(f"JalDrishti · {NAME} · {pdate} · NISAR HH + flood (cyan) / possible (amber)", fontsize=9)
    fig.savefig(OUT / f"quicklook_{pdate}.png", bbox_inches="tight"); plt.close(fig)
except Exception as exc:
    print("[map_region] quicklook skipped:", exc)

out = {"region": NAME, "date": pdate, "track": rec["track"], "reference_dates": rec["refs"], "areas_km2": rec["areas_km2"],
       "exposure": rec.get("exposure"), "method": rec.get("method"), "source": json.loads((REG / f"{NAME}.json").read_text())["source"],
       "bbox": json.loads((REG / f"{NAME}.json").read_text())["bounds"],
       "files": sorted(p.name for p in OUT.iterdir() if p.suffix != ".zip"),
       "caveat": "Not validated for this region: accuracy was measured in Assam, Thailand and Chennai. Exposure is not damage."}
(OUT / "summary.json").write_text(json.dumps(out, indent=1))
# One zip for the dashboard's "Map a Region" step 4 (drop it on the page to see the map).
import zipfile
with zipfile.ZipFile(OUT / f"jaldrishti_{NAME}.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.iterdir()):
        if f.suffix != ".zip":
            z.write(f, f.name)
fl = rec["areas_km2"]["flood (open water)"] + rec["areas_km2"]["flooded vegetation"]
print(f"\n[map_region] done: {fl:,.1f} km² confident flood on {pdate}. Files in {OUT}")
