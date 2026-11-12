"""Leave-one-pass-out test of the multi-track flood tracker against simple baselines.

Usage: tracker_eval.py --fit <event>[,<event>] --test <event> [--factor 10] [--tag name]

Protocol (fixed before looking at results):
  * Parameters are fitted on the --fit event(s) only (held-out log-loss, pixel subsample), then frozen.
  * On the --test event, every flood pass is hidden in turn and predicted from the others:
      gap-fill  (smooth: passes before and after)  vs  nearest pass in time / linear interpolation per pixel
      nowcast   (filter: only earlier passes)      vs  carry the last observation forward
  * Reference = the hidden pass's own map: confident flood (1) vs dry or permanent water (0); "possible" and
    "uncertain" pixels are not scored. Scored on pixels that pass actually saw. 200 m cells (factor 10).
"""
import sys, json, argparse, datetime as dt
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio
from scipy.optimize import minimize
from nisarflood.events import EVENTS
from nisarflood import tracker as T

ap = argparse.ArgumentParser()
ap.add_argument("--fit", required=True); ap.add_argument("--test", required=True)
ap.add_argument("--factor", type=int, default=10); ap.add_argument("--tag", default="")
ap.add_argument("--sample", type=int, default=40_000)
ap.add_argument("--version", type=int, default=2, help="1 = unconstrained (reported failure), 2 = constrained (deployed)")
a = ap.parse_args()
F = a.factor


block, load_event, obs_dict = T.block, (lambda ev: T.load_passes(ev, F)), T.obs_dict


def skip_key(E, k):
    p = E["passes"][k]
    same = [q for q in E["passes"] if q["day"] == p["day"]]
    return (p["day"], same.index(p))


# ---- fit ------------------------------------------------------------------------------------------------
def fit(events):
    rng = np.random.default_rng(0)
    packs = []
    for E in events:
        Y = np.stack([p["y"] for p in E["passes"]])
        seen = np.isfinite(Y).sum(0) >= 3
        ever = np.nanmax(np.where(np.isfinite(Y), Y, 0), 0) > 0
        idx_f, idx_o = np.flatnonzero(seen & ever), np.flatnonzero(seen & ~ever)
        k = a.sample // 2
        idx = np.concatenate([rng.choice(idx_f, min(k, len(idx_f)), replace=False), rng.choice(idx_o, min(k, len(idx_o)), replace=False)])
        sub = np.unravel_index(idx, E["hand"].shape)
        packs.append((E, sub, obs_dict(E, sub), E["hand"][sub]))

    def loss(theta):
        tot, cnt = 0.0, 0
        for E, sub, obs, hand in packs:
            for k, p in enumerate(E["passes"]):
                if p["kind"] != "post":
                    continue
                y = p["y"][sub]; ok = np.isfinite(y)
                if ok.sum() < 50:
                    continue
                q = np.clip(T.posterior(theta, obs, E["n"], hand, E["rain"], p["day"], "smooth", skip_key(E, k))[ok], 1e-4, 1 - 1e-4)
                tot += -np.sum(y[ok] * np.log(q) + (1 - y[ok]) * np.log(1 - q)); cnt += ok.sum()
        return tot / max(cnt, 1)

    if a.version == 1:
        res = minimize(loss, T.THETA0, method="Nelder-Mead", options={"maxiter": 400, "xatol": 1e-3, "fatol": 1e-5})
        theta = res.x
    else:
        res = minimize(lambda raw: loss(T.expand(raw)), T.RAW0, method="Nelder-Mead",
                       options={"maxiter": 600, "xatol": 1e-3, "fatol": 1e-6})
        theta = T.expand(res.x)
    print(f"fit on {[E['name'] for E in events]}: log-loss {res.fun:.4f} ({res.nit} it, converged={res.success})",
          dict(zip(T.NAMES, theta.round(3))), flush=True)
    return theta, float(res.fun)


