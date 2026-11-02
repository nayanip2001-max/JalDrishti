import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './ui.jsx'
import { t, fmtDate, floodKm2, posts as postsOf, trackColor, phaseOf, num } from '../lib/format.js'

const EVENT_ICON = { rain: 'rain', dam: 'dam', river: 'river', official: 'flag' }

// The flood story: rain and reported events on top, mapped flood area per track in the middle,
// every real NISAR pass as a clickable dot below. Clicking a pass updates the map and the panels.
export default function Timeline({ manifest, scene, onSelect, mode }) {
  const wrap = useRef(null)
  const [w, setW] = useState(900)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState(null)
  const posts = useMemo(() => postsOf(manifest), [manifest])
  const ev = manifest.event
  const tracks = useMemo(() => [...new Set(posts.map((s) => s.track))].sort((a, b) => a - b), [posts])
  const refDates = Object.entries(manifest.refs).flatMap(([tr, r]) => r.dates.map((d) => ({ track: +tr, date: d })))
  const events = ev.timeline?.length ? ev.timeline : [{ ...ev.marker, kind: 'rain' }]
  const rain = manifest.rainfall

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  const step = (dir) => {
    const i = posts.findIndex((s) => s.id === scene?.id)
    onSelect(posts[(i + dir + posts.length) % posts.length])
  }
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => step(1), 1500)
    return () => clearInterval(id)
  })
  useEffect(() => {
    const k = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const t0 = t(ev.window[0]), t1 = t(ev.window[1]), padL = 44, padR = 10
  const x = (d) => padL + ((t(d) - t0) / (t1 - t0)) * (w - padL - padR)
  const RAIN = [6, 30], AREA = [36, 72], rowY = (tr) => 84 + tracks.indexOf(tr) * (tracks.length > 2 ? 10 : 13)
  const H = rowY(tracks[tracks.length - 1]) + 32   // room for phase labels, then month labels
  const maxA = Math.max(1, ...posts.map(floodKm2))
  const ya = (s) => AREA[1] - (floodKm2(s) / maxA) * (AREA[1] - AREA[0])
  const rmax = rain ? Math.max(1, ...rain.mm.filter((v) => v != null)) : 1
  const months = []
  for (let m = new Date(t0); m <= t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push(m)
  const color = (tr) => trackColor(tracks, tr)
  const ph = scene ? phaseOf(manifest, scene.date) : null

  return (
    <section className="timeline" aria-label="Flood timeline">
      <div className="tl-head">
        <div className="tl-ctrl">
          <button className="btn-icon" onClick={() => step(-1)} aria-label="Previous pass"><Icon name="back" size={16} /></button>
          <button className="btn-icon play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={15} /></button>
          <button className="btn-icon" onClick={() => step(1)} aria-label="Next pass"><Icon name="chevron" size={16} /></button>
        </div>
        <span className="tl-cur">{scene ? fmtDate(scene.date) : '—'}</span>
        {ph && <span className="tl-phase" style={{ color: ph.color, borderColor: ph.color }}>{ph.name}</span>}
        <span className="tl-sub">{scene && `${num(floodKm2(scene))} km² flooded · track ${scene.track}${mode !== 'beginner' ? ` · ${scene.mode === 'QPDH' ? 'quad-pol' : 'HH/HV'}` : ''}`}</span>
        <span className="tl-fill" />
        <span className="tl-legend">
          {tracks.map((tr) => <span key={tr}><i style={{ background: color(tr) }} />Track {tr}</span>)}
          {rain && <span><i className="bar" />Rain</span>}
          <span><i className="ref" />{mode === 'beginner' ? 'Before' : 'Reference pass'}</span>
        </span>
      </div>
      <div ref={wrap} className="tl-body">
        <svg className="tl-svg" width={w} height={H} onMouseLeave={() => setHover(null)}>
          {ev.phases.map((p) => (
            <g key={p.name}>
              <rect x={x(p.from)} y={0} width={Math.max(0, x(p.to) - x(p.from))} height={H - 12} fill={p.color} opacity={0.07} rx={4} />
              <text className="phase" x={x(p.from) + 5} y={H - 15} style={{ fill: p.color }}>{p.name.toUpperCase()}</text>
            </g>
          ))}
          <text className="rowlbl" x={0} y={RAIN[1] - 6}>{rain ? 'Rain' : ''}</text>
          {rain && rain.days.map((d, i) => rain.mm[i] != null && (
            <rect key={d} x={x(d) - 1} width={2} y={RAIN[1] - (rain.mm[i] / rmax) * (RAIN[1] - RAIN[0])} height={(rain.mm[i] / rmax) * (RAIN[1] - RAIN[0])}
              className="rainbar" onMouseEnter={() => setHover({ x: x(d), title: `${fmtDate(d)} · ${rain.mm[i]} mm rain`, sub: 'ERA5 reanalysis, area mean' })} />
          ))}
          <text className="rowlbl" x={0} y={AREA[0] + 8}>km²</text>
          <text className="rowlbl dim" x={0} y={AREA[0] + 20}>{Math.round(maxA)}</text>
          {tracks.map((tr) => {
            const ss = posts.filter((s) => s.track === tr)
            return ss.length > 1 && <path key={tr} d={'M' + ss.map((s) => `${x(s.date)},${ya(s)}`).join('L')} fill="none" stroke={color(tr)} strokeWidth={2} opacity={0.9} />
          })}
          {posts.map((s) => <circle key={'a' + s.id} cx={x(s.date)} cy={ya(s)} r={2.4} fill={color(s.track)} />)}
          {tracks.map((tr) => <text key={tr} className="rowlbl" x={0} y={rowY(tr) + 3} style={{ fill: color(tr) }}>T{tr}</text>)}
          {refDates.map((r) => (
            <circle key={'r' + r.track + r.date} cx={x(r.date)} cy={rowY(r.track)} r={3.6} className="refdot"
              onMouseEnter={() => setHover({ x: x(r.date), title: `${fmtDate(r.date)} · track ${r.track}`, sub: 'Reference pass (before the flood)' })} />
          ))}
          {events.map((e) => (
            <g key={e.date + e.label} className="tl-ev" onMouseEnter={() => setHover({ x: x(e.date), title: `${fmtDate(e.date)} · ${e.label}`, sub: e.source })}>
              <line x1={x(e.date)} x2={x(e.date)} y1={RAIN[0]} y2={H - 24} />
              <circle cx={x(e.date)} cy={RAIN[0] + 2} r={7} />
              <foreignObject x={x(e.date) - 6} y={RAIN[0] - 4} width={12} height={12}><Icon name={EVENT_ICON[e.kind] ?? 'flag'} size={12} stroke={2} /></foreignObject>
            </g>
          ))}
          {posts.map((s) => {
            const on = s.id === scene?.id
            return (
              <g key={s.id} className="tl-pass" onClick={() => onSelect(s)}
                onMouseEnter={() => setHover({ x: x(s.date), title: `${fmtDate(s.date)} · track ${s.track}`, sub: `${num(floodKm2(s))} km² flooded · click to view` })}>
                <circle cx={x(s.date)} cy={rowY(s.track)} r={12} fill="transparent" />
                <circle cx={x(s.date)} cy={rowY(s.track)} r={on ? 6.5 : 4.6} fill={on ? '#fff' : color(s.track)} stroke={on ? color(s.track) : 'none'} strokeWidth={3} />
              </g>
            )
          })}
          {months.map((m) => <text key={+m} className="month" x={x(m.toISOString().slice(0, 10))} y={H - 2}>{m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>)}
        </svg>
        {hover && (
          <div className="tl-tip" style={{ left: Math.min(Math.max(hover.x, 90), w - 90) }}>
            <b>{hover.title}</b>{hover.sub && <small>{hover.sub}</small>}
          </div>
        )}
      </div>
    </section>
  )
}
