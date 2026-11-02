// Layout pieces around the map: navigation rail, contextual drawer and the map legend.
import { Icon } from './ui.jsx'
import { NAV } from '../lib/modes.js'

export function NavRail({ mode, section, onSection }) {
  return (
    <nav className="rail" aria-label="Sections">
      {NAV[mode].map((n) => (
        <button key={n.id} className={section === n.id ? 'on' : ''} onClick={() => onSection(n.id)} aria-current={section === n.id ? 'page' : undefined}>
          <Icon name={n.icon} size={20} />
          <span>{n.label}</span>
        </button>
      ))}
    </nav>
  )
}

export function Drawer({ title, crumb, onBack, onClose, open, children }) {
  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-label="Details">
      <header className="drawer-h">
        {onBack ? <button className="btn-icon" onClick={onBack} aria-label="Back"><Icon name="back" /></button> : <span className="drawer-dot" />}
        <div className="drawer-t">{crumb && <small>{crumb}</small>}<h2>{title}</h2></div>
        <button className="btn-icon" onClick={onClose} aria-label="Collapse panel" title="Collapse"><Icon name="drawer" /></button>
      </header>
      <div className="drawer-b">{children}</div>
    </aside>
  )
}

export function MapLegend({ manifest, layers, mode, scene }) {
  const simple = mode === 'beginner'
  const cls = [
    ['3', simple ? 'Flood' : 'Flood (open water)'], ['5', simple ? 'Flood under plants' : 'Flooded vegetation'],
    ['4', simple ? 'Maybe flood' : 'Possible flood'], ['2', simple ? 'River / lake' : 'Permanent water'],
  ]
  if (!simple) cls.push(['7', 'Uncertain'])
  const cmp = manifest.sensor_compare && layers.compare && scene.date === manifest.sensor_compare.date
  return (
    <div className="legend-float">
      {layers.flood && cls.map(([k, l]) => <span key={k}><i style={{ background: manifest.classes[k].color }} />{l}</span>)}
      {cmp && <><span><i style={{ background: '#d946ef' }} />Only NISAR</span><span><i style={{ background: '#fb923c' }} />Only Sentinel-1</span><span><i style={{ background: '#22d3ee' }} />Both</span></>}
      {layers.cropland && <span><i style={{ background: '#84cc16' }} />Cropland</span>}
      {layers.population && <span><i style={{ background: 'linear-gradient(90deg,#312e81,#db2777,#fef08a)' }} />People/km² (low → high)</span>}
      {layers.roads && <><span><i className="line" style={{ background: '#fde68a' }} />Road</span><span><i className="line" style={{ background: '#f87171' }} />Railway</span></>}
      {layers.districts && <span><i className="line dash" />District</span>}
    </div>
  )
}
