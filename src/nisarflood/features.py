"""Per-pixel feature stack for the learned water classifier.

Every feature is a physical quantity (backscatter, change, polarimetric ratio,
neighbourhood context, terrain), so feature importance stays interpretable.
Scene-normalised versions make the model transferable across tracks, whose
absolute dB levels differ with incidence angle.
"""
import warnings
import numpy as np
from scipy.ndimage import uniform_filter


def _box(a, size):
    v = np.isfinite(a)
    s = uniform_filter(np.where(v, a, 0).astype("float32"), size)
    n = uniform_filter(v.astype("float32"), size)
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0.5, s / n, np.nan).astype("float32")


def _std(a, size):
    m = _box(a, size)
    m2 = _box(a * a, size)
    return np.sqrt(np.maximum(m2 - m * m, 0)).astype("float32")


def build(post, refs, anc):
    hh, hv = post["HHHH"], post["HVHV"]
    rh = np.stack([r["HHHH"] for r in refs])
    rv = np.stack([r["HVHV"] for r in refs])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # pixels with no valid reference
        ref_hh, ref_hv, ref_hh_min = np.nanmedian(rh, 0), np.nanmedian(rv, 0), np.nanmin(rh, 0)
    v = post["valid"] & np.isfinite(ref_hh)
    p10, p50 = np.nanpercentile(hh[v], 10), np.nanpercentile(hh[v], 50)
    d_hh, d_hv = hh - ref_hh, hv - ref_hv
    f = {
        "hh": hh, "hv": hv, "hh_minus_hv": hh - hv,
        "hh_rel_p10": hh - p10, "hh_rel_p50": hh - p50, "hv_rel_p50": hv - np.nanpercentile(hv[v], 50),
        "ref_hh": ref_hh, "ref_hv": ref_hv, "ref_hh_min": ref_hh_min, "d_hh": d_hh, "d_hv": d_hv,
        "hh_m3": _box(hh, 3), "hh_m7": _box(hh, 7), "hh_m15": _box(hh, 15), "hv_m7": _box(hv, 7),
        "hh_s7": _std(hh, 7), "d_hh_m7": _box(d_hh, 7), "d_hh_m15": _box(d_hh, 15),
        "hand": anc["hand"], "slope": anc["slope"], "jrc": anc["jrc"],
        "worldcover": anc["worldcover"].astype("float32"),
    }
    names = list(f)
    X = np.stack([f[k].astype("float32") for k in names], -1)
    X[~v] = np.nan
    return X, names, v
