"""Multi-track flood state tracker: a daily flood probability from irregular NISAR passes on any track.

Each pixel is a two-state hidden Markov chain (dry / flooded) stepped once per day:
  * transition  flooded -> dry : daily recession hazard  r = sigmoid(a0 + a1 * log1p(HAND))
                dry -> flooded : daily onset hazard      f = sigmoid(b0 + b1 * log1p(HAND) + b2 * rain3)
    (low ground drains slowly; rain over the last 3 days raises the chance of new flooding)
  * emission    a NISAR pass that sees the pixel adds its detector flood probability p as a tempered
                likelihood ratio  log LR = w * (logit p - c); passes from different tracks/footprints
                simply update the pixels they cover.
Forward filtering = nowcast (only passes up to that day). Forward-backward smoothing = gap filling between
passes. Output is labelled MODELLED: it is an estimate between observations, never an observation.
"""
import numpy as np

EPS = 0.02          # detector probabilities are clipped: provisional products, never certainty
Q0 = 0.02           # flood probability at the start of the window (dry season)
THETA0 = np.array([-2.0, 0.6, -6.0, 0.4, 1.0, 0.6, -1.0])   # a0 a1 b0 b1 b2 w c (v1: all free)
NAMES = ["a0 recession", "a1 recession×log HAND", "b0 onset", "b1 onset×log HAND", "b2 onset×rain", "w evidence weight", "c evidence offset"]

# v2 (deployed): physics-constrained, observations trusted as calibrated.
#   * w = 1, c = logit(Q0): a pass sets a pixel's estimate to the detector's own probability; the model only
#     decides what happens BETWEEN passes. (v1 let the fit down-weight observations, which failed to transfer.)
#   * a1 >= 0 (higher ground drains faster), b1 <= 0 (low ground floods more easily), b2 >= 0 (rain only adds water).
RAW0 = np.array([-3.0, -0.4, -6.0, -0.4, 0.5])               # a0, u1, b0, u3, u4


def _softplus(x):
    return np.log1p(np.exp(-np.abs(x))) + np.maximum(x, 0)


def expand(raw):
    """Five free parameters -> the full 7-vector used by posterior()/daily()."""
    a0, u1, b0, u3, u4 = raw
    return np.array([a0, _softplus(u1), b0, -_softplus(u3), _softplus(u4), 1.0, np.log(Q0 / (1 - Q0))])


def _sig(x):
    return 1.0 / (1.0 + np.exp(-x))


def rain3(rain_mm):
    """3-day trailing rain sum in units of 50 mm (the onset covariate)."""
    r = np.nan_to_num(np.asarray(rain_mm, float))
    return np.convolve(r, np.ones(3), mode="full")[: len(r)] / 50.0


def _rates(theta, lh, rain_t):
    a0, a1, b0, b1, b2 = theta[:5]
    return _sig(a0 + a1 * lh), _sig(b0 + b1 * lh + b2 * rain_t)


def _lr(theta, p):
    w, c = theta[5], theta[6]
    p = np.clip(p, EPS, 1 - EPS)
    return np.exp(np.clip(w * (np.log(p / (1 - p)) - c), -20, 20))


def posterior(theta, obs, n_days, hand, rain, at, mode="smooth", skip=None):
    """P(flooded) on day `at` for every pixel.

    obs: dict day -> list of p arrays (NaN = not observed that day). hand: HAND array. rain: daily rain (mm), len n_days.
    mode "filter" uses passes on days <= at; "smooth" uses all. skip: (day, index) of an observation to leave out.
    """
    lh = np.log1p(np.nan_to_num(hand, nan=50.0)).astype("float32")
    r3 = rain3(rain)
    q = np.full(lh.shape, Q0, "float32")

    def emit(d, skip_ok=True):
        lam = np.ones(lh.shape, "float32")
        for i, p in enumerate(obs.get(d, [])):
            if skip is not None and skip == (d, i):
                continue
            ok = np.isfinite(p)
            lam[ok] *= _lr(theta, p[ok])
        return lam

    for d in range(at + 1):
        if d > 0:
            r, f = _rates(theta, lh, r3[d])
            q = q * (1 - r) + (1 - q) * f
        lam = emit(d)
        q = q * lam / (q * lam + 1 - q)
    if mode == "filter":
        return q
    b = np.ones(lh.shape, "float32")                    # backward message ratio beta(F)/beta(D)
    for d in range(n_days - 1, at, -1):
        r, f = _rates(theta, lh, r3[d])
        lam = emit(d)
        b = ((1 - r) * lam * b + r) / (f * lam * b + (1 - f))
    return q * b / (q * b + 1 - q)


def daily(theta, obs, n_days, hand, rain):
    """Smoothed P(flooded) for every day (T, H, W) float16: the 'modelled daily flood' product."""
    lh = np.log1p(np.nan_to_num(hand, nan=50.0)).astype("float32")
    r3 = rain3(rain)
    lam = {d: np.prod([np.where(np.isfinite(p), _lr(theta, p), 1.0) for p in ps], 0).astype("float32") for d, ps in obs.items()}
    fwd = np.empty((n_days,) + lh.shape, "float16")
    q = np.full(lh.shape, Q0, "float32")
    for d in range(n_days):
        if d > 0:
            r, f = _rates(theta, lh, r3[d])
            q = q * (1 - r) + (1 - q) * f
        if d in lam:
            q = q * lam[d] / (q * lam[d] + 1 - q)
        fwd[d] = q
    out = np.empty_like(fwd)
    b = np.ones(lh.shape, "float32")
    for d in range(n_days - 1, -1, -1):
        qd = fwd[d].astype("float32")
        out[d] = qd * b / (qd * b + 1 - qd)
        r, f = _rates(theta, lh, r3[d])
        l = lam.get(d, 1.0)
        b = ((1 - r) * l * b + r) / (f * l * b + (1 - f))
    return out


