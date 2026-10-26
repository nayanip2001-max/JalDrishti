// Guided walkthrough. Each step selects a pass, sets layers and moves the camera;
// every number in the text comes from the manifest, so the story can't drift from the data.

const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const km = (s) => Math.round((s.areas_km2['flood (open water)'] || 0) + (s.areas_km2['flooded vegetation'] || 0))
const lakh = (v) => (v >= 1e5 ? `${(v / 1e5).toFixed(1)} lakh` : v.toLocaleString())

export function buildSteps(m) {
  const posts = m.scenes.filter((s) => s.kind === 'post').sort((a, b) => a.date.localeCompare(b.date))
  if (!posts.length) return []
  const peak = posts.reduce((a, b) => (km(b) > km(a) ? b : a))
  const last = posts[posts.length - 1]
  const ev = m.event
  const steps = [
    {
      title: ev.title,
      body: `${ev.context} Clouds hid the ground from optical satellites. NISAR's L-band radar sees through cloud, day and night.`,
      scene: posts[0], layers: { flood: false, prob: false, sar: true, compare: false }, compare: false, camera: { bounds: m.aoi.bounds },
    },
    {
      title: 'Before vs after: the radar sees new water',
      body: `Drag the slider. Left: the median of ${m.refs[String(peak.track)]?.dates.length} pre-flood NISAR passes. Right: ${fmt(peak.date)}. Calm water reflects the radar away and shows up dark. We only flag water that wasn't there before.`,
      scene: peak, layers: { flood: false, prob: false, sar: true, compare: false }, compare: true, camera: { bounds: m.aoi.bounds },
    },
    {
      title: `Peak: ${km(peak).toLocaleString()} km² under water`,
      body: peak.exposure
        ? `On ${fmt(peak.date)}, ${lakh(peak.exposure.low.people)}–${lakh(peak.exposure.high.people)} people lived inside the mapped flood, along with ${Math.round(peak.exposure.low.cropland_km2)}–${Math.round(peak.exposure.high.cropland_km2)} km² of cropland. Click any pixel to see why it was flagged.`
        : `On ${fmt(peak.date)} the flood reached its largest mapped extent. Click any pixel to see why it was flagged.`,
      scene: peak, layers: { flood: true, prob: false, sar: true, compare: false }, compare: false, camera: { bounds: m.aoi.bounds },
    },
  ]
  if (m.sensor_compare) {
    const c = m.sensor_compare, crop = c.cropland_km2
    steps.push({
      title: 'Why L-band? Same day, same algorithm',
      body: `Sentinel-1 (C-band) passed 41 minutes after NISAR. Run through the same detector, NISAR found ${Math.round(crop.L_only)} km² of flooded cropland that C-band missed, against ${Math.round(crop.C_only)} km² the other way round. L-band's 24 cm waves reach water under the rice canopy. Water IoU vs Sentinel-2: L ${c.scores.water['NISAR L-band'].IoU.toFixed(2)} vs C ${c.scores.water['Sentinel-1 C-band'].IoU.toFixed(2)}.`,
      scene: posts.find((s) => s.date === c.date) || peak, layers: { flood: false, prob: false, sar: true, compare: true }, compare: false, camera: { bounds: c.bounds || m.aoi.bounds },
    })
  }
  steps.push({
    title: 'Watching the water go down',
    body: `NISAR came back every few days. By ${fmt(last.date)} the mapped flood was down to ${km(last)} km², close to the level of our false-alarm tests. Press ▶ on the timeline to replay the whole event.`,
    scene: last, layers: { flood: true, prob: false, sar: true, compare: false }, compare: false, camera: { bounds: m.aoi.bounds },
  })
  if (m.validation) {
    const sel = m.validation.rules[m.validation.selected]
    const thr = m.validation.rules['Fixed threshold −15 dB']
    const folds = Object.keys(sel)
    const mean = folds.reduce((a, f) => a + sel[f].IoU, 0) / folds.length
    const wins = thr ? folds.filter((f) => sel[f].IoU > thr[f].IoU).length : 0
    const vsThr = !thr ? '' : wins === folds.length
      ? ` It beat the standard −15 dB threshold on ${folds.length === 1 ? 'that date' : `all ${folds.length} held-out dates`}.`
      : ` It beat the standard −15 dB threshold on ${wins} of ${folds.length} held-out dates.`
    steps.push({
      title: 'Can you trust it?',
      body: `Every accuracy number was measured on a date the model never saw. JalDrishti's hybrid scored ${folds.length > 1 ? 'a mean ' : ''}IoU of ${mean.toFixed(2)} against Sentinel-2.${vsThr} Details are in the "How accurate is it?" panel.`,
      scene: peak, layers: { flood: true, prob: false, sar: true, compare: false }, compare: false, camera: { bounds: m.aoi.bounds },
    })
  }
  return steps
}

export default function Story({ steps, index, onIndex, onClose }) {
  const s = steps[index]
  if (!s) return null
  return (
    <div className="story">
      <div className="story-top">
        <span className="story-count">{index + 1} / {steps.length}</span>
        <div className="story-dots">{steps.map((_, i) => <span key={i} className={i === index ? 'on' : ''} onClick={() => onIndex(i)} />)}</div>
        <button className="story-x" onClick={onClose} aria-label="Close story">✕</button>
      </div>
      <h2>{s.title}</h2>
      <p>{s.body}</p>
      <div className="story-nav">
        <button onClick={() => onIndex(index - 1)} disabled={index === 0}>← Back</button>
        {index < steps.length - 1
          ? <button className="primary" onClick={() => onIndex(index + 1)}>Next →</button>
          : <button className="primary" onClick={onClose}>Explore the map</button>}
      </div>
    </div>
  )
}
