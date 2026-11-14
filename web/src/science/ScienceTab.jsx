// Intermediate "How We Know" tab: the ten visual explainers (each opens the wide science panel) followed by the
// open-data sources (formerly "Data & Sources"); validation now lives in Topic 8 with every event's real figures.
// Advanced: SciBanner puts a visual-explainer link at the top of the matching technical tab.
import { TOPICS } from './topics.jsx'
import { Thumb } from './Visuals.jsx'
import { DataView } from '../components/Science.jsx'
import './science.css'

export default function ScienceTab({ ctx }) {
  return (
    <div className="stack">
      <p className="lead">Ten visual explainers: how NISAR sees water, how this map is made, how accurate it is, and where it can be wrong.</p>
      <div className="sx-tlist">
        {TOPICS.map((t) => (
          <button key={t.id} className="sx-trow" onClick={() => ctx.openScience?.(t.id)}>
            <span className="sx-tthumb"><Thumb n={t.n} /></span>
            <span className="sx-trow-t"><b><i>{String(t.n).padStart(2, '0')}</i>{t.title}</b><small>{t.short}</small></span>
          </button>
        ))}
      </div>
      <h3 className="sx-sub">Data sources</h3>
      <DataView ctx={ctx} />
    </div>
  )
}

export function SciBanner({ topic, ctx }) {
  const t = TOPICS.find((x) => x.id === topic)
  if (!t || !ctx.openScience) return null
  return (
    <button className="sx-banner" onClick={() => ctx.openScience(topic)}>
      <span className="sx-tthumb"><Thumb n={t.n} /></span>
      <span className="sx-trow-t"><small>Visual explainer · Topic {t.n}</small><b>{t.title}</b></span>
      <span className="sx-banner-go" aria-hidden="true">→</span>
    </button>
  )
}
