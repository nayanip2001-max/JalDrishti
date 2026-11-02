// Science sections: observations, features, model, validation, data.
import { Card, Metric, Badge, Explain, Note, KV, LinkButton, Icon } from './ui.jsx'
import { RangeBars, DotCI, ChartLegend } from './Charts.jsx'
import { atLeast } from '../lib/modes.js'
import { fmtDate, floodKm2, num, posts, f1, trackColor, meanSelected } from '../lib/format.js'

export function ObservationsView({ ctx }) {
  const { manifest: m, scene, setScene, open, mode } = ctx
  const ps = posts(m)
  const tracks = [...new Set(ps.map((s) => s.track))].sort((a, b) => a - b)
  return (
    <div className="stack">
      <p className="lead">{ps.length} NISAR L-band passes after the event, on {tracks.length} orbit tracks. <Explain term="nisar" mode={mode} /></p>
      <Card title="Acquisitions" tag={<Badge>Observed</Badge>}>
        <table className="tbl clickable">
          <thead><tr><th>Date</th><th>Track</th><th>Orbit</th><th>Mode</th><th>Flood km²</th></tr></thead>
          <tbody>{ps.map((s) => (
            <tr key={s.id} className={s.id === scene.id ? 'sel' : ''} onClick={() => { setScene(s); open('observation', { scene: s }) }}>
              <td>{fmtDate(s.date)}</td><td><i className="dot" style={{ background: trackColor(tracks, s.track) }} />{s.track}</td>
              <td>{s.obs?.direction?.slice(0, 4) ?? '—'}</td><td>{s.mode === 'QPDH' ? 'Quad-pol' : 'HH/HV'}</td><td>{num(floodKm2(s))}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="Reference passes (before the flood)">
        <KV rows={Object.entries(m.refs).map(([tr, r]) => [`Track ${tr}`, `${r.dates.map((d) => fmtDate(d)).join(', ')} → median`])} />
      </Card>
      <Card title="Product and processing">
        <KV rows={[
          ['Product', 'NISAR L2 GCOV (provisional v1), frequency A'],
          ['Quantity', <>RTC γ⁰ backscatter, dB <Explain term="backscatter" mode={mode} /></>],
          ['Polarisation', <>HH, HV (quad-pol passes add VH, VV) <Explain term="hhhv" mode={mode} /></>],
          ['Grid', '20 m UTM (dual-pol 10 m multilooked 2×2), 5×5 Lee filter'],
          ['Distribution', 'ASF DAAC, streamed by area of interest'],
        ]} />
      </Card>
    </div>
  )
}

export function FeaturesView({ ctx }) {
  const { manifest: m, pixel, mode } = ctx
  const feats = m.model?.features ?? []
  const total = feats.reduce((a, f) => a + f.gain, 0) || 1
  return (
    <div className="stack">
      <p className="lead">{feats.length} physical features feed the classifier. All are scene-relative, so the model transfers between orbit tracks.</p>
      <Card title="Feature importance (share of total gain)">
        <RangeBars rows={[...feats].sort((a, b) => b.gain - a.gain).map((f) => ({ label: f.name, lo: (f.gain / total) * 100 }))} unit="%" fmt={(v) => v.toFixed(1)} color="#a78bfa" />
      </Card>
      <Card title="What each feature measures">
        <dl className="feats">{feats.map((f) => <div key={f.name}><dt>{f.name}</dt><dd>{f.description}</dd></div>)}</dl>
      </Card>
      <Card title="Values at the selected pixel">
        {pixel ? (
          <KV rows={[
            ['HH γ⁰', pixel.hh != null ? `${pixel.hh.toFixed(1)} dB` : '—'], ['HV γ⁰', pixel.hv != null ? `${pixel.hv.toFixed(1)} dB` : '—'],
            ['HH − HV', pixel.hh != null && pixel.hv != null ? `${(pixel.hh - pixel.hv).toFixed(1)} dB` : '—'],
            ['ΔHH vs reference', `${pixel.dHH.toFixed(1)} dB`], ['HAND', pixel.hand != null ? `${pixel.hand.toFixed(1)} m` : '—'],
            ['Slope', pixel.slope != null ? `${pixel.slope.toFixed(1)}°` : '—'], ['JRC occurrence', pixel.jrc != null ? `${pixel.jrc.toFixed(0)}%` : '—'],
            ['Land cover', pixel.wc ? m.anc?.worldcover?.[pixel.wc] ?? pixel.wc : '—'],
          ]} />
        ) : <p className="muted small"><Icon name="target" size={14} /> Click the map to read feature values at a pixel (sampled at 100 m).</p>}
        <p className="muted small">Scene-normalised features (hh_rel_*) and windowed statistics are computed at 20 m and are not shipped to the browser; the values above are their physical inputs.</p>
      </Card>
      {mode !== 'advanced' && <Note>Switch to Advanced mode for the full model card.</Note>}
    </div>
  )
}

// 'thailand@112:2026-10-07:2026-10-07' → 'Thailand · T112 · 7 Oct (S2 7 Oct)'
const pairLabel = (spec) => {
  const [ev, rest] = spec.includes('@') ? spec.split('@') : ['', spec]
  const [tr, nd, s2] = rest.split(':')
  return `${ev ? ev[0].toUpperCase() + ev.slice(1) + ' · ' : ''}T${tr} · ${fmtDate(nd)} (S2 ${fmtDate(s2)})`
}

export function ModelView({ ctx }) {
  const { manifest: m, mode, open } = ctx
  const md = m.model
  if (!md) return <Note>Model card not available for this event yet.</Note>
  return (
    <div className="stack">
      <p className="lead">{md.name}: {md.learner}, {md.trees} trees, with a physics rescue rule. <Explain term="hybrid" mode={mode} /></p>
      <Card title="Decision rule">
        <ol className="rule">
          <li><b>Water now:</b> P(water) from LightGBM &gt; 0.5, <em>or</em> HH &lt; −15 dB and HAND &lt; 10 m (physics rescue; p ≥ 0.51).</li>
          <li><b>New water:</b> × (1 − P(water) in the pre-flood reference passes).</li>
          <li><b>Not permanent:</b> excluded where JRC occurrence ≥ 50%.</li>
          <li><b>Water under vegetation:</b> {md.veg_rule}.</li>
        </ol>
        <KV rows={Object.entries(md.tiers).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v])} />
      </Card>
      <Card title="Training">
        <KV rows={[
          ['Training pairs', <span className="pairs">{md.trained_on.map((sp) => <span key={sp}>{pairLabel(sp)}</span>)}</span>],
          ['Labels', 'Sentinel-2 cloud-free open water (MNDWI ±0.1 margin), auto-generated'],
          ['Spatial CV IoU', md.spatial_cv_iou.join(', ')],
          ['Rounds', `${md.trees} (median early-stopping best)`],
          ...Object.entries(md.params).map(([k, v]) => [k, String(v)]),
        ]} />
      </Card>
      <Card title="Physics evidence terms"><p className="body small">{md.physics_terms}</p></Card>
      <div className="row-btns">
        <LinkButton onClick={() => ctx.go('features')}>Feature importance</LinkButton>
        <LinkButton onClick={() => open('validation')}>Validation</LinkButton>
      </div>
    </div>
  )
}

const shortRule = (n) => n.replace('JalDrishti hybrid', 'Hybrid').replace(' (ML + physics)', '').replace(' (LightGBM)', '')
  .replace('Fixed threshold ', '').replace(', adapted with 1 local scene', ' (adapted)').replace(', Assam-only (no adaptation)', ' (Assam-only)')

export function ValidationView({ ctx, inDrawer = false }) {
  const { manifest: m, mode, open } = ctx
  const v = m.validation
  if (!v) return <Note>No validation for this event.</Note>
  const folds = Object.keys(v.rules[v.selected])
  const adv = mode === 'advanced'
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={meanSelected(v).toFixed(3)} label={`${folds.length > 1 ? 'Mean IoU' : 'IoU'} on unseen dates`} color="var(--flood)" sub={v.selected} />
        {v.null_tests?.[0] && <Metric value={`${v.null_tests[0].false_flood_km2}`} unit="km²" label="False alarms (no-flood test)" sub={`of ${v.null_tests[0].mapped_km2.toLocaleString('en-US')} km² · T${v.null_tests[0].track}`} />}
      </div>
      <Card title="Held-out accuracy" action={<Explain term="iou" mode={mode} />}>
        <DotCI rules={v.rules} selected={v.selected} />
        <ChartLegend items={Object.keys(v.rules).map((n) => ({ label: n, color: n === v.selected ? 'var(--flood)' : n.startsWith('Fixed') ? '#94a3b8' : '#475569' }))} />
        <p className="muted small">{v.protocol}</p>
      </Card>
      {atLeast(mode, 'intermediate') && (
        <Card title={adv ? 'All metrics (95% CI on IoU)' : 'Scores'}>
          <div className="tbl-scroll">
            <table className="tbl nowrap">
              <thead><tr><th>Method</th><th>Date</th><th>IoU</th>{adv && <th>95% CI</th>}<th>Prec.</th><th>Recall</th><th>F1</th>{adv && <th>κ</th>}</tr></thead>
              <tbody>{Object.entries(v.rules).flatMap(([n, r]) => folds.map((f) => (
                <tr key={n + f} className={n === v.selected ? 'best' : ''}>
                  <td>{shortRule(n)}</td><td>{f}</td><td>{r[f].IoU.toFixed(3)}</td>{adv && <td>{r[f].ci[0].toFixed(3)}–{r[f].ci[1].toFixed(3)}</td>}
                  <td>{r[f].precision.toFixed(3)}</td><td>{r[f].recall.toFixed(3)}</td><td>{f1(r[f].precision, r[f].recall).toFixed(3)}</td>{adv && <td>{r[f].kappa.toFixed(3)}</td>}
                </tr>
              )))}</tbody>
            </table>
          </div>
        </Card>
      )}
      {v.null_tests?.length > 0 && atLeast(mode, 'intermediate') && (
        <Card title="False-alarm tests">
          <KV rows={v.null_tests.map((n) => [`T${n.track} ${fmtDate(n.date)}`, `${n.false_flood_km2} of ${n.mapped_km2.toLocaleString('en-US')} km² (refs ${n.refs.map((d) => fmtDate(d)).join(', ')})`])} />
          <p className="muted small">Two pre-flood dates, no flood between them: anything flagged is a false alarm.</p>
        </Card>
      )}
      {m.sensor_compare && !inDrawer && <LinkButton onClick={() => open('sensor')}>NISAR L-band vs Sentinel-1 C-band (same day)</LinkButton>}
      {adv && <Note>Provisional NISAR GCOV: the stored HH–VV phase calibration (+63°) is not applied in the data, so the detector does not use co-polar phase.</Note>}
    </div>
  )
}

