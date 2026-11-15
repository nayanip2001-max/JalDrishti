// Recovery (Idea 5) and flood scars (Idea 2): how long the land stayed under water, how fast each kind of land
// dried, where water came back, and whether the river banks moved. Data: scripts/export_recovery.py.
import { useEffect, useState } from 'react'
import { Card, Metric, Badge, Note, KV, LayerToggle } from './ui.jsx'
import { ChartFrame, ChartLegend } from './Charts.jsx'
import { loadRecovery } from '../lib/recovery.js'
import { fmtDate, num } from '../lib/format.js'

const COVER_COLOR = { all: '#e2e8f0', Cropland: '#a3e635', Trees: '#34d399', 'Built-up': '#f87171', 'Grass / wetland': '#38bdf8' }
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

export function useRecovery(ctx) {
  const [rec, setRec] = useState(null)
  useEffect(() => { let live = true; loadRecovery(ctx.base + 'recovery/').then((r) => live && setRec(r)); return () => { live = false } }, [ctx.base])
  return rec
}

// Share of the flooded land still under water at each pass of one track, one line per land cover.
export function RecoveryCurve({ cur, wide }) {
  const W = wide ? 820 : 340, H = wide ? 300 : 170, L = 34, R = 10, T = 12, B = 26
  const n = cur.dates.length
  const x = (i) => L + (n === 1 ? 0.5 : i / (n - 1)) * (W - L - R)
  const top = Math.min(1, Math.ceil(Math.max(0.1, ...Object.keys(cur).filter((k) => k !== 'dates').flatMap((k) => cur[k].filter((v) => v != null))) * 4) / 4)
  const y = (v) => T + (1 - v / top) * (H - T - B)
  const keys = ['all', 'Cropland', 'Trees', 'Grass / wetland', 'Built-up'].filter((k) => cur[k]?.some((v) => v != null))
  return (
    <svg className={`chart ${wide ? 'wide' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of the flooded land still under water at each pass, by land cover">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => f * top).map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
          <text x={L - 5} y={y(v) + 3.5} textAnchor="end" className="ax">{Math.round(v * 100)}%</text></g>
      ))}
      {keys.map((k) => {
        const pts = cur[k].map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean)
        return (
          <g key={k}>
            <path d={'M' + pts.map((p) => p.join(',')).join('L')} fill="none" stroke={COVER_COLOR[k]} strokeWidth={k === 'all' ? 2.6 : 1.8} strokeDasharray={k === 'all' ? '5 3' : undefined} />
            {cur[k].map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={wide ? 3.6 : 2.6} fill={COVER_COLOR[k]}><title>{`${k === 'all' ? 'All land' : k}, ${cur.dates[i].split('·')[0]}: ${pct(v)} still under water`}</title></circle>)}
            {wide && pts.length > 0 && <text x={pts[pts.length - 1][0] + 4} y={pts[pts.length - 1][1] + 3} className="ax lbl" style={{ fill: COVER_COLOR[k] }}>{k === 'all' ? 'All' : k}</text>}
          </g>
        )
      })}
      {cur.dates.map((d, i) => (wide || i % Math.ceil(n / 5) === 0 || i === n - 1) && <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="ax">{fmtDate(d.split('·')[0])}</text>)}
    </svg>
  )
}

export function RecoveryView({ ctx }) {
  const { mode, layers, setLayers, manifest: m } = ctx
  const rec = useRecovery(ctx)
  const [track, setTrack] = useState(null)
  if (!rec) return <Note>Recovery is computed for each event after its passes are processed.</Note>
  const t = rec.totals, s = rec.scars, adv = mode === 'advanced'
  const tr = String(track ?? rec.main_track), cur = rec.curves_by_track?.[tr] ?? rec.curves
  // the duration colours replace the flood classes while shown (two colour scales on one spot would mislead)
  const flip = (k) => setLayers({ ...layers, [k]: !layers[k], ...(k === 'dur' ? { flood: !!layers.dur } : {}) })
  const lastLook = rec.looks[rec.looks.length - 1].date
  const covers = Object.entries(rec.covers)
  return (
    <div className="stack">
      <p className="lead">How long the land stayed under water, and how fast it came back. Every NISAR pass of every track, merged per 20 m pixel.</p>
      {!t.recovering && <Note kind="warn">The water was still at its highest on the last pass ({fmtDate(lastLook)}): recovery cannot be measured yet. The figures below are the flood so far.</Note>}
      <div className="metrics">
        <Metric big value={num(t.flooded_km2)} unit="km²" label="Land flooded at any pass" color="var(--flood)" />
        {t.half_dry_days != null && <Metric value={`${t.half_dry_days}`} unit="days" label="Half of it dry again after the peak" sub={`track ${rec.main_track}, ≤ 12-day steps`} />}
        <Metric value={num(t.longer_than_4_weeks_km2)} unit="km²" label="Under water about 4 weeks or more" color="#7c3aed" />
        <Metric value={num(t.reflooded_km2)} unit="km²" label="Water came back after drying" color="#f59e0b" />
        <Metric value={num(t.still_wet_km2)} unit="km²" label={`Not seen dry again by ${fmtDate(lastLook)}`} color="#f43f5e" />
      </div>
      <Card title="On the map">
        <div className="layers">
          <LayerToggle on={!!layers.dur} onClick={() => flip('dur')} swatch="linear-gradient(90deg,#bae6fd,#60a5fa,#6366f1,#7c3aed,#f43f5e)" name="Days under water" sub="< 2 wk · 2–4 · 4–8 · > 8 · not dry again" />
          {s && <LayerToggle on={!!layers.scar} onClick={() => flip('scar')} swatch="linear-gradient(90deg,#f97316 0 50%,#facc15 50%)" name="River-bank change (candidate)" sub="orange: land → river · yellow: river → land" />}
        </div>
      </Card>
      {cur && (
        <>
          <ChartFrame title="How fast the land dried" sub={`share of the flooded land still under water, each pass of track ${tr}`}
            source="NISAR L2 GCOV passes, JalDrishti confident flood (classes 3, 5); ESA WorldCover 2021"
            caption="Each line is one kind of land. A line that falls fast dried fast. Only looks that saw the land are counted.">
            {(wide) => <RecoveryCurve cur={cur} wide={wide} />}
          </ChartFrame>
          <div className="row-btns">
            <ChartLegend items={['all', 'Cropland', 'Trees', 'Grass / wetland', 'Built-up'].filter((k) => cur[k]?.some((v) => v != null)).map((k) => ({ label: k === 'all' ? 'All land' : k, color: COVER_COLOR[k] }))} />
            {Object.keys(rec.curves_by_track ?? {}).length > 1 && (
              <label className="row small">Track <select value={tr} onChange={(e) => setTrack(e.target.value)}>{Object.keys(rec.curves_by_track).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            )}
          </div>
        </>
      )}
      <Card title="Recovery by land cover" tag={<Badge>Observed</Badge>}>
        <div className="tbl-scroll">
          <table className="tbl nowrap">
            <thead><tr><th>Land</th><th>Flooded km²</th><th>Days under water*</th><th>Half dry</th>{adv && <th>Index</th>}<th>Came back km²</th></tr></thead>
            <tbody>{covers.map(([k, v]) => (
              <tr key={k}><td><i className="dot" style={{ background: COVER_COLOR[k] }} />{k}</td><td>{num(v.flooded_km2)}</td>
                <td>{v.days_min_median}–{v.days_max_median ?? '?'}</td><td>{v.half_dry_days != null ? `${v.half_dry_days} d` : '—'}</td>
                {adv && <td>{v.recovery_index ?? '—'}</td>}<td>{num(v.reflooded_km2)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted small">* Median range per pixel: at least (last wet look − first wet look), at most (first dry look after − last dry look before). Passes are up to 12 days apart, so a single number would be invented.{adv && ' Index = mean dry share of the flooded land over the passes after the peak (0 = stayed wet, 100 = dried at once).'}</p>
      </Card>
      {s && <ScarsCard s={s} adv={adv} onFly={(c) => { ctx.flyTo(c); if (!layers.scar) flip('scar') }} />}
      {adv && Object.keys(rec.districts).length > 0 && (
        <Card title="Districts">
          <div className="tbl-scroll"><table className="tbl nowrap">
            <thead><tr><th>District</th><th>Flooded km²</th><th>Days*</th><th>&gt; 4 wk km²</th><th>Came back km²</th><th>Still wet km²</th></tr></thead>
            <tbody>{Object.entries(rec.districts).sort((a, b) => b[1].flooded_km2 - a[1].flooded_km2).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{num(v.flooded_km2)}</td><td>{v.days_min_median}–{v.days_max_median ?? '?'}</td><td>{num(v.longer_than_4_weeks_km2)}</td><td>{num(v.reflooded_km2)}</td><td>{num(v.still_wet_km2)}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      {adv && <Note>{rec.method} Wet = confident flood only, so "possible" water is never counted as a wet day. Vegetation regrowth (HV recovery) is not used: crop growth and harvest change HV too.</Note>}
      {m.event.caveat && !adv && <p className="muted small">{m.event.caveat}</p>}
    </div>
  )
}

export function ScarsCard({ s, adv, onFly }) {
  const verdict = !s.after_peak ? 'Not assessable yet: no pass after the flood peak.'
    : !s.stage_ok ? `Not reliable: the river was ${Math.round(Math.max(...s.post.map((p) => p.stage_diff)) * 100)}% larger or smaller than before, so high water would look like erosion.`
      : !s.noise ? `Candidate only: ${s.erosion_km2} km² land → river, ${s.accretion_km2} km² river → land. A noise floor needs two pre-flood looks, so significance is not tested here.`
      : s.erosion_significant || s.accretion_significant ? `Detected above the noise floor: ${s.erosion_significant ? `${s.erosion_km2} km² of bank lost (≈ ${s.mean_retreat_m} m mean retreat)` : ''}${s.erosion_significant && s.accretion_significant ? '; ' : ''}${s.accretion_significant ? `${s.accretion_km2} km² of new land (≈ ${s.mean_advance_m} m)` : ''}.`
        : s.hotspot_count ? `No change along the river as a whole, but ${s.hotspot_count} local patch${s.hotspot_count > 1 ? 'es' : ''} (${s.hotspot_km2} km²) ${s.hotspot_count > 1 ? 'are' : 'is'} bigger than anything noise produced: candidate bank hotspots.`
          : 'No bank change above the noise floor this season.'
  const ok = s.after_peak && s.stage_ok && (s.erosion_significant || s.accretion_significant || s.hotspot_count > 0)
  return (
    <Card title="What the flood left behind: river banks" tag={<Badge kind={ok ? 'observed' : 'predicted'}>{ok ? 'Candidate change' : 'No reliable change'}</Badge>}>
      <p className="body small"><b>{verdict}</b></p>
      <KV rows={[
        ['Compared', `track ${s.track}: ${fmtDate(s.pre)} (before) vs ${s.post.map((p) => fmtDate(p.date)).join(' and ')} (after${s.post.length > 1 ? ', both must agree' : ''})`],
        ['River size difference', s.post.map((p) => `${Math.round(p.stage_diff * 100)}%`).join(', ') + ' (≤ 10% needed)'],
        ['Land → river (erosion)', `${s.erosion_km2} km² · mean retreat ${s.mean_retreat_m} m`],
        ['River → land (new bars)', `${s.accretion_km2} km² · mean advance ${s.mean_advance_m} m`],
        s.noise && ['Noise floor', `${s.noise.erosion_km2} km² / ${s.noise.accretion_km2} km² between two pre-flood looks${s.noise.cross_track ? ' (different tracks: a conservative ceiling)' : ''}`],
        ['Smallest detectable', `${s.min_detectable_m} m (0.35 pixel)`],
        s.hotspot_min_km2 != null && ['Hotspot test', `a patch must exceed ${s.hotspot_min_km2} km², the largest patch two pre-flood looks produced`],
      ].filter(Boolean)} />
      {s.hotspots?.length > 0 && (
        <div className="hotspots">
          {s.hotspots.map((h, i) => (
            <button key={i} className="chip" onClick={() => onFly?.({ center: [h.lon, h.lat], zoom: 13 })}>
              <i className="dot" style={{ background: h.kind === 'erosion' ? '#f97316' : '#facc15' }} />{h.kind === 'erosion' ? 'Land → river' : 'River → land'} · {h.km2} km²
            </button>
          ))}
        </div>
      )}
      {adv && <p className="muted small">Area-based bank change after Rowland et al. (2016, SCREAM) and Langhorst &amp; Pavelsky (2023, REAL): river = open water connected to JRC permanent water within 1.5 km; retreat = changed area ÷ bank length ({num(s.bank_km)} km). One season only, so these are not yearly rates. Few river-migration studies have used radar (Nagel et al., 2023): NISAR can see banks through monsoon cloud.</p>}
    </Card>
  )
}
