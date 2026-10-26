#!/bin/sh
# Leave-one-date-out: train on two NISAR/S2 pairs, test on the third, for two feature sets.
cd "$(dirname "$0")/.."
PY=.venv/Scripts/python
A=40:2026-07-22:2026-07-21
B=163:2026-08-12:2026-08-10
C=40:2026-08-15:2026-08-15
ABS=hh,hv,ref_hh,ref_hv,ref_hh_min,hh_m3,hh_m7,hh_m15,hv_m7

for fs in full relative; do
  [ "$fs" = relative ] && D="--drop $ABS" || D=""
  $PY scripts/train_lgbm.py $B $C --test $A --folds 1 $D --tag lodo_${fs}_testA
  $PY scripts/train_lgbm.py $A $C --test $B --folds 1 $D --tag lodo_${fs}_testB
  $PY scripts/train_lgbm.py $A $B --test $C --folds 1 $D --tag lodo_${fs}_testC
done
