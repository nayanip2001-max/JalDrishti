import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
from nisarflood.recovery import recovery, duration_class, scars


def look(date, vals, kind="post", track=1):
    return {"date": date, "kind": kind, "track": track, "cls": np.array([vals], np.uint8)}


def test_day_range_drying_and_reflooding():
    # pixel 0: dry, wet, wet, dry            -> min 12 d, max 36 d, dried 2026-01-37
    # pixel 1: dry, wet, dry, wet            -> came back, not seen dry again
    # pixel 2: never wet
    # pixel 3: wet at the first post look, possible (4) after -> unknown, not seen dry again
    L = [look("2026-01-01", [1, 1, 1, 1], "null_test"), look("2026-01-13", [3, 3, 1, 3]),
         look("2026-01-25", [5, 1, 1, 4]), look("2026-02-06", [1, 3, 1, 4])]
    R = recovery(L)
    assert R["ever"].tolist() == [[True, True, False, True]]
    assert R["dmin"][0, 0] == 12 and R["dmax"][0, 0] == 36
    assert R["spells"][0, 1] == 2 and R["still_wet"][0, 1]
    assert R["still_wet"][0, 3] and R["dmax"][0, 3] == -1
    assert duration_class(R).tolist() == [[2, 5, 0, 5]]


def test_null_test_wet_is_not_flood():
    R = recovery([look("2026-01-01", [3], "null_test"), look("2026-01-13", [1])])
    assert not R["ever"].any()


def test_scars_need_connection_to_permanent_river():
    n = 60
    jrc = np.zeros((n, n), np.uint8); jrc[:, 20:30] = 100          # permanent river, columns 20-29
    pre = np.ones((n, n), np.uint8); pre[:, 20:30] = 2
    post = pre.copy(); post[:, 30:34] = 3                          # bank moved 4 px to the right
    post[5:10, 50:55] = 3                                          # an isolated pond: not river
    S = scars(pre, [("a", post), ("b", post)], jrc, buffer_px=20)
    assert S["erosion_px"] == n * 4                                # pond excluded, bank change kept
    assert S["accretion_px"] == 0
