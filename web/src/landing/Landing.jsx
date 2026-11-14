// Entry screen: Earth from space with the JalDrishti event sites, and the three experience levels.
// Everything here is real: sites and names come from data/events.json (the same list the dashboard uses), levels are
// the dashboard's own modes (jd-mode) and each level lists the sections it actually opens (lib/modes.js NAV).
// Choosing a site turns the globe to it and opens the existing dashboard at #<event> in the chosen level.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MODES, NAV } from '../lib/modes.js'
import './landing.css'

const BASE = import.meta.env.BASE_URL
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}
const PLACE = { assam: 'Assam', chennai: 'Chennai', thailand: 'Thailand' }
const placeOf = (e) => {
  const p = PLACE[e.id] ?? e.title.split('·')[0].trim()
  return p === e.country ? p : `${p}, ${e.country}`
}
const whenOf = (e) => e.title.split('·').slice(1).join('·').trim()
const kindOf = (e) => e.title.split('·')[0].trim()
// What each level opens, straight from the dashboard's navigation (its first item, Overview/Event, is common to all).
const OPENS = Object.fromEntries(MODES.map((m) => [m.id, [...(m.id === 'beginner' ? ['Guided tour'] : []), ...NAV[m.id].slice(1).map((n) => n.label)]]))

function Logo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 14c3-3 5 3 10 0s7 3 10 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M2 19c3-3 5 3 10 0s7 3 10 0" stroke="#a78bfa" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".8" />
    </svg>
  )
}

