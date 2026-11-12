"""Flood events: everything event-specific lives here so every script works for any event.

`last_pre` is the last date treated as "before the flood" (reference passes are the
same-track passes on or before it). `timeline` = dated, sourced context events shown on
the app's timeline (kind: rain | dam | river | official). Dates and descriptions cite
public reporting.
"""

EVENTS = {
    "assam": {
        "title": "Upper Assam floods · July 2026",
        "subtitle": "Golaghat · Jorhat · Sivasagar · Charaideo · Majuli",
        "country": "India", "iso3": "IND",
        "bounds": (93.7, 26.3, 95.0, 27.2), "epsg": 32646,
        "tracks": (40, 163), "fetch": ("2026-06-01", "2026-10-25"),
        "last_pre": "2026-07-17",
        "window": ("2026-06-10", "2026-10-25"),
        "marker": {"date": "2026-07-19", "label": "Cloudburst, Mon (Nagaland)"},
        "phases": [("Before", "2026-06-10", "2026-07-18", "#94a3b8"),
                   ("During", "2026-07-18", "2026-08-20", "#22d3ee"),
                   ("After / recovery", "2026-08-20", "2026-10-25", "#34d399")],
        "context": "Cloudburst over Mon district, Nagaland on 19 Jul 2026 swelled the Dikhow, Disang, Janji and Dhansiri "
                   "while a high Brahmaputra blocked their drainage (Wikipedia: 2026 Assam floods; Assam University report).",
        "timeline": [
            {"date": "2026-07-19", "kind": "rain", "label": "Cloudburst over Mon district, Nagaland",
             "source": "Wikipedia: 2026 Assam floods"},
        ],
        "caveat": "July is Sali rice transplanting season, so some newly flooded paddies count as new water; the 15 Aug map "
                  "(290 km², paddies still flooded) caps that share. The Assam University report counts ~2.12 lakh people "
                  "displaced: displacement is a subset of living inside the flood extent.",
    },
    "thailand": {
        "title": "Chao Phraya floods · Sep–Oct 2026",
        "subtitle": "Ayutthaya · Pathum Thani · northern Bangkok",
        "country": "Thailand", "iso3": "THA",
        "bounds": (100.2, 13.7, 100.9, 14.6), "epsg": 32647,
        "tracks": (4, 11, 112), "fetch": ("2026-08-01", "2026-10-25"),
        "last_pre": "2026-09-20",
        "window": ("2026-08-10", "2026-10-25"),
        "marker": {"date": "2026-09-24", "label": "Rains + dam releases"},
        "phases": [("Before", "2026-08-10", "2026-09-23", "#94a3b8"),
                   ("During: rain, then river rise", "2026-09-23", "2026-10-25", "#22d3ee")],
        "context": "A depression flooded Bangkok and central Thailand from 24 to 30 Sep 2026 (Wikipedia: 2026 Bangkok floods). "
                   "Chao Phraya Dam releases then pushed the river beyond embankments in Ayutthaya, and officials warned of further "
                   "rises from northern runoff on 4 Oct (Khaosod English; Thai PBS World).",
        "timeline": [
            {"date": "2026-09-24", "kind": "rain", "label": "Depression rains begin over Bangkok and central Thailand",
             "source": "Wikipedia: 2026 Bangkok floods"},
            {"date": "2026-09-24", "kind": "dam", "label": "Dam releases push the Chao Phraya beyond embankments in Ayutthaya",
             "source": "Thai PBS World / Khaosod English"},
            {"date": "2026-09-29", "kind": "river", "label": "Bangkok floodwaters begin to ease",
             "source": "Wikipedia: 2026 Bangkok floods"},
            {"date": "2026-10-04", "kind": "official", "label": "ONWR warns Ayutthaya of a further ~10 cm rise from northern runoff",
             "source": "Khaosod English, 4 Oct 2026"},
        ],
        "caveat": "Central Thailand is intensively irrigated rice land; standing water in paddies before 20 Sep is treated as "
                  "normal, so mapped flood is water that is new since then. Dense Bangkok streets are beyond what radar can map.",
    },
    "chennai": {
        "title": "Chennai northeast monsoon · Oct–Nov 2026",
        "subtitle": "Chennai · Tiruvallur · Kancheepuram · Chengalpattu",
        "country": "India", "iso3": "IND",
        "bounds": (79.95, 12.75, 80.35, 13.35), "epsg": 32644,
        "tracks": (84, 149, 156), "fetch": ("2026-06-15", None),
        "coast": "east",   # Bay of Bengal: open sea is excluded from training and scoring   # open-ended: the live watcher keeps adding passes
        "last_pre": "2026-10-12",
        "window": ("2026-06-15", "2026-11-30"),
        "live": True,
        "marker": {"date": "2026-10-17", "label": "Northeast monsoon onset rains"},
        "phases": [("Before (dry season)", "2026-06-15", "2026-10-13", "#94a3b8"),
                   ("Northeast monsoon", "2026-10-13", "2026-11-30", "#22d3ee")],
        "context": "Chennai gets most of its rain from the northeast monsoon (Oct–Dec). Heavy rain from 17 Oct 2026 brought "
                   "flash-flood warnings (The Week, 18 Oct 2026); on 2 Nov the city averaged 76 mm in 24 h (NewsBytes). "
                   "IMD/IANS flagged a Bay of Bengal system that could bring more heavy rain around 15–20 Nov. "
                   "Then vs now: during Cyclone Michaung (3–8 Dec 2023) no Sentinel-1 radar pass covered central Chennai "
                   "between 30 Nov and 25 Dec 2023 (ASF archive search), so free radar missed the city's worst recent flood; "
                   "ISRO mapped it with RISAT-1A on 7 Dec. In 2026 NISAR images the whole city on two tracks (149, 156) on "
                   "back-to-back days every 12 days, and the western suburbs on a third (84).",
        "timeline": [
            {"date": "2026-10-17", "kind": "rain", "label": "Heavy rain from Saturday evening; flash-flood warnings for Chennai",
             "source": "The Week, 18 Oct 2026"},
            {"date": "2026-11-02", "kind": "rain", "label": "Chennai averages 76 mm in 24 h; 149 mm at Parrys (Royapuram)",
             "source": "NewsBytes"},
            {"date": "2026-11-10", "kind": "official", "label": "Forecast: Bay of Bengal system may bring heavy rain 15–20 Nov",
             "source": "IANS via MENAFN, 10 Nov 2026"},
        ],
        "caveat": "Most of Chennai is dense city, where street flooding is hard to see with radar backscatter alone; the map "
                  "is most reliable over open land, lake beds, marshes (Pallikaranai) and river floodplains. Many tanks "
                  "fill every monsoon: water that is new since the dry season is shown as flood even where it is seasonal.",
    },
    "valencia": {
        "title": "La Safor DANA floods · October 2026",
        "subtitle": "Gandia · Oliva · Pego marshes",
        "country": "Spain", "iso3": "ESP",
        "bounds": (-0.35, 38.75, 0.05, 39.15), "epsg": 32630,
        "tracks": (167,), "fetch": ("2026-08-15", "2026-10-25"),
        "last_pre": "2026-10-17",
        "window": ("2026-08-20", "2026-10-25"),
        "marker": {"date": "2026-10-18", "label": "DANA 'Adam' >600 l/m²"},
        "phases": [("Before", "2026-08-20", "2026-10-17", "#94a3b8"),
                   ("During / after", "2026-10-17", "2026-10-25", "#22d3ee")],
        "context": "DANA 'Adam' dropped more than 600 l/m² over La Safor and La Marina Alta around 18-19 Oct 2026; "
                   "Copernicus EMS activation EMSR935 mapped flooding around Gandia.",
    },
}


# User-defined regions ("map any region", scripts/map_region.py) live in data/regions/<name>.json with the
# same fields, so every script in the pipeline works for them unchanged.
def _load_regions():
    import json
    from pathlib import Path
    d = Path(__file__).resolve().parents[2] / "data" / "regions"
    for f in sorted(d.glob("*.json")) if d.exists() else []:
        r = json.loads(f.read_text(encoding="utf-8"))
        r["bounds"], r["tracks"], r["fetch"], r["window"] = (tuple(r["bounds"]), tuple(r["tracks"]),
                                                             tuple(r["fetch"]), tuple(r["window"]))
        r["phases"] = [tuple(p) for p in r.get("phases", [])]
        EVENTS.setdefault(f.stem, r)


_load_regions()
