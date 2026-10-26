"""What sits inside the mapped flood: people, cropland, built-up land, roads — per district.

This is EXPOSURE (inside the flood extent), not damage; damage needs ground reports.
Reported as a range: confident flood classes only (low) and including "possible" (high).
"""
import json
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.features import rasterize
import geopandas as gpd

from .aoi import grid

CONFIDENT = (3, 5)       # flood (open water), flooded vegetation
POSSIBLE = (4, 6)
CROPLAND, BUILTUP = 40, 50


class Exposure:
    def __init__(self, aoi, root=Path("data/processed/ancillary")):
        d = root / aoi
        self.crs, self.transform, self.w, self.h = grid(aoi)
        self.px_km2 = abs(self.transform.a * self.transform.e) / 1e6
        self.px_km = abs(self.transform.a) / 1000
        rd = lambda n: rasterio.open(d / f"{n}.tif").read(1)
        self.wc, self.roads, self.dist = rd("worldcover"), rd("roads"), rd("districts")
        with rasterio.open(d / "pop_wp2025.tif") as p:
            self.pop, self.pop_t, self.pop_crs = p.read(1), p.transform, p.crs
        gdf = gpd.read_file(d / "districts.geojson")
        self.names = dict(zip(gdf["id"], gdf["shapeName"]))
        # District ids on the population grid, so people are counted where they live.
        self.dist_pop = rasterize(zip(gdf.geometry, gdf["id"]), out_shape=self.pop.shape,
                                  transform=self.pop_t, fill=0, dtype="uint8")

    def _people(self, mask):
        frac = np.zeros(self.pop.shape, "float32")
        reproject(mask.astype("float32"), frac, src_transform=self.transform, src_crs=self.crs,
                  dst_transform=self.pop_t, dst_crs=self.pop_crs, resampling=Resampling.average)
        return self.pop * frac

    def _stats(self, mask):
        ppl = self._people(mask)
        out = {"total": {}, "districts": {}}
        for did, name in [(0, None)] + sorted(self.names.items()):
            m = mask if did == 0 else mask & (self.dist == did)
            p = ppl.sum() if did == 0 else ppl[self.dist_pop == did].sum()
            row = {"people": int(round(float(p))),
                   "cropland_km2": round(float((m & (self.wc == CROPLAND)).sum() * self.px_km2), 1),
                   "builtup_km2": round(float((m & (self.wc == BUILTUP)).sum() * self.px_km2), 2),
                   "roads_km": round(float((m & np.isin(self.roads, (1, 2, 3, 4))).sum() * self.px_km), 1),
                   "rail_km": round(float((m & (self.roads == 5)).sum() * self.px_km), 1)}
            if did == 0:
                out["total"] = row
            elif m.any():
                out["districts"][name] = row
        return out

    def compute(self, cls):
        low = self._stats(np.isin(cls, CONFIDENT))
        high = self._stats(np.isin(cls, CONFIDENT + POSSIBLE))
        zero = dict.fromkeys(high["total"], 0)
        names = sorted(set(low["districts"]) | set(high["districts"]))
        return {"low": low["total"], "high": high["total"],
                "districts": {k: {"low": low["districts"].get(k, zero), "high": high["districts"][k]} for k in names}}
