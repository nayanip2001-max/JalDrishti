"""The Web Mercator grid that every web image of an event is warped onto.

MapLibre places an image by its four corners, so all images of an event share one
EPSG:3857 grid (25 m base resolution; `factor` coarsens it for lighter layers).
"""
import numpy as np
import rasterio
from rasterio.warp import reproject, calculate_default_transform, transform_bounds, Resampling
from PIL import Image

from .aoi import grid

DST_CRS = "EPSG:3857"


def enc(a, lo, hi):
    """Linear 8-bit encoding of [lo, hi]; NaN becomes lo (0)."""
    return np.clip(np.round((np.nan_to_num(a, nan=lo) - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)


class WebGrid:
    def __init__(self, aoi, res=25):
        self.crs, self.transform, self.w, self.h = grid(aoi)
        west, south, east, north = rasterio.transform.array_bounds(self.h, self.w, self.transform)
        self.dt, self.dw, self.dh = calculate_default_transform(self.crs, DST_CRS, self.w, self.h,
                                                                west, south, east, north, resolution=res)
        db = rasterio.transform.array_bounds(self.dh, self.dw, self.dt)
        lon0, lat0, lon1, lat1 = transform_bounds(DST_CRS, "EPSG:4326", *db)
        self.bounds = [lon0, lat0, lon1, lat1]
        self.corners = [[lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]]

    def warp(self, a, resampling, nodata=np.nan, factor=1, src_transform=None, src_crs=None):
        """Warp an array on the AOI's UTM grid (or any given grid) onto this web grid."""
        out = np.full((self.dh // factor, self.dw // factor), nodata, dtype=a.dtype)
        reproject(a, out, src_transform=src_transform or self.transform, src_crs=src_crs or self.crs,
                  dst_transform=self.dt * rasterio.Affine.scale(factor), dst_crs=DST_CRS,
                  src_nodata=nodata, dst_nodata=nodata, resampling=resampling)
        return out


def save_sar(G, hh_db, path):
    """Grey HH backdrop at 50 m (speckle does not compress); outside the swath stays transparent."""
    g = G.warp(hh_db, Resampling.average, factor=2)
    v = enc(g, -24, 0)
    alpha = np.where(np.isfinite(g), 255, 0).astype(np.uint8)
    Image.fromarray(np.stack([v, v, v, alpha], -1), "RGBA").save(path, "WEBP", quality=72, alpha_quality=50, method=6)
