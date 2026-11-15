// Guided tours for Intermediate and Advanced. Every step sets the date, layers, panel, camera and (optionally) a
// pixel itself, so the user watches the app work. Every number in the text is read from the event's data files.
import { buildSteps } from '../components/Story.jsx'
import { fmtDate, floodKm2, possibleKm2, num, pct, peakOf, posts, peopleRange, range, meanSelected } from './format.js'
import { boxAround, boxKm2, estimateMinutes } from './region.js'
import { loadRecovery, recoveryAt } from './recovery.js'

// Example pixels, picked from the published layers (scratch script pick_pixels.py): a cropland pixel inside the
// biggest flood patch at the peak with a typical wet spell, and the nearest cropland pixel never seen flooded.
export const TOUR_PIXELS = {
  assam: { flood: [94.07497, 26.78431], dry: [94.07048, 26.79113], date: '2026-07-22', track: 40, km: 0.99 },
  thailand: { flood: [100.2979, 14.49212], dry: [100.29768, 14.50755], date: '2026-10-19', track: 112, km: 1.78 },
  chennai: { flood: [79.98941, 13.1938], dry: [79.99412, 13.18943], date: '2026-10-22', track: 149, km: 0.73 },
}

// Which level a tour belongs to (a shared link switches to it).
export const TOUR_MODE = { size: 'intermediate', when: 'intermediate', pixel: 'intermediate', trust: 'intermediate', method: 'advanced' }

const short = (m) => m.event.title.split(/\s[·–-]\s/)[0]
const tiny = (m) => short(m).replace(/\s(floods?|northeast monsoon)$/i, '')
// "Not seen dry again" is counted over every pass of every track, so it is compared with the land flooded at ANY pass.
const notDry = (t) => ({ v: `${num(t.still_wet_km2)} of ${num(t.flooded_km2)} km²`, l: 'flooded land not seen dry again by the last pass' })
const zoomOn = (ll, zoom = 13.5) => ({ center: ll, zoom })
const sceneAt = (m, date, track) => m.scenes.find((s) => s.date === date && s.track === track) ?? peakOf(m)

// Everything the tours read beyond the current manifest: every event's manifest and recovery summary, and the
// season record of the example pixel. Loaded once, when the tour menu is first opened or a tour link is followed.
let pending = null
export function loadTourData(DATA, ids) {
  if (!pending) {
    pending = Promise.all(ids.map(async (id) => {
      const dir = `${DATA}${id}/`
      const m = await fetch(dir + 'manifest.json').then((r) => r.json())
      const rec = await loadRecovery(dir + 'recovery/')
      const px = rec && TOUR_PIXELS[id] ? await recoveryAt(dir + 'recovery/', rec, TOUR_PIXELS[id].flood).catch(() => null) : null
      return [id, { m, rec, px }]
    })).then(Object.fromEntries).catch((e) => { pending = null; throw e })
  }
  return pending
}

function story(m) {
  return { id: 'story', group: 'start', title: 'The flood in 60 seconds', sub: 'The whole event, from first rain to the water going down',
    steps: buildSteps(m).map((s) => ({ title: s.title, body: s.body, scene: s.scene, layers: s.layers, compare: s.compare, camera: s.camera })) }
}

function size(m) {
  const peak = peakOf(m), e = peak.exposure, country = m.event.country
  const steps = [{
    title: 'At its largest', section: 'overview', scene: peak, camera: { bounds: m.aoi.bounds },
    fact: { v: `${num(floodKm2(peak))} km²`, l: `under water on ${fmtDate(peak.date)}` },
    body: 'Cyan is open floodwater, violet is water under crops. Orange “possible flood” is counted separately, never as confirmed.',
  }]
  if (e) {
    steps.push({
      title: 'Who lived there', section: 'impact', scene: peak, camera: { bounds: m.aoi.bounds },
      fact: { v: peopleRange(e.low.people, e.high.people, country), l: 'people lived inside the flooded area' },
      body: `A range, not one guess: the low end counts confident flood only, the high end adds possible flood. Cropland: ${range(e.low.cropland_km2, e.high.cropland_km2)} km².`,
    })
    const [name, d] = Object.entries(e.districts ?? {}).sort((a, b) => b[1].high.people - a[1].high.people)[0] ?? []
    const dist = m.anc?.districts?.find((x) => x.name === name)
    if (name && dist) {
      steps.push({
        title: 'Hardest hit', section: 'impact', scene: peak, detail: { type: 'district', props: { name } },
        camera: { bounds: [[dist.bbox[0], dist.bbox[1]], [dist.bbox[2], dist.bbox[3]]] },
        fact: { v: name, l: `${peopleRange(d.low.people, d.high.people, country)} people inside the flood` },
        body: 'White lines are district borders. Click any district on the map, or any row in a table, to compare.',
      })
    }
  }
  return { id: 'size', group: 'ask', title: 'How big was the flood?', sub: 'Area, people and the hardest-hit district', steps }
}

