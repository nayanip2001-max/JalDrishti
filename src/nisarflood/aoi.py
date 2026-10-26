"""Areas of interest. Bounds are lon/lat (W, S, E, N); processing happens in a fixed UTM grid."""
from pyproj import Transformer

from .events import EVENTS

AOIS = {k: {"bounds": v["bounds"], "epsg": v["epsg"]} for k, v in EVENTS.items()}

def utm_bounds(name, res=20):
    """AOI bounds in its UTM CRS, snapped outward to the processing grid."""
    a = AOIS[name]
    t = Transformer.from_crs(4326, a["epsg"], always_xy=True)
    w, s, e, n = a["bounds"]
    xs, ys = zip(*[t.transform(x, y) for x in (w, e) for y in (s, n)])
    snap = lambda v, up: (int(v // res) + (1 if up else 0)) * res
    return snap(min(xs), False), snap(min(ys), False), snap(max(xs), True), snap(max(ys), True)


def grid(name, res=20):
    """Canonical processing grid for an AOI: (crs, transform, width, height)."""
    from rasterio.transform import from_origin
    w, s, e, n = utm_bounds(name, res)
    return f"EPSG:{AOIS[name]['epsg']}", from_origin(w, n, res, res), (e - w) // res, (n - s) // res
