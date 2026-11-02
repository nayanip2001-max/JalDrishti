// Drill-down panels shown in the right drawer: See → Click → Understand → Drill down → Verify → Analyse.
import { Card, Metric, Badge, Explain, Note, KV, LinkButton, Icon } from './ui.jsx'
import { RangeBars, ProbHistogram, TrackLines, ChartLegend } from './Charts.jsx'
import { ValidationView, SensorView } from './Science.jsx'
import { atLeast } from '../lib/modes.js'
import { GLOSSARY, glossaryText } from '../lib/glossary.js'
import { fmtDate, fmtDateLong, floodKm2, possibleKm2, num, range, people, pct, posts, prevSameTrack, phaseOf, peakOf } from '../lib/format.js'

const CLASS_LABELS = { 1: 'Dry land', 2: 'River / lake (normal water)', 3: 'Flood (open water)', 4: 'Possible flood',
  5: 'Flood under vegetation', 6: 'Possible flood under vegetation', 7: 'Uncertain' }
const CLASS_TONE = { 1: '#94a3b8', 2: 'var(--perm)', 3: 'var(--flood)', 4: 'var(--possible)', 5: 'var(--veg)', 6: 'var(--veg-possible)', 7: 'var(--uncertain)' }

function FloodDetail({ ctx }) {
  const { manifest: m, scene, mode, open } = ctx
  const a = scene.areas_km2
  const prev = prevSameTrack(m, scene)
  const rows = [
    { label: 'Flood (open water)', lo: a['flood (open water)'], color: 'var(--flood)' },
    { label: 'Flood under vegetation', lo: a['flooded vegetation'], color: 'var(--veg)' },
    { label: 'Possible flood', lo: possibleKm2(scene), color: 'var(--possible)' },
    { label: 'Uncertain', lo: a.uncertain, color: 'var(--uncertain)' },
    { label: 'River / permanent water', lo: a['permanent / pre-existing water'], color: 'var(--perm)' },
  ]
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={num(floodKm2(scene))} unit="km²" label={`Flood on ${fmtDate(scene.date)}`} color="var(--flood)" />
        <Metric value={prev ? `${floodKm2(scene) >= floodKm2(prev) ? '+' : '−'}${num(Math.abs(floodKm2(scene) - floodKm2(prev)))}` : '—'} unit="km²"
          label={prev ? `vs ${fmtDate(prev.date)} (same track)` : 'First pass on this track'} />
        <Metric value={`${Math.round((floodKm2(scene) / floodKm2(peakOf(m))) * 100)}%`} label={`of the peak (${fmtDate(peakOf(m).date)})`} />
      </div>
      <Card title="Mapped area by class" tag={<Badge>Observed</Badge>}>
        <RangeBars rows={rows} unit=" km²" fmt={num} />
        {mode === 'beginner' && <p className="muted small">Only cyan and purple count as flood. Orange means the radar isn't sure.</p>}
      </Card>
      <Card title="On the timeline">
        <TrackLines manifest={m} scene={scene} onSelect={ctx.setScene} height={120} />
      </Card>
      <div className="row-btns">
        <LinkButton onClick={() => open('probability')}>How confident?</LinkButton>
        {scene.exposure && <LinkButton onClick={() => open('people')}>Who is inside it?</LinkButton>}
        {atLeast(mode, 'intermediate') && <LinkButton onClick={() => open('observation', { scene })}>Radar pass details</LinkButton>}
      </div>
    </div>
  )
}

