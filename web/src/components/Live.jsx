// Live Monitor: what NISAR saw most recently, how old it is, and how long each map took.
// Every time shown comes from NASA's catalogue or our own processing log (live.json); nothing is estimated
// except the "expected next passes", which are labelled as an orbit-repeat projection.
import { Card, Metric, Note, KV, Badge, LinkButton } from './ui.jsx'
import { atLeast } from '../lib/modes.js'
import { fmtDate, floodKm2, num, posts, trackColor } from '../lib/format.js'

const REPEAT_DAYS = 12           // NISAR's exact orbit repeat
const STALE_H = 72               // older than this, the map is flagged as possibly out of date
const STATUS = {
  'No new observation': { tone: 'idle', text: 'No new observation since the last check' },
  'New scene detected': { tone: 'busy', text: 'New NISAR scene detected' },
  'Data downloading': { tone: 'busy', text: 'Downloading NISAR data' },
  Processing: { tone: 'busy', text: 'Processing' },
  'Flood map generated': { tone: 'ok', text: 'New flood map generated' },
  'Processing failed': { tone: 'bad', text: 'Processing failed (previous map still shown)' },
}

const ms = (iso) => new Date(iso).getTime()
export const ageHours = (iso, now = Date.now()) => (now - ms(iso)) / 3.6e6
export const fmtAge = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(h < 240 ? 1 : 0)} days`)
const fmtH = (h) => (h == null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`)
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST' : '—')

// Passes mapped while the monitor was being set up were processed long after NASA published them:
// their NASA latency is real, but our detection delay is not representative.
const isBackfill = (p) => p.backfill || p.latency_h?.available_to_detected > 6

