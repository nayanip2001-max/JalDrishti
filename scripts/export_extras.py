"""Drill-down assets for the dashboard, added to an event's existing web export.

Run after export_web.py:  export_extras.py <event> <flood result dir>
Adds to web/public/data/<event>/ and its manifest.json:
  * per pass: radar values + class per 100 m pixel (ev3), flood-probability histogram, NISAR
    acquisition metadata (granule, orbit direction, polarisations)
  * static per event: terrain / water history / land cover / district / population lookups (anc),
    cropland and population overlays, simplified district and road vectors
  * model card, sourced timeline events and daily rainfall
Nothing here re-runs detection: every value is read from the processed results.
"""
import sys, csv, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
import rasterio, requests, geopandas as gpd
from rasterio.warp import Resampling
from PIL import Image
from nisarflood.webgrid import WebGrid, enc, save_sar
from nisarflood.stack import scenes, load
from nisarflood.events import EVENTS

AOI, SRC = sys.argv[1], Path(sys.argv[2])
STATIC_ONLY = "--static-only" in sys.argv  # rebuild lookups/overlays/cards without re-reading the radar
web = Path(f"web/public/data/{AOI}")
anc_dir = Path(f"data/processed/ancillary/{AOI}")
mpath = web / "manifest.json"
m = json.loads(mpath.read_text())
G = WebGrid(AOI)
ev = EVENTS[AOI]
for sub in ("ev", "anc", "impact"):
    (web / sub).mkdir(exist_ok=True)
rd = lambda n: rasterio.open(anc_dir / f"{n}.tif").read(1)

WORLDCOVER = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up", 60: "Bare / sparse",
              70: "Snow and ice", 80: "Permanent water", 90: "Herbaceous wetland", 95: "Mangroves", 100: "Moss and lichen"}
SCALE = {"hh_db": [-30, 5], "hv_db": [-35, 0], "hand_m": [0, 60], "slope_deg": [0, 45], "jrc_pct": [0, 100],
         "pop_log10_per_km2": [0, 4.5]}

# ---- NISAR acquisition metadata, from the fetch manifests -------------------------------------------
granules = {}
for f in Path(f"data/processed/gcov/{AOI}").glob("manifest_T*.csv"):
    for r in csv.DictReader(open(f)):
        granules[(int(r["track"]), r["date"])] = r["granule"]
POLS = {"DHDH": ["HH", "HV"], "QPDH": ["HH", "HV", "VH", "VV"]}
NATIVE = {"DHDH": "10 m (multilooked 2×2 to 20 m)", "QPDH": "20 m"}

