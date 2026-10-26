import asf_search as asf, collections
aois = {
 "UpperAssam": "POLYGON((93.6 26.4,95.2 26.4,95.2 27.3,93.6 27.3,93.6 26.4))",
}
for name, wkt in aois.items():
    r = asf.search(dataset=asf.DATASET.NISAR, processingLevel="GCOV", intersectsWith=wkt,
                   start="2025-10-01", end="2026-10-25", maxResults=500)
    print(name, len(r))
    rows = []
    for g in r:
        p = g.properties
        rows.append((p.get("startTime","")[:10], p.get("pathNumber"), p.get("frameNumber"), p.get("flightDirection"), p.get("fileID") or p.get("sceneName")))
    import csv; w=csv.writer(open(f"data/catalog/{name}_gcov.csv","w",newline="")); w.writerow(["date","path","frame","dir","granule"]); w.writerows(sorted(rows))
