const fmtKm = (v) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1))

function Stat({ label, color, value, prev }) {
  const d = prev == null ? null : value - prev
  return (
    <div className="stat">
      <div className="v">{fmtKm(value)}<small>km²</small></div>
      <div className="k"><span className="dot" style={{ background: color }} />{label}</div>
      {d != null && Math.abs(d) >= 0.5 && (
        <div className={`delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {fmtKm(Math.abs(d))} vs previous pass</div>
      )}
    </div>
  )
}

function Layer({ on, onClick, swatch, name, sub }) {
  return (
    <button className={`layer ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="sw" style={{ background: swatch }} />
      <span className="name">{name}<small>{sub}</small></span>
      <span className="toggle" />
    </button>
  )
}

export function StatsCard({ scene, prev }) {
  const a = scene.areas_km2, p = prev?.areas_km2
  return (
    <div className="card">
      <h3>Flood extent <span className="tag observed">● Observed</span></h3>
      <div className="stats">
        <Stat label="Open-water flood" color="var(--flood)" value={a['flood (open water)']} prev={p?.['flood (open water)']} />
        <Stat label="Flooded vegetation" color="var(--veg)" value={a['flooded vegetation']} prev={p?.['flooded vegetation']} />
        <Stat label="Possible flood" color="var(--possible)" value={a['possible flood (open water)'] + a['possible flooded vegetation']} prev={p && p['possible flood (open water)'] + p['possible flooded vegetation']} />
        <Stat label="River & permanent water" color="var(--perm)" value={a['permanent / pre-existing water']} />
      </div>
    </div>
  )
}

const num = (v) => (v >= 100 ? Math.round(v) : v).toLocaleString()
const range = (lo, hi, f = num) => (Math.round(lo) === Math.round(hi) ? f(lo) : `${f(lo)}–${f(hi)}`)
const compact = (v) => (v >= 1e5 ? `${(v / 1e5).toFixed(1)} lakh` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

export function ExposureCard({ scene, caveat }) {
  const e = scene.exposure
  if (!e) return null
  const rows = Object.entries(e.districts).sort((a, b) => b[1].high.people - a[1].high.people).slice(0, 6)
  return (
    <div className="card">
      <h3>Inside the flood <span className="tag exposed">Exposed</span></h3>
      <div className="stats">
        <div className="stat"><div className="v" style={{ fontSize: 19 }}>{range(e.low.people, e.high.people, compact)}</div><div className="k">people living in flooded area</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 19 }}>{range(e.low.cropland_km2, e.high.cropland_km2)}<small>km²</small></div><div className="k">cropland under water</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 19 }}>{range(e.low.roads_km, e.high.roads_km)}<small>km</small></div><div className="k">major roads</div></div>
        <div className="stat"><div className="v" style={{ fontSize: 19 }}>{range(e.low.rail_km, e.high.rail_km)}<small>km</small></div><div className="k">railway</div></div>
      </div>
      <table className="dtable">
        <thead><tr><th>District</th><th>People</th><th>Crop km²</th></tr></thead>
        <tbody>
          {rows.map(([name, d]) => (
            <tr key={name}><td>{name}</td><td>{range(d.low.people, d.high.people, compact)}</td><td>{range(d.low.cropland_km2, d.high.cropland_km2, (v) => Math.round(v))}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ margin: '8px 0 0' }}>Range = confident flood only → including "possible". Exposure is not damage: damage needs field or ASDMA reports. Population: WorldPop 2025 · roads: OpenStreetMap.</p>
      {caveat && <p className="hint" style={{ margin: '6px 0 0', color: '#fbbf24cc' }}>⚠ {caveat}</p>}
    </div>
  )
}

export function ValidationCard({ manifest }) {
  const v = manifest.validation
  if (!v) return null
  const folds = Object.keys(Object.values(v.rules)[0])
  const shown = Object.keys(v.rules)
  const mean = (k) => folds.reduce((a, f) => a + v.rules[k][f].IoU, 0) / folds.length
  return (
    <div className="card">
      <h3>How accurate is it? <span className="tag reference">Held-out test</span></h3>
      <table className="dtable vtable">
        <thead><tr><th>IoU vs Sentinel-2</th>{folds.map((f) => <th key={f}>{f.replace(' T0', ' ·T').replace(' T1', ' ·T1')}</th>)}<th>Mean</th></tr></thead>
        <tbody>
          {shown.map((k) => (
            <tr key={k} className={k === v.selected ? 'best' : ''}>
              <td>{k}</td>
              {folds.map((f) => <td key={f} title={`95% CI ${v.rules[k][f].ci.join('–')} · precision ${v.rules[k][f].precision.toFixed(2)} · recall ${v.rules[k][f].recall.toFixed(2)}`}>{v.rules[k][f].IoU.toFixed(2)}</td>)}
              <td><b>{mean(k).toFixed(2)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.null_tests?.length > 0 && (
        <p className="hint" style={{ margin: '8px 0 0' }}>
          False-alarm test (two pre-flood dates, no flood between): {v.null_tests.map((n) => `${n.false_flood_km2} of ${n.mapped_km2.toLocaleString()} km² flagged on T${n.track} ${n.date}`).join(' · ')}.
        </p>
      )}
      <p className="hint" style={{ margin: '6px 0 0' }}>{v.protocol} Hover a score for its 95% confidence interval.</p>
    </div>
  )
}

export function SensorCard({ manifest }) {
  const c = manifest.sensor_compare
  if (!c) return null
  const L = c.scores.water['NISAR L-band'], C = c.scores.water['Sentinel-1 C-band']
  return (
    <div className="card">
      <h3>L-band vs C-band <span className="tag observed">Same day</span></h3>
      <div className="stats">
        <div className="stat"><div className="v" style={{ color: 'var(--veg-possible)' }}>{Math.round(c.cropland_km2.L_only)}<small>km²</small></div><div className="k">flooded cropland only NISAR saw</div></div>
        <div className="stat"><div className="v" style={{ color: '#fb923c' }}>{Math.round(c.cropland_km2.C_only)}<small>km²</small></div><div className="k">only Sentinel-1 saw</div></div>
      </div>
      <table className="dtable">
        <thead><tr><th>vs Sentinel-2</th><th>IoU</th><th>Recall</th><th>Precision</th></tr></thead>
        <tbody>
          <tr><td>NISAR L-band</td><td title={`95% CI ${L.ci.join('–')}`}>{L.IoU.toFixed(2)}</td><td>{L.recall.toFixed(2)}</td><td>{L.precision.toFixed(2)}</td></tr>
          <tr><td>Sentinel-1 C-band</td><td title={`95% CI ${C.ci.join('–')}`}>{C.IoU.toFixed(2)}</td><td>{C.recall.toFixed(2)}</td><td>{C.precision.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <p className="hint" style={{ margin: '8px 0 0' }}>Passes 41 minutes apart ({c.date}), same detector, same Sentinel-2 reference. C-band is more conservative; L-band reaches water under crop canopy. Partial-overlap area, so confidence intervals overlap.</p>
    </div>
  )
}

export function LayersCard({ layers, setLayers, opacity, setOpacity, basemap, setBasemap, compare, setCompare, hasSensor }) {
  const flip = (k) => setLayers({ ...layers, [k]: !layers[k] })
  return (
    <div className="card">
      <h3>Layers</h3>
      <div className="layers">
        <Layer on={layers.flood} onClick={() => flip('flood')} swatch="linear-gradient(90deg,var(--flood) 0 33%,var(--veg) 33% 66%,var(--possible) 66%)" name="Flood classes" sub="NISAR L-band change detection" />
        <Layer on={layers.prob} onClick={() => flip('prob')} swatch="linear-gradient(90deg,#0b1220,#3b82f6,#e0f2fe)" name="Flood probability" sub="Calibrated per-pixel confidence" />
        <Layer on={layers.sar} onClick={() => flip('sar')} swatch="linear-gradient(90deg,#000,#fff)" name="NISAR radar image" sub="HH backscatter (γ⁰, dB)" />
        {hasSensor && <Layer on={layers.compare} onClick={() => flip('compare')} swatch="linear-gradient(90deg,var(--flood) 0 33%,#d946ef 33% 66%,#fb923c 66%)" name="L-band vs C-band" sub="Both · NISAR only · Sentinel-1 only" />}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        Overlay
        <input className="range" type="range" min={0.2} max={1} step={0.05} value={opacity.overlay} onChange={(e) => setOpacity({ ...opacity, overlay: +e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div className="seg" style={{ flex: 1 }}>
          {['dark', 'satellite'].map((b) => <button key={b} className={basemap === b ? 'on' : ''} onClick={() => setBasemap(b)}>{b === 'dark' ? 'Dark' : 'Satellite'}</button>)}
        </div>
        <div className="seg">
          <button className={compare ? 'on' : ''} onClick={() => setCompare(!compare)}>⟷ Before / After</button>
        </div>
      </div>
    </div>
  )
}

export function LegendCard({ manifest }) {
  const show = ['3', '4', '5', '6', '2', '7']
  return (
    <div className="card">
      <h3>Legend</h3>
      <div className="legend">
        {show.map((k) => (
          <div key={k}><span className="dot" style={{ background: manifest.classes[k].color }} />{manifest.classes[k].name.replace(' (open water)', '').replace('permanent / pre-existing water', 'river / permanent')}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <span className="tag observed">Observed</span>
        <span className="tag modelled">Modelled</span>
        <span className="tag predicted">Predicted</span>
        <span className="tag exposed">Exposed</span>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>Every layer carries one of these labels. Radar observations are never mixed with model estimates or forecasts.</p>
      <p className="hint" style={{ margin: '10px 0 0' }}>
        <a className="ext" href="https://github.com/nayanip2001-max/JalDrishti#readme" target="_blank" rel="noreferrer">Method, validation &amp; code on GitHub ↗</a>
      </p>
      <p className="hint" style={{ margin: '6px 0 0' }}>Team JalWar · Thrinayani P · Thrijagathi P · Minhaj Parveen H · Nilani S · Haseena F · NASA Space Apps 2026</p>
    </div>
  )
}
