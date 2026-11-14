"""Genuine image crops for the dashboard's "How do we know?" science panel.

One window over the Assam event (track 40), chosen automatically as the 15 km square with the most new
flood on the 22 Jul 2026 pass. Everything written here comes from the real pipeline:
  * proc_*.webp   preprocessing stages (20 m multilooked gamma0 before/after the 5x5 Lee filter; reference median)
  * feat_*.webp   the deployed model's input features (src/nisarflood/features.py), same window
  * bda_*.webp    before / during / after: the web export's HH backdrops with the published flood classes
  * science.json  the window, the dates, the parameters actually used (looks, ENL, grid) and colour ranges

Usage: python scripts/export_science.py            (needs data/processed/gcov/assam and ancillary, ~3 min)
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.warp import transform_bounds

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from nisarflood.aoi import grid                      # noqa: E402
from nisarflood.features import build                # noqa: E402
from nisarflood.stack import load, scenes            # noqa: E402

AOI, TRACK, DURING, AFTER = "assam", 40, "2026-07-22", "2026-10-14"
WEB = ROOT / "web/public/data" / AOI
OUT = ROOT / "web/public/science" / AOI
SIZE = 360                                            # output pixels per crop
WIN_KM = 15
OUT.mkdir(parents=True, exist_ok=True)
man = json.loads((WEB / "manifest.json").read_text(encoding="utf-8"))
REFS = man["refs"][str(TRACK)]["dates"]

# ---- 1. pick the window on the published class map (EPSG:3857 image spanning the AOI corners)
R = 6378137.0
mx = lambda lon: R * math.radians(lon)
my = lambda lat: R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
ilat = lambda y: math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
w0, s0, e0, n0 = man["aoi"]["bounds"]
X0, X1, Y0, Y1 = mx(w0), mx(e0), my(s0), my(n0)

def rgba(path):
    return np.asarray(Image.open(WEB / path).convert("RGBA"))

PAL = {int(k): tuple(int(v["color"][i:i + 2], 16) for i in (1, 3, 5)) for k, v in man["classes"].items()}
def classes(img):
    out = np.zeros(img.shape[:2], np.uint8)
    for k, c in PAL.items():
        if k <= 1:
            continue
        out[(np.abs(img[..., :3].astype(int) - c).sum(-1) < 30) & (img[..., 3] > 0)] = k
    return out

cls_d = classes(rgba(f"cls/T{TRACK:03d}_{DURING}.webp"))
H, W = cls_d.shape
px_m = (X1 - X0) / W * math.cos(math.radians((s0 + n0) / 2))       # ground metres per web pixel
win = int(WIN_KM * 1000 / px_m)
new = np.isin(cls_d, (3, 5)).astype(np.float64)
perm = (cls_d == 2).astype(np.float64)
ii = lambda a: np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
I_new, I_perm = ii(new), ii(perm)
box = lambda I, r, c: I[r + win, c + win] - I[r, c + win] - I[r + win, c] + I[r, c]
best, rc = -1, (0, 0)
for r in range(0, H - win, 8):
    for c in range(0, W - win, 8):
        f, p = box(I_new, r, c), box(I_perm, r, c)
        if p < 0.02 * win * win:                          # want a river in view for context
            continue
        if f > best:
            best, rc = f, (r, c)
r0, c0 = rc
lon = lambda c: w0 + (e0 - w0) * c / W
lat = lambda r: ilat(Y1 - (Y1 - Y0) * r / H)
bbox = [round(lon(c0), 5), round(lat(r0 + win), 5), round(lon(c0 + win), 5), round(lat(r0), 5)]
print("window", bbox, "new-flood px", int(best))

def web_crop(path):
    """Same ground window in any web image of this event (they share the extent, not the pixel size)."""
    im = Image.open(WEB / path).convert("RGBA")
    sx, sy = im.width / W, im.height / H
    im = im.crop((round(c0 * sx), round(r0 * sy), round((c0 + win) * sx), round((r0 + win) * sy)))
    return im.resize((SIZE, SIZE), Image.LANCZOS)

def composite(sar_path, cls_path=None):
    """Grey HH backdrop (the dashboard's own) with the published classes on top."""
    base = web_crop(sar_path)
    bg = Image.new("RGBA", base.size, (8, 14, 28, 255))
    bg.alpha_composite(base)
    if cls_path:
        ov = np.asarray(web_crop(cls_path)).copy()
        ov[..., 3] = np.where(ov[..., 3] > 0, 200, 0)
        bg.alpha_composite(Image.fromarray(ov, "RGBA"))
    return bg.convert("RGB")

composite(man["refs"][str(TRACK)]["sar"]).save(OUT / "bda_before.webp", quality=80)
composite(f"sar/T{TRACK:03d}_{DURING}.webp", f"cls/T{TRACK:03d}_{DURING}.webp").save(OUT / "bda_during.webp", quality=80)
composite(f"sar/T{TRACK:03d}_{AFTER}.webp", f"cls/T{TRACK:03d}_{AFTER}.webp").save(OUT / "bda_after.webp", quality=80)
composite(f"sar/T{TRACK:03d}_{DURING}.webp").save(OUT / "bda_during_sar.webp", quality=80)
counts = {}
for tag, d in (("during", DURING), ("after", AFTER)):
    cc = classes(rgba(f"cls/T{TRACK:03d}_{d}.webp"))[r0:r0 + win, c0:c0 + win]
    counts[tag] = {int(k): round(float((cc == k).sum()) * px_m * px_m / 1e6, 1) for k in (2, 3, 4, 5, 6, 7)}

# ---- 2. the same window on the processing grid (UTM, 20 m)
crs, T, gw, gh = grid(AOI)
uw, us, ue, un = transform_bounds("EPSG:4326", crs, *bbox)
m = 24                                                  # margin so neighbourhood features are not cut at the edge
cA, cB = int((uw - T.c) / T.a) - m, int((ue - T.c) / T.a) + m
rA, rB = int((un - T.f) / T.e) - m, int((us - T.f) / T.e) + m
sl = (slice(rA, rB), slice(cA, cB))
inner = (slice(m, -m), slice(m, -m))

sc = {(s["track"], s["date"]): s for s in scenes(AOI)}
post_scene = sc[(TRACK, DURING)]
post = load(post_scene, AOI)
raw = load(post_scene, AOI, filt=False)
refs = [load(sc[(TRACK, d)], AOI) for d in REFS]
p10, p50 = np.nanpercentile(post["HHHH"][post["valid"]], 10), np.nanpercentile(post["HHHH"][post["valid"]], 50)
hv50 = np.nanpercentile(post["HVHV"][post["valid"]], 50)
cut = lambda d: {k: v[sl] for k, v in d.items()}
anc_dir = ROOT / "data/processed/ancillary" / AOI
anc = {}
for k, f in (("hand", "hand"), ("slope", "slope"), ("jrc", "jrc_occurrence"), ("worldcover", "worldcover")):
    with rasterio.open(anc_dir / f"{f}.tif") as src:
        a = src.read(1)
        assert a.shape == (gh, gw), (k, a.shape)
        anc[k] = a[sl].astype("float32") if k != "worldcover" else a[sl]
X, names, valid = build(cut(post), [cut(r) for r in refs], anc)
F = {n: X[..., i] for i, n in enumerate(names)}
# scene-relative features use percentiles of the whole pass in production, not of this window
F["hh_rel_p10"] = cut(post)["HHHH"] - p10
F["hh_rel_p50"] = cut(post)["HHHH"] - p50
F["hv_rel_p50"] = cut(post)["HVHV"] - hv50

with rasterio.open(post_scene["path"]) as src:
    looks = src.read(list(src.descriptions).index("looks") + 1)
looks_mean = float(np.nanmean(looks[looks > 0]))

def ramp(a, lo, hi, stops):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    xs = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(t, xs, [s[i] for s in stops]) for i in range(3)], -1)
    rgb[~np.isfinite(a)] = (8, 14, 28)
    return rgb.astype(np.uint8)

