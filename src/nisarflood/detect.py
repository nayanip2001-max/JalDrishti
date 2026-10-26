"""Probabilistic flood detection from a NISAR L-band GCOV time series.

Every clue is kept as its own log-odds term so a map pixel can be explained
("water-like now +4.1, was dry before +2.3, low HAND +1.0 ...") and so each
clue can be ablated when we measure accuracy.
"""
import numpy as np

# ESA WorldCover classes where L-band double bounce means water under canopy.
# Cropland (40) is excluded: transplanted rice standing in irrigation water is real
# double bounce too, and in a July monsoon scene it is indistinguishable from flooding
# (73% of flooded-vegetation false alarms in the 10 Jul null test were cropland).
VEGETATED = (10, 20, 30, 90, 95)
CLIP = 8.0


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def _sigmoid(x):
    return 1 / (1 + np.exp(-x))


def bimodal_tiles(hh, valid, tile=256, water_db=-15.0):
    """Pick tiles whose HH histogram has both water and land (split-based tile selection)."""
    sel = np.zeros_like(valid)
    h, w = hh.shape
    for r in range(0, h - tile + 1, tile):
        for c in range(0, w - tile + 1, tile):
            v = valid[r:r + tile, c:c + tile]
            if v.mean() < 0.9:
                continue
            frac = (hh[r:r + tile, c:c + tile][v] < water_db).mean()
            if 0.15 < frac < 0.85:
                sel[r:r + tile, c:c + tile] = v
    return sel


class WaterGMM:
    """Two-component 2-D Gaussian mixture on (HH, HV) dB: open water vs everything else."""

    def fit(self, x, iters=60, seed=0):
        rng = np.random.default_rng(seed)
        if len(x) > 400_000:
            x = x[rng.choice(len(x), 400_000, replace=False)]
        z = (x[:, 0] < -15).astype(float)
        resp = np.stack([z, 1 - z], 1) * 0.9 + 0.05
        for _ in range(iters):
            nk = resp.sum(0)
            self.pi = nk / nk.sum()
            self.mu = (resp.T @ x) / nk[:, None]
            self.cov = []
            for k in range(2):
                d = x - self.mu[k]
                self.cov.append((resp[:, k, None] * d).T @ d / nk[k] + np.eye(2) * 1e-3)
            self.cov = np.array(self.cov)
            ll = np.stack([self._logpdf(x, k) for k in range(2)], 1) + np.log(self.pi)
            ll -= ll.max(1, keepdims=True)
            resp = np.exp(ll)
            resp /= resp.sum(1, keepdims=True)
        if self.mu[0, 0] > self.mu[1, 0]:  # component 0 is the darker one = water
            self.mu, self.cov, self.pi = self.mu[::-1], self.cov[::-1], self.pi[::-1]
        return self

    def _logpdf(self, x, k):
        d = x - self.mu[k]
        inv = np.linalg.inv(self.cov[k])
        return -0.5 * np.einsum("ni,ij,nj->n", d, inv, d) - 0.5 * np.log(np.linalg.det(self.cov[k])) - np.log(2 * np.pi)

    def log_lr(self, hh, hv):
        """log p(x|water) - p(x|land), clipped. Prior-free: priors are added separately."""
        x = np.stack([hh.ravel(), hv.ravel()], 1)
        ok = np.isfinite(x).all(1)
        out = np.zeros(len(x), dtype="float32")
        out[ok] = self._logpdf(x[ok], 0) - self._logpdf(x[ok], 1)
        # Brighter than the land mean is never evidence for water, whatever the Gaussian tails say.
        out[ok & (x[:, 0] > self.mu[1, 0])] = np.minimum(out[ok & (x[:, 0] > self.mu[1, 0])], 0)
        return np.clip(out, -CLIP, CLIP).reshape(hh.shape)


def terrain_prior(hand, slope, jrc):
    """Log-odds priors. HAND bands follow Nobre et al. (2011): <5 m floodplain, >15 m upland."""
    hand = np.nan_to_num(hand, nan=50.0)
    l_hand = np.interp(hand, [0, 5, 15, 30], [1.0, 0.5, -2.5, -5.0]).astype("float32")
    l_slope = np.interp(np.nan_to_num(slope, nan=0), [0, 5, 10, 20], [0.0, 0.0, -2.0, -6.0]).astype("float32")
    perm = np.nan_to_num(jrc, nan=0) >= 50  # water more than half of 1984-2021: river/lake, not flood
    return l_hand, l_slope, perm


def predict_water(model, post, refs, anc):
    """Hybrid P(open water): learned model OR a physics rescue for dark, low-lying pixels.

    The rescue rule (HH < -15 dB and HAND < 10 m) was the best of five pre-registered
    combinations on leave-one-date-out validation (mean IoU 0.793 vs 0.780 model-only,
    0.736 threshold-only). Rescued pixels get p >= 0.51: water, but never "confident"
    on the threshold's word alone.
    Pixels with HH > -6 dB or slope >= 10 deg skip the model (p = 0): <=1% of model-water
    pixels on any validation fold were that bright, and steep slopes cannot flood here.
    """
    from .features import build
    X, names, valid = build(post, refs, anc)
    cols = [names.index(n) for n in model.feature_name()]
    hh = post["HHHH"]
    hand = np.nan_to_num(anc["hand"], nan=99.0)
    cand = valid & (hh < -6) & (np.nan_to_num(anc["slope"], nan=0) < 10)
    p = np.zeros(valid.shape, dtype="float32")
    p.ravel()[np.flatnonzero(cand)] = model.predict(X.reshape(-1, X.shape[-1])[cand.ravel()][:, cols], num_threads=4)
    rescue = valid & (hh < -15) & (hand < 10)
    p[rescue] = np.maximum(p[rescue], 0.51)
    p[~valid] = np.nan
    return p


