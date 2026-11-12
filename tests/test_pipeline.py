"""Fast tests for ingestion, preprocessing, inference and map publication (no network, synthetic data).

Run: python -m pytest -q tests
"""
import sys, json, subprocess
from pathlib import Path
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))


# ---- ingestion -----------------------------------------------------------------------------------------
def _p(kind, track, date, ver="001"):
    return {"sceneName": f"NISAR_L2_{kind}_GCOV_035_{track:03d}_A_008_4005_DHDH_A_{date.replace('-', '')}T001627_X_P05036_F_F_J_{ver}",
            "pathNumber": track, "startTime": f"{date}T00:16:27Z"}


def test_science_product_beats_urgent_response():
    from nisarflood.gcov import best_products
    best, every = best_products([_p("UR", 84, "2026-10-30"), _p("PR", 84, "2026-10-30"), _p("UR", 84, "2026-11-11")], {84})
    assert best[(84, "2026-10-30")]["sceneName"].split("_")[2] == "PR"
    assert best[(84, "2026-11-11")]["sceneName"].split("_")[2] == "UR"      # UR used until a science product exists
    assert len(every[(84, "2026-10-30")]) == 2


def test_latest_reprocessing_and_track_filter():
    from nisarflood.gcov import best_products
    best, _ = best_products([_p("PR", 84, "2026-10-30", "001"), _p("PR", 84, "2026-10-30", "002"), _p("PR", 40, "2026-10-30")], {84})
    assert best[(84, "2026-10-30")]["sceneName"].endswith("002") and (40, "2026-10-30") not in best


def test_granule_metadata_parsing():
    from nisarflood.webexport import obs_meta
    m = obs_meta(_p("UR", 149, "2026-11-03")["sceneName"].replace("_A_008", "_D_082"), "DHDH")
    assert m["direction"] == "Descending" and m["frame"] == 82 and m["product_type"] == "UR" and m["polarisations"] == ["HH", "HV"]
    assert obs_meta(None, None)["granule"] is None


# ---- preprocessing ----------------------------------------------------------------------------------------
def test_sea_mask_excludes_coastal_sea_but_keeps_lakes():
    from nisarflood.evaluate import sea_mask
    wc = np.full((50, 50), 40, np.uint8)
    wc[:, 40:] = 80          # sea on the east edge
    wc[10:15, 10:15] = 80    # inland lake
    s = sea_mask(wc, "east", buffer_px=0)
    assert s[:, 40:].all() and not s[10:15, 10:15].any()


def test_lee_filter_keeps_nan_and_reduces_speckle():
    from nisarflood.stack import lee
    rng = np.random.default_rng(0)
    img = rng.exponential(0.1, (64, 64)).astype("float32"); img[0, 0] = np.nan
    out = lee(img)
    assert np.isnan(out[0, 0]) and np.nanstd(out) < np.nanstd(img)


# ---- inference --------------------------------------------------------------------------------------------
def _scene(rng, shape=(96, 96), water=None):
    hh = rng.normal(-8, 1.5, shape).astype("float32"); hv = rng.normal(-15, 1.5, shape).astype("float32")
    if water is not None:
        hh[water] = rng.normal(-20, 1.0, water.sum()); hv[water] = rng.normal(-27, 1.0, water.sum())
    return {"HHHH": hh, "HVHV": hv, "valid": np.ones(shape, bool)}


def test_reference_pack_gives_identical_map():
    """The live monitor maps against a median-only pack; detection must not depend on more than the median."""
    from nisarflood.detect import detect
    rng = np.random.default_rng(1)
    shape = (96, 96)
    anc = {"hand": np.full(shape, 2.0, "float32"), "slope": np.zeros(shape, "float32"),
           "jrc": np.zeros(shape, "float32"), "worldcover": np.full(shape, 40, np.uint8)}
    water = np.zeros(shape, bool); water[20:60, 20:60] = True
    refs = [_scene(rng) for _ in range(5)]
    post = _scene(rng, water=water)
    pack = {"HHHH": np.nanmedian(np.stack([r["HHHH"] for r in refs]), 0), "HVHV": np.nanmedian(np.stack([r["HVHV"] for r in refs]), 0)}
    a, b = detect(post, refs, anc), detect(post, [pack], anc)
    assert np.array_equal(a["class"], b["class"]) and np.allclose(a["p_flood"], b["p_flood"], equal_nan=True)
    assert (a["class"][water] == 3).mean() > 0.8                      # the new water is found


