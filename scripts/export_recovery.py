"""Recovery + flood-scar layers for one event or user region (see src/nisarflood/recovery.py for the method).

  python scripts/export_recovery.py assam                     -> web/public/data/assam/recovery/
  python scripts/export_recovery.py <region> <flood_dir> <out_dir>   (used by map_region.py --until)

Writes: duration.webp (days under water), scars.webp (river-bank change), lookup.png (per-pixel look indices for
click-to-explain, 100 m) and recovery.json (looks, curves per land cover, recovery index, districts, scar stats).
"""
import sys, json, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import numpy as np
import rasterio
from rasterio.warp import Resampling
from PIL import Image
from nisarflood.webgrid import WebGrid
from nisarflood.recovery import recovery, duration_class, curves, recovery_index, scars, NONE

t0 = time.time()
AOI = sys.argv[1]
src = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / f"data/processed/flood/{AOI}_v2"
out = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / f"web/public/data/{AOI}/recovery"
out.mkdir(parents=True, exist_ok=True)
anc = ROOT / "data/processed/ancillary" / AOI

summary = json.loads((src / "summary.json").read_text())
looks = []
for rec in summary:
    name = f"T{rec['track']:03d}_{rec['date']}" + ("_nullTest" if rec["kind"] == "null_test" else "")
    with rasterio.open(src / f"{name}.tif") as r:
        looks.append({"date": rec["date"], "track": rec["track"], "kind": rec["kind"], "cls": r.read(1).astype(np.uint8)})
        T, CRS, px_km2 = r.transform, r.crs, abs(r.transform.a * r.transform.e) / 1e6
R = recovery(looks)
ordered = sorted(looks, key=lambda x: (x["date"], x["kind"] != "null_test"))
read = lambda f: rasterio.open(anc / f).read(1) if (anc / f).exists() else None
wc, jrc, dist = read("worldcover.tif"), read("jrc_occurrence.tif"), read("districts.tif")
COVERS = {40: "Cropland", 10: "Trees", 50: "Built-up", (30, 90): "Grass / wetland"}
km2 = lambda m: round(float(m.sum()) * px_km2, 1)

# ---- recovery curves and summary
# curves per track (tracks see different footprints, so mixing them makes a saw-tooth); the main track leads
tracks = sorted({L["track"] for L in ordered}, key=lambda t: -sum(L["kind"] == "post" and L["track"] == t for L in ordered))
cur_by = {}
if wc is not None:
    for t in tracks:
        sub = dict(R, looks=[L2 for L2, L in zip(R["looks"], ordered) if L["track"] == t])
        cur_by[str(t)] = curves(sub, [L["cls"] for L in ordered if L["track"] == t], wc, px_km2, COVERS)
# lead with the track that saw the flood at its fullest (a track that missed the peak shows a flat, misleading curve)
if cur_by:
    tracks.sort(key=lambda t: -max([v for v in cur_by[str(t)]["all"] if v is not None] or [0]))
cur = cur_by.get(str(tracks[0])) if cur_by else None
def half_dry(series, dates):
    s = [(v, d) for v, d in zip(series, dates) if v is not None]
    if len(s) < 2:
        return None
    k = max(range(len(s)), key=lambda i: s[i][0])
    for v, d in s[k + 1:]:
        if v <= s[k][0] / 2:
            return int((np.datetime64(d[:10]) - np.datetime64(s[k][1][:10])).astype(int))
    return None
mid = np.where(R["dmax"] >= 0, (R["dmin"] + R["dmax"]) / 2, R["dmin"]).astype(np.float32)
ever = R["ever"]
def block(m):
    e = ever & m
    if km2(e) < 1:
        return None
    closed = e & (R["dmax"] >= 0)
    return {"flooded_km2": km2(e), "days_min_median": int(np.median(R["dmin"][e])),
            "days_max_median": int(np.median(R["dmax"][closed])) if closed.any() else None,
            "still_wet_km2": km2(e & R["still_wet"]), "reflooded_km2": km2(e & (R["spells"] >= 2)),
            "longer_than_4_weeks_km2": km2(e & (mid >= 28))}