GREY = [(0, 0, 0), (255, 255, 255)]
DIV = [(34, 211, 238), (12, 20, 38), (245, 158, 11)]          # darker (water-like) cyan, brighter amber
TERR = [(8, 47, 73), (14, 116, 144), (103, 232, 249), (236, 254, 255)]
BLUE = [(12, 20, 38), (30, 64, 175), (147, 197, 253)]
WC = {10: (0, 100, 0), 20: (255, 187, 34), 30: (255, 255, 76), 40: (240, 150, 255), 50: (250, 0, 0), 60: (180, 180, 180),
      80: (0, 100, 200), 90: (0, 150, 160), 95: (0, 207, 117)}

def save(rgb, name):
    Image.fromarray(rgb[inner] if rgb.shape[0] > 2 * m else rgb, "RGB").resize((SIZE, SIZE), Image.LANCZOS).save(OUT / name, quality=82)

RANGES = {"proc": [-24, 0], "hh_rel_p10": [-6, 18], "hh_minus_hv": [0, 14], "hv_rel_p50": [-10, 8], "d_hh": [-10, 10], "d_hv": [-10, 10],
          "hh_s7": [0, 5], "d_hh_m15": [-8, 8], "hand": [0, 30], "slope": [0, 15], "jrc": [0, 100]}