def test_tracker_fills_gap_between_flooded_passes():
    from nisarflood import tracker as T
    theta = np.array([-6.7, 2.0, -5.5, -2.0, 0.9, 2.2, -0.26])     # parameters fitted on Thailand
    hand = np.array([[1.0, 1.0]], "float32")
    wet, dry = np.array([[0.95, 0.05]], "float32"), np.array([[0.05, 0.05]], "float32")
    obs = {0: [dry], 10: [wet], 20: [wet]}
    q = T.posterior(theta, obs, 30, hand, np.zeros(30), 15, "smooth")
    assert q[0, 0] > 0.8 and q[0, 1] < 0.2
    # Leaving out the day-10 pass: smoothing still uses day 20, filtering cannot.
    qs = T.posterior(theta, obs, 30, hand, np.zeros(30), 10, "smooth", skip=(10, 0))
    qf = T.posterior(theta, obs, 30, hand, np.zeros(30), 10, "filter", skip=(10, 0))
    assert qs[0, 0] > qf[0, 0]
    d = T.daily(theta, obs, 30, hand, np.zeros(30))
    assert d.shape == (30, 1, 2) and float(d[15, 0, 0]) > 0.8


# ---- manual upload validation ---------------------------------------------------------------------------
def test_upload_rejects_geographic_crs(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    bad = tmp_path / "after_2026-10-07.tif"
    with rasterio.open(bad, "w", driver="GTiff", dtype="float32", count=2, width=8, height=8, crs="EPSG:4326",
                       transform=rasterio.transform.from_origin(80, 13, 0.001, 0.001)) as d:
        d.write(np.ones((2, 8, 8), "float32"))
    refs = [tmp_path / f"before_2026-09-{d}.tif" for d in ("13", "25")]
    for r in refs:
        r.write_bytes(bad.read_bytes())
    p = subprocess.run([sys.executable, str(ROOT / "scripts/map_region.py"), "--name", "pytest_bad", "--upload", str(bad),
                        "--refs", *map(str, refs)], capture_output=True, text=True, cwd=ROOT)
    assert p.returncode != 0 and "geographic" in (p.stdout + p.stderr)
    (ROOT / "data/regions/pytest_bad.json").unlink(missing_ok=True)


# ---- map publication --------------------------------------------------------------------------------------
def test_pass_images_written_on_web_grid(tmp_path):
    from nisarflood.webgrid import WebGrid
    from nisarflood.webexport import pass_images
    from nisarflood.aoi import grid
    from PIL import Image
    G = WebGrid("chennai")
    _, _, w, h = grid("chennai")
    rng = np.random.default_rng(2)
    L = {k: rng.random((h, w)).astype("float32") for k in ("p_flood", "p_open", "p_veg", "d_hh", "l_now", "l_before", "l_hand", "l_slope")}
    L["class"] = rng.integers(1, 8, (h, w)).astype(np.uint8)
    for sub in ("cls", "prob", "ev"):
        (tmp_path / sub).mkdir()
    out = pass_images(G, tmp_path, "T084_2026-11-11", L)
    im = Image.open(tmp_path / out["cls"])
    assert im.size == (G.dw, G.dh) and im.mode == "RGBA"
    assert all((tmp_path / p).exists() for p in out["ev"])


def test_live_status_file_is_consistent():
    p = ROOT / "web/public/data/chennai/live.json"
    if not p.exists():
        pytest.skip("live monitor not initialised")
    live = json.loads(p.read_text(encoding="utf-8"))
    assert live["status"] in {"No new observation", "New scene detected", "Data downloading", "Processing",
                              "Flood map generated", "Processing failed"}
    for q in live.get("passes", []):
        assert q["acquired"] <= (q.get("processing_end") or "9999")      # a map can never predate its observation


def test_interpolation_blends_tracks_and_never_forecasts():
    from nisarflood.tracker import interpolate
    P = np.array([[[0.0, np.nan]], [[1.0, 0.8]]], "float32")      # pass A (day 0) misses pixel 2; pass B (day 10) sees both
    q = interpolate([0, 10], P, 4)
    assert abs(q[0, 0] - 0.4) < 1e-6 and abs(q[0, 1] - 0.8) < 1e-6   # one-sided within 12 days: nearest value
    assert np.isnan(interpolate([0, 10], P, 30)).all()             # 20 days after the last pass: no estimate
