"""Train / test the learned water classifier on NISAR features vs Sentinel-2 labels.

Protocol (so the score means something):
  * spatial blocks of 128 px (2.56 km) are the unit of splitting, never single pixels
  * boosting rounds come from early stopping on held-out spatial blocks
    (--folds 5: 5-fold spatial CV, final rounds = median best; --folds 1: one 20% hold-out)
  * test pairs are other dates / tracks the model never saw
Usage:
  train_lgbm.py <train pairs> [--test <pairs>] [--drop f1,f2] [--folds 1|5] [--tag name]
  train_lgbm.py --model models/x.txt --test <pairs>       # score an existing model
  pair = track:nisar_date:s2_date
"""
import sys, json, argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np, rasterio, lightgbm as lgb
from nisarflood.stack import scenes, load
from nisarflood.features import build
from nisarflood.evaluate import evaluate, otsu
from nisarflood.events import EVENTS

AOI, BLOCK = "assam", 128  # training event; test pairs may name another event
ap = argparse.ArgumentParser()
ap.add_argument("train", nargs="*")
ap.add_argument("--test", nargs="*", default=[])
ap.add_argument("--model", help="score an existing model instead of training")
ap.add_argument("--drop", default="", help="comma-separated features to exclude")
ap.add_argument("--folds", type=int, default=5)
ap.add_argument("--lr", type=float, default=0.05)
ap.add_argument("--per-scene", type=int, default=1_500_000)
ap.add_argument("--tag", default="v2")
ap.add_argument("--save-pred", action="store_true", help="keep test probabilities for offline ensembling")
args = ap.parse_args()
drop = set(filter(None, args.drop.split(",")))

_anc, _scenes, _refs = {}, {}, {}


def event_data(aoi):
    """Ancillary layers and scene list for an event (cached)."""
    if aoi not in _anc:
        d = Path(f"data/processed/ancillary/{aoi}")
        rd = lambda n: rasterio.open(d / f"{n}.tif").read(1)
        _anc[aoi] = {"hand": rd("hand"), "slope": rd("slope"), "jrc": rd("jrc_occurrence"), "worldcover": rd("worldcover")}
        _scenes[aoi] = scenes(aoi)
    return _anc[aoi], _scenes[aoi]


def pair_data(spec):
    """Features, labels and evaluation mask for one NISAR/S2 pair: [event@]track:nisar_date:s2_date."""
    aoi, spec = spec.split("@") if "@" in spec else (AOI, spec)
    track, nd, s2d = spec.split(":")
    track = int(track)
    anc, all_sc = event_data(aoi)
    if (aoi, track) not in _refs:
        last_pre = EVENTS[aoi]["last_pre"]
        _refs[(aoi, track)] = [load(s, aoi) for s in all_sc if s["track"] == track and s["date"] <= last_pre]
    post = load(next(s for s in all_sc if s["track"] == track and s["date"] == nd), aoi)
    X, names, valid = build(post, _refs[(aoi, track)], anc)
    keep = [i for i, n in enumerate(names) if n not in drop]
    lab = rasterio.open(f"data/processed/labels/{aoi}/s2_{s2d}.tif").read(1)
    mask = valid & (lab > 0) & (np.nan_to_num(anc["slope"]) < 10)
    return X[..., keep], [names[i] for i in keep], lab == 2, mask, post["HHHH"], anc["hand"]