// Next passes on each track, projected from the last acquisition with the 12-day repeat.
function nextPasses(manifest, live) {
  const last = {}
  for (const s of posts(manifest)) last[s.track] = s.date > (last[s.track] ?? '') ? s.date : last[s.track]
  for (const p of live?.passes ?? []) last[p.track] = p.date > (last[p.track] ?? '') ? p.date : last[p.track]
  const today = new Date().toISOString().slice(0, 10)
  return Object.entries(last).map(([tr, d]) => {
    const t = new Date(d + 'T00:00:00Z')
    while (t.toISOString().slice(0, 10) <= today) t.setUTCDate(t.getUTCDate() + REPEAT_DAYS)
    return { track: +tr, date: t.toISOString().slice(0, 10) }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

export function LiveBanner({ manifest, live, scene, onLatest }) {
  if (!live?.latest_observation) return null
  const ps = posts(manifest)
  const newest = ps[ps.length - 1]
  const h = ageHours(newest.live?.acquired ?? newest.date + 'T12:00:00Z')
  const viewingOld = scene.id !== newest.id
  if (h < STALE_H && !viewingOld) return null
  return (
    <div className={`live-banner ${h >= STALE_H ? 'stale' : ''}`} role="status">
      {viewingOld
        ? <>Showing {fmtDate(scene.date)}, not the latest pass. <button onClick={onLatest}>Go to latest ({fmtDate(newest.date)})</button></>
        : <>Latest NISAR view is {fmtAge(h)} old. Conditions may have changed since.</>}
    </div>
  )
}

export function LiveView({ ctx }) {
  const { manifest: m, live, mode, setScene, open } = ctx
  if (!live) return <Note>Live monitoring is not enabled for this event.</Note>
  const simple = mode === 'beginner'
  const ps = posts(m)
  const newest = ps[ps.length - 1]
  const st = STATUS[live.status] ?? { tone: 'idle', text: live.status }
  const obsH = live.latest_observation && ageHours(live.latest_observation.acquired)
  const mapped = (live.passes ?? []).filter((p) => p.status === 'Flood map generated')
  const failed = (live.passes ?? []).filter((p) => p.status === 'Processing failed')
  const real = mapped.filter((p) => !isBackfill(p))
  const tracks = [...new Set(ps.map((s) => s.track))].sort((a, b) => a - b)
  const next = nextPasses(m, live)
  const urgent = mapped.filter((p) => p.latency_h?.acquired_to_first_product != null)
  const best = urgent.length ? Math.min(...urgent.map((p) => p.latency_h.acquired_to_first_product)) : null

  return (
    <div className="stack">
      <div className={`live-status ${st.tone}`}>
        <span className="pulse" />
        <div><b>{st.text}</b><small>Checked {fmtAge(ageHours(live.checked_at))} ago · automatic check every 3 hours</small></div>
      </div>

      <Card title={simple ? 'Most recent satellite view' : 'Latest NISAR observation'} tag={<Badge kind="observed">Observed</Badge>}>
        <div className="metrics">
          <Metric big value={fmtDate(newest.date)} label={`Track ${newest.track}${newest.obs?.direction ? ' · ' + newest.obs.direction : ''}`}
            onOpen={() => { setScene(newest); open('observation', { scene: newest }) }} />
          <Metric big value={obsH != null ? fmtAge(obsH) : '—'} label="Age of the latest pass" color={obsH > STALE_H ? 'var(--possible)' : 'var(--good)'} />
          <Metric value={num(floodKm2(newest))} unit="km²" label="Flood on that pass" color="var(--flood)" onOpen={() => { setScene(newest); open('flood') }} />
        </div>
        {obsH > STALE_H && <Note kind="warn">This map is {fmtAge(obsH)} old. NISAR has not passed over since, so floodwater may have spread or drained. Check the expected next passes below.</Note>}
        {newest.obs?.product_type === 'UR' && <Note>Made from NISAR's <b>Urgent Response</b> product, which is released hours after the pass instead of days. It is replaced by the science product when that appears.</Note>}
      </Card>

      <Card title={simple ? 'How fast do maps arrive?' : 'Measured latency'} tag={<Badge kind="observed">Measured</Badge>}>
        {best != null && (
          <div className="metrics">
            <Metric big value={fmtH(best)} label={simple ? 'Fastest: satellite pass to public data' : 'Best acquisition → first NASA product'} />
            {real.length > 0 && <Metric big value={fmtH(Math.min(...real.map((p) => p.latency_h.acquired_to_map)))} label="Best pass → JalDrishti map" />}
          </div>
        )}
        <table className="ltable">
          <thead><tr><th>Pass</th><th>Product</th><th title="Acquisition to the first public NASA product">First data</th>
            {!simple && <th title="Our processing time">Mapping</th>}<th title="Acquisition to map ready">Pass → map</th></tr></thead>
          <tbody>
            {mapped.slice().reverse().map((p) => (
              <tr key={p.granule}>
                <td><i className="dot" style={{ background: trackColor(tracks, p.track) }} />{fmtDate(p.date)} · T{p.track}</td>
                <td>{p.product === 'UR' ? 'Urgent' : 'Science'}</td>
                <td>{fmtH(p.latency_h?.acquired_to_first_product ?? p.latency_h?.acquired_to_available)}</td>
                {!simple && <td>{fmtH(p.latency_h?.processing)}</td>}
                <td>{isBackfill(p) ? <span className="muted" title="Mapped while the monitor was being set up">backfill</span> : fmtH(p.latency_h?.acquired_to_map)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>Times come from NASA's catalogue (when each product became public) and our own log. <b>Backfill</b> = passes mapped while the monitor was being set up, so only NASA's part of the delay is shown. For reference, Copernicus GFM reports a typical ~5 h delivery and Sentinel-1 imagery ~24 h; these are typical figures, not guarantees.</Note>
        {failed.length > 0 && <Note kind="warn">{failed.length} pass{failed.length > 1 ? 'es' : ''} failed to process ({failed.map((p) => `${fmtDate(p.date)} T${p.track}`).join(', ')}); the last good map stays on screen.</Note>}
      </Card>

      <Card title={simple ? 'When will the satellite look again?' : 'Expected next passes'} tag={<Badge kind="modelled">Projected</Badge>}>
        <KV rows={next.map((n) => [`Track ${n.track}`, `${fmtDate(n.date)} (in ${Math.max(0, Math.ceil((ms(n.date + 'T00:00:00Z') - Date.now()) / 864e5))} days)`])} />
        <Note>Projected from NISAR's exact 12-day orbit repeat. Whether a product is made for a pass depends on NISAR's observation plan.</Note>
      </Card>

      {atLeast(mode, 'intermediate') && (
        <Card title="How the monitor works">
          <ol className="steps">
            <li>Every 3 hours a GitHub Actions job asks NASA's catalogue (ASF) for new NISAR passes over the area.</li>
            <li>A new pass is streamed (only this area, not the 7 GB file) and mapped with the same hybrid model as the validated maps, against the dry-season reference passes of the same track.</li>
            <li>Each pass is mapped once; its NASA timestamps and our processing times are logged.</li>
            <li>The site is rebuilt on every check, so the age shown here is always current.</li>
          </ol>
          {atLeast(mode, 'advanced') && live.latest_observation && <KV rows={[['Latest granule', <code key="g">{live.latest_observation.granule}</code>],
            ['Last checked', fmtTime(live.checked_at)], ['Passes mapped', mapped.length]]} />}
          <LinkButton onClick={() => open('help')}>Questions about the data?</LinkButton>
        </Card>
      )}
    </div>
  )
}
