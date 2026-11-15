// SVG charts drawn from manifest values. Width is fluid (viewBox), height fixed. Charts that carry analysis sit in a
// ChartFrame: research-style panel (title, axes, caption, source) with an Expand button for a wider, labelled view.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtDate, floodKm2, posts as postsOf, t, trackColor } from '../lib/format.js'

export function ChartFrame({ title, sub, source, caption, children }) {
  const [big, setBig] = useState(false)
  useEffect(() => {
    if (!big) return
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setBig(false) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [big])
  return (
    <figure className="cf">
      <figcaption className="cf-h">
        <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
        <button className="cf-x" onClick={() => setBig(true)} aria-label={`Expand: ${title}`} title="Expand">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </button>
      </figcaption>
      <div className="cf-b">{children(false)}</div>
      {caption && <p className="cf-c">{caption}</p>}
      {source && <p className="cf-s">Source: {source}</p>}
      {big && createPortal(
        <div className="cf-modal" onClick={() => setBig(false)}>
          <div className="cf-big" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="cf-h"><span><b>{title}</b>{sub && <small>{sub}</small>}</span>
              <button className="cf-x" onClick={() => setBig(false)} aria-label="Close" autoFocus>✕</button></div>
            <div className="cf-b">{children(true)}</div>
            {caption && <p className="cf-c">{caption}</p>}
            {source && <p className="cf-s">Source: {source}</p>}
          </div>
        </div>, document.body)}
    </figure>
  )
}

// How fast the water rose and drained: average change in mapped flood area per day between consecutive passes on the
// same track (pre-flood no-flood passes included as the starting point). One small panel per track, shared time axis.
export function RiseRecession({ manifest, scene, onSelect, wide = false }) {
  const tracks = [...new Set(postsOf(manifest).map((s) => s.track))].sort((a, b) => a - b)
  const W = wide ? 860 : 340, L = wide ? 56 : 44, R = 10, rowH = wide ? 96 : 62, gap = wide ? 14 : 10, T = 8, B = 24
  const H = T + tracks.length * (rowH + gap) - gap + B
  const [w0, w1] = manifest.event.window
  const x = (d) => L + ((t(d) - t(w0)) / (t(w1) - t(w0))) * (W - L - R)
  const series = tracks.map((tr) => {
    const ss = manifest.scenes.filter((s) => s.track === tr && s.areas_km2).sort((a, b) => a.date.localeCompare(b.date))
    return { tr, steps: ss.slice(1).map((b, i) => { const a = ss[i], days = Math.max(1, (t(b.date) - t(a.date)) / 864e5); return { a, b, days, rate: (floodKm2(b) - floodKm2(a)) / days } }) }
  })
  const max = Math.max(1, ...series.flatMap((s) => s.steps.map((st) => Math.abs(st.rate))))
  const p10 = 10 ** Math.floor(Math.log10(max))
  const ymax = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((m) => m >= max)
  const mk = manifest.event.marker
  const months = []
  for (let d = new Date(t(w0)); d <= t(w1); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) if (d >= t(w0)) months.push(d.toISOString().slice(0, 10))
  return (
    <svg className={`chart ${wide ? 'wide' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rate of flood rise and recession between passes, per track">
      {series.map(({ tr, steps }, i) => {
        const top = T + i * (rowH + gap), mid = top + rowH / 2
        const y = (v) => mid - (v / ymax) * (rowH / 2 - 4)
        return (
          <g key={tr}>
            <rect x={L} y={top} width={W - L - R} height={rowH} className="panel" />
            {[ymax, 0, -ymax].map((v) => (
              <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
                <text x={L - 5} y={y(v) + 3.5} textAnchor="end" className="ax">{v > 0 ? '+' : ''}{v}</text></g>
            ))}
            <text x={L + 6} y={top + 13} className="ax lbl" style={{ fill: trackColor(tracks, tr) }}>Track {tr}</text>
            {steps.map((st) => {
              const x0 = x(st.a.date), x1 = x(st.b.date), up = st.rate >= 0
              return (
                <rect key={st.b.id} x={x0 + 0.5} width={Math.max(1.5, x1 - x0 - 1)} y={Math.min(y(st.rate), mid)} height={Math.max(1, Math.abs(y(st.rate) - mid))}
                  className={`rr ${up ? 'up' : 'down'} ${st.b.id === scene?.id ? 'sel' : ''} ${onSelect ? 'pt' : ''}`} onClick={onSelect && (() => onSelect(st.b))}>
                  <title>{`Track ${tr} · ${fmtDate(st.a.date)} → ${fmtDate(st.b.date)} (${Math.round(st.days)} d): ${st.rate >= 0 ? '+' : ''}${st.rate.toFixed(1)} km²/day (${Math.round(floodKm2(st.a))} → ${Math.round(floodKm2(st.b))} km²)`}</title>
                </rect>
              )
            })}
            {wide && steps.filter((st) => Math.abs(st.rate) > ymax * 0.15).map((st) => {
              const xm = (x(st.a.date) + x(st.b.date)) / 2
              return <text key={'v' + st.b.id} x={xm} y={st.rate >= 0 ? y(st.rate) - 4 : y(st.rate) + 12} textAnchor="middle" className="ax val">{st.rate >= 0 ? '+' : ''}{Math.round(st.rate)}</text>
            })}
          </g>
        )
      })}
      {mk && <g><line x1={x(mk.date)} x2={x(mk.date)} y1={T} y2={H - B} className="mark" /><text x={x(mk.date) + 4} y={H - B - 4} className="ax mk">{wide ? mk.label : 'event'}</text></g>}
      {months.map((d) => <text key={d} x={x(d)} y={H - 8} className="ax">{fmtDate(d, { month: 'short' })}</text>)}
      <text x={2} y={H - 8} className="ax">km²/day</text>
    </svg>
  )
}

// Horizontal bars; with `hi`, the faint bar is the upper bound and the solid bar the lower bound.
export function RangeBars({ rows, unit = '', fmt = (v) => v.toLocaleString('en-US'), fmtRange, onPick, color = 'var(--flood)' }) {
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
          <span className="rbar-v">{r.hi != null && Math.round(r.hi) !== Math.round(r.lo) ? (fmtRange ? fmtRange(r.lo, r.hi) : `${fmt(r.lo)}–${fmt(r.hi)}`) : fmt(r.lo)}{unit}</span>
        </button>
      ))}
    </div>
  )
}

// Flood-probability distribution of one pass, with the decision tiers shaded.
export function ProbHistogram({ hist, wide = false }) {
  const W = wide ? 760 : 320, H = wide ? 260 : 130, n = hist.km2.length
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
      <line x1={24} x2={W - 6} y1={H - 20} y2={H - 20} className="zero" />
      {[0.1, 0.35, 0.5, 0.8, 1].map((p) => (
        <text key={p} x={24 + ((p - 0.1) / 0.9) * (W - 30)} y={H - 6} textAnchor="middle" className="ax">{p}</text>
      ))}
      {wide && <text x={W - 6} y={H - 26} textAnchor="end" className="ax">flood probability →</text>}
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
export function DotCI({ rules, selected, wide = false }) {
  const names = Object.keys(rules)
  const folds = Object.keys(rules[names[0]])
  // Axis fitted to the data (dots, not bars, so it need not start at zero), on 0.05 steps.
  const all = names.flatMap((n) => folds.flatMap((f) => rules[n][f].ci))
  const lo = Math.floor((Math.min(...all) - 0.01) * 20) / 20, hi = Math.ceil((Math.max(...all) + 0.01) * 20) / 20
  const W = wide ? 760 : 340, rowH = (wide ? 22 : 16) + names.length * (wide ? 14 : 9), H = 14 + folds.length * rowH + 22, L = wide ? 120 : 78
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - 12)
  const shade = (n) => (n === selected ? 'var(--flood)' : n.startsWith('Fixed') ? '#cbd5e1' : '#7c8aa5')
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
              const r = rules[n][f], yy = yc + (ni - (names.length - 1) / 2) * (wide ? 14 : 9)
              return (
                <g key={n}>
                  <line x1={x(r.ci[0])} x2={x(r.ci[1])} y1={yy} y2={yy} stroke={shade(n)} strokeWidth={2} />
                  <circle cx={x(r.IoU)} cy={yy} r={n === selected ? 4.5 : 3.3} fill={shade(n)}><title>{`${n}, ${f}: IoU ${r.IoU.toFixed(3)} (95% CI ${r.ci[0]}–${r.ci[1]})`}</title></circle>
                  {wide && <text x={x(r.ci[1]) + 6} y={yy + 3.5} className="ax val">{r.IoU.toFixed(3)}</text>}
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
