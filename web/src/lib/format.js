// Shared number/date formatting so every panel shows the same value the same way.

export const t = (d) => new Date(d + 'T00:00:00Z').getTime()
export const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) =>
  new Date(t(d)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const fmtDateLong = (d) => fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' })

export const floodKm2 = (s) => (s.areas_km2['flood (open water)'] || 0) + (s.areas_km2['flooded vegetation'] || 0)
export const possibleKm2 = (s) => (s.areas_km2['possible flood (open water)'] || 0) + (s.areas_km2['possible flooded vegetation'] || 0)

export const num = (v) => (v == null ? '—' : (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1)).toLocaleString('en-US'))
export const range = (lo, hi, f = num) => (Math.round(lo) === Math.round(hi) ? f(lo) : `${f(lo)}–${f(hi)}`)
// Lakh for the Indian event (as local reporting uses); thousands/millions elsewhere.
export const people = (v, country = 'India') => (country === 'India' && v >= 1e5 ? `${(v / 1e5).toFixed(1)} lakh`
  : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`
export const f1 = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0)

export const trackColor = (tracks, tr) => ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24'][Math.max(0, tracks.indexOf(tr)) % 4]

export const posts = (m) => m.scenes.filter((s) => s.kind === 'post').sort((a, b) => a.date.localeCompare(b.date))
export const peakOf = (m) => posts(m).reduce((a, b) => (floodKm2(b) > floodKm2(a) ? b : a))
export const prevSameTrack = (m, s) => {
  const same = posts(m).filter((x) => x.track === s.track && x.date < s.date)
  return same[same.length - 1] ?? null
}
export const phaseOf = (m, date) => m.event.phases.find((p) => date >= p.from && date < p.to) ?? m.event.phases[m.event.phases.length - 1]

// Mean IoU of the deployed rule over its held-out folds.
export const meanSelected = (v) => {
  const r = v.rules[v.selected]; const fs = Object.keys(r)
  return fs.reduce((a, k) => a + r[k].IoU, 0) / fs.length
}
