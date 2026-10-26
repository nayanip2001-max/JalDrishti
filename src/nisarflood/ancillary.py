"""Static context layers resampled onto an AOI's processing grid."""
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import array_bounds
from pyproj import Transformer
import pystac_client
import planetary_computer

from .aoi import grid

PC = "https://planetarycomputer.microsoft.com/api/stac/v1"


def _lonlat_bbox(crs, transform, w, h, pad=0.02):
    b = array_bounds(h, w, transform)  # (west, south, east, north) in grid CRS
    t = Transformer.from_crs(crs, 4326, always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x in (b[0], b[2]) for y in (b[1], b[3])])
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def warp_sources(hrefs, aoi, resampling, dtype="float32", nodata=np.nan):
    """Mosaic + reproject a list of rasters onto the AOI grid (first valid pixel wins)."""
    crs, transform, w, h = grid(aoi)
    out = np.full((h, w), nodata, dtype=dtype)
    for href in hrefs:
        with rasterio.open(href) as src:
            tmp = np.full((h, w), nodata, dtype=dtype)
            reproject(rasterio.band(src, 1), tmp, dst_transform=transform, dst_crs=crs,
                      dst_nodata=nodata, resampling=resampling)
        fill = np.isnan(out) if np.isnan(nodata) else (out == nodata)
        out[fill] = tmp[fill]
    return out


def stac_hrefs(aoi, collection, asset, query=None):
    crs, transform, w, h = grid(aoi)
    cat = pystac_client.Client.open(PC, modifier=planetary_computer.sign_inplace)
    items = cat.search(collections=[collection], bbox=_lonlat_bbox(crs, transform, w, h), query=query).item_collection()
    return [it.assets[asset].href for it in items]


def write(path, arr, aoi, desc, nodata=np.nan):
    crs, transform, w, h = grid(aoi)
    with rasterio.open(path, "w", driver="GTiff", dtype=arr.dtype, count=1, width=w, height=h, crs=crs,
                       transform=transform, nodata=nodata, compress="deflate", tiled=True) as dst:
        dst.write(arr, 1)
        dst.set_band_description(1, desc)
