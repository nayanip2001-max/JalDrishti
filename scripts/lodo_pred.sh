#!/bin/sh
# Re-run the relative-feature LODO folds keeping per-pixel test probabilities (for ensembling).
cd "$(dirname "$0")/.."
PY=.venv/Scripts/python
A=40:2026-07-22:2026-07-21; B=163:2026-08-12:2026-08-10; C=40:2026-08-15:2026-08-15
LR=${1:-0.05}; TAG=${2:-rel}
D="--lr $LR --drop hh,hv,ref_hh,ref_hv,ref_hh_min,hh_m3,hh_m7,hh_m15,hv_m7 --folds 1 --save-pred"
$PY scripts/train_lgbm.py $B $C --test $A $D --tag ${TAG}_A
$PY scripts/train_lgbm.py $A $C --test $B $D --tag ${TAG}_B
$PY scripts/train_lgbm.py $A $B --test $C $D --tag ${TAG}_C
