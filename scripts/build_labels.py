"""Sentinel-2 open-water reference labels for dates matching NISAR passes.

Usage: build_labels.py <event> <s2_date:track:nisar_date> ...
Resumable: dates already in labels.json with their GeoTIFF on disk are skipped.
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from nisarflood.optical import water_labels
from nisarflood.ancillary import write

AOI = sys.argv[1]
PAIRS = {p.split(":")[0]: (int(p.split(":")[1]), p.split(":")[2]) for p in sys.argv[2:]}
out = Path(f"data/processed/labels/{AOI}"); out.mkdir(parents=True, exist_ok=True)
meta = json.loads((out / "labels.json").read_text()) if (out / "labels.json").exists() else {}
for d, (track, nd) in PAIRS.items():
    if d in meta and (out / f"s2_{d}.tif").exists():
        continue
    r = water_labels(AOI, d)
    if r is None:
        print(d, "no items"); continue
    write(out / f"s2_{d}.tif", r["label"], AOI, "S2 open water label: 0 none, 1 land, 2 water", nodata=0)
    write(out / f"s2_{d}_mndwi.tif", r["mndwi"], AOI, "S2 MNDWI")
    meta[d] = {"nisar_track": track, "nisar_date": nd, "clear_pct": round(float(r["clear"].mean() * 100), 1),
               "water_px": int((r["label"] == 2).sum()), "land_px": int((r["label"] == 1).sum()), "tiles": r["n_items"]}
    print(d, meta[d], flush=True)
    (out / "labels.json").write_text(json.dumps(meta, indent=1))