function ProbabilityDetail({ ctx }) {
  const { scene, mode, layers, setLayers } = ctx
  const h = scene.prob_hist
  return (
    <div className="stack">
      <p className="lead">{mode === 'beginner' ? 'Every spot gets a score for how sure we are it is flooded.' : 'Distribution of per-pixel flood probability on this pass.'} <Explain term="probability" mode={mode} /></p>
      {h ? (
        <>
          <div className="metrics">
            <Metric big value={pct(h.confident_share)} label="of flagged area is high-confidence" color="var(--flood)" />
            <Metric value={num(possibleKm2(ctx.scene))} unit="km²" label="Possible (0.5–0.8)" color="var(--possible)" />
          </div>
          <Card title="Probability distribution (p ≥ 0.1)"><ProbHistogram hist={h} />
            <ChartLegend items={[{ label: 'Confident > 0.8', color: 'var(--flood)' }, { label: 'Possible', color: 'var(--possible)' }, { label: 'Uncertain', color: 'var(--uncertain)' }, { label: 'Unlikely', color: '#334155' }]} />
          </Card>
        </>
      ) : <Note>The probability distribution appears after the next data export.</Note>}
      <KV rows={[['Confident', 'p > 0.8 → shown solid'], ['Possible', '0.5 < p ≤ 0.8 → shown faint'], ['Uncertain', '0.35 < p ≤ 0.5 → shown faint grey']]} />
      {atLeast(mode, 'advanced') && <Note>p_flood = 1 − (1 − p_open)(1 − p_veg); p_open = P(water now) × (1 − P(water in reference)). Probabilities are from the model, not separately recalibrated; the tiers are what was validated.</Note>}
      <button className={`chip ${layers.prob ? 'on' : ''}`} onClick={() => setLayers({ ...layers, prob: !layers.prob })}>{layers.prob ? 'Hide' : 'Show'} the probability layer</button>
    </div>
  )
}

function ExposureList({ ctx, keyLo, label, unit, fmt, color }) {
  const rows = Object.entries(ctx.scene.exposure.districts).map(([name, d]) => ({ label: name, lo: d.low[keyLo], hi: d.high[keyLo] }))
    .filter((r) => r.hi > 0).sort((a, b) => b.hi - a.hi)
  return (
    <Card title={`${label} by district`}>
      <RangeBars rows={rows} unit={unit} fmt={fmt} color={color} onPick={(r) => ctx.open('district', { name: r.label })} />
      <p className="muted small">Solid = confident flood only · faint = including "possible".</p>
    </Card>
  )
}

function PeopleDetail({ ctx }) {
  const { scene, mode, layers, setLayers, country, manifest: m } = ctx
  const e = scene.exposure
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={range(e.low.people, e.high.people, (v) => people(v, country))} label="People living inside the flood extent" color="#f472b6" />
      </div>
      <Note kind="exposed"><Badge kind="exposed">Exposed</Badge> {mode === 'beginner' ? 'These people live where the map shows water. It does not mean all of them were hurt or had to leave.' : 'Population inside the mapped flood extent, not displaced or damaged.'} <Explain term="exposure" mode={mode} label="Explain" /></Note>
      <ExposureList ctx={ctx} keyLo="people" label="People" fmt={(v) => people(v, country)} color="#f472b6" />
      {atLeast(mode, 'intermediate') && <button className={`chip ${layers.population ? 'on' : ''}`} onClick={() => setLayers({ ...layers, population: !layers.population })}>{layers.population ? 'Hide' : 'Show'} population density on the map</button>}
      {atLeast(mode, 'advanced') && <p className="muted small">WorldPop 2025 constrained 100 m grid; each cell weighted by the flooded fraction of its 20 m pixels (average resampling). Low = classes 3+5, high = classes 3–6.</p>}
      {m.event.caveat && <Note kind="warn">{m.event.caveat}</Note>}
    </div>
  )
}

function CroplandDetail({ ctx }) {
  const { scene, mode, layers, setLayers } = ctx
  const e = scene.exposure
  return (
    <div className="stack">
      <div className="metrics"><Metric big value={range(e.low.cropland_km2, e.high.cropland_km2)} unit="km²" label="Cropland under water" color="#84cc16" /></div>
      <ExposureList ctx={ctx} keyLo="cropland_km2" label="Cropland" unit=" km²" fmt={num} color="#84cc16" />
      <button className={`chip ${layers.cropland ? 'on' : ''}`} onClick={() => setLayers({ ...layers, cropland: !layers.cropland, flood: true })}>{layers.cropland ? 'Hide' : 'Show'} cropland on the map</button>
      <Note kind="warn">{mode === 'beginner' ? 'Some rice fields are flooded on purpose for planting, so this number may be a little too high.' : 'Paddy fields with standing irrigation water can count as new water in July; treat cropland figures as upper bounds. Exposure ≠ crop loss.'}</Note>
    </div>
  )
}