function when(m, rec) {
  const ps = posts(m), peak = peakOf(m), last = ps[ps.length - 1], t = rec?.totals
  const drop = floodKm2(peak) > 0 ? 1 - floodKm2(last) / floodKm2(peak) : 0
  const steps = [
    { title: 'The worst day', section: 'temporal', scene: peak, camera: { bounds: m.aoi.bounds },
      fact: { v: fmtDate(peak.date), l: `largest mapped flood, ${num(floodKm2(peak))} km² (track ${peak.track})` },
      body: 'Each dot on the timeline below is a real NISAR pass; the bars above it are rain.' },
    last === peak
      ? { title: 'The last look', section: 'temporal', scene: last, camera: { bounds: m.aoi.bounds },
        fact: { v: 'Still rising', l: `the last pass, ${fmtDate(last.date)}, is also the largest flood` },
        body: 'The water had not started to go down when the data ends. The chart shows how fast it rose, track by track.' }
      : { title: 'The last look', section: 'temporal', scene: last, camera: { bounds: m.aoi.bounds },
        fact: { v: `${num(floodKm2(last))} km²`, l: `still mapped on ${fmtDate(last.date)}, ${pct(Math.max(0, drop))} less than the peak` },
        body: 'The chart shows how fast the water rose and drained between passes, track by track.' },
  ]
  if (t) {
    steps.push({ title: 'How long it stayed', section: 'recovery', scene: peak, layers: { flood: false, dur: true }, camera: { bounds: m.aoi.bounds },
      fact: t.half_dry_days != null
        ? { v: `${t.half_dry_days} days`, l: 'until half the flooded land was dry again' }
        : notDry(t),
      body: `Darker purple stayed wet longer; red was never seen dry again. ${num(t.longer_than_4_weeks_km2)} km² stayed wet about four weeks or more.` })
    if (t.reflooded_km2 >= 1) {
      steps.push({ title: 'The water came back', section: 'recovery', scene: peak, layers: { flood: false, dur: true },
        fact: { v: `${num(t.reflooded_km2)} km²`, l: 'seen dry on one pass, then flooded again later' },
        body: 'A second flood on land that had just dried is easy to miss on a single-day map.' })
    }
  }
  return { id: 'when', group: 'ask', title: 'When was it worst, and did it drain?', sub: 'Peak day, the last look, days under water', steps }
}

function pixel(m) {
  const P = TOUR_PIXELS[m.aoi.id]
  if (!P) return null
  const sc = sceneAt(m, P.date, P.track)
  const conf = floodKm2(sc) / Math.max(floodKm2(sc) + possibleKm2(sc), 1e-9)
  return { id: 'pixel', group: 'ask', title: 'Why is this spot marked flood?', sub: 'One flooded field, one dry field, one confidence map', steps: [
    { title: 'A flooded field', section: 'flood', scene: sc, pick: P.flood, detail: { type: 'pixel', props: {} }, camera: zoomOn(P.flood),
      fact: (px) => ({ v: px?.mapCls === 5 ? 'Flooded crops' : 'Flood', l: `what the map says here on ${fmtDate(sc.date)}` }),
      body: 'The panel lists the evidence: the radar now against the same spot before the flood, and how low the ground is.' },
    { title: 'A dry field next door', section: 'flood', scene: sc, pick: P.dry, detail: { type: 'pixel', props: {} }, camera: zoomOn(P.dry),
      fact: { v: 'Dry', l: `${P.km} km away, same kind of land, same pass` },
      body: 'Compare its radar values with the flooded field: no new water here.' },
    { title: 'How sure is the map?', section: 'flood', scene: sc, layers: { prob: true }, camera: zoomOn(P.flood, 11),
      fact: { v: pct(conf), l: `of the flood mapped on ${fmtDate(sc.date)} is high-confidence` },
      body: 'Bright means the model is sure. The rest is shown as “possible flood”, kept apart from the confirmed area.' },
  ] }
}