def block_id(shape):
    r, c = np.indices(shape)
    return (r // BLOCK) * 10_000 + (c // BLOCK)


PARAMS = dict(objective="binary", learning_rate=args.lr, num_threads=4,  # 4 = P-cores; E-cores slow OpenMP down
              num_leaves=63, min_data_in_leaf=200,
              feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=0)


def train(specs):
    rng = np.random.default_rng(0)
    Xs, ys, gs = [], [], []
    for i, spec in enumerate(specs):
        X, names, y, m, _, _ = pair_data(spec)
        idx = rng.choice(np.flatnonzero(m), min(int(m.sum()), args.per_scene), replace=False)
        Xs.append(X.reshape(-1, X.shape[-1])[idx]); ys.append(y.ravel()[idx])
        gs.append(block_id(m.shape).ravel()[idx] + 10**7 * i)
        print(f"train {spec}: {len(idx)} px, water {ys[-1].mean():.3f}", flush=True)
    X, y, g = np.concatenate(Xs), np.concatenate(ys), np.concatenate(gs)
    ub = np.unique(g)
    fold = dict(zip(ub, rng.permutation(len(ub)) % 5))
    fold = np.vectorize(fold.get)(g)
    cat = ["worldcover"] if "worldcover" in names else []
    cv, iters = [], []
    for k in range(args.folds):
        tr, va = fold != k, fold == k
        bst = lgb.train(PARAMS, lgb.Dataset(X[tr], y[tr], feature_name=names, categorical_feature=cat),
                        num_boost_round=5000, valid_sets=[lgb.Dataset(X[va], y[va])],
                        callbacks=[lgb.early_stopping(100, verbose=False)])
        p = bst.predict(X[va], num_iteration=bst.best_iteration) > 0.5
        cv.append(float(np.sum(p & y[va]) / np.sum(p | y[va]))); iters.append(bst.best_iteration)
        print(f"  fold {k}: IoU {cv[-1]:.3f}, best round {bst.best_iteration}", flush=True)
    rounds = int(np.median(iters))
    model = lgb.train(PARAMS, lgb.Dataset(X, y, feature_name=names, categorical_feature=cat), num_boost_round=rounds)
    imp = dict(sorted(zip(names, model.feature_importance("gain").round(0).tolist()), key=lambda t: -t[1]))
    return model, {"train": specs, "features": names, "cv_iou": cv, "best_rounds": iters, "rounds": rounds,
                   "params": PARAMS, "gain_importance": imp}


if args.model:
    model, report = lgb.Booster(model_file=args.model), {"model": args.model}
else:
    model, report = train(args.train)
    Path("models").mkdir(exist_ok=True)
    model.save_model(f"models/lgbm_{args.tag}.txt")
    print(f"spatial CV IoU {np.mean(report['cv_iou']):.3f}; rounds {report['rounds']}; top {list(report['gain_importance'])[:6]}")

report["test"] = {}
for spec in args.test:
    Xt, _, yt, mt, hh, hand = pair_data(spec)
    idx = np.flatnonzero(mt)  # predicting only labelled pixels keeps tests to minutes
    prob = model.predict(Xt.reshape(-1, Xt.shape[-1])[idx])
    pred = np.zeros(mt.shape, bool)
    pred.ravel()[idx] = prob > 0.5
    if args.save_pred:
        names_t = report.get("features") or model.feature_name()
        np.savez_compressed(f"outputs/eval/pred_{args.tag}.npz", idx=idx, prob=prob.astype("float32"), y=yt.ravel()[idx],
                            hh=hh.ravel()[idx], hand=hand.ravel()[idx], shape=np.array(mt.shape))
    hybrid = pred | (mt & (hh < -15) & (np.nan_to_num(hand, nan=99) < 10))
    res = {"lgbm": evaluate(pred, yt, mt), "hybrid": evaluate(hybrid, yt, mt),
           "HH < -15 dB": evaluate(hh < -15, yt, mt),
           "Otsu(HH)": evaluate(hh < otsu(hh[np.isfinite(hh)]), yt, mt)}
    report["test"][spec] = res
    for k, v in res.items():
        print(f"TEST {spec} {k:12s} IoU {v['IoU']:.3f} {v['ci95']['IoU']}  P {v['precision']:.3f}  R {v['recall']:.3f}  k {v['kappa']:.3f}", flush=True)

Path("outputs/eval").mkdir(parents=True, exist_ok=True)
Path(f"outputs/eval/lgbm_{args.tag}.json").write_text(json.dumps(report, indent=1))
