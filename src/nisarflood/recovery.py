"""Flood recovery (how long the land stayed under water) and flood scars (river-bank change) from the per-pass
JalDrishti class maps of one event or user region. Pure array code on the event's 20 m UTM grid.

Recovery (Idea 5). Every pass of every track is one look; a pixel's looks are merged in time order.
  wet = confident flood (classes 3, 5); dry = class 1; anything else (possible, uncertain, no data) = unknown.
  Pre-flood null-test passes only contribute "dry before" looks. Per pixel:
    first_wet / last_wet       first and last look that saw it flooded
    dry_after                  first dry look after the last wet look (none = not seen dry again)
    spells                     separate wet spells (2+ = the water came back after the land had dried)
  Days under water is a RANGE, never one invented number:
    min = last_wet - first_wet         (it was certainly wet between those looks)
    max = dry_after - last dry look before first_wet   (it cannot have been wet outside the bracketing dry looks)

Flood scars (Idea 2), after Rowland et al. (2016, SCREAM) and Langhorst & Pavelsky (2023, REAL): area-based
land<->river transitions between a pre-flood and a post-flood look of the SAME track (same geometry).
  river      open water (classes 2, 3) connected to JRC permanent water (occurrence >= 50 %), within a search buffer
  erosion    land before -> river after;   accretion   river before -> dry land after
  stage      water level changes look like bank change (REAL's main caveat): the post pass whose river area is
             closest to the pre-flood river area is used, the relative difference is reported, and a change must
             be seen on the two best-matched post passes (persistence) and form a patch of >= 6 pixels.
  noise      the same computation between two PRE-flood looks (no real bank change expected) gives a false-change
             floor, as REAL does with simulated classification noise.
"""
import numpy as np
from scipy import ndimage

WET, DRY = (3, 5), 1
NONE = 255


def _d(s):
    return np.datetime64(s, "D")


def recovery(looks, valid_any=None):
    """looks: list of dicts (date, kind 'post'|'null_test', cls uint8 array), any order. Returns per-pixel arrays."""
    looks = sorted(looks, key=lambda x: (x["date"], x["kind"] != "null_test"))
    sh = looks[0]["cls"].shape
    first, last, dry_after, last_dry_before = (np.full(sh, NONE, np.uint8) for _ in range(4))
    n_wet, spells = np.zeros(sh, np.uint8), np.zeros(sh, np.uint8)
    for i, L in enumerate(looks):
        c = L["cls"]
        dry = c == DRY
        if L["kind"] == "post":
            wet = np.isin(c, WET)
            again = wet & (dry_after != NONE)                       # dried, now wet again: a new spell
            spells[again] += 1; dry_after[again] = NONE
            new = wet & (first == NONE)
            first[new] = i; spells[new] = 1
            last[wet] = i; n_wet[wet] += 1
        before = dry & (first == NONE)
        last_dry_before[before] = i
        after = dry & (first != NONE) & (dry_after == NONE)
        dry_after[after] = i
    days = np.array([(_d(L["date"]) - _d(looks[0]["date"])).astype(int) for L in looks], np.int32)
    ever = first != NONE
    dmin = np.where(ever, days[np.minimum(last, len(days) - 1)] - days[np.minimum(first, len(days) - 1)], -1)
    end = np.where(dry_after != NONE, days[np.minimum(dry_after, len(days) - 1)], -1)
    start = np.where(last_dry_before != NONE, days[np.minimum(last_dry_before, len(days) - 1)], -1)
    dmax = np.where(ever & (end >= 0) & (start >= 0), end - start, -1)       # -1 = open-ended
    return {"looks": [{"date": L["date"], "track": L.get("track"), "kind": L["kind"]} for L in looks], "days": days,
            "first": first, "last": last, "dry_after": dry_after, "last_dry_before": last_dry_before,
            "n_wet": n_wet, "spells": spells, "ever": ever, "still_wet": ever & (dry_after == NONE),
            "dmin": dmin.astype(np.int16), "dmax": dmax.astype(np.int16)}


def duration_class(R):
    """0 none, 1 < 2 weeks, 2 2-4 weeks, 3 4-8 weeks, 4 > 8 weeks, 5 not seen dry again. Uses the range midpoint;
    open-ended spells use their minimum."""
    mid = np.where(R["dmax"] >= 0, (R["dmin"] + R["dmax"]) / 2, R["dmin"])
    k = np.zeros(mid.shape, np.uint8)
    for lo, v in ((0, 1), (14, 2), (28, 3), (56, 4)):
        k[R["ever"] & (mid >= lo)] = v
    k[R["still_wet"]] = 5
    return k