function RoadsDetail({ ctx }) {
  const { scene, layers, setLayers } = ctx
  const e = scene.exposure
  return (
    <div className="stack">
      <div className="metrics">
        <Metric big value={range(e.low.roads_km, e.high.roads_km)} unit="km" label="Major roads in the flood" color="#fde68a" />
        <Metric value={range(e.low.rail_km, e.high.rail_km)} unit="km" label="Railway" color="#f87171" />
      </div>
      <ExposureList ctx={ctx} keyLo="roads_km" label="Roads (km)" unit=" km" fmt={num} color="#fde68a" />
      <button className={`chip ${layers.roads ? 'on' : ''}`} onClick={() => setLayers({ ...layers, roads: !layers.roads })}>{layers.roads ? 'Hide' : 'Show'} roads and railway</button>
      <p className="muted small">Trunk to tertiary roads and rail from OpenStreetMap; length counted over flooded 20 m pixels, so it is approximate.</p>
    </div>
  )
}

function DistrictDetail({ ctx, name }) {
  const { scene, manifest: m, country, mode } = ctx
  const d = scene.exposure?.districts?.[name]
  const info = m.anc?.districts?.find((x) => x.name === name)
  return (
    <div className="stack">
      <p className="lead">{name} · {fmtDate(scene.date)}</p>
      {d ? (
        <div className="metrics">
          <Metric value={range(d.low.people, d.high.people, (v) => people(v, country))} label="People in flooded area" color="#f472b6" />
          <Metric value={range(d.low.cropland_km2, d.high.cropland_km2)} unit="km²" label="Cropland under water" color="#84cc16" />
          <Metric value={range(d.low.roads_km, d.high.roads_km)} unit="km" label="Major roads" />
          <Metric value={range(d.low.rail_km, d.high.rail_km)} unit="km" label="Railway" />
        </div>
      ) : <Note>No mapped flood in {name} on this pass.</Note>}
      {info && <button className="chip" onClick={() => ctx.flyTo({ bounds: [[info.bbox[0], info.bbox[1]], [info.bbox[2], info.bbox[3]]] })}>Zoom to {name}</button>}
      <Card title="Across all passes">
        <table className="tbl"><thead><tr><th>Date</th><th>People</th><th>Crop km²</th></tr></thead>
          <tbody>{posts(m).filter((s) => s.exposure?.districts?.[name]).map((s) => {
            const x = s.exposure.districts[name]
            return <tr key={s.id} className={s.id === scene.id ? 'sel' : ''} onClick={() => ctx.setScene(s)}><td>{fmtDate(s.date)} · T{s.track}</td><td>{range(x.low.people, x.high.people, (v) => people(v, country))}</td><td>{range(x.low.cropland_km2, x.high.cropland_km2)}</td></tr>
          })}</tbody></table>
        {mode !== 'beginner' && <p className="muted small">Different tracks cover different parts of the district; compare same-track rows.</p>}
      </Card>
    </div>
  )
}

