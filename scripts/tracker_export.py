"""Daily MODELLED flood maps between NISAR passes as web assets: cross-track linear interpolation.

Usage: tracker_export.py <event> [--factor 8]
Each pixel blends the nearest earlier and later passes (any orbit track) by time. This parameter-free method was
validated leave-one-pass-out (tracker_eval.py): it beat copying the nearest pass on 17 of 20 hidden passes in
Assam and Thailand. (The fitted HMM tracker in nisarflood/tracker.py did not transfer between events and is
not used.) Adds web/public/data/<event>/model/day_<date>.webp and manifest["tracker"].
"""
import sys, json, argparse, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
from PIL import Image
from rasterio.warp import Resampling
from scipy.optimize import minimize
from nisarflood import tracker as T
from nisarflood.webgrid import WebGrid
from nisarflood.aoi import grid
import rasterio

ap = argparse.ArgumentParser(); ap.add_argument("event")
ap.add_argument("--factor", type=int, default=8); a = ap.parse_args()
ev, F = a.event, a.factor
web = Path(f"web/public/data/{ev}"); (web / "model").mkdir(parents=True, exist_ok=True)

E = T.load_passes(ev, F)
pdays = [p["day"] for p in E["passes"]]
stack = np.stack([p["p"] for p in E["passes"]])
seen = np.stack([np.isfinite(p["p"]) for p in E["passes"]]).any(0)
crs, transform, _, _ = grid(ev)
cell_km2 = (abs(transform.a) * F) ** 2 / 1e6
G = WebGrid(ev)
src_t = transform * rasterio.Affine.scale(F)
d0 = dt.date.fromisoformat(E["d0"])
days, exp_km2, likely_km2 = [], [], []
for i in range(E["n"]):
    q = np.where(seen, T.interpolate(pdays, stack, i), np.nan)
    date = (d0 + dt.timedelta(days=i)).isoformat()
    days.append(date)
    exp_km2.append(round(float(np.nansum(q) * cell_km2), 1))
    likely_km2.append(round(float(np.nansum(q > 0.5) * cell_km2), 1))
    g = G.warp(q, Resampling.bilinear, factor=4, src_transform=src_t)   # 100 m web grid
    gv = np.nan_to_num(g)
    rgba = np.zeros(g.shape + (4,), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 45, 212, 191                # modelled = teal, never the observed cyan
    rgba[..., 3] = (np.clip((gv - 0.2) / 0.7, 0, 1) * 220).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(web / "model" / f"day_{date}.webp", "WEBP", quality=70, alpha_quality=60, method=4)

def _validation():
    """Leave-one-pass-out scores on both events (from tracker_eval.py outputs), pooled honestly."""
    rows = []
    for e in ("assam", "thailand"):
        p = Path(f"outputs/eval/tracker_{e}_fit-{'thailand' if e == 'assam' else 'assam'}.json")
        if p.exists():
            rows += [dict(r, event=e) for r in json.loads(p.read_text())["passes"].values()]
    if not rows:
        return None
    li = [r["gap-fill: linear interpolation"]["IoU"] for r in rows]; nn = [r["gap-fill: nearest pass"]["IoU"] for r in rows]
    return {"protocol": "Each NISAR pass hidden in turn and predicted from the other passes (any track); scored against "
                        "that pass's own map (confident flood vs dry, 200 m cells). Assam and Thailand.",
            "passes": len(rows), "interp_mean_iou": round(float(np.mean(li)), 3), "nearest_mean_iou": round(float(np.mean(nn)), 3),
            "interp_wins": int(sum(a > b for a, b in zip(li, nn))), "ties": int(sum(a == b for a, b in zip(li, nn))),
            "sign_p": round(float(__import__("scipy.stats", fromlist=["binomtest"]).binomtest(
                int(sum(a > b for a, b in zip(li, nn))), int(sum(a != b for a, b in zip(li, nn))), alternative="greater").pvalue), 4)}


m = json.loads((web / "manifest.json").read_text(encoding="utf-8"))
m["tracker"] = {
    "label": "Modelled", "days": days, "image": "model/day_{date}.webp",
    "expected_km2": exp_km2, "likely_km2": likely_km2,
    "cell_m": int(abs(transform.a) * F),
    # Each pass on the same coarse cells and the same rule (probability > 0.5), so the chart compares like with like.
    "obs": [{"date": p["date"], "track": p["track"], "km2": round(float(np.nansum(p["p"] > 0.5) * cell_km2), 1)}
            for p in E["passes"] if p["kind"] == "post"],
    "method": "Cross-track linear interpolation: each pixel blends the nearest earlier and later NISAR passes (any track) by time.",
    "validation": _validation(),
    "note": "Estimate between passes from the passes before and after. Not an observation.",
}
(web / "manifest.json").write_text(json.dumps(m, indent=1), encoding="utf-8")
print(f"{ev}: {len(days)} daily modelled maps; peak expected {max(exp_km2):.0f} km² on {days[int(np.argmax(exp_km2))]}")