covers = {}
for code, name in COVERS.items():
    if wc is None:
        break
    b = block(np.isin(wc, code if isinstance(code, tuple) else (code,)))
    if b:
        b["recovery_index"] = recovery_index(cur[name]) if cur else None
        b["half_dry_days"] = half_dry(cur[name], cur["dates"]) if cur else None
        covers[name] = b
districts = {}
if dist is not None and (anc / "districts.geojson").exists():
    names = {f["properties"]["id"]: f["properties"]["shapeName"] for f in json.loads((anc / "districts.geojson").read_text())["features"]}
    for did, nm in names.items():
        b = block(dist == did)
        if b and b["flooded_km2"] >= 2:
            districts[nm] = b

# ---- flood scars: the track with the most post passes that has a pre-flood (null-test) look
sc_out = None
if jrc is not None:
    nulls = [L for L in ordered if L["kind"] == "null_test"]
    by_track = {}
    for L in ordered:
        by_track.setdefault(L["track"], []).append(L)
    cands = sorted((t for t in by_track if any(L["kind"] == "null_test" for L in by_track[t])),
                   key=lambda t: -sum(L["kind"] == "post" for L in by_track[t]))
    if cands:
        t = cands[0]
        pre = [L for L in by_track[t] if L["kind"] == "null_test"][-1]
        ps = [L for L in by_track[t] if L["kind"] == "post"]
        peak = max(range(len(ps)), key=lambda i: int(np.isin(ps[i]["cls"], (3, 5)).sum()))
        after_peak = peak < len(ps) - 1
        posts = [(L["date"], L["cls"]) for L in ps[peak + 1:]] or [(ps[-1]["date"], ps[-1]["cls"])]   # after the flood peak only
        noise = (nulls[0]["cls"], nulls[1]["cls"]) if len(nulls) >= 2 else None
        S = scars(pre["cls"], posts, jrc, noise_pair=noise)
        if S:
            px_m = abs(T.a)
            bank_km = S["bank_px"] * px_m / 1000
            sc_out = {"track": t, "pre": pre["date"], "post": S["pairs"], "erosion_km2": round(S["erosion_px"] * px_km2, 2),
                      "accretion_km2": round(S["accretion_px"] * px_km2, 2), "bank_km": round(bank_km, 1),
                      # area-based mean bank retreat / advance (REAL): changed area / bank length, over this season only
                      "mean_retreat_m": round(S["erosion_px"] * px_km2 * 1e6 / max(bank_km * 1000, 1), 1),
                      "mean_advance_m": round(S["accretion_px"] * px_km2 * 1e6 / max(bank_km * 1000, 1), 1),
                      "min_detectable_m": round(0.35 * px_m, 1), "after_peak": after_peak,
                      "stage_ok": all(p["stage_diff"] <= 0.10 for p in S["pairs"])}
            if noise is not None:
                nb_km = S["noise_bank_px"] * px_m / 1000
                sc_out["noise"] = {"looks": [nulls[0]["date"] + f"·T{nulls[0]['track']}", nulls[1]["date"] + f"·T{nulls[1]['track']}"],
                                   "erosion_km2": round(S["noise_erosion_px"] * px_km2, 2), "accretion_km2": round(S["noise_accretion_px"] * px_km2, 2),
                                   "retreat_m": round(S["noise_erosion_px"] * px_km2 * 1e6 / max(nb_km * 1000, 1), 1),
                                   "advance_m": round(S["noise_accretion_px"] * px_km2 * 1e6 / max(nb_km * 1000, 1), 1),
                                   "cross_track": nulls[0]["track"] != nulls[1]["track"]}
                n = sc_out["noise"]
                ok = sc_out["after_peak"] and sc_out["stage_ok"]
                # hotspots: change patches larger than the largest noise patch, biggest first, with their location
                from rasterio.transform import xy
                from rasterio.warp import transform as wtransform
                lim = S["noise_max_patch_px"]
                hot = []
                for kind, m in (("erosion", S["erosion"]), ("accretion", S["accretion"])):
                    sizes, lab = __import__("nisarflood.recovery", fromlist=["patches"]).patches(m)
                    big = np.flatnonzero(sizes > lim)
                    if not len(big):
                        continue
                    from scipy import ndimage as ndi
                    cms = ndi.center_of_mass(m, lab, big + 1)
                    xs, ys = xy(T, [int(r) for r, _ in cms], [int(c) for _, c in cms])
                    lons, lats = wtransform(CRS, "EPSG:4326", xs, ys)
                    hot += [{"kind": kind, "km2": round(float(sizes[i]) * px_km2, 2), "lon": round(lo, 5), "lat": round(la, 5)} for i, lo, la in zip(big, lons, lats)]
                hot.sort(key=lambda h: -h["km2"])
                sc_out["hotspot_min_km2"] = round(lim * px_km2, 3)
                sc_out["hotspots"] = hot[:8] if ok else []
                sc_out["hotspot_count"] = len(hot) if ok else 0
                sc_out["hotspot_km2"] = round(sum(h["km2"] for h in hot), 2) if ok else 0
                sc_out["erosion_significant"] = ok and sc_out["erosion_km2"] > 2 * n["erosion_km2"] and sc_out["mean_retreat_m"] >= sc_out["min_detectable_m"] / 2
                sc_out["accretion_significant"] = ok and sc_out["accretion_km2"] > 2 * n["accretion_km2"] and sc_out["mean_advance_m"] >= sc_out["min_detectable_m"] / 2

