"""Per-pass web assets, shared by the batch export (export_web / export_extras) and the live updater.

A pass = one NISAR acquisition's detection result `L` (dict of named layers from run_detect).
Images go onto the event's EPSG:3857 grid; evidence PNGs carry encoded values in RGB.
"""
import numpy as np
from PIL import Image
from rasterio.warp import Resampling

from .webgrid import enc

# Confident classes are near-opaque; "possible"/"uncertain" stay visible but recede, so the map reads
# confident flood first without hiding uncertainty.
COLORS = {0: (0, 0, 0, 0), 1: (0, 0, 0, 0), 2: (30, 64, 175, 170), 3: (34, 211, 238, 240),
          4: (245, 158, 11, 105), 5: (167, 139, 250, 240), 6: (217, 70, 239, 95), 7: (148, 163, 184, 70)}
SCALE = {"hh_db": [-30, 5], "hv_db": [-35, 0], "hand_m": [0, 60], "slope_deg": [0, 45], "jrc_pct": [0, 100],
         "pop_log10_per_km2": [0, 4.5]}
POLS = {"DHDH": ["HH", "HV"], "QPDH": ["HH", "HV", "VH", "VV"]}
NATIVE = {"DHDH": "10 m (multilooked 2×2 to 20 m)", "QPDH": "20 m"}


def pass_images(G, web, name, L):
    """Class map, probability map and click-to-explain evidence (ev1, ev2) for one pass."""
    warp = G.warp
    cls = warp(L["class"].astype(np.uint8), Resampling.nearest, nodata=0)
    rgba = np.zeros(cls.shape + (4,), np.uint8)
    for k, c in COLORS.items():
        rgba[cls == k] = c
    Image.fromarray(rgba, "RGBA").save(web / "cls" / f"{name}.webp", "WEBP", lossless=True, method=6)

    p = warp(L["p_flood"], Resampling.average, factor=2)
    pr = np.zeros(p.shape + (4,), np.uint8)
    pv = np.nan_to_num(p)
    pr[..., 0] = enc(pv, 0, 1); pr[..., 1] = (80 + 120 * pv).astype(np.uint8); pr[..., 2] = 255
    pr[..., 3] = (np.clip((pv - 0.15) / 0.85, 0, 1) * 230).astype(np.uint8)
    Image.fromarray(pr, "RGBA").save(web / "prob" / f"{name}.webp", "WEBP", quality=70, alpha_quality=60, method=6)

    f = 4  # evidence at 100 m is plenty for a click-to-explain card (and it only loads on click)
    ev1 = np.stack([enc(warp(L["l_now"], Resampling.average, factor=f), -8, 8),
                    enc(warp(L["l_before"], Resampling.average, factor=f), -8, 8),
                    enc(warp(L["l_hand"] + L["l_slope"], Resampling.average, factor=f), -12, 4)], -1)
    ev2 = np.stack([enc(warp(L["p_open"], Resampling.average, factor=f), 0, 1),
                    enc(warp(L["p_veg"], Resampling.average, factor=f), 0, 1),
                    enc(warp(L["d_hh"], Resampling.average, factor=f), -15, 15)], -1)
    Image.fromarray(ev1, "RGB").save(web / "ev" / f"{name}_1.png", optimize=True)
    Image.fromarray(ev2, "RGB").save(web / "ev" / f"{name}_2.png", optimize=True)
    return {"cls": f"cls/{name}.webp", "prob": f"prob/{name}.webp", "ev": [f"ev/{name}_1.png", f"ev/{name}_2.png"]}


def obs_meta(granule, mode):
    """NISAR acquisition metadata parsed from the granule name: NISAR_L2_<PR|UR>_GCOV_<cycle>_<track>_<A|D>_<frame>_..."""
    tok = granule.split("_") if granule else []
    urgent = len(tok) > 2 and tok[2] == "UR"
    return {"granule": granule, "direction": {"A": "Ascending", "D": "Descending"}.get(tok[6]) if granule else None,
            "frame": int(tok[7]) if granule else None, "polarisations": POLS.get(mode or "", ["HH", "HV"]),
            "native_resolution": NATIVE.get(mode or "", "—"),
            "product": ("NISAR L2 GCOV Urgent Response (low-latency), frequency A" if urgent
                        else "NISAR L2 GCOV (provisional v1), frequency A"),
            "product_type": "UR" if urgent else "PR",
            "quantity": "RTC γ⁰ (terrain-flattened backscatter), dB", "processing": "20 m grid, 5×5 Lee filter",
            "asf_url": f"https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList={granule}" if granule else None}


def pass_extras(G, web, sc, L, rad, px_km2):
    """Probability histogram and radar values + class per 100 m pixel (ev3) for a flood pass; mutates `sc`."""
    cls = L["class"]
    valid = cls > 0
    counts, _ = np.histogram(L["p_flood"][valid], bins=20, range=(0, 1))
    conf = np.isin(cls, (3, 5)).sum(); poss = np.isin(cls, (4, 6)).sum()
    sc["prob_hist"] = {"bins": 20, "km2": [round(float(c * px_km2), 1) for c in counts],
                       "confident_share": round(float(conf / max(conf + poss, 1)), 3)}
    f = 4
    ev3 = np.stack([enc(G.warp(rad["HHHH"], Resampling.average, factor=f), *SCALE["hh_db"]),
                    enc(G.warp(rad["HVHV"], Resampling.average, factor=f), *SCALE["hv_db"]),
                    (G.warp(cls.astype(np.uint8), Resampling.nearest, nodata=0, factor=f) * 32).astype(np.uint8)], -1)
    Image.fromarray(ev3, "RGB").save(web / "ev" / f"{sc['id']}_3.png", optimize=True)
    sc["ev3"] = f"ev/{sc['id']}_3.png"