def detect(post, refs, anc, model=None, p_before=None):
    """Flood probabilities for one post-event scene against same-track reference scenes.

    post/refs: dicts from stack.load(); anc: dict with hand, slope, jrc, worldcover.
    model: optional trained water classifier (v2). p_before: its P(water) on the reference
    passes (median over refs), computed once per track by the caller.
    Returns dict of float32 layers (probabilities and log-odds terms) and a uint8 class map.
    """
    valid = post["valid"]
    ref_hh = np.nanmedian(np.stack([r["HHHH"] for r in refs]), 0)
    ref_hv = np.nanmedian(np.stack([r["HVHV"] for r in refs]), 0)
    valid &= np.isfinite(ref_hh)

    sel = bimodal_tiles(post["HHHH"], valid)
    if sel.sum() < 10_000:  # few bimodal tiles: fall back to all valid low-HAND pixels
        sel = valid & (np.nan_to_num(anc["hand"], nan=99) < 10)
    gmm = WaterGMM().fit(np.stack([post["HHHH"][sel], post["HVHV"][sel]], 1))

    l_now = gmm.log_lr(post["HHHH"], post["HVHV"])
    l_before = gmm.log_lr(ref_hh, ref_hv)
    l_hand, l_slope, perm = terrain_prior(anc["hand"], anc["slope"], anc["jrc"])
    prior = _logit(np.float32(0.2)) + l_hand + l_slope  # base rate: ~1 in 5 floodplain pixels floods

    if model is None:
        p_water_now = _sigmoid(l_now + prior)
        p_water_before = _sigmoid(l_before + prior)
    else:
        p_water_now = predict_water(model, post, refs, anc)
        p_water_before = p_before
    p_open = p_water_now * (1 - p_water_before)
    p_open[perm] = 0

    # Flooded vegetation: HH rises from double bounce (trunk/stem + water surface), HV much less.
    d_hh = post["HHHH"] - ref_hh
    d_hv = post["HVHV"] - ref_hv
    stable = valid & (np.abs(d_hh) < 6)
    mu0, sd0 = np.nanmedian(d_hh[stable]), 1.4826 * np.nanmedian(np.abs(d_hh[stable] - np.nanmedian(d_hh[stable])))
    z = (d_hh - mu0) / max(sd0, 0.3)
    veg = np.isin(anc["worldcover"], VEGETATED)
    l_dbl = np.clip(1.5 * (z - 3.0), -CLIP, CLIP)  # 3 sigma above no-change = even odds
    l_ratio = np.clip(1.5 * ((d_hh - d_hv) - 1.5), -CLIP, CLIP)  # co-pol gain beyond cross-pol
    l_hv_flat = np.clip(1.5 * (1.5 - d_hv), -CLIP, CLIP)  # wet soil / growth raise HV too; double bounce barely does
    p_veg = _sigmoid(np.minimum.reduce([l_dbl, l_ratio, l_hv_flat]) + l_hand + l_slope)
    p_veg[~veg | perm] = 0

    p_any = 1 - (1 - p_open) * (1 - p_veg)
    cls = np.zeros(valid.shape, np.uint8)            # 0 = no data
    cls[valid] = 1                                   # dry / no flood
    cls[valid & (perm | (p_water_before > 0.5) & (p_water_now > 0.5))] = 2   # permanent or pre-existing water
    cls[valid & (p_open > 0.5)] = 4                  # possible open-water flood
    cls[valid & (p_open > 0.8)] = 3                  # open-water flood
    cls[valid & (p_veg > 0.5) & (p_open <= 0.5)] = 6  # possible flooded vegetation
    cls[valid & (p_veg > 0.8) & (p_open <= 0.5)] = 5  # flooded vegetation
    cls[valid & (p_any > 0.35) & (p_any <= 0.5)] = 7  # uncertain

    nan = lambda a: np.where(valid, a, np.nan).astype("float32")
    return {
        "class": cls,
        "p_open": nan(p_open), "p_veg": nan(p_veg), "p_flood": nan(p_any),
        "p_water_now": nan(p_water_now), "p_water_before": nan(p_water_before),
        "l_now": nan(l_now), "l_before": nan(-l_before), "l_hand": nan(l_hand), "l_slope": nan(l_slope),
        "d_hh": nan(d_hh), "d_hv": nan(d_hv),
        "gmm": {"mu": gmm.mu.tolist(), "pi": gmm.pi.tolist(), "noch_mu": float(mu0), "noch_sd": float(sd0)},
    }


CLASSES = {0: "no data", 1: "dry", 2: "permanent / pre-existing water", 3: "flood (open water)",
           4: "possible flood (open water)", 5: "flooded vegetation", 6: "possible flooded vegetation",
           7: "uncertain"}
