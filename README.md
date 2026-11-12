# JalDrishti: NISAR L-band flood intelligence

*NASA Space Apps Challenge 2026: "Dancing with the SARs"*

JalDrishti ("water vision") maps where floodwater appeared, how it spread and how it drained. It uses radar from **NISAR**, the NASA–ISRO satellite that sees through monsoon clouds, by day and by night. The app also shows how many people, how much farmland and how many kilometres of road sat inside the flood, and for every pixel it explains *why* it was flagged.

Every map in the app is built from real NISAR observations, and every accuracy number was measured on a date the model never saw.

**Live demo:** https://nayanip2001-max.github.io/JalDrishti/ · **Events:** Upper Assam, India (Jul 2026) · Chao Phraya, Thailand (Sep–Oct 2026) · **Chennai, India — live** (northeast monsoon, Oct–Nov 2026)

---

## What it shows

| Stage | What you see | Label |
|---|---|---|
| Before | Median of the pre-flood NISAR passes on the same track | Reference |
| During | Flood extent on every NISAR pass (~3-day revisit using two tracks), before/after swipe, flood-area timeline | **Observed** |
| After | Water receding pass by pass, down to the false-alarm noise floor | **Observed** |
| Impact | People, cropland, roads and rail inside the flood, per district | **Exposed** (not damage) |

Every layer carries one of the labels *Observed / Modelled / Predicted / Exposed / Damaged*.

**One dashboard, three depths.** A header toggle switches between **Beginner** (plain answers: where, how big, when, how sure, who is affected, how radar works), **Intermediate** (evidence: classes, probability, temporal and district analysis, model performance, sources) and **Advanced** (observations and orbit metadata, features and importance, model card, full validation metrics, raw pixel values and model trace). A **Science | Impact** switch changes the map layers and the emphasis. Every number opens a detail panel; clicking the map explains that pixel. The timeline shows rainfall, sourced events (rain, dam releases, official warnings) and every NISAR pass. Radar observations are never mixed with estimates.

**Three things no flood product we know of does together:** it updates itself from NISAR's hours-latency *Urgent Response* products, it fills the days between passes by blending passes from different orbit tracks (and shows that this beats the obvious alternative), and anyone can map a new region from a laptop or a free Colab notebook.

## Live monitor (Chennai)

A GitHub Actions job checks NASA's catalogue every 3 hours. When a new NISAR pass over Chennai appears, it streams only the Chennai subset, maps it against a stored reference pack and republishes the site. The **Live Monitor** tab shows the status, the latest observation and its age, and the expected next passes from the 12-day repeat.

- **Urgent Response products change the latency.** The science product (GCOV) took 50–377 h after the pass to appear. On 11 Nov 2026 the Urgent Response GCOV appeared **10.4 h** after the pass. JalDrishti uses a UR product until the science product replaces it, and labels which one it used. Every latency in the table is computed from NASA's own catalogue insert time; passes mapped before the monitor started are marked *backfill*.
- **Coverage.** Tracks 149 (descending) and 156 (ascending) image the whole city on back-to-back days every 12 days. Track 84 covers only the western 41% (the suburbs west of ~80.18° E).
- **Then and now.** For Cyclone Michaung (3–5 Dec 2023), the ASF archive has **no Sentinel-1 acquisition** over central Chennai between 30 Nov and 25 Dec 2023. In 2026, NISAR images the whole city twice every 12 days.
- **Chennai accuracy (fixed protocol, `scripts/chennai_eval.sh`).** Scored against Sentinel-2 water on the monsoon dates (hybrid IoU):

  | Date · track | Assam model | Thailand-adapted | **Chennai-adapted (deployed)** | Threshold −15 dB | Otsu |
  |---|---|---|---|---|---|
  | 30 Oct · T84 | 0.440 | 0.556 | **0.578** | 0.440 | 0.123 |
  | 4 Nov · T156 | 0.547 | 0.682 | **0.557** | 0.542 | 0.217 |
  | 11 Nov · T84 (UR) | 0.508 | 0.554 | **0.604** | 0.498 | 0.184 |
  | **Mean** | 0.498 | 0.597 | **0.580** | 0.493 | 0.175 |

  The deployed model was chosen before scoring and is not swapped after, even though the Thailand-adapted model scored higher on 4 Nov and on the mean. It beats the threshold on every monsoon date, but the confidence intervals overlap on each date. Dry-season dates score ≤ 0.36 for every method (little water to find). Confident new flood so far is small (2–7 km² per pass): this is an early, moderate monsoon, and street flooding is not visible to backscatter.

## Between passes (Modelled)

NISAR sees a place every few days. For the days in between, each pixel blends the nearest earlier and later passes that saw it, **from any track**, weighted by time. Passes from different orbits fill each other's gaps. It is labelled **Modelled**, never Observed, and gives no estimate more than 12 days from a pass, so it never forecasts.