# ---- images on the web grid
G = WebGrid(AOI)
DUR = {1: (186, 230, 253, 200), 2: (96, 165, 250, 215), 3: (99, 102, 241, 225), 4: (124, 58, 237, 235), 5: (244, 63, 94, 235)}
k = G.warp(duration_class(R), Resampling.nearest, nodata=0)
rgba = np.zeros(k.shape + (4,), np.uint8)
for v, c in DUR.items():
    rgba[k == v] = c
Image.fromarray(rgba, "RGBA").save(out / "duration.webp", "WEBP", lossless=True, method=6)
if sc_out:
    s = np.zeros(S["river_pre"].shape, np.uint8)
    s[S["river_pre"]] = 1; s[S["erosion"]] = 2; s[S["accretion"]] = 3
    s = G.warp(s, Resampling.nearest, nodata=0)
    rgba = np.zeros(s.shape + (4,), np.uint8)
    rgba[s == 1] = (30, 64, 175, 90); rgba[s == 2] = (249, 115, 22, 245); rgba[s == 3] = (250, 204, 21, 245)
    Image.fromarray(rgba, "RGBA").save(out / "scars.webp", "WEBP", lossless=True, method=6)
f = 4
idx = lambda a: G.warp(a, Resampling.nearest, nodata=NONE, factor=f)
lk = np.stack([idx(R["first"]), idx(R["last"]), idx(R["dry_after"])], -1)
lk[..., 0] = np.where((idx(np.where(R["spells"] >= 2, 1, 0).astype(np.uint8)) == 1) & (lk[..., 0] != NONE), lk[..., 0] | 128, lk[..., 0])
Image.fromarray(lk, "RGB").save(out / "lookup.png", optimize=True)

res = {"method": "Per-pixel merge of every NISAR pass (all tracks): wet = confident flood (classes 3, 5), dry = class 1. "
                 "Days under water is a range: min = last wet look - first wet look; max = first dry look after - last dry look before.",
       "looks": R["looks"], "days": R["days"].tolist(), "corners": G.corners,
       "totals": block(np.ones_like(ever)), "covers": covers, "curves": cur, "curves_by_track": cur_by, "main_track": tracks[0], "districts": districts, "scars": sc_out,
       "duration_classes": {"1": "< 2 weeks", "2": "2–4 weeks", "3": "4–8 weeks", "4": "> 8 weeks", "5": "not seen dry again"},
       "duration_colors": {str(v): "#%02x%02x%02x" % c[:3] for v, c in DUR.items()}}
if res["totals"] and cur:
    res["totals"]["recovery_index"] = recovery_index(cur["all"])
    res["totals"]["half_dry_days"] = half_dry(cur["all"], cur["dates"])
    last = [v for v in cur["all"] if v is not None]
    res["totals"]["recovering"] = bool(last) and last[-1] < max(last)        # False: water still at its highest at the last look
(out / "recovery.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps({k: res[k] for k in ("totals", "covers", "scars")}, indent=1))
print(f"wrote {out} in {time.time() - t0:.0f} s")