function ObservationDetail({ ctx, scene: s0 }) {
  const { manifest: m, mode, setScene } = ctx
  const s = s0 ?? ctx.scene
  const o = s.obs ?? {}
  const refs = m.refs[String(s.track)]
  return (
    <div className="stack">
      <p className="lead">NISAR pass · {fmtDateLong(s.date)} <Badge>Observed</Badge></p>
      <KV rows={[
        ['Track', `${s.track}${o.frame ? ` · frame ${o.frame}` : ''}`],
        ['Orbit', o.direction ?? '—'],
        ['Mode', s.mode === 'QPDH' ? 'Quad-pol (QPDH)' : 'Dual-pol (DHDH)'],
        ['Polarisations', <>{(o.polarisations ?? ['HH', 'HV']).join(', ')} <Explain term="hhhv" mode={mode} /></>],
        ['Band', <>L-band, 24 cm <Explain term="lband" mode={mode} /></>],
        atLeast(mode, 'intermediate') && ['Quantity', o.quantity ?? 'RTC γ⁰, dB'],
        atLeast(mode, 'intermediate') && ['Resolution', o.native_resolution ?? '20 m'],
        atLeast(mode, 'intermediate') && ['Processing', o.processing ?? '20 m, Lee filter'],
        ['Compared with', refs ? `${refs.dates.length} pre-flood passes: ${refs.dates.map((d) => fmtDate(d)).join(', ')}` : '—'],
        ['Phase', phaseOf(m, s.date).name],
        atLeast(mode, 'advanced') && ['Product', o.product ?? 'NISAR L2 GCOV'],
        atLeast(mode, 'advanced') && ['Granule', <code className="mono small">{o.granule ?? '—'}</code>],
      ]} />
      {o.asf_url && <a className="linkbtn" href={o.asf_url} target="_blank" rel="noreferrer">Verify this granule at ASF Vertex <Icon name="external" size={13} /></a>}
      {s.id !== ctx.scene.id && <button className="chip on" onClick={() => setScene(s)}>Show this pass on the map</button>}
    </div>
  )
}

function Clue({ label, v, range: r = 8, neutral, unit = '', title }) {
  const c = Math.max(-r, Math.min(r, v)), w = (Math.abs(c) / r) * 50
  return (
    <div className="clue" title={title}><span>{label}</span>
      <span className="bar"><span className="fill" style={{ left: c >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: neutral ? '#64748b' : c >= 0 ? 'var(--flood)' : 'var(--possible)' }} /></span>
      <span className="num">{v >= 0 ? '+' : ''}{v.toFixed(1)}{unit}</span></div>
  )
}

