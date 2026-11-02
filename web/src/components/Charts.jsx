// Small SVG charts drawn from manifest values. Width is fluid (viewBox), height fixed.
import { fmtDate, floodKm2, posts as postsOf, t, trackColor } from '../lib/format.js'

// Horizontal bars; with `hi`, the faint bar is the upper bound and the solid bar the lower bound.
export function RangeBars({ rows, unit = '', fmt = (v) => v.toLocaleString('en-US'), onPick, color = 'var(--flood)' }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.hi ?? r.lo))
  return (
    <div className="rbars">
      {rows.map((r) => (
        <button key={r.label} className={`rbar ${onPick ? 'clickable' : ''}`} onClick={onPick && (() => onPick(r))} disabled={!onPick}>
          <span className="rbar-l">{r.label}</span>
          <span className="rbar-track">
            {r.hi != null && <span className="rbar-hi" style={{ width: `${(r.hi / max) * 100}%`, background: r.color ?? color }} />}
            <span className="rbar-lo" style={{ width: `${(r.lo / max) * 100}%`, background: r.color ?? color }} />
          </span>
          <span className="rbar-v">{r.hi != null && Math.round(r.hi) !== Math.round(r.lo) ? `${fmt(r.lo)}–${fmt(r.hi)}` : fmt(r.lo)}{unit}</span>
        </button>
      ))}
    </div>
  )
}

// Flood-probability distribution of one pass, with the decision tiers shaded.
export function ProbHistogram({ hist }) {
  const W = 320, H = 120, n = hist.km2.length
  const vals = hist.km2.map((v, i) => ({ v, p0: i / n }))
  const shown = vals.filter((d) => d.p0 >= 0.1)          // the first bins are dry land and dwarf everything
  const max = Math.max(1, ...shown.map((d) => d.v))
  const bw = (W - 30) / shown.length
  const tier = (p) => (p >= 0.8 ? 'var(--flood)' : p >= 0.5 ? 'var(--possible)' : p >= 0.35 ? 'var(--uncertain)' : '#334155')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flood probability distribution">
      {shown.map((d, i) => (
        <rect key={i} x={24 + i * bw} y={H - 20 - (d.v / max) * (H - 34)} width={bw - 2} height={(d.v / max) * (H - 34)} fill={tier(d.p0)} rx={1.5}>
          <title>{`p ${d.p0.toFixed(2)}–${(d.p0 + 1 / n).toFixed(2)}: ${d.v} km²`}</title>
        </rect>
      ))}
      {[0.1, 0.35, 0.5, 0.8, 1].map((p) => (
        <text key={p} x={24 + ((p - 0.1) / 0.9) * (W - 30)} y={H - 6} textAnchor="middle" className="ax">{p}</text>
      ))}
      <text x={2} y={12} className="ax">km²</text>
      <text x={2} y={26} className="ax">{Math.round(max)}</text>
    </svg>
  )
}

// Mapped flood area over time, one line per orbit track (tracks image different footprints).
export function TrackLines({ manifest, scene, onSelect, height = 150, showRain = false }) {
  const ps = postsOf(manifest)
  const tracks = [...new Set(ps.map((s) => s.track))].sort((a, b) => a - b)
  const W = 340, H = height, L = 34, R = 8, T = 10, B = 22
  const [w0, w1] = manifest.event.window
  const x = (d) => L + ((t(d) - t(w0)) / (t(w1) - t(w0))) * (W - L - R)
  const max = Math.max(1, ...ps.map(floodKm2))
  const y = (v) => H - B - (v / max) * (H - T - B)
  const rain = showRain && manifest.rainfall
  const rmax = rain ? Math.max(1, ...rain.mm.filter((v) => v != null)) : 1
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapped flood area over time by track">
      {[0, 0.5, 1].map((f) => (
        <g key={f}><line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} className="grid" />
          <text x={L - 4} y={y(f * max) + 3} textAnchor="end" className="ax">{Math.round(f * max)}</text></g>
      ))}
      {rain && rain.days.map((d, i) => rain.mm[i] != null && (
        <rect key={d} x={x(d) - 0.6} width={1.2} y={H - B - (rain.mm[i] / rmax) * 26} height={(rain.mm[i] / rmax) * 26} className="rainbar">
          <title>{`${d}: ${rain.mm[i]} mm rain`}</title>
        </rect>
      ))}
      {tracks.map((tr) => {
        const ss = ps.filter((s) => s.track === tr)
        return (
          <g key={tr}>
            <path d={'M' + ss.map((s) => `${x(s.date)},${y(floodKm2(s))}`).join('L')} fill="none" stroke={trackColor(tracks, tr)} strokeWidth={2} />
            {ss.map((s) => (
              <circle key={s.id} cx={x(s.date)} cy={y(floodKm2(s))} r={s.id === scene?.id ? 5 : 3.2}
                fill={s.id === scene?.id ? '#fff' : trackColor(tracks, tr)} className={onSelect ? 'pt' : ''} onClick={onSelect && (() => onSelect(s))}>
                <title>{`${fmtDate(s.date)} · track ${s.track}: ${Math.round(floodKm2(s))} km²`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {[...new Set(ps.map((s) => s.date.slice(0, 7)))].map((mth) => (
        <text key={mth} x={x(mth + '-01')} y={H - 6} className="ax">{fmtDate(mth + '-01', { month: 'short' })}</text>
      ))}
      <text x={L} y={T} className="ax">km² flooded</text>
    </svg>
  )
}

// Estimates with 95% CIs, one row per held-out date; the selected rule is the accent.
export function DotCI({ rules, selected }) {
  const names = Object.keys(rules)
  const folds = Object.keys(rules[names[0]])
  // Axis fitted to the data (dots, not bars, so it need not start at zero), on 0.05 steps.
  const all = names.flatMap((n) => folds.flatMap((f) => rules[n][f].ci))
  const lo = Math.floor((Math.min(...all) - 0.01) * 20) / 20, hi = Math.ceil((Math.max(...all) + 0.01) * 20) / 20
  const W = 340, rowH = 16 + names.length * 9, H = 14 + folds.length * rowH + 18, L = 78
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - 12)
  const shade = (n) => (n === selected ? 'var(--flood)' : n.startsWith('Fixed') ? '#94a3b8' : '#475569')
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="IoU on held-out dates with 95% confidence intervals">
      {Array.from({ length: Math.round((hi - lo) / 0.05) + 1 }, (_, i) => +(lo + i * 0.05).toFixed(2)).map((v) => (
        <g key={v}><line x1={x(v)} x2={x(v)} y1={6} y2={H - 16} className="grid" /><text x={x(v)} y={H - 4} textAnchor="middle" className="ax">{v.toFixed(2)}</text></g>
      ))}
      {folds.map((f, fi) => {
        const yc = 14 + fi * rowH + rowH / 2
        return (
          <g key={f}>
            <text x={0} y={yc + 3} className="ax lbl">{f}</text>
            {names.map((n, ni) => {
              const r = rules[n][f], yy = yc + (ni - (names.length - 1) / 2) * 9
              return (
                <g key={n}>
                  <line x1={x(r.ci[0])} x2={x(r.ci[1])} y1={yy} y2={yy} stroke={shade(n)} strokeWidth={2} />
                  <circle cx={x(r.IoU)} cy={yy} r={n === selected ? 4.5 : 3.3} fill={shade(n)}><title>{`${n}, ${f}: IoU ${r.IoU.toFixed(3)} (95% CI ${r.ci[0]}–${r.ci[1]})`}</title></circle>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export function ChartLegend({ items }) {
  return <div className="clegend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>
}
