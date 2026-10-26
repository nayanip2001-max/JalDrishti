"""Flood events: everything event-specific lives here so every script works for any event.

`last_pre` is the last date treated as "before the flood" (reference passes are the
same-track passes on or before it). Dates and descriptions cite public reporting.
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
        "caveat": "Central Thailand is intensively irrigated rice land; standing water in paddies before 20 Sep is treated as "
                  "normal, so mapped flood is water that is new since then. Dense Bangkok streets are beyond what radar can map.",
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
