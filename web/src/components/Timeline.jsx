import { useEffect, useMemo, useRef, useState } from 'react'

const DAY = 86400000
const t = (d) => new Date(d + 'T00:00:00Z').getTime()
const fmt = (d) => new Date(t(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const floodKm2 = (s) => (s.areas_km2['flood (open water)'] || 0) + (s.areas_km2['flooded vegetation'] || 0)

export default function Timeline({ manifest, scene, onSelect }) {
  const wrap = useRef(null)
  const [w, setW] = useState(900)
  const [playing, setPlaying] = useState(false)
  const posts = useMemo(() => manifest.scenes.filter((s) => s.kind === 'post').sort((a, b) => a.date.localeCompare(b.date)), [manifest])
  const ev = manifest.event
  const tracks = [...new Set(manifest.scenes.map((s) => s.track))].sort((a, b) => a - b)
  const refDates = Object.entries(manifest.refs).flatMap(([tr, r]) => r.dates.map((d) => ({ track: +tr, date: d })))

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const i = posts.findIndex((s) => s.id === scene?.id)
      onSelect(posts[(i + 1) % posts.length])
    }, 1600)
    return () => clearInterval(id)
  }, [playing, posts, scene, onSelect])

  const t0 = t(ev.window[0]), t1 = t(ev.window[1])
  const pad = 8
  const x = (d) => pad + ((t(d) - t0) / (t1 - t0)) * (w - 2 * pad)
  const H = 74, rowY = (tr) => 46 + tracks.indexOf(tr) * (tracks.length > 2 ? 9 : 13)
  const maxA = Math.max(1, ...posts.map(floodKm2))
  // One line per track: tracks image different footprints, so only same-track passes are comparable.
  const TRACK_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24']
  const color = (tr) => TRACK_COLORS[tracks.indexOf(tr) % TRACK_COLORS.length]
  const y = (s) => 40 - (floodKm2(s) / maxA) * 30
  const lines = tracks.map((tr) => {
    const ss = posts.filter((s) => s.track === tr)
    return { tr, d: ss.length > 1 ? 'M' + ss.map((s) => `${x(s.date)},${y(s)}`).join('L') : '' }
  })

  const months = []
  for (let m = new Date(t0); m <= t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    if (m.getUTCDate() === 1 || +m === t0) months.push(m)
  }

  return (
    <div className="timeline">
      <div className="tl-head">
        <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <span className="cur">{scene ? fmt(scene.date) : '—'}</span>
        <span>NISAR track {scene?.track} · {scene?.mode === 'QPDH' ? 'quad-pol' : 'dual-pol HH/HV'}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span>Each dot is a real NISAR pass · one line per track = mapped flood area (km²)</span>
      </div>
      <div ref={wrap} style={{ flex: 1 }}>
        <svg className="tl-svg" width={w} height={H}>
          {ev.phases.map((p) => (
            <g key={p.name}>
              <rect x={x(p.from)} y={0} width={Math.max(0, x(p.to) - x(p.from))} height={H - 6} fill={p.color} opacity={0.08} rx={6} />
              <text className="phase" x={x(p.from) + 6} y={11} fill={p.color} style={{ fill: p.color }}>{p.name.toUpperCase()}</text>
            </g>
          ))}
          {months.map((m) => (
            <text key={+m} x={pad + ((+m - t0) / (t1 - t0)) * (w - 2 * pad)} y={H + 4}>{m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>
          ))}
          {lines.map((l) => l.d && <path key={l.tr} d={l.d} fill="none" stroke={color(l.tr)} strokeWidth={2} opacity={0.9} />)}
          {posts.map((s) => <circle key={'a' + s.id} cx={x(s.date)} cy={y(s)} r={2.5} fill={color(s.track)} />)}
          {tracks.map((tr) => (
            <text key={tr} x={0} y={rowY(tr) + 3} style={{ fontSize: 9, fill: color(tr) }}>T{tr}</text>
          ))}
          {refDates.map((r) => (
            <circle key={'r' + r.track + r.date} cx={x(r.date)} cy={rowY(r.track)} r={4} fill="none" stroke="var(--muted)" strokeWidth={1.5}>
              <title>{`Reference pass ${r.date} (track ${r.track})`}</title>
            </circle>
          ))}
          {posts.map((s) => {
            const on = s.id === scene?.id
            return (
              <g key={s.id} className="tl-pass" onClick={() => onSelect(s)}>
                <circle cx={x(s.date)} cy={rowY(s.track)} r={on ? 7 : 5} fill={on ? '#fff' : color(s.track)} opacity={on ? 1 : 0.75} stroke={on ? '#fff' : 'none'} strokeWidth={2} />
                <title>{`${s.date} · track ${s.track} · ${Math.round(floodKm2(s))} km² flooded`}</title>
              </g>
            )
          })}
          {ev.marker && (
            <g>
              <line x1={x(ev.marker.date)} x2={x(ev.marker.date)} y1={14} y2={H - 6} stroke="var(--predicted)" strokeDasharray="3 3" />
              <text x={x(ev.marker.date) - 6} y={24} textAnchor="end" style={{ fill: 'var(--predicted)' }}>{ev.marker.label}</text>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}
