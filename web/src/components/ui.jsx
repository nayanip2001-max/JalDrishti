import { useEffect, useRef, useState } from 'react'
import { GLOSSARY, glossaryText } from '../lib/glossary.js'

const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  check: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  database: 'M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  radar: 'M12 12l6-6M19.1 4.9A10 10 0 1 0 22 12M16 8a6 6 0 1 0 2 4',
  layers: 'M12 3l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5M3 16l9 5 9-5',
  cpu: 'M9 9h6v6H9zM4 9h2m-2 6h2m12-6h2m-2 6h2M9 4v2m6-2v2M9 18v2m6-2v2M6 6h12v12H6z',
  search: 'M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  play: 'M7 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  drawer: 'M15 4v16M4 4h16v16H4z',
  rain: 'M8 19l-1 2m6-2l-1 2m6-2l-1 2M7 15a5 5 0 1 1 1.7-9.7A6 6 0 0 1 20 9a4 4 0 0 1-1 7.9',
  dam: 'M3 20h18M5 20V8l4-2v14m0-9h10v9M13 11v9',
  river: 'M3 8c3-2 5 2 9 0s6 2 9 0M3 14c3-2 5 2 9 0s6 2 9 0',
  flag: 'M5 21V4m0 0h12l-2 4 2 4H5',
  external: 'M14 4h6v6m0-6l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12h.01',
}

export function Icon({ name, size = 18, stroke = 1.8, ...rest }) {
  const filled = name === 'play'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Card({ title, tag, children, className = '', action }) {
  return (
    <section className={`card ${className}`}>
      {(title || tag || action) && (
        <header className="card-h">
          <h3>{title}</h3>
          <span className="card-h-r">{tag}{action}</span>
        </header>
      )}
      {children}
    </section>
  )
}

// A number people can click to drill down. `onOpen` makes it a button.
export function Metric({ value, unit, label, color, sub, delta, onOpen, big = false }) {
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag className={`metric ${onOpen ? 'clickable' : ''} ${big ? 'big' : ''} ${!big && String(value).length > 8 ? 'long' : ''}`} onClick={onOpen}>
      <span className="metric-v">{value}{unit && <small>{unit}</small>}</span>
      <span className="metric-k">{color && <i className="dot" style={{ background: color }} />}{label}</span>
      {sub && <span className="metric-sub">{sub}</span>}
      {delta}
      {onOpen && <Icon name="chevron" size={14} className="metric-go" />}
    </Tag>
  )
}

export function Badge({ kind = 'observed', children }) {
  return <span className={`badge ${kind}`}>{children}</span>
}

export function KV({ rows }) {
  return (
    <dl className="kv">
      {rows.filter(Boolean).map(([k, v, hint]) => (
        <div key={k} className="kv-row"><dt>{k}{hint}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}

export function Note({ kind = 'info', children }) {
  return <p className={`note ${kind}`}>{children}</p>
}

// "Explain this": a small ? chip that opens a plain-language (or technical) explanation.
export function Explain({ term, mode, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const g = GLOSSARY[term]
  if (!g) return null
  return (
    <span className="explain" ref={ref}>
      <button className="explain-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open) }} aria-expanded={open}
        aria-label={`Explain ${g.term}`}>{label ?? '?'}</button>
      {open && (
        <span className="explain-pop" role="dialog">
          <b>{g.term}</b>
          <span>{glossaryText(term, mode)}</span>
        </span>
      )}
    </span>
  )
}

export function LayerToggle({ on, onClick, swatch, name, sub }) {
  return (
    <button className={`layer ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="sw" style={{ background: swatch }} />
      <span className="name">{name}{sub && <small>{sub}</small>}</span>
      <span className="toggle" />
    </button>
  )
}

export function Seg({ value, options, onChange, size = '' }) {
  return (
    <div className={`seg ${size}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)} title={o.title}>{o.label}</button>
      ))}
    </div>
  )
}

export function LinkButton({ children, onClick, icon = 'chevron' }) {
  return <button className="linkbtn" onClick={onClick}>{children}<Icon name={icon} size={14} /></button>
}
