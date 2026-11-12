// Drawer sections for the main navigation. Each section answers more, or less, depending on the mode:
// Beginner = the answer, Intermediate = the evidence, Advanced = the scientific detail.
import { Card, Metric, Badge, Explain, Note, KV, LayerToggle, Seg, LinkButton, Icon } from './ui.jsx'
import { RangeBars, ProbHistogram, TrackLines, ChartLegend } from './Charts.jsx'
import { atLeast } from '../lib/modes.js'
import { ModelledCard } from './Modelled.jsx'
import { fmtDate, fmtDateLong, floodKm2, possibleKm2, num, range, people, pct, posts, peakOf, prevSameTrack, phaseOf, trackColor, meanSelected } from '../lib/format.js'

const CLASS_COLORS = { flood: 'var(--flood)', veg: 'var(--veg)', possible: 'var(--possible)', perm: 'var(--perm)' }

function Delta({ now, before }) {
  if (before == null) return null
  const d = now - before
  if (Math.abs(d) < 0.5) return <span className="delta">no change vs previous pass</span>
  return <span className={`delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {num(Math.abs(d))} km² vs previous pass</span>
}

const topDistricts = (scene, key = 'people', n = 3) =>
  Object.entries(scene.exposure?.districts ?? {}).sort((a, b) => b[1].high[key] - a[1].high[key]).slice(0, n).map(([k]) => k)


// ---------------------------------------------------------------------------------------------------------
export function Overview({ ctx }) {
  const { manifest: m, scene, mode, lens, open, go, country } = ctx
  const prev = prevSameTrack(m, scene)
  const peak = peakOf(m)
  const e = scene.exposure
  const val = m.validation
  const conf = scene.prob_hist?.confident_share
  const ps = posts(m)
  const first = ps[0], last = ps[ps.length - 1]
  const where = topDistricts(scene, 'cropland_km2')

  if (mode === 'beginner') {
    const qs = [
      { q: 'Where is the flood?', a: where.length ? `Mostly in ${where.join(', ')}.` : 'See the cyan areas on the map.', on: () => open('flood') },
      { q: 'How big is it?', a: `${num(floodKm2(scene))} km² under water on ${fmtDate(scene.date)}, plus ${num(possibleKm2(scene))} km² that might be flooded.`, on: () => open('flood') },
      { q: 'When did it happen?', a: `${m.event.marker.label} on ${fmtDate(m.event.marker.date)}. Largest on ${fmtDate(peak.date)}; latest view ${fmtDate(last.date)}.`, on: () => go('temporal') },
      { q: 'How sure are we?', a: val ? `On days it had never seen, the map matched trusted satellite photos with a score of ${meanSelected(val).toFixed(2)} out of 1.${conf != null ? ` ${pct(conf)} of today's flooded area is high-confidence.` : ''}` : 'Each spot has a confidence level; click the map to see it.', on: () => open(val ? 'validation' : 'probability') },
      e && { q: 'Who may be affected?', a: `${people(e.low.people, country)}–${people(e.high.people, country)} people live inside the flooded area, with ${range(e.low.cropland_km2, e.high.cropland_km2)} km² of farmland.`, on: () => open('people') },
      { q: 'How can a satellite see floods?', a: 'Its radar sees through clouds and at night. Calm water looks dark, so new dark areas show new water.', on: () => go('how') },
    ].filter(Boolean)
    return (
      <div className="stack">
        <p className="lead">{m.event.title}. {m.event.subtitle}.</p>
        <div className="qa">
          {qs.map((x) => (
            <button key={x.q} className="qa-item" onClick={x.on}>
              <span className="qa-q">{x.q}</span><span className="qa-a">{x.a}</span>
              <Icon name="chevron" size={14} />
            </button>
          ))}
        </div>
        <Note>Viewing {fmtDateLong(scene.date)}. Pick another day on the timeline below.</Note>
      </div>
    )
  }

  // Intermediate overview: evidence-first KPIs, ordered by the lens.
  const science = [
    <Metric key="fl" big value={num(floodKm2(scene))} unit="km²" label="Flood extent" color={CLASS_COLORS.flood}
      delta={<Delta now={floodKm2(scene)} before={prev && floodKm2(prev)} />} onOpen={() => open('flood')} />,
    <Metric key="cf" value={conf != null ? pct(conf) : '—'} label="High-confidence share" sub={`+ ${num(possibleKm2(scene))} km² possible`} onOpen={() => open('probability')} />,
    val && <Metric key="va" value={meanSelected(val).toFixed(2)} label="Held-out IoU (mean)" sub="vs Sentinel-2" onOpen={() => open('validation')} />,
    <Metric key="ob" value={fmtDate(scene.date)} label={`NISAR track ${scene.track}`} sub={scene.obs?.direction ?? 'L-band HH/HV'} onOpen={() => open('observation', { scene })} />,
  ]
  const impact = e ? [
    <Metric key="pp" big value={range(e.low.people, e.high.people, (v) => people(v, country))} label="People in flooded area" color="#f472b6" onOpen={() => open('people')} />,
    <Metric key="cr" value={range(e.low.cropland_km2, e.high.cropland_km2)} unit="km²" label="Cropland under water" color="#84cc16" onOpen={() => open('cropland')} />,
    <Metric key="rd" value={range(e.low.roads_km, e.high.roads_km)} unit="km" label="Major roads" sub={`${range(e.low.rail_km, e.high.rail_km)} km railway`} onOpen={() => open('roads')} />,
  ] : []
  const order = lens === 'impact' ? [...impact, ...science] : [...science, ...impact]
  return (
    <div className="stack">
      <p className="lead">{m.event.title} · <span className="muted">{phaseOf(m, scene.date).name} phase</span></p>
      <div className="metrics">{order.filter(Boolean)}</div>
      <Card title="Flood area over time" tag={<Badge>Observed</Badge>}>
        <TrackLines manifest={m} scene={scene} onSelect={ctx.setScene} height={130} showRain />
        <ChartLegend items={[...new Set(ps.map((s) => s.track))].sort((a, b) => a - b).map((tr, i, a) => ({ label: `Track ${tr}`, color: trackColor(a, tr) }))
          .concat(m.rainfall ? [{ label: 'Daily rain', color: '#64748b' }] : [])} />
      </Card>
      {m.event.caveat && <Note kind="warn">{m.event.caveat}</Note>}
      <p className="muted small">{first && `${ps.length} NISAR passes, ${fmtDate(first.date)} – ${fmtDate(last.date)}.`}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
export function EventView({ ctx }) {
  const { manifest: m, scene, open } = ctx
  const ps = posts(m)
  const tracks = [...new Set(ps.map((s) => s.track))].sort((a, b) => a - b)
  return (
    <div className="stack">
      <p className="lead">{m.event.title}</p>
      <p className="body">{m.event.context}</p>
      <div className="metrics">
        <Metric value={num(floodKm2(peakOf(m)))} unit="km²" label={`Peak extent · ${fmtDate(peakOf(m).date)}`} color="var(--flood)" onOpen={() => { ctx.setScene(peakOf(m)); open('flood') }} />
        <Metric value={ps.length} label="Post-event NISAR passes" sub={`${tracks.length} tracks`} onOpen={() => ctx.go('observations')} />
        {m.validation && <Metric value={meanSelected(m.validation).toFixed(3)} label="Held-out IoU" onOpen={() => open('validation')} />}
        <Metric value={fmtDate(scene.date)} label={`Selected pass · T${scene.track}`} onOpen={() => open('observation', { scene })} />
      </div>
      <Card title="Phases and context events">
        <ul className="evlist">
          {m.event.phases.map((p) => <li key={p.name}><i style={{ background: p.color }} /><b>{p.name}</b><span>{fmtDate(p.from)} – {fmtDate(p.to)}</span></li>)}
          {(m.event.timeline ?? [m.event.marker]).map((x) => (
            <li key={x.label}><Icon name={x.kind === 'dam' ? 'dam' : x.kind === 'river' ? 'river' : x.kind === 'official' ? 'flag' : 'rain'} size={14} />
              <b>{fmtDate(x.date)}</b><span>{x.label}{x.source && <em> · {x.source}</em>}</span></li>
          ))}
        </ul>
      </Card>
      <Card title="Reference (before) passes">
        <KV rows={Object.entries(m.refs).map(([tr, r]) => [`Track ${tr}`, r.dates.map((d) => fmtDate(d)).join(', ')])} />
      </Card>
      {m.event.caveat && <Note kind="warn">{m.event.caveat}</Note>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
export function FloodView({ ctx }) {
  const { manifest: m, scene, mode, layers, setLayers, open, compare, setCompare, basemap, setBasemap, opacity, setOpacity } = ctx
  const a = scene.areas_km2
  const flip = (k) => setLayers({ ...layers, [k]: !layers[k] })
  const simple = mode === 'beginner'
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={num(floodKm2(scene))} unit="km²" label={simple ? 'Flooded' : 'Confident flood'} color="var(--flood)"
          delta={<Delta now={floodKm2(scene)} before={prevSameTrack(m, scene) && floodKm2(prevSameTrack(m, scene))} />} onOpen={() => open('flood')} />
        <Metric value={num(possibleKm2(scene))} unit="km²" label={simple ? 'Maybe flooded' : 'Possible flood'} color="var(--possible)" onOpen={() => open('probability')} />
        {!simple && <Metric value={num(a['flooded vegetation'])} unit="km²" label="Water under vegetation" color="var(--veg)" onOpen={() => open('flood')} />}
        <Metric value={num(a['permanent / pre-existing water'])} unit="km²" label={simple ? 'Rivers & lakes (normal)' : 'Permanent / pre-existing water'} color="var(--perm)" />
      </div>

      <Card title="Map layers">
        <div className="layers">
          <LayerToggle on={layers.flood} onClick={() => flip('flood')} swatch="linear-gradient(90deg,var(--flood) 0 40%,var(--veg) 40% 60%,var(--possible) 60%)"
            name={simple ? 'Flood map' : 'Flood classes'} sub={simple ? 'Where the water is' : 'NISAR change detection'} />
          <LayerToggle on={layers.sar} onClick={() => flip('sar')} swatch="linear-gradient(90deg,#000,#fff)" name="Radar image"
            sub={simple ? 'What the satellite saw' : 'HH backscatter γ⁰ (dB)'} />
          {!simple && <LayerToggle on={layers.prob} onClick={() => flip('prob')} swatch="linear-gradient(90deg,#0b1220,#3b82f6,#e0f2fe)" name="Flood probability" sub="Per-pixel confidence" />}
          {!simple && m.sensor_compare && <LayerToggle on={layers.compare} onClick={() => ctx.setLayersCompare(!layers.compare)}
            swatch="linear-gradient(90deg,var(--flood) 0 33%,#d946ef 33% 66%,#fb923c 66%)" name="L-band vs C-band" sub={`Same-day comparison · ${fmtDate(m.sensor_compare.date)}`} />}
        </div>
        <div className="row-btns">
          <button className={`chip ${compare ? 'on' : ''}`} onClick={() => setCompare(!compare)}>⟷ Before / after slider</button>
          <Seg value={basemap} onChange={setBasemap} size="sm" options={[{ id: 'dark', label: 'Dark' }, { id: 'satellite', label: 'Satellite' }]} />
        </div>
        {atLeast(mode, 'intermediate') && (
          <label className="row small">Overlay opacity
            <input className="range" type="range" min={0.2} max={1} step={0.05} value={opacity.overlay} onChange={(e) => setOpacity({ ...opacity, overlay: +e.target.value })} />
          </label>
        )}
      </Card>

      {atLeast(mode, 'intermediate') && scene.prob_hist && (
        <Card title="How confident is this pass?" action={<Explain term="probability" mode={mode} />}>
          <ProbHistogram hist={scene.prob_hist} />
          <ChartLegend items={[{ label: 'Confident > 0.8', color: 'var(--flood)' }, { label: 'Possible 0.5–0.8', color: 'var(--possible)' }, { label: 'Uncertain', color: 'var(--uncertain)' }]} />
          <LinkButton onClick={() => open('probability')}>Probability details</LinkButton>
        </Card>
      )}

      {simple ? (
        <Note>Cyan means new flood water. Orange means "maybe": the radar isn't sure. Dark blue rivers and lakes are normal water and not counted. <Explain term="change" mode={mode} label="Why?" /></Note>
      ) : (
        <Card title="Method in one line" action={<Explain term="hybrid" mode={mode} />}>
          <p className="body small">{m.model?.rule ?? 'Hybrid LightGBM + physics rule; flood = water now and not water before.'}</p>
          {m.sensor_compare && <LinkButton onClick={() => open('sensor')}>Why L-band? Same-day comparison with Sentinel-1</LinkButton>}
        </Card>
      )}
      <p className="hint-click"><Icon name="target" size={14} /> Click anywhere on the map to see why that spot was classified.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
export function TemporalView({ ctx }) {
  const { manifest: m, scene, mode, setScene, open } = ctx
  const ps = posts(m)
  const peak = peakOf(m), last = ps[ps.length - 1]
  const tracks = [...new Set(ps.map((s) => s.track))].sort((a, b) => a - b)
  return (
    <div className="stack">
      {mode === 'beginner' ? (
        <ol className="storyline">
          <li><b>{fmtDate(m.event.marker.date)}</b> {m.event.marker.label}.</li>
          <li><b>{fmtDate(peak.date)}</b> The flood is at its largest: {num(floodKm2(peak))} km².</li>
          <li><b>{fmtDate(last.date)}</b> Mostly drained: {num(floodKm2(last))} km² left.</li>
        </ol>
      ) : (
        <p className="lead">Peak {num(floodKm2(peak))} km² on {fmtDate(peak.date)} (track {peak.track}) → {num(floodKm2(last))} km² by {fmtDate(last.date)}.</p>
      )}
      <Card title="Flood area per pass" action={<Explain term="revisit" mode={mode} />}>
        <TrackLines manifest={m} scene={scene} onSelect={setScene} height={160} showRain={atLeast(mode, 'intermediate')} />
        <ChartLegend items={tracks.map((tr) => ({ label: `Track ${tr}`, color: trackColor(tracks, tr) })).concat(m.rainfall && atLeast(mode, 'intermediate') ? [{ label: 'Daily rain', color: '#64748b' }] : [])} />
        {mode !== 'beginner' && <p className="muted small">Each orbit track sees a different footprint, so compare points along the same line.</p>}
      </Card>
      <ModelledCard ctx={ctx} />
      <Card title={mode === 'beginner' ? 'Pick a day' : 'All passes'}>
        <table className="tbl clickable">
          <thead><tr><th>Date</th>{mode !== 'beginner' && <th>Track</th>}<th>Flood km²</th>{atLeast(mode, 'intermediate') && <th>Possible</th>}</tr></thead>
          <tbody>
            {ps.map((s) => (
              <tr key={s.id} className={s.id === scene.id ? 'sel' : ''} onClick={() => setScene(s)}>
                <td>{fmtDate(s.date)}</td>{mode !== 'beginner' && <td><i className="dot" style={{ background: trackColor(tracks, s.track) }} />{s.track}</td>}
                <td>{num(floodKm2(s))}</td>{atLeast(mode, 'intermediate') && <td>{num(possibleKm2(s))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {m.rainfall && atLeast(mode, 'intermediate') && <p className="muted small">Rain: {m.rainfall.source}.</p>}
      <LinkButton onClick={() => open('observation', { scene })}>About the selected NISAR pass</LinkButton>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
export function ImpactView({ ctx }) {
  const { manifest: m, scene, mode, open, layers, setLayers, country } = ctx
  const e = scene.exposure
  if (!e) return <Note>No exposure data for this event.</Note>
  const flip = (k) => setLayers({ ...layers, [k]: !layers[k] })
  const rows = Object.entries(e.districts).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.high.people - a.high.people)
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={range(e.low.people, e.high.people, (v) => people(v, country))} label="People living in flooded area" color="#f472b6" onOpen={() => open('people')} />
        <Metric value={range(e.low.cropland_km2, e.high.cropland_km2)} unit="km²" label="Cropland under water" color="#84cc16" onOpen={() => open('cropland')} />
        <Metric value={range(e.low.roads_km, e.high.roads_km)} unit="km" label="Major roads" onOpen={() => open('roads')} />
        <Metric value={range(e.low.rail_km, e.high.rail_km)} unit="km" label="Railway" onOpen={() => open('roads')} />
      </div>
      <Note kind="exposed"><Badge kind="exposed">Exposed</Badge> means inside the mapped flood, not confirmed damage. <Explain term="exposure" mode={mode} label="Explain" /></Note>
      <Card title={mode === 'beginner' ? 'Most affected districts' : 'Districts (people in flooded area)'}>
        <RangeBars rows={rows.slice(0, mode === 'beginner' ? 5 : 20).map((r) => ({ label: r.name, lo: r.low.people, hi: r.high.people }))}
          fmt={(v) => people(v, country)} color="#f472b6" onPick={(r) => open('district', { name: r.label })} />
        {mode !== 'beginner' && <p className="muted small">Solid = confident flood only · faint = including "possible". Click a district for details.</p>}
      </Card>
      {atLeast(mode, 'intermediate') && m.impact_layers && (
        <Card title="Impact layers on the map">
          <div className="layers">
            <LayerToggle on={layers.districts} onClick={() => flip('districts')} swatch="repeating-linear-gradient(90deg,#e2e8f0 0 2px,transparent 2px 6px)" name="District boundaries" sub="geoBoundaries ADM2" />
            <LayerToggle on={layers.roads} onClick={() => flip('roads')} swatch="linear-gradient(90deg,#fde68a 0 50%,#f87171 50%)" name="Roads and railway" sub="OpenStreetMap" />
            <LayerToggle on={layers.cropland} onClick={() => flip('cropland')} swatch="#84cc16" name="Cropland" sub="ESA WorldCover 2021" />
            <LayerToggle on={layers.population} onClick={() => flip('population')} swatch="linear-gradient(90deg,#312e81,#db2777,#fef08a)" name="Population density" sub="WorldPop 2025" />
          </div>
        </Card>
      )}
      {mode === 'advanced' && (
        <Card title="District table (low – high)">
          <table className="tbl clickable">
            <thead><tr><th>District</th><th>People</th><th>Crop km²</th><th>Built-up km²</th><th>Roads km</th><th>Rail km</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.name} onClick={() => open('district', { name: r.name })}>
                <td>{r.name}</td><td>{range(r.low.people, r.high.people, (v) => people(v, country))}</td><td>{range(r.low.cropland_km2, r.high.cropland_km2)}</td>
                <td>{range(r.low.builtup_km2, r.high.builtup_km2)}</td><td>{range(r.low.roads_km, r.high.roads_km)}</td><td>{range(r.low.rail_km, r.high.rail_km)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="muted small">People: WorldPop 2025 constrained (100 m), weighted by the flooded fraction of each cell. Cropland/built-up: ESA WorldCover 2021. Roads (trunk–tertiary) and rail: OpenStreetMap, length of flooded 20 m pixels. Districts: geoBoundaries ADM2.</p>
        </Card>
      )}
      {m.event.caveat && atLeast(mode, 'intermediate') && <Note kind="warn">{m.event.caveat}</Note>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
export function HowItWorks({ ctx }) {
  const { mode, setCompare, go } = ctx
  const steps = [
    { t: 'The satellite sends radar waves', d: 'NISAR sends its own radio waves to the ground and listens for the echo. Clouds and darkness don\'t stop it.', term: 'radar',
      svg: <svg viewBox="0 0 120 60"><circle cx="20" cy="14" r="7" className="i-sat" /><path d="M26 18 L70 48" className="i-wave" /><path d="M10 52h100" className="i-ground" /><path d="M46 8c6-4 14-4 20 0M40 14c10-7 22-7 32 0" className="i-cloud" /></svg> },
    { t: 'Calm water looks dark', d: 'Water is smooth like a mirror, so the radar bounces away and little comes back. Land and plants are rough and look brighter.', term: 'backscatter',
      svg: <svg viewBox="0 0 120 60"><path d="M10 40h45" className="i-water" /><path d="M20 12 L32 40 L46 12" className="i-wave" /><path d="M65 40h45" className="i-ground" /><path d="M76 12l12 28M88 40l-6-14M88 40l8-14" className="i-wave" /></svg> },
    { t: 'Compare before and after', d: 'We compare each new picture with ones from before the flood. Only water that wasn\'t there before counts as flood, so rivers aren\'t counted.', term: 'change',
      svg: <svg viewBox="0 0 120 60"><rect x="8" y="10" width="46" height="40" rx="4" className="i-box" /><path d="M20 30c6-4 10 4 22 0" className="i-water" /><rect x="66" y="10" width="46" height="40" rx="4" className="i-box" /><path d="M72 22c8-6 14 8 34 0M72 36c8-6 14 8 34 0" className="i-flood" /></svg> },
    { t: 'Check the clues', d: 'Dark spots can also be shadows or rice fields. So the computer also checks how low the ground is, what was there before, and the land type, then gives a confidence level.', term: 'hybrid',
      svg: <svg viewBox="0 0 120 60"><path d="M20 30l8 8 16-16" className="i-check" /><path d="M60 22h50M60 32h40M60 42h46" className="i-ground" /></svg> },
  ]
  return (
    <div className="stack">
      <p className="lead">How a radar satellite finds floods, in four steps.</p>
      {steps.map((s, i) => (
        <div key={s.t} className="how">
          <div className="how-ill">{s.svg}</div>
          <div><b>{i + 1}. {s.t}</b><p>{s.d} <Explain term={s.term} mode={mode} label="More" /></p></div>
        </div>
      ))}
      <Note kind="warn">Dark doesn't always mean water, and NISAR isn't a live camera: it passes every few days. <Explain term="revisit" mode={mode} label="Why?" /></Note>
      <div className="row-btns">
        <button className="chip" onClick={() => { go('flood'); setCompare(true) }}>Try the before / after slider</button>
        <button className="chip" onClick={() => ctx.startTour()}>Take the guided tour</button>
      </div>
    </div>
  )
}

