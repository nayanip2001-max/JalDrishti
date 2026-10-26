"""Score a NISAR flood map against Copernicus EMS expert flood polygons (observedEvent).

CEMS maps come from very-high-resolution optical imagery interpreted by analysts, so they
are an independent reference. Scoring is restricted to each CEMS area of interest minus
its 'not analysed' zones. Also overlays CEMS building damage grades on our flood map.
Usage: eval_cems.py <event> <EMSR dir> <nisar result name> [method dir suffix]
"""
import sys, json, glob
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio, geopandas as gpd
from rasterio.features import rasterize
from nisarflood.aoi import grid
from nisarflood.evaluate import evaluate

event, emsr_dir, name = sys.argv[1:4]
suffix = sys.argv[4] if len(sys.argv) > 4 else ""
crs, transform, W, H = grid(event)
burn = lambda gdf: rasterize(((g, 1) for g in gdf.to_crs(crs).geometry if g is not None and not g.is_empty),
                             out_shape=(H, W), transform=transform, fill=0, dtype="uint8", all_touched=False).astype(bool)

def layer(kind):
    files = glob.glob(f"{emsr_dir}/*/*_{kind}_v*.shp")
    return gpd.GeoDataFrame(gpd.pd.concat([gpd.read_file(f) for f in files], ignore_index=True)) if files else None

aoi = burn(layer("areaOfInterestA"))
na = layer("notAnalysedA")
analysed = aoi & ~(burn(na) if na is not None else False)
obs = layer("observedEventA")
ref = burn(obs)

with rasterio.open(f"data/processed/flood/{event}{suffix}/{name}.tif") as r:
    L = {d: r.read(i + 1) for i, d in enumerate(r.descriptions)}
cls = L["class"]
mask = analysed & (cls > 0)
res = {}
for label, pred in (("confident flood", np.isin(cls, (3, 5))), ("incl. possible", np.isin(cls, (3, 4, 5, 6)))):
    res[label] = evaluate(pred, ref, mask, block=64, n_boot=300)
    v = res[label]
    print(f"{label:16s} IoU {v['IoU']:.3f} {v['ci95']['IoU']}  P {v['precision']:.3f}  R {v['recall']:.3f}")
px_km2 = abs(transform.a * transform.e) / 1e6
print(f"CEMS flooded area in analysed zone: {(ref & mask).sum() * px_km2:.2f} km² | ours (confident): {(np.isin(cls, (3, 5)) & mask).sum() * px_km2:.2f} km²")

# Damage: share of CEMS-graded buildings that fall inside our flood extent.
dmg = layer("builtUpP")
damage = {}
if dmg is not None:
    pts = dmg.to_crs(crs)
    rows, cols = rasterio.transform.rowcol(transform, pts.geometry.x.values, pts.geometry.y.values)
    rows, cols = np.clip(rows, 0, H - 1), np.clip(cols, 0, W - 1)
    inside = np.isin(cls[rows, cols], (3, 4, 5, 6))
    near = np.zeros(len(pts), bool)  # within 100 m (5 px) of our flood: SAR misses water between buildings
    fl = np.isin(cls, (3, 4, 5, 6))
    from scipy.ndimage import binary_dilation
    near = binary_dilation(fl, iterations=5)[rows, cols]
    for g in sorted(pts["damage_gra"].unique()):
        m = (pts["damage_gra"] == g).values
        damage[g] = {"buildings": int(m.sum()), "inside_flood": int((inside & m).sum()), "within_100m": int((near & m).sum())}
    print("CEMS building damage grades vs our flood:", damage)
out = Path(f"outputs/eval/{event}_validation.json")
Path(out).write_text(json.dumps({"reference": f"Copernicus EMS {Path(emsr_dir).name} observedEvent (VHR optical, expert)",
                                 "nisar": name, "scores": res, "damage_vs_flood": damage}, indent=1))
