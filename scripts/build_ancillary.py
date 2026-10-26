"""DEM, slope, HAND, JRC water occurrence and ESA WorldCover on the AOI grid."""
import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
from rasterio.warp import Resampling
from nisarflood.aoi import AOIS, grid
from nisarflood.ancillary import stac_hrefs, warp_sources, write

aoi = sys.argv[1] if len(sys.argv) > 1 else "assam"
out = Path(f"data/processed/ancillary/{aoi}"); out.mkdir(parents=True, exist_ok=True)

dem = warp_sources(stac_hrefs(aoi, "cop-dem-glo-30", "data"), aoi, Resampling.bilinear)
write(out / "dem.tif", dem, aoi, "Copernicus GLO-30 elevation (m)")
gy, gx = np.gradient(dem, 20.0)
write(out / "slope.tif", np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32"), aoi, "slope (deg)")

# ASF GLO-30 HAND tiles, 1x1 degree, named by SW corner.
w, s, e, n = AOIS[aoi]["bounds"]
tile = lambda la, lo: (f"{'N' if la >= 0 else 'S'}{abs(la):02d}_00_{'E' if lo >= 0 else 'W'}{abs(lo):03d}_00")
hand_urls = [f"https://glo-30-hand.s3.amazonaws.com/v1/2021/Copernicus_DSM_COG_10_{tile(la, lo)}_HAND.tif"
             for la in range(math.floor(s), math.ceil(n)) for lo in range(math.floor(w), math.ceil(e))]
write(out / "hand.tif", warp_sources(hand_urls, aoi, Resampling.bilinear), aoi, "height above nearest drainage (m)")

occ = warp_sources(stac_hrefs(aoi, "jrc-gsw", "occurrence"), aoi, Resampling.bilinear, dtype="float32")
write(out / "jrc_occurrence.tif", occ, aoi, "JRC GSW water occurrence 1984-2021 (%)")

wc = warp_sources(stac_hrefs(aoi, "esa-worldcover", "map", query={"esa_worldcover:product_version": {"eq": "2.0.0"}}),
                  aoi, Resampling.mode, dtype="uint8", nodata=0)
write(out / "worldcover.tif", wc, aoi, "ESA WorldCover 2021 class", nodata=0)

for f in sorted(out.glob("*.tif")):
    import rasterio
    with rasterio.open(f) as r:
        a = r.read(1).astype("float32"); a[a == (r.nodata if r.nodata is not None and not np.isnan(r.nodata) else -9e9)] = np.nan
        print(f.name, r.shape, "valid%", round(np.isfinite(a).mean()*100, 1), "p5/50/95", np.nanpercentile(a, [5, 50, 95]).round(1))
