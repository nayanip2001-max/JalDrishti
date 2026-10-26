"""Accuracy metrics with spatial block bootstrap confidence intervals.

Pixels are spatially autocorrelated, so resampling single pixels would give
falsely narrow intervals; we resample whole blocks (default 128 px = 2.56 km).
"""
import numpy as np


def confusion(pred, ref):
    """pred, ref: bool arrays over the evaluated pixels."""
    tp = np.sum(pred & ref); fp = np.sum(pred & ~ref); fn = np.sum(~pred & ref); tn = np.sum(~pred & ~ref)
    return tp, fp, fn, tn


def scores(tp, fp, fn, tn):
    tp, fp, fn, tn = map(float, (tp, fp, fn, tn))
    n = tp + fp + fn + tn
    iou = tp / max(tp + fp + fn, 1)
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    f1 = 2 * prec * rec / max(prec + rec, 1e-9)
    po = (tp + tn) / n
    pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / n ** 2
    kappa = (po - pe) / max(1 - pe, 1e-9)
    return {"IoU": iou, "F1": f1, "precision": prec, "recall": rec, "kappa": kappa, "OA": po}


def evaluate(pred, ref, mask, block=128, n_boot=300, seed=0):
    """Scores of bool map `pred` against bool `ref` on `mask`, with 95% block-bootstrap CIs."""
    h, w = pred.shape
    stats = []
    for r in range(0, h, block):
        for c in range(0, w, block):
            m = mask[r:r + block, c:c + block]
            if m.sum() < 50:
                continue
            stats.append(confusion(pred[r:r + block, c:c + block][m], ref[r:r + block, c:c + block][m]))
    stats = np.array(stats, dtype=float)
    point = scores(*stats.sum(0))
    rng = np.random.default_rng(seed)
    boots = [scores(*stats[rng.integers(0, len(stats), len(stats))].sum(0)) for _ in range(n_boot)]
    ci = {k: (float(np.percentile([b[k] for b in boots], 2.5)), float(np.percentile([b[k] for b in boots], 97.5))) for k in point}
    return {"n_px": int(stats[:, :].sum()), "n_blocks": len(stats), **{k: round(v, 4) for k, v in point.items()},
            "ci95": {k: [round(a, 4), round(b, 4)] for k, (a, b) in ci.items()}}


def mcnemar(pred_a, pred_b, ref, mask):
    """Exact-enough McNemar chi-square (with continuity correction) between two maps."""
    a = pred_a[mask] == ref[mask]; b = pred_b[mask] == ref[mask]
    n01 = float(np.sum(a & ~b)); n10 = float(np.sum(~a & b))
    chi2 = (abs(n01 - n10) - 1) ** 2 / max(n01 + n10, 1)
    return {"a_only_correct": int(n01), "b_only_correct": int(n10), "chi2": round(chi2, 1)}


def otsu(x, bins=256):
    x = x[np.isfinite(x)]
    hist, edges = np.histogram(x, bins=bins)
    mids = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist); w1 = w0[-1] - w0
    m0 = np.cumsum(hist * mids) / np.maximum(w0, 1)
    m1 = (np.sum(hist * mids) - np.cumsum(hist * mids)) / np.maximum(w1, 1)
    return float(mids[np.argmax(w0 * w1 * (m0 - m1) ** 2)])