# ---- baselines ------------------------------------------------------------------------------------------
def baselines(E, k):
    t = E["passes"][k]["day"]
    others = [p for j, p in enumerate(E["passes"]) if j != k]
    days = np.array([p["day"] for p in others], float)
    P = np.stack([p["p"] for p in others])                       # (N, H, W)
    ok = np.isfinite(P)
    dist = np.where(ok, np.abs(days[:, None, None] - t), np.inf)
    nearest = np.take_along_axis(P, dist.argmin(0)[None], 0)[0]
    before = np.where(ok & (days[:, None, None] <= t), days[:, None, None], -np.inf)
    after = np.where(ok & (days[:, None, None] >= t), days[:, None, None], np.inf)
    ib, ia = before.argmax(0), after.argmin(0)
    pb, pa = np.take_along_axis(P, ib[None], 0)[0], np.take_along_axis(P, ia[None], 0)[0]
    db, da = np.max(before, 0), np.min(after, 0)
    hb, ha = np.isfinite(db), np.isfinite(da)
    wgt = np.where(hb & ha, (t - db) / np.maximum(da - db, 1), 0)
    interp = np.where(hb & ha, pb * (1 - wgt) + pa * wgt, np.where(hb, pb, pa))
    persist = np.where(hb, pb, 0.0)
    return {"nearest pass": nearest, "linear interpolation": interp, "carry last forward": persist}


def scores(pred, y):
    ok = np.isfinite(y) & np.isfinite(pred)
    p, t = pred[ok] > 0.5, y[ok] > 0.5
    tp, fp, fn = np.sum(p & t), np.sum(p & ~t), np.sum(~p & t)
    return {"IoU": round(float(tp / max(tp + fp + fn, 1)), 3), "precision": round(float(tp / max(tp + fp, 1)), 3),
            "recall": round(float(tp / max(tp + fn, 1)), 3), "n": int(ok.sum()), "flood_cells": int(t.sum())}


fit_events = [load_event(e) for e in a.fit.split(",")]
E = next((x for x in fit_events if x["name"] == a.test), None) or load_event(a.test)
theta, ll = fit(fit_events)
obs = obs_dict(E)
rows = {}
for k, p in enumerate(E["passes"]):
    if p["kind"] != "post" or np.nansum(p["y"]) < 20:
        continue
    sm = T.posterior(theta, obs, E["n"], E["hand"], E["rain"], p["day"], "smooth", skip_key(E, k))
    fl = T.posterior(theta, obs, E["n"], E["hand"], E["rain"], p["day"], "filter", skip_key(E, k))
    b = baselines(E, k)
    gap = sorted({abs(q["day"] - p["day"]) for j, q in enumerate(E["passes"]) if j != k})[0]
    rows[p["id"]] = {"date": p["date"], "track": p["track"], "nearest_other_pass_days": int(gap),
                     "gap-fill: tracker": scores(sm, p["y"]), "gap-fill: nearest pass": scores(b["nearest pass"], p["y"]),
                     "gap-fill: linear interpolation": scores(b["linear interpolation"], p["y"]),
                     "nowcast: tracker": scores(fl, p["y"]), "nowcast: carry last forward": scores(b["carry last forward"], p["y"])}
    r = rows[p["id"]]
    print(f"{p['id']} (±{gap} d): gap-fill tracker {r['gap-fill: tracker']['IoU']:.3f} | nearest {r['gap-fill: nearest pass']['IoU']:.3f} | "
          f"interp {r['gap-fill: linear interpolation']['IoU']:.3f} || nowcast tracker {r['nowcast: tracker']['IoU']:.3f} | "
          f"carry {r['nowcast: carry last forward']['IoU']:.3f}", flush=True)

methods = [k for k in next(iter(rows.values())) if ":" in k]
pooled = {}
for mth in methods:  # pooled over passes (cell-weighted IoU) and mean of per-pass IoU
    pooled[mth] = {"mean IoU": round(float(np.mean([r[mth]["IoU"] for r in rows.values()])), 3)}
    print(f"MEAN {mth:32s} IoU {pooled[mth]['mean IoU']:.3f}")
out = {"fit_on": a.fit, "test": a.test, "factor": F, "version": a.version, "theta": dict(zip(T.NAMES, theta.round(4).tolist())), "fit_logloss": ll,
       "passes": rows, "mean": pooled}
Path("outputs/eval").mkdir(parents=True, exist_ok=True)
Path(f"outputs/eval/tracker_{a.test}_fit-{a.fit.replace(',', '+')}{'_v1' if a.version == 1 else ''}{a.tag}.json").write_text(json.dumps(out, indent=1))
