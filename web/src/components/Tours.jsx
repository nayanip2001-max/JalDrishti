// Guided tours UI: the header button + menu, the step card, and the "resume" pill shown while exploring freely.
import { useEffect, useRef, useState } from 'react'
import { Icon } from './ui.jsx'

const GROUPS = [
  ['start', 'Start here'],
  ['ask', 'Ask a question'],
  ['deep', 'Go deeper'],
  ['world', 'Around the world'],
]
const mins = (n) => `${Math.max(1, Math.round(n * 15 / 60))} min`

export function TourButton({ tours, loading, onStart, fresh, onOpen }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const k = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', f); window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div className="tours" ref={ref}>
      <button className={`tour-btn ${fresh ? 'fresh' : ''}`} aria-expanded={open} aria-haspopup="menu"
        onClick={() => { setOpen((o) => !o); onOpen() }}>
        <span className="tour-btn-ic"><Icon name="play" size={12} /></span><span className="tour-btn-t">Guided tours</span>
      </button>
      {open && (
        <div className="tour-menu" role="menu">
          {GROUPS.map(([g, label]) => {
            const items = tours.filter((t) => t.group === g)
            if (!items.length) return null
            return (
              <div key={g} className={`tm-group tm-${g}`}>
                <small>{label}</small>
                {items.map((t) => (
                  <button key={t.id} role="menuitem" className="tm-item" onClick={() => { setOpen(false); onStart(t.id) }}>
                    <b>{t.title}</b><span>{t.sub}</span><em>{t.steps.length} steps · {mins(t.steps.length)}</em>
                  </button>
                ))}
              </div>
            )
          })}
          {loading && <p className="tm-loading"><span className="spinner" />Loading the other tours…</p>}
        </div>
      )}
    </div>
  )
}

export function TourCard({ tour, index, pixel, onIndex, onPause, onClose, link }) {
  const [copied, setCopied] = useState(false)
  const s = tour.steps[index]
  if (!s) return null
  const fact = typeof s.fact === 'function' ? s.fact(pixel) : s.fact
  const last = index === tour.steps.length - 1
  const copy = async () => {
    try { await navigator.clipboard.writeText(link) } catch { window.prompt('Copy this link', link) }
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="tour" role="dialog" aria-label={`Guided tour: ${tour.title}`}>
      <div className="tour-top">
        <span className="tour-name">{tour.title}</span>
        <button className="tour-ic" onClick={copy} title="Copy a link to this step" aria-label="Copy a link to this step"><Icon name="link" size={15} /></button>
        <button className="tour-ic" onClick={onPause} title="Explore freely, resume later" aria-label="Pause the tour"><Icon name="pause" size={15} /></button>
        <button className="tour-ic" onClick={onClose} title="End the tour" aria-label="End the tour"><Icon name="close" size={15} /></button>
      </div>
      {copied && <span className="tour-copied" role="status">Link copied</span>}
      <h3>{s.title}</h3>
      {fact && <div className="tour-fact"><b>{fact.v}</b><span>{fact.l}</span></div>}
      {s.table && (
        <table className="tour-tbl"><thead><tr>{s.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{s.table.rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table>
      )}
      <p>{s.body}</p>
      <div className="tour-nav">
        <button onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous step"><Icon name="back" size={16} /></button>
        <div className="tour-dots">{tour.steps.map((st, i) => (
          <button key={i} className={i === index ? 'on' : i < index ? 'done' : ''} onClick={() => onIndex(i)} aria-label={`Step ${i + 1}: ${st.title}`} title={st.title} />
        ))}</div>
        {last ? <button className="primary" onClick={onClose}>Explore</button>
          : <button className="primary" onClick={() => onIndex(index + 1)}>Next <Icon name="chevron" size={14} /></button>}
      </div>
    </div>
  )
}

export function TourResume({ tour, index, onResume, onClose }) {
  return (
    <div className="tour-pill" role="status">
      <button className="tour-pill-go" onClick={onResume}><Icon name="play" size={11} />Resume tour<span>{tour.title} · {index + 1}/{tour.steps.length}</span></button>
      <button className="tour-ic" onClick={onClose} aria-label="End the tour"><Icon name="close" size={14} /></button>
    </div>
  )
}
