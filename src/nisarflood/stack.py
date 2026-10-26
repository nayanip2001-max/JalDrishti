"""Load GCOV subsets onto the canonical AOI grid as speckle-filtered dB layers."""
import csv
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from scipy.ndimage import uniform_filter

from .aoi import grid

ROOT = Path(__file__).resolve().parents[2]


def scenes(aoi):
    """All fetched scenes as dicts (track, date, mode, path), sorted by track then date."""
    d = ROOT / "data/processed/gcov" / aoi
    rows = []
    for m in d.glob("manifest_T*.csv"):
        with open(m) as fh:
            rows += [dict(r, track=int(r["track"]), path=d / r["file"]) for r in csv.DictReader(fh)]
    return sorted((r for r in rows if r["path"].exists()), key=lambda r: (r["track"], r["date"]))


def lee(img, size=5, enl=18.0):
    """Lee filter in linear power. ENL ~ native looks (~4.5) x 2x2 multilook."""
    valid = np.isfinite(img)
    x = np.where(valid, img, 0.0)
    n = uniform_filter(valid.astype("float32"), size)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = uniform_filter(x, size) / n
        sq = uniform_filter(x * x, size) / n
        var = np.maximum(sq - mean ** 2, 0)
        cu2 = 1.0 / enl
        ci2 = var / np.maximum(mean ** 2, 1e-12)
        w = np.clip(1 - cu2 / np.maximum(ci2, 1e-12), 0, 1)
    out = mean + w * (x - mean)
    out[~valid] = np.nan
    return out


def to_db(a):
    with np.errstate(divide="ignore", invalid="ignore"):
        return (10 * np.log10(np.clip(a, 1e-6, None))).astype("float32")


def load(scene, aoi, bands=("HHHH", "HVHV"), filt=True):
    """Return {band: dB array on the AOI grid} plus 'valid' (bool)."""
    crs, transform, w, h = grid(aoi)
    out = {}
    with rasterio.open(scene["path"]) as src:
        names = list(src.descriptions)
        for b in bands + ("valid_frac",):
            if b not in names:
                continue
            dst = np.full((h, w), np.nan, dtype="float32")
            reproject(rasterio.band(src, names.index(b) + 1), dst, dst_transform=transform, dst_crs=crs,
                      src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.average)
            out[b] = dst
    valid = np.nan_to_num(out.pop("valid_frac"), nan=0) > 0.99
    res = {}
    for b, a in out.items():
        a[~valid] = np.nan
        res[b] = to_db(lee(a) if filt else a)
    res["valid"] = valid & np.isfinite(res["HHHH"])
    return res
