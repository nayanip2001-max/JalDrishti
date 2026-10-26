"""Stream an AOI window out of a remote NISAR GCOV HDF5 and write 20 m GeoTIFFs.

Values stay as RTC gamma-naught in linear power; multilooking averages in linear
power so the dB conversion happens once, downstream.
"""
import warnings
import numpy as np
import h5py
import earthaccess
import rasterio
from rasterio.transform import from_origin

GRID = "science/LSAR/GCOV/grids/frequencyA"
DIAG = ("HHHH", "HVHV", "VHVH", "VVVV")


def _window(xc, yc, bounds):
    """Row/col slice of the native grid covering bounds (xc ascending, yc descending)."""
    w, s, e, n = bounds
    c0, c1 = np.searchsorted(xc, w), np.searchsorted(xc, e)
    r0, r1 = np.searchsorted(-yc, -n), np.searchsorted(-yc, -s)
    return slice(r0, r1), slice(c0, c1)


def _multilook(a, f):
    if f == 1:
        return a
    h, w = (a.shape[0] // f) * f, (a.shape[1] // f) * f
    a = a[:h, :w].reshape(h // f, f, w // f, f)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN blocks outside the swath
        return np.nanmean(a, axis=(1, 3))


def subset(url, bounds, out_path, res=20):
    """Write a multi-band GeoTIFF: diagonal covariance terms + valid mask + looks.

    Off-diagonal HHVV (complex) is kept as real/imag bands for quad-pol scenes,
    which is what the polarimetric decomposition needs.
    """
    h = h5py.File(earthaccess.open([url])[0], "r")
    g = h[GRID]
    xc, yc = g["xCoordinates"][()], g["yCoordinates"][()]
    dx = float(g["xCoordinateSpacing"][()])
    f = int(round(res / dx))
    rs, cs = _window(xc, yc, bounds)
    terms = [t.decode() for t in g["listOfCovarianceTerms"][()]]

    bands, names = [], []
    for t in DIAG:
        if t in terms:
            bands.append(_multilook(g[t][rs, cs].astype("float32"), f))
            names.append(t)
    if "HHVV" in terms:
        z = g["HHVV"][rs, cs]
        bands += [_multilook(z.real.astype("float32"), f), _multilook(z.imag.astype("float32"), f)]
        names += ["HHVV_re", "HHVV_im"]
    m = g["mask"][rs, cs]
    valid = ((m > 0) & (m < 255)).astype("float32")
    bands.append(_multilook(valid, f))
    names.append("valid_frac")
    bands.append(_multilook(g["numberOfLooks"][rs, cs].astype("float32"), f))
    names.append("looks")

    # Grid coordinates are pixel centres.
    x0 = xc[cs.start] - dx / 2
    y0 = yc[rs.start] + dx / 2
    epsg = int(g["projection"][()])
    arr = np.stack(bands)
    prof = dict(driver="GTiff", dtype="float32", count=arr.shape[0], height=arr.shape[1],
                width=arr.shape[2], crs=f"EPSG:{epsg}", transform=from_origin(x0, y0, res, res),
                nodata=np.nan, compress="deflate", predictor=3, tiled=True, blockxsize=512, blockysize=512)
    with rasterio.open(out_path, "w", **prof) as dst:
        dst.write(arr)
        for i, n in enumerate(names, 1):
            dst.set_band_description(i, n)
    return out_path, names