# ---- inputs: per-pass detector results on a coarse grid -------------------------------------------------
import json, datetime as dt, warnings
from pathlib import Path
import rasterio
from .events import EVENTS


def block(x, f, how="mean"):
    h, w = (x.shape[0] // f) * f, (x.shape[1] // f) * f
    x = x[:h, :w].reshape(h // f, f, w // f, f)
    with np.errstate(invalid="ignore"):
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(x, axis=(1, 3)) if how == "mean" else x.mean(axis=(1, 3))


def load_passes(ev, F):
    """Detector results of an event's passes on a coarse grid (factor F): p (flood probability, NaN = unseen) and
    y (1 confident flood / 0 dry or permanent water / NaN otherwise), plus HAND and daily rain."""
    src = Path(f"data/processed/flood/{ev}_v2")
    summ = json.loads((src / "summary.json").read_text())
    w0, w1 = EVENTS[ev]["window"]
    d0 = dt.date.fromisoformat(w0)
    n = (dt.date.fromisoformat(w1) - d0).days + 1
    m = json.loads(Path(f"web/public/data/{ev}/manifest.json").read_text(encoding="utf-8"))
    rain = np.full(n, 0.0)
    for d, v in zip(m["rainfall"]["days"], m["rainfall"]["mm"]):
        i = (dt.date.fromisoformat(d) - d0).days
        if 0 <= i < n and v is not None:
            rain[i] = v
    hand = block(rasterio.open(f"data/processed/ancillary/{ev}/hand.tif").read(1).astype("float32"), F)
    passes = []
    for r in summ:
        name = f"T{r['track']:03d}_{r['date']}" + ("_nullTest" if r["kind"] == "null_test" else "")
        day = (dt.date.fromisoformat(r["date"]) - d0).days
        if not 0 <= day < n:
            continue
        with rasterio.open(src / f"{name}.tif") as t:
            cls = t.read(1); p = t.read(2)
        valid = cls > 0
        p = np.where(valid, p, np.nan)
        flood = np.isin(cls, (3, 5)).astype("float32"); dry = np.isin(cls, (1, 2)).astype("float32")
        vf = block(valid.astype("float32"), F, "frac")
        pf, ff, df = block(p, F), block(flood, F, "frac"), block(dry, F, "frac")
        obs = np.where(vf > 0.5, pf, np.nan)
        target = np.full(obs.shape, np.nan, "float32")
        target[(vf > 0.5) & (ff / np.maximum(vf, 1e-6) > 0.5)] = 1
        target[(vf > 0.5) & (df / np.maximum(vf, 1e-6) > 0.5)] = 0
        passes.append({"id": name, "track": r["track"], "date": r["date"], "day": day, "kind": r["kind"], "p": obs, "y": target})
    return {"name": ev, "d0": w0, "factor": F, "n": n, "rain": rain, "hand": hand, "passes": passes}


def obs_dict(E, sub=None):
    o = {}
    for p in E["passes"]:
        o.setdefault(p["day"], []).append(p["p"] if sub is None else p["p"][sub])
    return o




# ---- deployed between-pass estimate: cross-track linear interpolation ------------------------------------
def interpolate(days, P, t, max_one_side=12):
    """Per-pixel flood probability on day t from the passes before and after it, on ANY track.

    days: (N,) pass days; P: (N, H, W) detector probabilities (NaN = not seen). Each pixel blends the nearest
    earlier and later passes that saw it, weighted by time; with only one side, that side's value.
    Validated leave-one-pass-out: beats copying the nearest pass on 17 of 20 hidden passes (Assam + Thailand).
    """
    days = np.asarray(days, float)[:, None, None]
    ok = np.isfinite(P)
    before = np.where(ok & (days <= t), days, -np.inf)
    after = np.where(ok & (days >= t), days, np.inf)
    ib, ia = before.argmax(0), after.argmin(0)
    pb, pa = np.take_along_axis(P, ib[None], 0)[0], np.take_along_axis(P, ia[None], 0)[0]
    db, da = before.max(0), after.min(0)
    hb, ha = np.isfinite(db), np.isfinite(da)
    w = np.where(hb & ha, (t - db) / np.maximum(da - db, 1), 0)
    out = np.where(hb & ha, pb * (1 - w) + pa * w, np.where(hb, pb, pa))
    # With a pass on one side only (before a pixel's first pass / after its last), estimate at most
    # `max_one_side` days away (NISAR's 12-day repeat): beyond that there is no estimate, never a forecast.
    near = (hb & ha) | (hb & (t - db <= max_one_side)) | (ha & (da - t <= max_one_side))
    return np.where(near, out, np.nan).astype("float32")