function trust(m) {
  const v = m.validation, c = m.sensor_compare, peak = peakOf(m)
  const steps = []
  if (v) {
    const folds = Object.keys(v.rules[v.selected])
    steps.push({ title: 'Scored on unseen days', section: 'science', detail: { type: 'validation', props: {} }, scene: peak, camera: { bounds: m.aoi.bounds },
      fact: { v: meanSelected(v).toFixed(2), l: `mean IoU against Sentinel-2 on ${folds.length} held-out date${folds.length > 1 ? 's' : ''} (1 = perfect)` },
      body: 'The model never trained on these dates. Each score has a bootstrap 95% interval in the panel.' })
  }
  if (c) {
    const w = c.scores.water
    steps.push({ title: 'L-band against C-band', detail: { type: 'sensor', props: {} }, scene: sceneAt(m, c.date, peak.track), layers: { compare: true },
      camera: { bounds: c.bounds || m.aoi.bounds },
      fact: { v: `${w['NISAR L-band'].IoU.toFixed(2)} vs ${w['Sentinel-1 C-band'].IoU.toFixed(2)}`, l: 'water IoU, NISAR vs Sentinel-1, same day, same detector' },
      body: `Sentinel-1 passed 41 minutes after NISAR. NISAR found ${num(c.cropland_km2.L_only)} km² of flooded cropland that C-band missed.` })
  }
  const nt = v?.null_tests ?? []
  if (nt.length) {
    const n0 = nt.reduce((a, b) => (b.false_flood_km2 > a.false_flood_km2 ? b : a))
    const ns = m.scenes.find((s) => s.kind === 'null_test' && s.date === n0.date && s.track === n0.track)
    steps.push({ title: 'A day with no flood', section: 'science', scene: ns ?? peak, camera: { bounds: m.aoi.bounds },
      fact: { v: `${range(Math.min(...nt.map((x) => x.false_flood_km2)), n0.false_flood_km2)} km²`, l: 'flagged on pre-flood dates: our false-alarm level' },
      body: 'We ran the same detector on dates before the flood. Anything it flags there is a false alarm, so smaller changes are not trusted.' })
  }
  return steps.length ? { id: 'trust', group: 'ask', title: 'Can I trust this map?', sub: 'Unseen-day scores, L vs C band, false alarms', steps } : null
}