- **Validation (leave-one-pass-out, Assam + Thailand).** Each pass was hidden and predicted from the others. Blending beat copying the nearest pass on **17 of 20** passes (2 ties; sign test p = 0.0013), mean IoU 0.472 vs 0.423.
- **Negative result.** We also built a per-pixel hidden Markov flood-state model driven by rain and terrain (`src/nisarflood/tracker.py`). Fitted on Thailand it helped in Assam, but fitted on Assam it failed in Thailand (0 of 7), and a physically constrained version was worse in both directions. It is not deployed.

## Map any region

`scripts/map_region.py` maps any area, two ways:

- **From NISAR:** `python scripts/map_region.py --name mytown --bbox W S E N --date 2026-11-04` finds the best-covering pass within ±1 day and at least two earlier passes on the same track, streams only the subset and maps it.
- **From your own files:** `--upload after_2026-11-04.tif --refs before_2026-10-11.tif before_2026-10-23.tif`. Uploads are checked before use: a projected CRS (not lat/lon), 1–30 m pixels, HH and HV bands, plausible backscatter (dB is converted), dates in the file names, references dated before the flood scene, and at least 50% overlap.

Outputs: a GeoTIFF (class and probability), a GeoJSON of confident flood, a quicklook PNG and a summary marked *not validated for this region*. The same thing runs in a free notebook: [`notebooks/map_any_region.ipynb`](notebooks/map_any_region.ipynb) (open in Colab; asks for your free NASA Earthdata login).

## Method

1. **Data.** NISAR L2 **GCOV** (geocoded, terrain-corrected γ⁰) from ASF DAAC. Only the area of interest is streamed out of each ~7 GB HDF5 file, then multilooked to 20 m and Lee-filtered. The background layers are Copernicus GLO-30 DEM, ASF GLO-30 **HAND**, JRC Global Surface Water, ESA WorldCover, WorldPop 2025, OpenStreetMap and geoBoundaries.
2. **Change, not darkness.** A dark radar pixel is not always flood. It could be a river, a paddy field, shadow or smooth ground. Each pass is compared with the median of earlier passes from the *same track*. "Flood" means water now **and** not water before, outside JRC permanent water.
3. **Hybrid detector (deployed).** A LightGBM classifier uses 13 physically meaningful, scene-relative features: HH/HV relative to the scene median, 7–15 px change from the reference, texture, HV/HH ratio, HAND, slope, JRC occurrence and land cover. Its result is OR-ed with a physics rescue for dark, low-lying pixels (HH < −15 dB and HAND < 10 m). This rule was picked from five combinations fixed in advance, by held-out score.
4. **Explainable.** Each clue (water-like now, dry before, low ground, echo change) is stored as log-odds, so clicking a pixel shows how much each clue pushed the decision.
5. **Flooded vegetation.** L-band double bounce (HH rises, HV stable) is used under trees, grass and wetland. It is *not* used on cropland: 73% of flooded-vegetation false alarms in a no-flood test were July rice fields.

## Evidence

**Held-out accuracy, Assam (leave-one-date-out).** The model is trained on two NISAR/Sentinel-2 pairs and scored on the third, a different date or a different orbit track. The reference is Sentinel-2 cloud-free open water from the same or an adjacent day. 95% confidence intervals come from a spatial block bootstrap. Scores are IoU (overlap with the reference water map, 0 to 1, higher is better).

| Held-out pass | **JalDrishti hybrid** | ML only | Threshold −15 dB | Otsu |
|---|---|---|---|---|
| 22 Jul · track 40 (peak) | **0.763** [0.747–0.779] | 0.750 | 0.632 | 0.702 |
| 12 Aug · track 163 (other orbit) | **0.795** [0.771–0.813] | 0.810 | 0.769 | 0.554 |
| 15 Aug · track 40 | **0.820** [0.799–0.838] | 0.780 | 0.807 | 0.536 |
| **Mean** | **0.793** | 0.780 | 0.736 | 0.597 |

- **False alarms.** We compared two pre-flood dates with no flood between them, which should show nothing. JalDrishti flagged **5.9 km²** (2.9 open water + 3.0 under vegetation) out of 13,178 km² mapped on track 40. The physics-only version flagged 47.5 km². Track 163 has only two reference passes, so its test falls back to the physics detector (57.8 km² of 11,071 km²).
- **Why L-band.** On 22 Jul, Sentinel-1 (C-band) passed **41 minutes** after NISAR. We ran the same detector on both and scored them against the same reference:

  | | Water IoU | Precision | Recall |
  |---|---|---|---|
  | NISAR L-band | **0.645** [0.576–0.706] | 0.84 | **0.74** |
  | Sentinel-1 C-band | 0.536 [0.446–0.617] | 0.96 | 0.55 |

  NISAR found 63 km² of flooded cropland that C-band missed, against 23 km² the other way round. C-band is more conservative; L-band reaches water under the rice canopy.