export function SensorView({ ctx }) {
  const { manifest: m, mode } = ctx
  const c = m.sensor_compare
  const L = c.scores.water['NISAR L-band'], C = c.scores.water['Sentinel-1 C-band']
  return (
    <div className="stack">
      <p className="lead">Same day, 41 minutes apart, same detector, same Sentinel-2 reference. <Explain term="lband" mode={mode} /></p>
      <div className="metrics">
        <Metric big value={Math.round(c.cropland_km2.L_only)} unit="km²" label="Flooded cropland only NISAR saw" color="#d946ef" />
        <Metric value={Math.round(c.cropland_km2.C_only)} unit="km²" label="Only Sentinel-1 saw" color="#fb923c" />
        <Metric value={Math.round(c.cropland_km2.both)} unit="km²" label="Both saw" color="var(--flood)" />
      </div>
      <table className="tbl">
        <thead><tr><th>vs Sentinel-2</th><th>IoU</th><th>Recall</th><th>Precision</th></tr></thead>
        <tbody>
          <tr className="best"><td>NISAR L-band</td><td>{L.IoU.toFixed(3)}</td><td>{L.recall.toFixed(2)}</td><td>{L.precision.toFixed(2)}</td></tr>
          <tr><td>Sentinel-1 C-band</td><td>{C.IoU.toFixed(3)}</td><td>{C.recall.toFixed(2)}</td><td>{C.precision.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <p className="muted small">CIs: L {L.ci.join('–')} · C {C.ci.join('–')} (partial overlap area). {c.nisar} vs {c.s1}.</p>
      <button className="chip on" onClick={() => ctx.setLayersCompare(true)}>Show the agreement map</button>
    </div>
  )
}

const SOURCES = [
  ['NISAR L2 GCOV (provisional)', 'NASA/JPL & ISRO via ASF DAAC', 'Primary radar observations', 'https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l2-gcov-provisional-v1-1'],
  ['Sentinel-2 L2A', 'ESA Copernicus / Planetary Computer', 'Validation labels', 'https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a'],
  ['Sentinel-1 RTC', 'ESA Copernicus / Planetary Computer', 'Same-day C-band comparison', 'https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc'],
  ['Copernicus GLO-30 DEM + ASF HAND', 'ESA / ASF', 'Terrain priors and features', 'https://glo-30-hand.s3.amazonaws.com/readme.html'],
  ['JRC Global Surface Water', 'EC JRC', 'Permanent water', 'https://global-surface-water.appspot.com/'],
  ['ESA WorldCover 2021', 'ESA', 'Land cover, cropland', 'https://esa-worldcover.org/'],
  ['WorldPop 2025', 'University of Southampton', 'Population exposure', 'https://www.worldpop.org/'],
  ['OpenStreetMap', 'OSM contributors', 'Roads and railway', 'https://www.openstreetmap.org/'],
  ['geoBoundaries ADM2', 'William & Mary geoLab', 'Districts', 'https://www.geoboundaries.org/'],
]

export function DataView({ ctx }) {
  const { manifest: m, mode } = ctx
  return (
    <div className="stack">
      <p className="lead">Every layer comes from open data. NISAR is the primary evidence; the rest gives context, tests the result or counts exposure.</p>
      <div className="sources">
        {SOURCES.map(([n, by, role, url]) => (
          <a key={n} className="source" href={url} target="_blank" rel="noreferrer">
            <b>{n}</b><span>{role}</span><small>{by}</small><Icon name="external" size={13} />
          </a>
        ))}
        {m.rainfall && <div className="source"><b>Daily rainfall</b><span>Timeline context</span><small>{m.rainfall.source}</small></div>}
      </div>
      {atLeast(mode, 'advanced') && m.rainfall?.note && <Note>{m.rainfall.note}</Note>}
      <Card title="Labels used on every layer">
        <div className="badges"><Badge>Observed</Badge><Badge kind="modelled">Modelled</Badge><Badge kind="predicted">Predicted</Badge><Badge kind="exposed">Exposed</Badge><Badge kind="damaged">Damaged</Badge></div>
        <p className="muted small">Radar observations are never mixed with model estimates or forecasts. Exposure is not damage.</p>
      </Card>
      <a className="linkbtn" href="https://github.com/nayanip2001-max/JalDrishti#readme" target="_blank" rel="noreferrer">Method, validation &amp; code on GitHub <Icon name="external" size={13} /></a>
      <p className="muted small">Team JalWar · Thrinayani P · Thrijagathi P · Minhaj Parveen H · Nilani S · Haseena F · NASA Space Apps 2026</p>
    </div>
  )
}