save(ramp(cut(raw)["HHHH"], *RANGES["proc"], GREY), "proc_multilook.webp")
save(ramp(cut(post)["HHHH"], *RANGES["proc"], GREY), "proc_lee.webp")
# 3.2 km zoom at full 20 m pixels (nearest neighbour), where speckle and the Lee filter's effect are visible
Z = 80
def zoom(a, name):
    h, w = a.shape[0] // 2, a.shape[1] // 2
    Image.fromarray(ramp(a[h - Z:h + Z, w - Z:w + Z], *RANGES["proc"], GREY), "RGB").resize((SIZE, SIZE), Image.NEAREST).save(OUT / name, quality=88)
zoom(cut(raw)["HHHH"], "proc_multilook_zoom.webp")
zoom(cut(post)["HHHH"], "proc_lee_zoom.webp")
ref_med = np.nanmedian(np.stack([cut(r)["HHHH"] for r in refs]), 0)
save(ramp(ref_med, *RANGES["proc"], GREY), "proc_reference.webp")
for n, stops in (("hh_rel_p10", GREY), ("hh_minus_hv", GREY), ("hv_rel_p50", GREY), ("d_hh", DIV), ("d_hv", DIV), ("hh_s7", GREY),
                 ("d_hh_m15", DIV), ("hand", TERR), ("slope", TERR), ("jrc", BLUE)):
    save(ramp(F[n], *RANGES[n], stops), f"feat_{n}.webp")
wc = np.zeros(anc["worldcover"].shape + (3,), np.uint8); wc[:] = (8, 14, 28)
for k, c in WC.items():
    wc[anc["worldcover"] == k] = c
save(wc, "feat_worldcover.webp")

meta = {
    "event": AOI, "track": TRACK, "during": DURING, "after": AFTER, "refs": REFS, "bbox": bbox, "window_km": WIN_KM,
    "grid_m": float(T.a), "native_spacing_m": 10, "multilook": "2 x 2 block mean in linear power (10 m -> 20 m)",
    "lee": {"window": 5, "enl": 18.0}, "zoom_km": 2 * Z * 20 / 1000, "looks_mean": round(looks_mean, 1),
    "scene_percentiles_db": {"hh_p10": round(float(p10), 2), "hh_p50": round(float(p50), 2), "hv_p50": round(float(hv50), 2)},
    "ranges": RANGES, "areas_km2": counts,
    "worldcover": {str(k): "#%02x%02x%02x" % c for k, c in WC.items()},
}
(OUT / "science.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
print(json.dumps(meta, indent=1))
print("wrote", sorted(p.name for p in OUT.iterdir()))