# ---- per pass ----------------------------------------------------------------------------------------
by_key = {(s["track"], s["date"]): s for s in scenes(AOI)}
px_km2 = abs(G.transform.a * G.transform.e) / 1e6
for sc in ([] if STATIC_ONLY else m["scenes"]):
    g = granules.get((sc["track"], sc["date"]))
    tok = g.split("_") if g else []
    # NISAR_L2_PR_GCOV_<cycle>_<track>_<A|D>_<frame>_...
    sc["obs"] = {"granule": g, "direction": {"A": "Ascending", "D": "Descending"}.get(tok[6]) if g else None,
                 "frame": int(tok[7]) if g else None, "polarisations": POLS.get(sc.get("mode") or "", ["HH", "HV"]),
                 "native_resolution": NATIVE.get(sc.get("mode") or "", "—"), "product": "NISAR L2 GCOV (provisional v1), frequency A",
                 "quantity": "RTC γ⁰ (terrain-flattened backscatter), dB", "processing": "20 m grid, 5×5 Lee filter",
                 "asf_url": f"https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList={g}" if g else None}
    if sc["kind"] != "post":
        continue
    with rasterio.open(SRC / f"{sc['id']}.tif") as r:
        L = {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
    cls = L["class"]
    valid = cls > 0
    counts, _ = np.histogram(L["p_flood"][valid], bins=20, range=(0, 1))
    conf = np.isin(cls, (3, 5)).sum(); poss = np.isin(cls, (4, 6)).sum()
    sc["prob_hist"] = {"bins": 20, "km2": [round(float(c * px_km2), 1) for c in counts],
                       "confident_share": round(float(conf / max(conf + poss, 1)), 3)}
    rad = load(by_key[(sc["track"], sc["date"])], AOI)
    f = 4
    ev3 = np.stack([enc(G.warp(rad["HHHH"], Resampling.average, factor=f), *SCALE["hh_db"]),
                    enc(G.warp(rad["HVHV"], Resampling.average, factor=f), *SCALE["hv_db"]),
                    (G.warp(cls.astype(np.uint8), Resampling.nearest, nodata=0, factor=f) * 32).astype(np.uint8)], -1)
    Image.fromarray(ev3, "RGB").save(web / "ev" / f"{sc['id']}_3.png", optimize=True)
    sc["ev3"] = f"ev/{sc['id']}_3.png"
    print("pass", sc["id"], flush=True)

# ---- reference passes: the before/after "before" image uses every reference pass of the flood passes --
for tr in ({sc["track"] for sc in m["scenes"] if sc["kind"] == "post"} if not STATIC_ONLY else []):
    ref_dates = next(sc["refs"] for sc in m["scenes"] if sc["kind"] == "post" and sc["track"] == tr)
    stack = [load(by_key[(tr, d)], AOI, bands=("HHHH",))["HHHH"] for d in ref_dates]
    save_sar(G, np.nanmedian(np.stack(stack), 0), web / "sar" / f"T{tr:03d}_ref.webp")
    m["refs"][str(tr)] = {"sar": f"sar/T{tr:03d}_ref.webp", "dates": ref_dates}
    print("reference", tr, ref_dates, flush=True)

# ---- static lookups (100 m) ----------------------------------------------------------------------------
f = 4
hand, slope, jrc, wc, dist = rd("hand"), rd("slope"), rd("jrc_occurrence"), rd("worldcover"), rd("districts")
anc1 = np.stack([enc(G.warp(hand, Resampling.average, factor=f), *SCALE["hand_m"]),
                 enc(G.warp(slope, Resampling.average, factor=f), *SCALE["slope_deg"]),
                 enc(G.warp(jrc, Resampling.average, factor=f), *SCALE["jrc_pct"])], -1)
with rasterio.open(anc_dir / "pop_wp2025.tif") as p:
    pop = G.warp(p.read(1).astype("float32"), Resampling.average, factor=f, src_transform=p.transform, src_crs=p.crs)
    # WorldPop is a 3 arc-second grid: true cell area shrinks with latitude (≈0.0077 km² at 27°N).
    lat = np.radians((p.bounds.bottom + p.bounds.top) / 2)
    wp_cell_km2 = (abs(p.transform.e) * 111.32) * (abs(p.transform.a) * 111.32 * np.cos(lat))
density = np.nan_to_num(pop) / wp_cell_km2
anc2 = np.stack([G.warp(wc, Resampling.nearest, nodata=0, factor=f), G.warp(dist, Resampling.nearest, nodata=0, factor=f),
                 enc(np.log10(1 + density), *SCALE["pop_log10_per_km2"])], -1).astype(np.uint8)
Image.fromarray(anc1, "RGB").save(web / "anc" / "anc_1.png", optimize=True)
Image.fromarray(anc2, "RGB").save(web / "anc" / "anc_2.png", optimize=True)

# ---- impact overlays ----------------------------------------------------------------------------------
crop = G.warp(wc, Resampling.nearest, nodata=0, factor=2) == 40
rgba = np.zeros(crop.shape + (4,), np.uint8); rgba[crop] = (132, 204, 22, 120)
Image.fromarray(rgba, "RGBA").save(web / "impact" / "cropland.webp", "WEBP", lossless=True, method=6)
d = np.log10(1 + density) / SCALE["pop_log10_per_km2"][1]
ramp = np.array([[49, 46, 129], [124, 58, 237], [219, 39, 119], [251, 146, 60], [254, 240, 138]], float)
idx = np.clip(d * (len(ramp) - 1), 0, len(ramp) - 1.001)
lo = np.floor(idx).astype(int); t = (idx - lo)[..., None]
col = ramp[lo] * (1 - t) + ramp[lo + 1] * t
rgba = np.zeros(d.shape + (4,), np.uint8); rgba[..., :3] = col.astype(np.uint8)
rgba[..., 3] = (np.clip((d - 0.25) / 0.6, 0, 1) * 210).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(web / "impact" / "population.webp", "WEBP", quality=75, alpha_quality=70, method=6)

# ---- vectors --------------------------------------------------------------------------------------------
dg = gpd.read_file(anc_dir / "districts.geojson")
dg["geometry"] = dg.geometry.simplify(0.002, preserve_topology=True)
dg[["id", "shapeName", "geometry"]].rename(columns={"shapeName": "name"}).to_file(web / "districts.geojson", driver="GeoJSON")
rg = gpd.read_file(anc_dir / "roads_osm.geojson")
rg = rg[rg["kind"].isin(["motorway", "trunk", "primary", "secondary", "railway"])].copy()
rg["geometry"] = rg.geometry.simplify(0.0004)
rg[["kind", "name", "geometry"]].to_file(web / "roads.geojson", driver="GeoJSON")
m["anc"] = {"files": ["anc/anc_1.png", "anc/anc_2.png"], "scale": SCALE, "worldcover": WORLDCOVER,
            "districts": [{"id": int(r.id), "name": r.shapeName, "bbox": [round(v, 4) for v in r.geometry.bounds],
                           "center": [round(r.geometry.centroid.x, 4), round(r.geometry.centroid.y, 4)]}
                          for r in gpd.read_file(anc_dir / "districts.geojson").itertuples()]}
m["impact_layers"] = {"cropland": "impact/cropland.webp", "population": "impact/population.webp",
                      "districts": "districts.geojson", "roads": "roads.geojson"}
m["class_scale"] = 32  # ev3 blue channel = class code × 32

# ---- model card -----------------------------------------------------------------------------------------
card = json.loads(Path("outputs/eval/" + ("lgbm_final_rel02.json" if AOI == "assam" else "lgbm_adapt_th.json")).read_text())
FEATURES = {
    "hh_rel_p50": "HH backscatter relative to the scene median (dB): dark compared with this scene's typical land",
    "hh_rel_p10": "HH backscatter relative to the scene's darkest 10% (dB): how water-like, scene-normalised",
    "hv_rel_p50": "HV cross-pol backscatter relative to the scene median (dB): vegetation volume vs smooth water",
    "hh_minus_hv": "HH − HV (dB): polarisation ratio; separates smooth water, vegetation and urban scattering",
    "d_hh": "HH change from the pre-flood reference median (dB): strong drop = new open water",
    "d_hv": "HV change from the pre-flood reference median (dB)",
    "d_hh_m7": "HH change averaged over 7×7 pixels (140 m): spatially coherent change, not speckle",
    "d_hh_m15": "HH change averaged over 15×15 pixels (300 m): neighbourhood context",
    "hh_s7": "HH texture: standard deviation in a 7×7 window (water is smooth, land is rough)",
    "hand": "Height Above Nearest Drainage (m), ASF GLO-30 HAND: low ground floods first",
    "slope": "Terrain slope (°) from Copernicus GLO-30",
    "jrc": "JRC Global Surface Water occurrence 1984–2021 (%): how often this place was water historically",
    "worldcover": "ESA WorldCover 2021 land-cover class (categorical)",
}
m["model"] = {
    "name": "JalDrishti hybrid", "learner": "LightGBM gradient-boosted trees (binary: open water vs not)",
    "trees": card["rounds"], "params": {k: card["params"][k] for k in ("learning_rate", "num_leaves", "min_data_in_leaf",
                                                                         "feature_fraction", "bagging_fraction", "lambda_l2")},
    "trained_on": card["train"], "spatial_cv_iou": [round(c, 3) for c in card["cv_iou"]],
    "features": [{"name": k, "gain": card["gain_importance"][k], "description": FEATURES[k]} for k in card["features"]],
    "rule": "flood water = P(water now) > 0.5, OR (HH < −15 dB and HAND < 10 m) as a physics rescue (rescued pixels get p ≥ 0.51); "
            "new flood = water now × (1 − water in the pre-flood reference passes), outside JRC permanent water",
    "veg_rule": "flooded vegetation = HH rises > 3σ above no-change and more than HV, HV stable, under trees/grass/wetland (not cropland)",
    "tiers": {"confident": "p > 0.8", "possible": "0.5 < p ≤ 0.8", "uncertain": "0.35 < p ≤ 0.5"},
    "physics_terms": "Per-pixel log-odds from the scene-adaptive water/land Gaussian mixture (water-like now, dry before) and "
                     "terrain priors (HAND bands after Nobre et al. 2011, slope); shown in the pixel panel.",
}

# ---- timeline events and rainfall -----------------------------------------------------------------------
m["event"]["timeline"] = ev.get("timeline", [])
w0, w1 = ev["window"]
lon0, lat0, lon1, lat1 = ev["bounds"]
lats = np.linspace(lat0 + 0.1, lat1 - 0.1, 3); lons = np.linspace(lon0 + 0.1, lon1 - 0.1, 3)
r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=120, headers={"User-Agent": "JalDrishti/0.1"},
                 params={"latitude": ",".join(f"{a:.3f}" for a in lats for _ in lons),
                         "longitude": ",".join(f"{b:.3f}" for _ in lats for b in lons),
                         "start_date": w0, "end_date": w1, "daily": "precipitation_sum", "timezone": "UTC"})
r.raise_for_status()
js = r.json() if isinstance(r.json(), list) else [r.json()]
vals = np.array([[np.nan if v is None else v for v in x["daily"]["precipitation_sum"]] for x in js], float)
m["rainfall"] = {"days": js[0]["daily"]["time"], "mm": [None if np.isnan(v) else round(float(v), 1) for v in np.nanmean(vals, 0)],
                 "source": "ERA5 reanalysis (Copernicus/ECMWF) via Open-Meteo archive, mean of a 3×3 point grid over the area",
                 "note": "NASA GPM IMERG will replace this once the GES DISC archive is authorised for the project's Earthdata account"}

mpath.write_text(json.dumps(m, indent=1))
print("manifest updated:", AOI)