- **New country.** Trained in Assam only, the model scores IoU 0.61 in Thailand, below the threshold's 0.755. Adding **one** automatically labelled Thailand scene (from Sentinel-2, with no manual work) raises it to **0.838** [0.812–0.861], above the threshold's 0.755 [0.714–0.787], and the confidence intervals do not overlap. So JalDrishti adapts to a new region from free data alone.
- **A gap in existing systems.** On 26 Oct 2026, NASA's CMR catalogue listed no OPERA DSWx-S1 surface-water granules over the Assam area between 9 Jul and 13 Sep 2026. That 66-day gap covers the whole flood. JalDrishti maps the whole event from NISAR.

## Honest limitations

- **Revisit.** NISAR is not real-time. Here, two tracks give a pass every ~3 days. A flash flood can drain between passes. In Valencia (DANA, Oct 2026) the only post-event pass came 4 days later, and its swath edge missed most of the area mapped by Copernicus EMS (EMSR935). We report this as a limitation, not a result.
- **Paddies.** July is Sali rice transplanting season. Some newly flooded paddies count as "new water", so the 22 Jul figures are upper bounds. The 15 Aug map (290 km², with paddies still flooded) caps that share.
- **Exposure ≠ damage.** Our 3.2–6.6 lakh people *living inside* the 22 Jul flood extent compares with the Assam University report of ~2.12 lakh *displaced*. Displaced people are a subset of those living inside the extent.
- **Urban flooding.** Water between buildings cannot be mapped reliably from backscatter alone. This matters most in Chennai, where open water shows up in tanks, lakes, marshland (Pallikaranai) and the city's edges. Coherence from NISAR GUNW products (also in the Urgent Response stream) is the next step.
- **Live monitor dependencies.** The 3-hourly job needs a NASA Earthdata login stored as repository secrets. GitHub pauses scheduled jobs after 60 days without commits; each new map is a commit, so an active season keeps it running.
- **Provisional NISAR products.** In GCOV, the HH–VV phase calibration stored in the metadata (+63°) is not applied to the data. Once it is applied, 7 Jul behaves physically: built-up areas show double bounce, with 40% of pixels above 90° phase against ~19% elsewhere. However, 24 Aug shows an extra ~180° ambiguity. JalDrishti therefore does not depend on co-pol phase.
- **Validation sources.** NRSC/Bhuvan and ASDMA products could not be accessed. Validation uses Sentinel-2, Sentinel-1 and Copernicus EMS.

## Reproduce

```bash
python -m venv .venv && .venv/Scripts/pip install asf_search earthaccess h5py rasterio rioxarray xarray scipy scikit-image \
    geopandas pystac-client planetary-computer lightgbm matplotlib pillow requests
# NASA Earthdata login in ~/.netrc
python scripts/fetch_gcov.py assam                 # stream NISAR GCOV subsets
python scripts/build_ancillary.py assam            # DEM, HAND, JRC, WorldCover
python scripts/build_exposure_inputs.py assam      # WorldPop, districts, OSM roads
python scripts/build_labels.py assam 2026-07-21:40:2026-07-22 2026-08-10:163:2026-08-12 2026-08-15:40:2026-08-15
sh scripts/lodo_pred.sh 0.2 rel02 && python scripts/ensemble_eval.py rel02   # held-out validation
python scripts/run_detect.py assam --model models/lgbm_final_rel02.txt       # hybrid flood maps + exposure
python scripts/export_web.py assam data/processed/flood/assam_v2               # web assets
cd web && npm install && npm run dev
```

Other events work the same way: they are defined in `src/nisarflood/events.py`. Regions mapped with `map_region.py` are added from `data/regions/`.

Live monitor: `python scripts/build_refpack.py chennai --model models/lgbm_chennai_C_adapt.txt` builds the reference pack (published as the `livepack` release), and `python scripts/live_update.py chennai` checks for and maps new passes (`--check-only` lists them with their latency). Tests: `python -m pytest -q tests`.

## Data and credits

NISAR data: NASA/JPL and ISRO, distributed by ASF DAAC. Sentinel-1 RTC, Sentinel-2 L2A, Copernicus GLO-30, ESA WorldCover and JRC GSW were accessed via Microsoft Planetary Computer. ASF GLO-30 HAND. WorldPop 2025. OpenStreetMap contributors. geoBoundaries. Copernicus EMS EMSR935. Rainfall: ERA5 via Open-Meteo. Basemaps by Esri.

**Team JalWar:** Thrinayani P · Thrijagathi P · Minhaj Parveen H · Nilani S · Haseena F
