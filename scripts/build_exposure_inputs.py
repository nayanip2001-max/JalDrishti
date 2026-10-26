"""Exposure inputs for an AOI: WorldPop 2025 population, district polygons, OSM roads/railways.

Population stays on its native 100 m WGS84 grid (counts must be summed, never resampled
like a continuous field); districts and roads are rasterised onto the 20 m flood grid.
"""
import sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, requests, rasterio, geopandas as gpd
from rasterio.windows import from_bounds
from rasterio.features import rasterize
from shapely.geometry import box, LineString
from nisarflood.aoi import AOIS, grid
from nisarflood.ancillary import write
from nisarflood.events import EVENTS

AOI = sys.argv[1] if len(sys.argv) > 1 else "assam"
out = Path(f"data/processed/ancillary/{AOI}")
w, s, e, n = AOIS[AOI]["bounds"]
iso = EVENTS[AOI]["iso3"]
crs, transform, W, H = grid(AOI)

# 1. Population: window of the national WorldPop file (downloaded once, 770 MB).
WP = Path(f"data/raw/worldpop/{iso.lower()}_pop_2025_CN_100m_R2024B_v1.tif")  # national file; server refuses GDAL range reads
if not WP.exists():
    import subprocess
    WP.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sL", "--retry", "3", "-o", str(WP), "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
                    f"R2024B/2025/{iso}/v1/100m/constrained/{iso.lower()}_pop_2025_CN_100m_R2024B_v1.tif"], check=True)
with rasterio.open(WP) as src:
    win = from_bounds(w - 0.02, s - 0.02, e + 0.02, n + 0.02, src.transform).round_offsets().round_lengths()
    pop = src.read(1, window=win).astype("float32")
    pop[pop == src.nodata] = 0
    prof = dict(driver="GTiff", dtype="float32", count=1, width=pop.shape[1], height=pop.shape[0], crs=src.crs,
                transform=src.window_transform(win), nodata=0, compress="deflate", tiled=True)
with rasterio.open(out / "pop_wp2025.tif", "w", **prof) as dst:
    dst.write(pop, 1)
print(f"population window {pop.shape}, total {pop.sum():,.0f} people")

# 2. Districts (geoBoundaries ADM2), clipped to the AOI.
gb = f"https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/{iso}/ADM2/geoBoundaries-{iso}-ADM2_simplified.geojson"
d = gpd.read_file(gb)
d = d[d.intersects(box(w, s, e, n))][["shapeName", "geometry"]].reset_index(drop=True)
d["id"] = np.arange(1, len(d) + 1)
d.to_file(out / "districts.geojson", driver="GeoJSON")
dr = rasterize(zip(d.to_crs(crs).geometry, d["id"]), out_shape=(H, W), transform=transform, fill=0, dtype="uint8")
write(out / "districts.tif", dr, AOI, "district id (see districts.geojson)", nodata=0)
print("districts:", ", ".join(d["shapeName"]))

# 3. Major roads and railways from OpenStreetMap (Overpass API).
q = f"""[out:json][timeout:180];
(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]({s},{w},{n},{e});
 way["railway"="rail"]({s},{w},{n},{e}););
out geom;"""
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter"]
UA = {"User-Agent": "JalDrishti-NISAR-flood/0.1 (NASA Space Apps 2026 research prototype)"}
for attempt in range(6):
    url = MIRRORS[attempt % len(MIRRORS)]
    try:
        r = requests.post(url, data={"data": q}, timeout=240, headers=UA)
        r.raise_for_status()
        break
    except requests.RequestException as err:
        print(f"overpass {url}: {err}; retrying", flush=True)
        time.sleep(10 * (attempt + 1))
else:
    sys.exit("all Overpass mirrors failed")
rows = []
for el in r.json()["elements"]:
    if "geometry" in el and len(el["geometry"]) > 1:
        kind = "railway" if el["tags"].get("railway") == "rail" else el["tags"]["highway"]
        rows.append({"kind": kind, "name": el["tags"].get("name", ""),
                     "geometry": LineString([(p["lon"], p["lat"]) for p in el["geometry"]])})
roads = gpd.GeoDataFrame(rows, crs=4326)
roads.to_file(out / "roads_osm.geojson", driver="GeoJSON")
codes = {"motorway": 1, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4, "railway": 5}
rr = rasterize(((g, codes[k]) for g, k in zip(roads.to_crs(crs).geometry, roads["kind"])),
               out_shape=(H, W), transform=transform, fill=0, dtype="uint8", all_touched=True)
write(out / "roads.tif", rr, AOI, "1 trunk, 2 primary, 3 secondary, 4 tertiary, 5 railway", nodata=0)
km = roads.to_crs(crs).length.groupby(roads["kind"]).sum() / 1000
print("network km:", km.round(0).to_dict())
(out / "exposure_sources.json").write_text(json.dumps({
    "population": "WorldPop 2025 constrained 100 m (R2024B v1)", "districts": f"geoBoundaries gbOpen {iso} ADM2 (simplified)",
    "roads": "OpenStreetMap via Overpass, retrieved 2026-10-25", "cropland": "ESA WorldCover 2021 v200 class 40"}, indent=1))