// What the classifier saw at one pixel. Beginner = plain sentences; Advanced = raw values and log-odds terms.
function PixelDetail({ ctx }) {
  const { pixel: p, pick, mode, manifest: m, scene } = ctx
  if (!pick) return <Note>Click anywhere on the map.</Note>
  if (!p) return <Note>No NISAR coverage at this point on {fmtDate(scene.date)}.</Note>
  const cls = p.cls ?? (p.pOpen > 0.8 ? 3 : p.pVeg > 0.8 ? 5 : p.pOpen > 0.5 ? 4 : p.pVeg > 0.5 ? 6 : 1)
  const wc = p.wc ? m.anc?.worldcover?.[p.wc] ?? `class ${p.wc}` : null
  const plain = [
    p.hh != null && (p.hh < -15 ? 'The radar echo is very weak here, which is typical of calm water.' : p.hh < -10 ? 'The radar echo is fairly weak.' : 'The radar echo is strong: this looks like land, plants or buildings.'),
    p.lBefore > 1 ? 'Before the flood, this spot looked like dry land.' : p.lBefore < -1 ? 'This spot already looked like water before the flood.' : null,
    p.hand != null && (p.hand < 5 ? `It sits low, only about ${Math.max(0, p.hand).toFixed(0)} m above the nearest river.` : `It sits about ${p.hand.toFixed(0)} m above the nearest river.`),
    p.jrc != null && (p.jrc >= 50 ? `It is water most of the time (${p.jrc.toFixed(0)}% of years): a river or lake.` : p.jrc > 5 ? `It is occasionally water (${p.jrc.toFixed(0)}% of the time since 1984).` : 'It is almost never covered by water normally.'),
    wc && `The land here is ${wc.toLowerCase()}.`,
  ].filter(Boolean)
  const rescue = p.hh != null && p.hand != null && p.hh < -15 && p.hand < 10
  return (
    <div className="stack">
      <div className="verdict" style={{ borderColor: CLASS_TONE[cls] }}>
        <span className="verdict-p" style={{ color: CLASS_TONE[cls] }}>{Math.round(p.pFlood * 100)}%</span>
        <span><b style={{ color: CLASS_TONE[cls] }}>{CLASS_LABELS[cls]}</b><small>flood probability · {fmtDate(scene.date)}{p.district ? ` · ${p.district}` : ''}</small></span>
      </div>
      {mode === 'beginner' ? (
        <Card title="Why this spot?"><ul className="plain">{plain.map((t) => <li key={t}>{t}</li>)}</ul></Card>
      ) : (
        <Card title="Evidence (log-odds; cyan pushes towards flood)" action={<Explain term="change" mode={mode} />}>
          <Clue label="Looks like water now" v={p.lNow} title="Scene-adaptive water/land mixture on this pass" />
          <Clue label="Was dry before" v={p.lBefore} title="Same test on the reference passes; positive = it was land" />
          <Clue label="Low ground / flat" v={p.lTerrain} title="HAND and slope priors" />
          <Clue label="HH change" v={p.dHH} range={15} neutral unit=" dB" title="vs pre-flood reference median" />
        </Card>
      )}
      {atLeast(mode, 'intermediate') && (
        <Card title="Measured values">
          <KV rows={[
            ['HH backscatter', p.hh != null ? `${p.hh.toFixed(1)} dB` : '—', <Explain key="e" term="backscatter" mode={mode} />],
            ['HV backscatter', p.hv != null ? `${p.hv.toFixed(1)} dB` : '—'],
            ['Change vs before (HH)', `${p.dHH >= 0 ? '+' : ''}${p.dHH.toFixed(1)} dB`],
            ['HAND', p.hand != null ? `${p.hand.toFixed(1)} m` : '—', <Explain key="h" term="hand" mode={mode} />],
            ['Slope', p.slope != null ? `${p.slope.toFixed(1)}°` : '—'],
            ['Historical water', p.jrc != null ? `${p.jrc.toFixed(0)}% of 1984–2021` : '—', <Explain key="j" term="jrc" mode={mode} />],
            ['Land cover', wc ?? '—'],
            p.density != null && ['Population density', `~${num(p.density)} people/km²`],
          ]} />
        </Card>
      )}
      {mode === 'advanced' && (
        <Card title="Model trace">
          <KV rows={[
            ['p_open (new open water)', p.pOpen.toFixed(3)], ['p_veg (under vegetation)', p.pVeg.toFixed(3)], ['p_flood', p.pFlood.toFixed(3)],
            ['Class code', `${cls} · ${CLASS_LABELS[cls]}`],
            ['Physics rescue (HH < −15 dB & HAND < 10 m)', p.hh == null ? '—' : rescue ? 'applies' : 'does not apply'],
            ['Permanent water (JRC ≥ 50%)', p.jrc == null ? '—' : p.jrc >= 50 ? 'yes: excluded' : 'no'],
            ['Coordinates', `${pick[1].toFixed(5)}°N, ${pick[0].toFixed(5)}°E`],
          ]} />
          <p className="muted small">Values sampled from 100 m lookups (decision made at 20 m). LightGBM per-pixel feature contributions are not shipped; physics log-odds terms above and global feature importance (Features) explain the decision.</p>
        </Card>
      )}
    </div>
  )
}