export default function Landing({ onEnter }) {
  const [events, setEvents] = useState([])
  const [mode, setMode] = useState(() => { const m = store.get('jd-mode', 'beginner'); return MODES.some((x) => x.id === m) ? m : 'beginner' })
  const [hover, setHover] = useState(null)
  const [going, setGoing] = useState(null)
  const [sel, setSel] = useState(null)                 // chosen region (pin or button); Start exploring enters it
  const fromPin = useRef(false)
  const [ready, setReady] = useState(false)
  const [noGL, setNoGL] = useState(false)
  const root = useRef(null), pane = useRef(null), canvas = useRef(null), pinEls = useRef({}), globe = useRef(null)
  const modeRef = useRef(mode); modeRef.current = mode

  useEffect(() => { fetch(BASE + 'data/events.json').then((r) => r.json()).then(setEvents).catch(() => setEvents([])) }, [])

  // The globe is created once the sites are known; it is torn down with the page.
  useLayoutEffect(() => {
    if (!events.length || !canvas.current) return
    let g, alive = true, ro
    const host = root.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    import('./globe.js').then(({ createGlobe }) => {
      if (!alive) return
      try {
        g = createGlobe(canvas.current, {
          textures: { day: BASE + 'globe/earth_day.webp', clouds: BASE + 'globe/earth_clouds.webp' },
          sites: events.map((e) => ({ id: e.id, lon: e.center[0], lat: e.center[1] })),
          reduced, onReady: () => alive && setReady(true),
        })
      } catch { setNoGL(true); return }
      globe.current = g
      g.setPins(events.map((e) => ({ id: e.id, get el() { return pinEls.current[e.id] } })))
      const fit = () => {
        const r = pane.current.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight
        g.layout({ x: r.left, y: r.top, w: r.width, h: r.height, W, H, fill: W < 860 ? 0.64 : 0.62 })
      }
      fit()
      ro = new ResizeObserver(fit); ro.observe(host)
      host.addEventListener('scroll', fit, { passive: true })
      window.addEventListener('resize', fit)
      g._fit = fit
    }).catch(() => setNoGL(true))
    return () => {
      alive = false; ro?.disconnect()
      if (g) { host?.removeEventListener('scroll', g._fit); window.removeEventListener('resize', g._fit); g.dispose() }
      globe.current = null
    }
  }, [events])

  useEffect(() => { globe.current?.hover(going ?? hover, !going && fromPin.current) }, [hover, going])
  const hoverOn = (id, pin) => { fromPin.current = pin; setHover(id) }
  const hoverOff = (id) => setHover((h) => (h === id ? null : h))

  const select = (id, pin) => {
    if (going) return
    if (pin && sel === id) return start(id)             // clicking the chosen pin again starts too
    setSel(id); globe.current?.select(id)
  }
  // Start exploring: zoom to the chosen site (its marker lit, the water swirling past), then open the dashboard
  const start = (id = sel) => {
    if (going || !id) return
    store.set('jd-mode', modeRef.current)
    setGoing(id)
    const enter = () => onEnter(id, modeRef.current)
    if (globe.current && !noGL) globe.current.focus(id, enter)
    else setTimeout(enter, 150)
  }
  const pickMode = (m) => { setMode(m); store.set('jd-mode', m) }
  const level = MODES.findIndex((m) => m.id === mode)

  return (
    <div ref={root} className={`landing ${ready || noGL ? 'ready' : ''} ${going ? 'leaving' : ''}`}>
      <canvas ref={canvas} className="lg-canvas" aria-hidden="true" />
      <div className="lg-veil" aria-hidden="true" />

      <section ref={pane} className="lg-globe" aria-label="Flood events on the globe">
        {noGL && <p className="lg-nogl">This browser can't draw the 3D globe. Choose a region on the right.</p>}
      </section>
      <div className="lg-pins" aria-hidden={noGL}>
        {!noGL && events.map((e) => (
          <button key={e.id} ref={(el) => { pinEls.current[e.id] = el }} className={`lg-pin ${hover === e.id || sel === e.id || going === e.id ? 'on' : ''} ${sel === e.id ? 'sel' : ''} ${going === e.id ? 'go' : ''}`}
            onPointerEnter={() => hoverOn(e.id, true)} onPointerLeave={() => hoverOff(e.id)}
            onFocus={() => hoverOn(e.id, false)} onBlur={() => hoverOff(e.id)} onClick={() => select(e.id, true)}
            aria-pressed={sel === e.id} aria-label={`${placeOf(e)}: ${e.title}`}>
            <span className="lg-dot" /><span className="lg-pulse" />
            <span className="lg-tag" role="presentation">
              <b>{placeOf(e)}{e.live && <em>Live</em>}</b>
              <small>{kindOf(e)} · {whenOf(e)}</small>
            </span>
          </button>
        ))}
      </div>

      <aside className="lg-side">
        <div className="lg-brand"><span className="lg-logo"><Logo /></span><span><b>JalDrishti</b><small>NISAR flood intelligence</small></span></div>
        <header className="lg-head">
          <h1>Explore flood intelligence</h1>
          <p>Choose your region. Choose your experience.</p>
        </header>

        <div className="lg-step"><span>1</span>Experience</div>
        <div className="lg-levels" role="radiogroup" aria-label="Experience level">
          {MODES.map((m, i) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={`lg-level ${mode === m.id ? 'on' : ''}`} onClick={() => pickMode(m.id)}>
              <span className="lg-bars" aria-hidden="true">{[0, 1, 2].map((k) => <i key={k} className={k <= i ? 'f' : ''} />)}</span>
              <span className="lg-lv-t"><b>{m.label}</b><small>{m.who}</small></span>
              <span className="lg-lv-d">{OPENS[m.id].join(' · ')}</span>
              <span className="lg-check" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            </button>
          ))}
        </div>

        <div className="lg-step"><span>2</span>Region <small>a pin on the globe, or here</small></div>
        <div className="lg-regions">
          {events.map((e) => (
            <button key={e.id} className={`lg-region ${hover === e.id ? 'on' : ''} ${sel === e.id ? 'sel' : ''}`} onClick={() => select(e.id, false)}
              aria-pressed={sel === e.id}
              onPointerEnter={() => hoverOn(e.id, false)} onPointerLeave={() => hoverOff(e.id)}
              onFocus={() => hoverOn(e.id, false)} onBlur={() => hoverOff(e.id)}>
              <span><b>{PLACE[e.id] ?? placeOf(e)}</b>{e.live && <em>Live</em>}</span>
              <small>{whenOf(e)}</small>
              <svg className="lg-arrow" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
        <button className="lg-start" disabled={!sel || !!going} onClick={() => start()}>
          <span>{sel ? <>Start exploring <small>{PLACE[sel] ?? events.find((e) => e.id === sel)?.title} · {MODES[level].label}</small></> : 'Choose a region to start'}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <p className="lg-credit">Earth imagery: NASA Blue Marble (July 2004) and Blue Marble clouds. Pins: the centres of JalDrishti's NISAR event areas.</p>
      </aside>
    </div>
  )
}
