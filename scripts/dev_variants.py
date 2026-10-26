"""Development-only ablation on the 22 Jul pair: which physically motivated changes help?"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio
from scipy.ndimage import gaussian_filter
from nisarflood.evaluate import evaluate
from nisarflood.detect import _logit, _sigmoid

def read(p):
    with rasterio.open(p) as r: return {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
D = read("data/processed/flood/assam/T040_2026-07-22.tif")
lab = rasterio.open("data/processed/labels/assam/s2_2026-07-21.tif").read(1)
slope = rasterio.open("data/processed/ancillary/assam/slope.tif").read(1)
base = (lab > 0) & np.isfinite(D["p_water_now"]) & (np.nan_to_num(slope) < 10)
ref = lab == 2
def sm(a, s):
    v = np.isfinite(a); x = gaussian_filter(np.where(v, a, 0), s); n = gaussian_filter(v.astype(float), s)
    return np.where(v, x / np.maximum(n, 1e-6), np.nan)
l_now, lh, ls = D["l_now"], D["l_hand"], D["l_slope"]
V = {}
for bp in (0.2, 0.5):
    for s in (0, 1, 2):
        for hand in (True, False):
            l = sm(l_now, s) if s else l_now
            V[f"base={bp} smooth={s} hand={hand}"] = _sigmoid(l + _logit(np.float32(bp)) + (lh + ls if hand else ls)) > 0.5
for k, p in V.items():
    e = evaluate(p, ref, base, n_boot=50)
    print(f"{k:32s} IoU {e['IoU']:.3f}  P {e['precision']:.3f}  R {e['recall']:.3f}")
