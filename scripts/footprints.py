import asf_search as asf
from shapely.geometry import shape, box
core = box(93.7, 26.3, 95.0, 27.2)  # Golaghat-Jorhat-Sivasagar-Charaideo-Majuli
r = asf.search(dataset=asf.DATASET.NISAR, processingLevel="GCOV", intersectsWith=core.wkt,
               start="2026-06-01", end="2026-09-01", maxResults=200)
seen = {}
for g in r:
    p = g.properties
    if "_PR_" not in p["sceneName"]: continue
    k = (p["pathNumber"], p["flightDirection"])
    fp = shape(g.geometry)
    seen.setdefault(k, []).append((p["startTime"][:10], p["sceneName"].split("_")[7], round(fp.intersection(core).area / core.area * 100)))
    seen[k+("bounds",)] = [round(v,2) for v in fp.bounds]
for k, v in seen.items():
    print(k, v)
