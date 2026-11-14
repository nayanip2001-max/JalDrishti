// "How do we know?": a science panel over the right side of the dashboard. The map stays visible and
// interactive on the left. Overview of ten topics -> one topic in detail -> back, previous / next, close.
// Loaded on demand (React.lazy) so it costs the dashboard nothing until opened.
import { useEffect, useRef, useState } from 'react'
import { TOPICS } from './topics.jsx'
import { Thumb } from './Visuals.jsx'
import './science.css'

const SCI_JSON = `${import.meta.env.BASE_URL}science/assam/science.json`
let sciCache = null

const Arrow = ({ dir = 'left' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={dir === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const val = (v, ctx, sci) => (typeof v === 'function' ? v(ctx, sci) : v)

function Section({ title, open = false, children }) {
  return (
    <details className="sx-card" open={open}>
      <summary><h4>{title}</h4><span className="sx-chev" aria-hidden="true" /></summary>
      <div className="sx-card-b">{children}</div>
    </details>
  )
}

function Overview({ onTopic }) {
  return (
    <div className="sx-over">
      <p className="sx-intro">
        JalDrishti finds floods with radar from the NISAR satellite. Satellite observations show where water is; scientific models and rules
        decide which water is <b>new</b>, and how sure we can be. Pick any topic: each one shows the science first, explains it simply, and
        keeps the technical depth underneath.
      </p>
      <div className="sx-grid">
        {TOPICS.map((t) => (
          <button key={t.id} className="sx-tcard" onClick={() => onTopic(t.id)}>
            <span className="sx-thumb"><Thumb n={t.n} /></span>
            <span className="sx-tcard-t"><i>{String(t.n).padStart(2, '0')}</i><b>{t.title}</b><small>{t.short}</small></span>
          </button>
        ))}
      </div>
      <p className="sx-foot">Diagrams marked <span className="sx-badge ill">Illustration</span> explain a concept. Images marked <span className="sx-badge real">Real NISAR data</span> come from
        the actual pipeline (Upper Assam, track 40). <span className="sx-badge data">Real project figures</span> are read from this dashboard&apos;s own results.</p>
    </div>
  )
}

function Detail({ t, ctx, sci, events, onDeeper }) {
  if (!sci) return <div className="sx-loading">Loading…</div>      // several topics read the exported science figures
  const method = val(t.method, ctx, sci) ?? []
  const params = val(t.params, ctx, sci) ?? []
  return (
    <article className="sx-detail">
      <div className="sx-visual">{t.visual(ctx, sci, events)}</div>

      <section className="sx-simple">
        <h4>In simple words</h4>
        <p>{t.simple}</p>
      </section>

      <section className="sx-terms" aria-label="Key terms">
        <h4>Key terms</h4>
        <dl>{t.terms.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>
      </section>

      <section className="sx-steps">
        <h4>Step by step</h4>
        <ol>{t.steps.map((s, i) => <li key={i}><span>{i + 1}</span><p>{s}</p></li>)}</ol>
      </section>

      <div className="sx-depth">
        <div className="sx-depth-h"><span>Technical depth</span><small>for analysts and researchers</small></div>
        <Section title="How JalDrishti does it" open>
          <ul className="sx-list">{method.filter(Boolean).map((m, i) => <li key={i}>{m}</li>)}</ul>
          {t.extra && t.extra(ctx, sci)}
        </Section>
        {params.length > 0 && (
          <Section title="Equations and parameters">
            <table className="sx-params"><tbody>{params.map(([k, v], i) => <tr key={i}><th>{k}</th><td><code>{v}</code></td></tr>)}</tbody></table>
          </Section>
        )}
        <Section title="Data sources"><ul className="sx-list">{t.sources.map((s) => <li key={s}>{s}</li>)}</ul></Section>
        <Section title="References"><ul className="sx-list refs">{t.refs.map((s) => <li key={s}>{s}</li>)}</ul></Section>
        <Section title="Limitations and interpretation" open><ul className="sx-list warn">{t.limits.map((s) => <li key={s}>{s}</li>)}</ul></Section>
        {t.deeper && <button className="sx-deeper" onClick={() => onDeeper(t.deeper)}>{t.deeper.label}<Arrow dir="right" /></button>}
      </div>
    </article>
  )
}

export default function SciencePanel({ topic, onTopic, onClose, ctx, events, onDeeper }) {
  const [sci, setSci] = useState(sciCache)
  const [shown, setShown] = useState(false)
  const body = useRef(null), head = useRef(null)
  const t = TOPICS.find((x) => x.id === topic)
  const i = t ? TOPICS.indexOf(t) : -1

  useEffect(() => {
    if (sciCache) return
    fetch(SCI_JSON).then((r) => r.json()).then((j) => { sciCache = j; setSci(j) }).catch(() => setSci(null))
  }, [])
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r) }, [])
  // new topic: back to the top, focus the heading (keyboard and screen-reader users land on the new content)
  useEffect(() => { body.current?.scrollTo({ top: 0 }); head.current?.focus({ preventScroll: true }) }, [topic])
  // Esc: topic -> overview -> closed. Captured here so the dashboard's own Esc (drawer back) does not also fire.
  useEffect(() => {
    const k = (e) => {
      if (e.key !== 'Escape' || e.target.closest?.('select')) return
      e.stopPropagation()
      if (t) onTopic('index'); else onClose()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [t, onTopic, onClose])

  return (
    <aside className={`sx-panel ${shown ? 'in' : ''}`} role="dialog" aria-modal="false" aria-labelledby="sx-title">
      <header className="sx-head">
        {t
          ? <button className="sx-back" onClick={() => onTopic('index')}><Arrow />All topics</button>
          : <span className="sx-kicker">How do we know?</span>}
        <button className="sx-close" onClick={onClose} aria-label="Close the science panel" title="Close (Esc)">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="sx-body" ref={body}>
        <div className="sx-title" key={topic}>
          {t && <span className="sx-num">Topic {t.n} of {TOPICS.length}</span>}
          <h2 id="sx-title" ref={head} tabIndex={-1}>{t ? t.title : 'Explore the Science Behind the Flood'}</h2>
          {t && <p className="sx-short">{t.short}</p>}
        </div>
        <div className="sx-view" key={`v-${topic}`}>
          {t ? <Detail t={t} ctx={ctx} sci={sci} events={events} onDeeper={onDeeper} /> : <Overview onTopic={onTopic} />}
        </div>
        {t && (
          <nav className="sx-pn" aria-label="More topics">
            {i > 0 ? <button onClick={() => onTopic(TOPICS[i - 1].id)}><Arrow /><span><small>Previous</small>{TOPICS[i - 1].title}</span></button> : <span />}
            {i < TOPICS.length - 1 ? <button className="next" onClick={() => onTopic(TOPICS[i + 1].id)}><span><small>Next</small>{TOPICS[i + 1].title}</span><Arrow dir="right" /></button> : <button className="next" onClick={() => onTopic('index')}><span><small>Done</small>All topics</span><Arrow dir="right" /></button>}
          </nav>
        )}
      </div>
    </aside>
  )
}
