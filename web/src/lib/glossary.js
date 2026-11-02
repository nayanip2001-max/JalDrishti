// "Explain this": each term has a plain-language and a technical explanation.

export const GLOSSARY = {
  nisar: {
    term: 'NISAR',
    simple: 'A satellite built by NASA (USA) and ISRO (India). It carries a radar that can see the ground through clouds, by day and by night.',
    technical: 'NASA–ISRO Synthetic Aperture Radar, launched 30 July 2025. L-band (24 cm, NASA) and S-band (9.4 cm, ISRO) SAR, 12-day exact repeat; ascending + descending passes give a revisit of a few days. Data distributed by ASF DAAC.',
  },
  radar: {
    term: 'Radar (SAR)',
    simple: 'The satellite sends out its own radio waves and listens for the echo, like a bat. It does not need sunlight, and clouds do not block it.',
    technical: 'Synthetic Aperture Radar: an active microwave sensor that synthesises a long antenna from the platform\'s motion to reach metre-scale resolution. Measures backscattered power and phase.',
  },
  backscatter: {
    term: 'Backscatter (γ⁰)',
    simple: 'How much of the radar echo comes back. Calm water acts like a mirror and bounces the radar away, so it looks dark. Rough land and plants send more back and look brighter.',
    technical: 'Radiometrically terrain-corrected gamma-naught (γ⁰), the backscatter coefficient normalised by the illuminated area, in dB. NISAR GCOV provides the polarimetric covariance terms; HHHH and HVHV are γ⁰ in HH and HV.',
  },
  hhhv: {
    term: 'HH and HV',
    simple: 'Two ways the radar can send and receive its waves. HH is good at spotting smooth water. HV reacts more to plants and leaves.',
    technical: 'Polarisation channels: HH = horizontal transmit, horizontal receive (co-pol); HV = horizontal transmit, vertical receive (cross-pol, sensitive to volume scattering). Quad-pol passes add VH and VV.',
  },
  lband: {
    term: 'L-band',
    simple: 'Long radar waves (about 24 cm). They pass between leaves and crop stems, so they can find water hidden under plants.',
    technical: 'L-band (~1.26 GHz, λ ≈ 24 cm) penetrates vegetation canopies more than C-band (λ ≈ 5.6 cm), enabling double-bounce detection of water under vegetation and lower sensitivity to wind roughening.',
  },
  change: {
    term: 'Change detection',
    simple: 'We compare each new radar picture with pictures from before the flood. Only water that was not there before is counted as flood, so rivers and lakes are not mistaken for flooding.',
    technical: 'Each pass is compared with the per-pixel median of same-track pre-event passes (same geometry). Flood = P(water now) × (1 − P(water in reference)), excluding JRC permanent water (occurrence ≥ 50%).',
  },
  probability: {
    term: 'Flood probability',
    simple: 'How sure the computer is that a spot is flooded, from 0% (sure it is dry) to 100% (sure it is flooded).',
    technical: 'p_flood = 1 − (1 − p_open)(1 − p_veg). p_open combines the LightGBM P(water now) (with a physics rescue) and the reference water probability; tiers: confident > 0.8, possible 0.5–0.8, uncertain 0.35–0.5.',
  },
  hand: {
    term: 'HAND',
    simple: 'Height Above Nearest Drainage: how high a place sits above the closest river or stream. Low places flood first.',
    technical: 'Height Above Nearest Drainage from ASF\'s GLO-30 HAND (Copernicus DEM). Priors follow Nobre et al. (2011): < 5 m floodplain, > 15 m upland.',
  },
  jrc: {
    term: 'Historical water',
    simple: 'How often this spot was covered by water in satellite pictures from 1984 to 2021. Places that are almost always water are rivers or lakes, not floods.',
    technical: 'JRC Global Surface Water occurrence (Pekel et al. 2016), % of valid Landsat observations classified as water, 1984–2021. Pixels ≥ 50% are treated as permanent water.',
  },
  iou: {
    term: 'IoU (accuracy)',
    simple: 'A score from 0 to 1 for how well our flood map overlaps a trusted reference map. 1 means a perfect match.',
    technical: 'Intersection over Union = TP / (TP + FP + FN) of the water class against the Sentinel-2 reference on cloud-free pixels; 95% CIs from a spatial block bootstrap (128 px blocks).',
  },
  exposure: {
    term: 'Exposure vs damage',
    simple: 'Exposed means people, farms or roads were inside the flooded area. It does not mean they were harmed. Damage can only be confirmed by people on the ground.',
    technical: 'Exposure = overlay of the mapped flood extent with WorldPop 2025, ESA WorldCover cropland and OpenStreetMap roads/rail. Reported as a range: confident classes only → including "possible".',
  },
  revisit: {
    term: 'Revisit (not live)',
    simple: 'NISAR is not a live camera. It passes over the same place every few days. Between passes we can\'t see what changed.',
    technical: '12-day exact repeat per track; combining ascending and descending tracks gives a pass every ~3–6 days here. A flash flood can drain between passes.',
  },
  hybrid: {
    term: 'Hybrid detector',
    simple: 'A computer model that learned what flood water looks like in radar pictures, double-checked by a simple physics rule about dark, low-lying places.',
    technical: 'LightGBM on 13 scene-relative features, OR-ed with a physics rescue (HH < −15 dB and HAND < 10 m). Selected from five pre-registered rules by leave-one-date-out IoU.',
  },
}

export const glossaryText = (key, mode) => {
  const g = GLOSSARY[key]
  return g ? (mode === 'beginner' ? g.simple : mode === 'advanced' ? g.technical : `${g.simple} ${g.technical}`) : ''
}
