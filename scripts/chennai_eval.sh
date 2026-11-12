#!/bin/sh
# Chennai accuracy protocol, fixed before any Chennai result was seen (12 Nov 2026).
#   Reference: Sentinel-2 cloud-free open water (MNDWI, ±0.1 margin), same or adjacent day; open sea excluded.
#   Same 13 relative features and settings as the Assam/Thailand models (lr 0.2, early stopping).
#   A) Assam-only model, zero-shot            B) Thailand-adapted model, zero-shot for Chennai
#   C) Assam + ONE auto-labelled Chennai dry-season scene (T084 14 Jul / S2 15 Jul); everything else held out:
#      other dates of the same track, the other track (T156) and all northeast-monsoon dates.
#   Baselines on the same pixels: fixed −15 dB threshold and Otsu.
set -e
DROP=hh,hv,ref_hh,ref_hv,ref_hh_min,hh_m3,hh_m7,hh_m15,hv_m7
ASSAM="40:2026-07-22:2026-07-21 163:2026-08-12:2026-08-10 40:2026-08-15:2026-08-15"
TEST="chennai@84:2026-08-31:2026-09-01 chennai@156:2026-06-25:2026-06-25 chennai@156:2026-10-11:2026-10-11 \
      chennai@84:2026-10-30:2026-10-31 chennai@156:2026-11-04:2026-11-05 chennai@84:2026-11-11:2026-11-10"
export PYTHONIOENCODING=utf-8 OMP_WAIT_POLICY=PASSIVE
PY=.venv/Scripts/python
$PY scripts/train_lgbm.py --model models/lgbm_final_rel02.txt --drop $DROP --test $TEST --tag chennai_A_assam
$PY scripts/train_lgbm.py --model models/lgbm_adapt_th.txt --drop $DROP --test $TEST --tag chennai_B_thailand
$PY scripts/train_lgbm.py $ASSAM chennai@84:2026-07-14:2026-07-15 --drop $DROP --lr 0.2 --folds 1 --tag chennai_C_adapt --test $TEST
