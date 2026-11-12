// "Between passes": the multi-track tracker's daily MODELLED flood estimate, kept visibly apart from observations.
import { Card, Badge, Note, Metric } from './ui.jsx'
import { atLeast } from '../lib/modes.js'
import { fmtDate, num, t, trackColor } from '../lib/format.js'

function ModelChart({ tr, day, onDay }) {
  const W = 340, H = 150, L = 34, R = 8, T = 10, B = 22
  const n = tr.days.length
  const x = (i) => L + (i / (n - 1)) * (W - L - R)
  const xd = (d) => x((t(d) - t(tr.days[0])) / 864e5)
  const max = Math.max(1, ...tr.likely_km2, ...tr.obs.map((o) => o.km2))
  const y = (v) => H - B - (v / max) * (H - T - B)
  const tracks = [...new Set(tr.obs.map((o) => o.track))].sort((a, b) => a - b)
  const di = tr.days.indexOf(day)
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round((((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (n - 1))
    onDay(tr.days[Math.min(n - 1, Math.max(0, i))])
  }
  return (
    <svg className="chart pt" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Modelled daily flood area with observed passes" onClick={pick}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}><line x1={L} x2={W - R} y1={y(f * max)} y2={y(f * max)} className="grid" />
          <text x={L - 4} y={y(f * max) + 3} textAnchor="end" className="ax">{Math.round(f * max)}</text></g>
      ))}
      <path d={'M' + tr.likely_km2.map((v, i) => `${x(i)},${y(v)}`).join('L')} fill="none" stroke="var(--modelled)" strokeWidth={2} strokeDasharray="5 3" />
      {tr.obs.map((o) => (
        <circle key={o.date + o.track} cx={xd(o.date)} cy={y(o.km2)} r={3.4} fill={trackColor(tracks, o.track)}>
          <title>{`Observed ${fmtDate(o.date)} · track ${o.track}: ${num(o.km2)} km² (same ${tr.cell_m} m cells)`}</title>
        </circle>
      ))}
      {di >= 0 && <line x1={x(di)} x2={x(di)} y1={T} y2={H - B} stroke="#fff" strokeOpacity={0.6} />}
      {[...new Set(tr.days.map((d) => d.slice(0, 7)))].map((mth) => (
        <text key={mth} x={xd(mth + '-01')} y={H - 6} className="ax">{fmtDate(mth + '-01', { month: 'short' })}</text>
      ))}
      <text x={L} y={T} className="ax">km² likely flooded, all tracks ({tr.cell_m} m cells)</text>
    </svg>
  )
}

export function ModelledCard({ ctx }) {
  const { manifest: m, scene, mode, modelDay, setModelDay } = ctx
  const tr = m.tracker
  if (!tr) return null
  const v = tr.validation
  const day = modelDay ?? (tr.days.includes(scene.date) ? scene.date : tr.days[tr.likely_km2.indexOf(Math.max(...tr.likely_km2))])
  const i = tr.days.indexOf(day)
  const simple = mode === 'beginner'
  const isObsDay = tr.obs.some((o) => o.date === day)
  const nearest = tr.obs.reduce((best, o) => Math.min(best, Math.abs(t(o.date) - t(day)) / 864e5), Infinity)
  return (
    <Card title={simple ? 'Between satellite passes' : 'Daily estimate between passes'} tag={<Badge kind="modelled">Modelled</Badge>}>
      <p className="muted small">{simple
        ? 'The satellite passes every few days. For the days in between, JalDrishti blends the passes before and after, from any orbit, to estimate where water probably was.'
        : 'Each pixel blends the nearest earlier and later NISAR passes that saw it, from any orbit track, weighted by time. Passes from different tracks fill each other’s gaps.'}</p>
      <ModelChart tr={tr} day={day} onDay={setModelDay} />
      <div className="model-ctl">
        <input type="range" min={0} max={tr.days.length - 1} value={Math.max(0, i)} aria-label="Day"
          onChange={(e) => setModelDay(tr.days[+e.target.value])} />
        <span><b>{fmtDate(day)}</b> · {num(tr.likely_km2[Math.max(0, i)])} km² likely flooded, all tracks {isObsDay ? '(pass day)' : `(${Math.round(nearest)} d from a pass)`}</span>
      </div>
      <div className="model-ctl">
        {modelDay
          ? <button className="btn-ghost" onClick={() => setModelDay(null)}>Back to observed passes</button>
          : <button className="btn-ghost model-on" onClick={() => setModelDay(day)}>Show this day on the map</button>}
      </div>
      {atLeast(mode, 'intermediate') && v && (
        <div className="metrics">
          <Metric value={v.interp_mean_iou.toFixed(2)} label="Blending passes: predicting a hidden pass (IoU)" color="var(--modelled)" />
          <Metric value={v.nearest_mean_iou.toFixed(2)} label="Copying the nearest pass (IoU)" />
        </div>
      )}
      {atLeast(mode, 'intermediate') && v && <Note>{v.protocol} Better on {v.interp_wins} of {v.passes - v.ties} passes ({v.ties} ties; sign test p = {v.sign_p}).
        {atLeast(mode, 'advanced') && <> We also built a fitted per-pixel flood-state model (rain- and terrain-driven); it did not beat this simple blend when moved between events, so it is not used. JalDrishti never forecasts beyond the latest pass.</>}</Note>}
      <Note>{tr.note} Line = area where the estimate is above 50% across all tracks' footprints, so it can exceed any single pass; dots = each observed pass on the same {tr.cell_m} m cells. No estimate more than 12 days from a pass.</Note>
    </Card>
  )
}
