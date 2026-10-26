"""Compare pre-registered model/threshold combinations on the three LODO folds.

Rules are fixed before looking at results; the winner is chosen by mean IoU over the
held-out folds (cross-validation model selection, reported as such).
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
from nisarflood.evaluate import evaluate


def soft_threshold(hh, t=-15.0, width=1.5):
    return 1 / (1 + np.exp((hh - t) / width))


RULES = {
    "model p>0.5": lambda d: d["prob"] > 0.5,
    "HH < -15 dB": lambda d: d["hh"] < -15,
    "model OR (HH<-15 & HAND<10)": lambda d: (d["prob"] > 0.5) | ((d["hh"] < -15) & (np.nan_to_num(d["hand"], nan=99) < 10)),
    "mean(model, soft threshold) > 0.5": lambda d: 0.5 * (d["prob"] + soft_threshold(d["hh"])) > 0.5,
    "model p>0.4": lambda d: d["prob"] > 0.4,
}

prefix = sys.argv[1] if len(sys.argv) > 1 else "rel"
folds = {"22 Jul T040": f"{prefix}_A", "12 Aug T163": f"{prefix}_B", "15 Aug T040": f"{prefix}_C"}
table = {}
for fold, tag in folds.items():
    z = np.load(f"outputs/eval/pred_{tag}.npz")
    shape = tuple(z["shape"])
    d = {k: z[k] for k in ("prob", "hh", "hand")}
    y = np.zeros(shape, bool); y.ravel()[z["idx"]] = z["y"]
    mask = np.zeros(shape, bool); mask.ravel()[z["idx"]] = True
    for name, rule in RULES.items():
        pred = np.zeros(shape, bool); pred.ravel()[z["idx"]] = rule(d)
        table.setdefault(name, {})[fold] = evaluate(pred, y, mask, n_boot=200)

print(f"{'rule':38s}" + "".join(f"{f:>16s}" for f in folds) + f"{'mean':>8s}")
for name, res in table.items():
    ious = [res[f]["IoU"] for f in folds]
    print(f"{name:38s}" + "".join(f"{v:16.3f}" for v in ious) + f"{np.mean(ious):8.3f}")
best = max(table, key=lambda n: np.mean([table[n][f]["IoU"] for f in folds]))
print("selected by mean LODO IoU:", best)
Path(f"outputs/eval/ensemble_lodo{'' if prefix == 'rel' else '_' + prefix}.json").write_text(json.dumps({"rules": table, "selected": best}, indent=1))