def curves(R, looks_cls, cover, px_km2, covers):
    """Share of the ever-flooded area still under water at each post look, per land cover (and all).
    looks_cls: classes of each look in R['looks'] order. cover: WorldCover array. covers: {code: name}."""
    out = {"dates": [], "all": [], **{n: [] for n in covers.values()}}
    ever = R["ever"]
    for L, c in zip(R["looks"], looks_cls):
        if L["kind"] != "post":
            continue
        seen = ever & (c > 0)
        wet = seen & np.isin(c, WET)
        out["dates"].append(f"{L['date']}·T{L['track']}")
        def share(m):
            n = int((seen & m).sum())
            return round(float((wet & m).sum() / n), 4) if n * px_km2 >= 1 else None    # need >= 1 km2 observed
        out["all"].append(share(np.ones_like(ever)))
        for code, name in covers.items():
            out[name].append(share(np.isin(cover, code if isinstance(code, tuple) else (code,))))
    return out


def recovery_index(series):
    """Mean dry share of the flooded area over the looks after the peak (0 = stayed wet, 100 = dried at once)."""
    s = [v for v in series if v is not None]
    if len(s) < 2:
        return None
    k = int(np.argmax(s))
    after = s[k + 1:]
    return round(100 * float(np.mean([1 - v / max(s[k], 1e-9) for v in after])), 1) if after else None


def _river(water, jrc, zone):
    lab, n = ndimage.label(water & zone)
    if not n:
        return np.zeros_like(water)
    keep = np.unique(lab[(jrc >= 50) & water & zone])
    keep = keep[keep > 0]
    return np.isin(lab, keep)


def _clean(m, min_px=6):
    lab, n = ndimage.label(m)
    if not n:
        return m
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return np.isin(lab, np.flatnonzero(sizes >= min_px) + 1)


def patches(m):
    """Connected patches: (sizes in px, label image)."""
    lab, n = ndimage.label(m)
    return (ndimage.sum(m, lab, range(1, n + 1)).astype(int) if n else np.array([], int)), lab


def scars(pre, posts, jrc, buffer_px=75, noise_pair=None):
    """pre: class array of a pre-flood look; posts: [(date, cls)] of the SAME track after the flood.
    noise_pair: (cls_a, cls_b) two pre-flood looks for the false-change floor. Returns masks + stats."""
    zone = ndimage.binary_dilation(jrc >= 50, iterations=buffer_px)
    water = lambda c: np.isin(c, (2, 3))
    r_pre = _river(water(pre), jrc, zone)
    a_pre = int(r_pre.sum())
    if a_pre < 200:
        return None
    ranked = []
    for d, c in posts:
        v = (c > 0) & (pre > 0)
        r = _river(water(c), jrc, zone)
        ranked.append((abs(int((r & v).sum()) - int((r_pre & v).sum())) / max(int((r_pre & v).sum()), 1), d, c, r, v))
    ranked.sort(key=lambda x: x[0])
    use = ranked[:2]
    ero, acc, val = None, None, None
    for stage, d, c, r, v in use:
        e = r & ~water(pre) & (pre == DRY) & v
        a = r_pre & (c == DRY) & v
        ero = e if ero is None else ero & e
        acc = a if acc is None else acc & a
        val = v if val is None else val & v
    ero, acc = _clean(ero), _clean(acc)
    bank = r_pre & ~ndimage.binary_erosion(r_pre)                      # bank pixels of the pre-flood river
    out = {"erosion": ero, "accretion": acc, "river_pre": r_pre, "valid": val,
           "pairs": [{"date": d, "stage_diff": round(s, 3)} for s, d, *_ in use], "bank_px": int((bank & val).sum()),
           "erosion_px": int(ero.sum()), "accretion_px": int(acc.sum())}
    if noise_pair is not None:
        a0, b0 = noise_pair
        v = (a0 > 0) & (b0 > 0)
        ra, rb = _river(water(a0), jrc, zone), _river(water(b0), jrc, zone)
        out["noise_erosion_px"] = int(_clean(rb & ~water(a0) & (a0 == DRY) & v).sum())
        out["noise_accretion_px"] = int(_clean(ra & (b0 == DRY) & v).sum())
        out["noise_bank_px"] = int((ra & ~ndimage.binary_erosion(ra) & v).sum())
        # hotspot test: a patch bigger than every patch that pure noise produced cannot be noise
        ne = _clean(rb & ~water(a0) & (a0 == DRY) & v); na = _clean(ra & (b0 == DRY) & v)
        out["noise_max_patch_px"] = int(max([0, *patches(ne)[0], *patches(na)[0]]))
    return out