function method(m, D) {
  const id = m.aoi.id, P = TOUR_PIXELS[id], rec = D?.[id]?.rec, rp = D?.[id]?.px
  if (!P) return null
  const sc = sceneAt(m, P.date, P.track)
  const looks = rec?.looks ?? []
  const nTracks = new Set(looks.map((l) => l.track)).size
  const md = m.model, v = m.validation
  const top = md?.features?.reduce((a, b) => (b.gain > a.gain ? b : a))
  const cv = md?.spatial_cv_iou?.length ? md.spatial_cv_iou.reduce((a, b) => a + b, 0) / md.spatial_cv_iou.length : null
  const box = boxAround(P.flood, 0.12)
  const est = estimateMinutes(boxKm2(box), 3, 1)
  const at = { scene: sc, pick: P.flood }
  const steps = [
    { title: 'Meet one pixel', ...at, section: 'observations', detail: { type: 'pixel', props: {} }, camera: zoomOn(P.flood),
      fact: { v: `${P.flood[1].toFixed(3)}°N, ${P.flood[0].toFixed(3)}°E`, l: 'one cropland pixel; its marker stays on the map at every step' },
      body: 'We follow this spot through the whole method, from the radar pass to how long it stayed under water.' },
    { title: '1 · Observations', ...at, section: 'observations', camera: zoomOn(P.flood, 11),
      fact: looks.length ? { v: `${looks.length} passes`, l: `on ${nTracks} orbit track${nTracks > 1 ? 's' : ''}, ${fmtDate(looks[0].date)} – ${fmtDate(looks[looks.length - 1].date)}` } : null,
      body: 'Every NISAR L-band pass over the event: HH and HV backscatter from the GCOV product, the raw material for everything after.' },
    md && { title: '2 · Features', ...at, section: 'features',
      fact: { v: `${md.features.length} features`, l: `per pixel; strongest: ${top?.name}` },
      body: 'Radar now, change from the pre-flood median, texture, and terrain (height above the river, slope, water history).' },
    md && { title: '3 · Model', ...at, section: 'model',
      fact: (px) => (px ? { v: px.pFlood.toFixed(2), l: 'flood probability at this pixel' } : { v: `${md.trees} trees`, l: md.learner }),
      body: `${md.learner.split('(')[0].trim()}, ${md.trees} trees, combined with physics rules.${cv ? ` Spatial cross-validation IoU ${cv.toFixed(2)}.` : ''}` },
    v && { title: '4 · Validation', ...at, section: 'validation',
      fact: { v: meanSelected(v).toFixed(2), l: 'mean IoU vs Sentinel-2 on held-out dates' },
      body: 'Scored only on dates the model never saw, with bootstrap 95% intervals and pre-flood false-alarm tests.' },
    rec && { title: '5 · Recovery', ...at, section: 'recovery', layers: { flood: false, dur: true },
      fact: rp?.flooded
        ? (rp.dryAgain ? { v: rp.dmax != null && rp.dmax !== rp.dmin ? `${rp.dmin}–${rp.dmax} days` : `${rp.dmin}+ days`, l: 'under water at this pixel' }
          : { v: 'Not dry again', l: `still wet at the last pass, ${fmtDate(rp.lastLook)}` })
        : null,
      body: rp?.flooded
        ? `Wet from ${fmtDate(rp.first)} to ${fmtDate(rp.last)}${rp.dryAgain ? `, seen dry again on ${fmtDate(rp.dryAgain)}` : ''}. A range, because NISAR passes every few days.`
        : 'Every pass is merged in time order to see how long each pixel stayed wet.' },
    { title: 'Now map your own area', section: 'region', region: { box, name: `${id}_tour`, date: sc.date, result: null, check: null, drawing: false },
      camera: { bounds: [[box[0], box[1]], [box[2], box[3]]] },
      fact: { v: `about ${est[0]}–${est[1]} min`, l: `to map this ${num(boxKm2(box))} km² box yourself, free, in Colab` },
      body: 'The settings line in step 3 is already filled in for a box around this pixel: copy it, open the notebook, run all.' },
  ].filter(Boolean)
  return { id: 'method', group: 'deep', title: 'One pixel, the whole method', sub: 'Radar pass → features → model → validation → recovery, then map your own area', steps }
}

function world(D, ids) {
  const rows = []
  const steps = ids.filter((id) => D[id]).map((id) => {
    const { m, rec } = D[id], peak = peakOf(m), t = rec?.totals
    rows.push([tiny(m), t ? num(t.flooded_km2) : '—', t?.half_dry_days != null ? `${t.half_dry_days} d` : 'not yet', t ? num(t.still_wet_km2) : '—'])
    return { event: id, title: short(m), section: 'recovery', scene: peak, layers: { flood: false, dur: true }, camera: { bounds: m.aoi.bounds },
      fact: !t ? { v: `${num(floodKm2(peak))} km²`, l: `at the peak, ${fmtDate(peak.date)}` }
        : t.half_dry_days != null ? { v: `${t.half_dry_days} days`, l: 'until half the flooded land was dry again' }
          : notDry(t),
      body: `${m.event.country}. Peak ${num(floodKm2(peak))} km² on ${fmtDate(peak.date)}.${t?.reflooded_km2 >= 1 ? ` ${num(t.reflooded_km2)} km² flooded a second time.` : ''}${t && t.half_dry_days == null ? ' It had not drained by the last pass, so there is no recovery score yet.' : ''}` }
  })
  if (steps.length < 2) return null
  const lastId = steps[steps.length - 1].event
  steps.push({ event: lastId, title: 'Same satellite, three different floods', section: 'recovery', layers: { flood: false, dur: true },
    table: { head: ['Event', 'Flooded km²', 'Half dry', 'Not dry again'], rows },
    body: 'Land flooded at any pass, days until half of it was dry, and km² never seen dry again. One method everywhere, so the differences come from the floods, not the tools.' })
  return { id: 'world', group: 'world', title: 'Same satellite, three floods', sub: 'India, Thailand and Chennai side by side', steps }
}

export function buildTours(mode, m, D, ids) {
  const rec = D?.[m.aoi.id]?.rec
  const list = [story(m)]
  if (mode === 'intermediate') list.push(size(m), D && when(m, rec), pixel(m), trust(m))
  if (mode === 'advanced') list.push(D && method(m, D))
  if (D) list.push(world(D, ids))
  return list.filter((t) => t && t.steps.length)
}
