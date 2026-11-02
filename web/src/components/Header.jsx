import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Seg } from './ui.jsx'
import { MODES, NAV } from '../lib/modes.js'
import { GLOSSARY } from '../lib/glossary.js'
import { fmtDate, posts } from '../lib/format.js'

// Search across districts, NISAR passes (by date or track), dashboard sections and glossary terms.
function useSearch(manifest, mode, query) {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !manifest) return []
    const out = []
    for (const d of manifest.anc?.districts ?? []) if (d.name.toLowerCase().includes(q)) out.push({ kind: 'District', label: d.name, payload: d })
    for (const s of posts(manifest)) {
      const label = `${fmtDate(s.date)} · track ${s.track}`
      if (label.toLowerCase().includes(q) || s.date.includes(q) || `t${s.track}` === q.replace(/\s/g, '')) out.push({ kind: 'NISAR pass', label, payload: s })
    }
    for (const n of NAV[mode]) if (n.label.toLowerCase().includes(q)) out.push({ kind: 'Section', label: n.label, payload: n })
    for (const [k, g] of Object.entries(GLOSSARY)) if (g.term.toLowerCase().includes(q) || k.includes(q)) out.push({ kind: 'Explain', label: g.term, payload: k })
    return out.slice(0, 9)
  }, [manifest, mode, query])
}

export default function Header({ events, eventId, onEvent, manifest, scene, mode, onMode, lens, onLens, onSearchPick, onHelp, onSeeing }) {
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState(false)
  const [hi, setHi] = useState(0)
  const input = useRef(null)
  const results = useSearch(manifest, mode, query)

  useEffect(() => {
    const k = (e) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); input.current?.focus() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const pick = (r) => { onSearchPick(r); setQuery(''); setFocus(false); input.current?.blur() }
  const ev = manifest?.event
  return (
    <header className="hdr">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M2 14c3-3 5 3 10 0s7 3 10 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M2 19c3-3 5 3 10 0s7 3 10 0" stroke="#a78bfa" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".8" /></svg>
        </span>
        <span className="brand-t"><b>JalDrishti</b><small>NISAR flood intelligence</small></span>
      </div>

      <div className="hdr-event">
        <select value={eventId} onChange={(e) => onEvent(e.target.value)} aria-label="Flood event">
          {(events.length ? events : [{ id: eventId, title: ev?.title ?? '', country: ev?.country ?? '' }]).map((e) => (
            <option key={e.id} value={e.id}>{e.title} · {e.country}</option>
          ))}
        </select>
        {scene && (
          <span className="hdr-obs" title="Date of the NISAR pass shown on the map">
            <i className="live" />{fmtDate(scene.date, { day: 'numeric', month: 'short', year: 'numeric' })} · T{scene.track}
          </span>
        )}
      </div>

      <div className={`search ${focus ? 'focus' : ''}`}>
        <Icon name="search" size={16} />
        <input ref={input} value={query} placeholder="Search district, date, term…  ( / )" aria-label="Search"
          onChange={(e) => { setQuery(e.target.value); setHi(0) }} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
            if (e.key === 'Enter' && results[hi]) pick(results[hi])
            if (e.key === 'Escape') { setQuery(''); input.current?.blur() }
          }} />
        {focus && query && (
          <ul className="search-res" role="listbox">
            {results.length ? results.map((r, i) => (
              <li key={r.kind + r.label} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={() => pick(r)}>
                <span>{r.label}</span><small>{r.kind}</small>
              </li>
            )) : <li className="empty">No matches</li>}
          </ul>
        )}
      </div>

      <div className="hdr-r">
        <button className="btn-ghost seeing" onClick={onSeeing}><Icon name="eye" size={16} />What am I seeing?</button>
        <button className="btn-icon" onClick={onHelp} aria-label="Help" title="Help"><Icon name="help" /></button>
        <Seg value={lens} onChange={onLens} size="sm" options={[{ id: 'science', label: 'Science' }, { id: 'impact', label: 'Impact' }]} />
        <div className="modes" role="radiogroup" aria-label="Detail level">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)} title={m.who}>
              <b>{m.label}</b><small>{m.who}</small>
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