// "What am I seeing?" — explains the current map state in plain language.
function SeeingDetail({ ctx }) {
  const { manifest: m, scene, layers, compare, mode, country } = ctx
  const ph = phaseOf(m, scene.date)
  const e = scene.exposure
  const items = [
    layers.sar && ['Grey picture', 'The NISAR radar image. Dark = calm water (radar bounces away); bright = rough land, plants, buildings.'],
    layers.flood && ['Cyan / purple', 'New flood water (purple: water under plants). Only water that wasn\'t there before the flood is counted.'],
    layers.flood && ['Faint orange', '"Maybe" flood: the radar is not sure.'],
    layers.flood && ['Dark blue', 'Rivers and lakes that are always there (normal water, not flood).'],
    layers.prob && ['Blue glow', 'How confident the detection is: brighter = more confident.'],
    layers.compare && ['Magenta / orange / cyan', 'Where only NISAR, only Sentinel-1, or both saw flood on the same day.'],
    layers.cropland && ['Green', 'Farmland (cropland).'],
    layers.population && ['Purple → yellow', 'Where people live: brighter = more people.'],
    layers.districts && ['White outlines', 'District boundaries.'],
    layers.roads && ['Yellow / red lines', 'Main roads (yellow) and railways (red).'],
    compare && ['Slider', 'Left of the slider: before the flood. Right: the selected day.'],
  ].filter(Boolean)
  return (
    <div className="stack">
      <p className="lead">You are looking at {m.event.title.split('·')[0].trim()} as the NISAR satellite saw it on <b>{fmtDateLong(scene.date)}</b> ({ph.name.toLowerCase()} the flood).</p>
      <p className="body">On this day about <b>{num(floodKm2(scene))} km²</b> was flooded{e ? <>, and <b>{people(e.low.people, country)}–{people(e.high.people, country)}</b> people lived inside the flooded area</> : null}.</p>
      <Card title="On the map now"><KV rows={items} /></Card>
      <Note>Click any spot to see why it was or wasn't marked as flood. Use the timeline to move through the days. <Explain term="radar" mode={mode} label="How does radar see?" /></Note>
    </div>
  )
}

function HelpDetail({ ctx }) {
  const { mode, open } = ctx
  return (
    <div className="stack">
      <Card title="Getting around">
        <ul className="plain">
          <li><b>Modes</b>: Beginner gives the answers, Intermediate shows the evidence, Advanced shows the science. Same data in every mode.</li>
          <li><b>Science | Impact</b>: radar and model, or people, farms and roads.</li>
          <li><b>Click</b> any number, chart row or map spot to drill down; use ← to go back.</li>
          <li><b>Timeline</b>: each dot is a real NISAR pass. Click one, or press ▶ to replay.</li>
          <li><b>Search</b>: districts, dates ("22 Jul"), tracks ("T40") or terms ("HAND").</li>
        </ul>
      </Card>
      <div className="row-btns">
        <button className="chip on" onClick={() => open('seeing')}>What am I seeing?</button>
        <button className="chip" onClick={() => ctx.startTour()}>Guided tour</button>
      </div>
      <Card title="Glossary">
        <dl className="feats">{Object.entries(GLOSSARY).map(([k, g]) => <div key={k}><dt>{g.term}</dt><dd>{glossaryText(k, mode)}</dd></div>)}</dl>
      </Card>
      <p className="muted small">Keyboard: ← → previous/next pass · / search · Esc close panel.</p>
    </div>
  )
}

function TermDetail({ ctx, term }) {
  const g = GLOSSARY[term]
  return <div className="stack"><p className="lead">{g.term}</p><p className="body">{glossaryText(term, ctx.mode)}</p></div>
}

export const DETAILS = {
  flood: { title: 'Flood extent', C: FloodDetail },
  probability: { title: 'Flood probability', C: ProbabilityDetail },
  people: { title: 'People in the flooded area', C: PeopleDetail },
  cropland: { title: 'Cropland under water', C: CroplandDetail },
  roads: { title: 'Roads and railway', C: RoadsDetail },
  district: { title: (p) => p.name, C: DistrictDetail },
  observation: { title: 'NISAR observation', C: ObservationDetail },
  validation: { title: 'Validation', C: (props) => <ValidationView {...props} inDrawer /> },
  sensor: { title: 'L-band vs C-band', C: SensorView },
  pixel: { title: 'Why this pixel?', C: PixelDetail },
  seeing: { title: 'What am I seeing?', C: SeeingDetail },
  help: { title: 'Help', C: HelpDetail },
  term: { title: (p) => GLOSSARY[p.term]?.term ?? 'Explain', C: TermDetail },
}
