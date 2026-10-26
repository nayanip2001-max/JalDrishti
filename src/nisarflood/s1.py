"""Sentinel-1 RTC (C-band) scenes on the AOI grid, processed exactly like NISAR scenes.

VV/VH are returned under the co-/cross-pol keys the detector uses (HHHH/HVHV), so the
same algorithm runs on both sensors and any difference comes from the radar band.
"""
from datetime import datetime, timedelta
import numpy as np
import pystac_client, planetary_computer
from rasterio.warp import Resampling

from .ancillary import PC, _lonlat_bbox, warp_sources
from .aoi import grid
from .stack import lee, to_db


def s1_scene(aoi, date, orbit):
    crs, transform, w, h = grid(aoi)
    cat = pystac_client.Client.open(PC, modifier=planetary_computer.sign_inplace)
    d = datetime.fromisoformat(date)
    items = [i for i in cat.search(collections=["sentinel-1-rtc"], bbox=_lonlat_bbox(crs, transform, w, h),
                                    datetime=f"{date}/{(d + timedelta(days=1)).date()}").item_collection()
             if i.properties["sat:relative_orbit"] == orbit and i.datetime.date() == d.date()]
    if not items:
        raise ValueError(f"no Sentinel-1 RTC on {date} orbit {orbit}")
    out = {}
    for key, asset in (("HHHH", "vv"), ("HVHV", "vh")):
        a = warp_sources([i.assets[asset].href for i in items], aoi, Resampling.average)
        a[a <= 0] = np.nan
        out[key] = a
    valid = np.isfinite(out["HHHH"]) & np.isfinite(out["HVHV"])
    # ENL ~ 4.4 (GRD IW) x 4 from 10 m -> 20 m averaging, comparable to the NISAR subsets.
    res = {k: to_db(lee(v, enl=17.6)) for k, v in out.items()}
    res["valid"] = valid & np.isfinite(res["HHHH"])
    return res
