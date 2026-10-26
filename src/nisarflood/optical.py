"""Independent open-water reference from Sentinel-2 L2A on cloud-free pixels.

Optical sensors cannot see water under canopy, so these labels only score open water.
"""
import numpy as np
from rasterio.warp import Resampling

from .ancillary import stac_hrefs, warp_sources, PC
from .aoi import grid

CLEAR_SCL = (4, 5, 6)  # vegetation, bare soil, water; drops cloud, shadow, cirrus, unclassified


def s2_items(aoi, date, max_cloud=80):
    import pystac_client, planetary_computer
    from .ancillary import _lonlat_bbox
    crs, transform, w, h = grid(aoi)
    cat = pystac_client.Client.open(PC, modifier=planetary_computer.sign_inplace)
    return list(cat.search(collections=["sentinel-2-l2a"], bbox=_lonlat_bbox(crs, transform, w, h),
                           datetime=date, query={"eo:cloud_cover": {"lt": max_cloud}}).item_collection())


def water_labels(aoi, date, margin=0.1):
    """uint8 labels on the AOI grid: 0 = no label, 1 = land, 2 = water. Plus MNDWI and clear mask."""
    items = s2_items(aoi, date)
    if not items:
        return None
    hrefs = lambda a: [it.assets[a].href for it in items]
    g = warp_sources(hrefs("B03"), aoi, Resampling.average)
    s = warp_sources(hrefs("B11"), aoi, Resampling.bilinear)
    scl = warp_sources(hrefs("SCL"), aoi, Resampling.nearest, dtype="uint8", nodata=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mndwi = (g - s) / (g + s)
    clear = np.isin(scl, CLEAR_SCL) & np.isfinite(mndwi)
    lab = np.zeros(mndwi.shape, np.uint8)
    lab[clear & (mndwi < -margin)] = 1
    lab[clear & (mndwi > margin)] = 2
    return {"label": lab, "mndwi": mndwi.astype("float32"), "clear": clear, "n_items": len(items)}
