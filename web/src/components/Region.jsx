// "Map a Region": pick any area and date, check NISAR coverage live from NASA, make the map in a free
// Colab notebook (or the CLI), then drop the result back here to see it on the map.
import { useRef, useState } from 'react'
import { Card, Badge, Note, Metric, Icon, KV } from './ui.jsx'
import { atLeast } from '../lib/modes.js'
import { fmtDate, num } from '../lib/format.js'
import { geocode, boxKm2, boxProblem, nisarPasses, settingsLine, cliCommand, readResult, slug, COLAB_URL, BEFORE_DAYS } from '../lib/region.js'

const today = () => new Date().toISOString().slice(0, 10)
const fmtBox = (b) => b.map((v) => v.toFixed(3)).join(', ')

function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  const go = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600) } catch { /* clipboard blocked: text is selectable */ }
  }
  return <button className="btn-ghost small" onClick={go}>{done ? 'Copied ✓' : label}</button>
}

function AreaStep({ region, upd, ctx }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const search = async (e) => {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true); setErr(null)
    try { setHits(await geocode(q.trim())) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const choose = (h) => {
    upd({ box: h.box, name: h.short, check: null, drawing: false })
    setHits(null)
    ctx.flyTo({ bounds: [[h.box[0], h.box[1]], [h.box[2], h.box[3]]] })
  }
  const useView = () => {
    const b = window.__maps?.main?.getBounds()
    if (!b) return
    // A little inside the visible map, so the box is not hidden under the panels.
    const w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth(), dx = (e - w) * 0.15, dy = (n - s) * 0.15
    upd({ box: [w + dx, s + dy, e - dx, n - dy].map((v) => Math.round(v * 1e4) / 1e4), check: null, drawing: false })
  }
  const problem = region.box && boxProblem(region.box)
  return (
    <Card title="1 · Choose an area">
      <form className="rg-search" onSubmit={search}>
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any place: town, district, river…" aria-label="Search a place" />
        <button className="btn-ghost small" disabled={busy}>{busy ? '…' : 'Search'}</button>
      </form>
      {err && <Note kind="warn">{err}</Note>}
      {hits && (
        <ul className="rg-hits">
          {hits.length === 0 && <li className="muted small">No place found.</li>}
          {hits.map((h) => (
            <li key={h.name}><button onClick={() => choose(h)}><b>{h.short}</b><span>{h.name}</span></button></li>
          ))}
        </ul>
      )}
      <div className="rg-row">
        <button className={`btn-ghost small ${region.drawing ? 'model-on' : ''}`} onClick={() => upd({ drawing: !region.drawing })}>
          {region.drawing ? 'Click two corners on the map…' : 'Draw a box on the map'}
        </button>
        <button className="btn-ghost small" onClick={useView}>Use the current map view</button>
      </div>
      {region.box && (
        <div className="rg-box">
          <span>{region.name ? <b>{region.name} · </b> : null}{num(Math.round(boxKm2(region.box)))} km²</span>
          <code>W S E N: {fmtBox(region.box)}</code>
          {problem && <Note kind="warn">{problem}</Note>}
        </div>
      )}
      <p className="muted small">Place search by OpenStreetMap. Your box stays in this browser.</p>
    </Card>
  )
}

function CheckStep({ region, upd }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const date = region.date ?? today()
  const ok = region.box && !boxProblem(region.box)
  const run = async (d = date) => {
    setBusy(true); setErr(null)
    try { upd({ check: await nisarPasses(region.box, d), date: d }) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const c = region.check
  const dates = c ? [...new Set(c.passes.map((p) => p.date))] : []
  return (
    <Card title="2 · Pick a date and check NISAR" tag={c && <Badge kind={c.verdict.ok ? 'observed' : 'exposed'}>{c.verdict.ok ? 'Ready' : 'Not yet'}</Badge>}>
      <div className="rg-row">
        <input type="date" value={date} max={today()} onChange={(e) => upd({ date: e.target.value, check: null })} aria-label="Flood date" />
        <button className="btn-ghost small model-on" disabled={!ok || busy} onClick={() => run()}>{busy ? 'Asking NASA…' : 'Check NISAR passes'}</button>
      </div>
      {err && <Note kind="warn">{err}</Note>}
      {c && (
        <>
          <Note kind={c.verdict.ok ? (c.verdict.warn ? 'warn' : 'info') : 'warn'}>{c.verdict.text}</Note>
          {c.near.length > 0 && (
            <table className="ltable">
              <thead><tr><th>Pass</th><th>Product</th><th>Covers box</th><th>Earlier passes</th></tr></thead>
              <tbody>{c.near.map((p) => (
                <tr key={p.track + p.date}><td>{fmtDate(p.date)} · T{p.track} {p.dir.slice(0, 4)}.</td><td>{p.product === 'UR' ? 'Urgent' : 'Science'}</td>
                  <td>{Math.round(p.cover * 100)}%</td><td>{p.refs.length}</td></tr>
              ))}</tbody>
            </table>
          )}
          {dates.length > 0
            ? <div className="rg-dates"><span className="muted small">NISAR passed over this box on ({fmtDate(c.window[0])} – {fmtDate(c.window[1])}):</span>
              {dates.map((d) => <button key={d} className={`chip ${d === date ? 'on' : ''}`} onClick={() => run(d)}>{fmtDate(d)}</button>)}</div>
            : <p className="muted small">No NISAR GCOV passes over this box from {fmtDate(c.window[0])} to {fmtDate(c.window[1])}.</p>}
        </>
      )}
      <p className="muted small">Asks NASA’s ASF archive directly, with the same rules the mapping script uses: a pass within a day of your date, plus at least two earlier passes on the same orbit track (up to {BEFORE_DAYS} days before) to compare against.</p>
    </Card>
  )
}

function MakeStep({ region, mode }) {
  const ready = region.check?.verdict.ok && region.box
  const date = region.check?.best?.date ?? region.date ?? today()
  const line = region.box ? settingsLine(region.name || 'my_region', region.box, date) : null
  return (
    <Card title="3 · Make the flood map" tag={<Badge kind="observed">Free · ~5 min</Badge>}>
      <ol className="steps">
        <li>Open the notebook: <a className="rg-colab" href={COLAB_URL} target="_blank" rel="noreferrer"><Icon name="external" size={14} />Open in Google Colab</a></li>
        <li>Paste this line into the <b>Region and date</b> box{line ? '' : ' (choose an area first)'}:
          {line && <div className="rg-code"><code>{line}</code><Copy text={line} /></div>}</li>
        <li><b>Runtime → Run all</b>, then log in with a free <a href="https://urs.earthdata.nasa.gov/users/new" target="_blank" rel="noreferrer">NASA Earthdata</a> account when asked.</li>
        <li>The notebook downloads <code>jaldrishti_{slug(region.name)}.zip</code>. Drop it in step 4.</li>
      </ol>
      {!ready && region.check && <Note kind="warn">The NISAR check did not pass for this box and date, so the notebook would stop with the same message. Pick one of the pass dates above.</Note>}
      <p className="muted small">Have your own radar images instead (HH + HV GeoTIFFs: one after, two or more before)? Use section 3B of the same notebook; the files are checked before use.</p>
      {atLeast(mode, 'advanced') && line && <div className="rg-code"><code>{cliCommand(region.name, region.box, date)}</code><Copy text={cliCommand(region.name, region.box, date)} /></div>}
    </Card>
  )
}

function ResultStep({ region, upd, ctx }) {
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState(null)
  const input = useRef(null)
  const load = async (files) => {
    setErr(null)
    try {
      const r = await readResult(files)
      upd({ result: r, drawing: false })
      if (r.bbox) ctx.flyTo({ bounds: [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]] })
    } catch (x) { setErr(x.message) }
  }
  const example = async () => {
    const base = `${import.meta.env.BASE_URL}data/examples/region/`
    const names = ['flood.geojson', 'summary.json', 'quicklook.webp']
    const files = await Promise.all(names.map(async (n) => new File([await (await fetch(base + n)).blob()], n)))
    load(files)
  }
  const r = region.result
  const s = r?.summary
  const a = s?.areas_km2
  return (
    <Card title="4 · See it here" tag={r && <Badge kind="observed">Observed · not validated here</Badge>}>
      <div className={`rg-drop ${drag ? 'on' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); load([...e.dataTransfer.files]) }} onClick={() => input.current?.click()}
        role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
        <b>Drop the result zip here</b>
        <span>or the flood_&lt;date&gt;.geojson and summary.json files · read in your browser, not uploaded</span>
        <input ref={input} type="file" multiple accept=".zip,.geojson,.json,.png,.jpg,.webp,.tif" hidden onChange={(e) => load([...e.target.files])} />
      </div>
      {err && <Note kind="warn">{err}</Note>}
      {!r && <button className="linkbtn" onClick={example}>Load an example result<Icon name="chevron" size={14} /></button>}
      {r && (
        <>
          {a && (
            <div className="metrics">
              <Metric value={num(a['flood (open water)'] + (a['flooded vegetation'] ?? 0))} unit="km²" label="Confident flood" color="#22d3ee" />
              <Metric value={num(a['possible flood (open water)'] + (a['possible flooded vegetation'] ?? 0))} unit="km²" label="Possible flood" color="#f59e0b" />
            </div>
          )}
          {s && <KV rows={[
            ['Region', s.region], ['Flood pass', `${fmtDate(s.date)}${s.track ? ` · track ${s.track}` : ' · uploaded images'}`],
            ['Compared with', (s.reference_dates ?? []).map((d) => fmtDate(d)).join(', ')], ['Source', s.source],
            s.exposure?.population && ['People inside the flood', num(s.exposure.population)],
          ]} />}
          {r.image && <img className="rg-quick" src={r.image} alt="Quicklook: NISAR HH with the flood map on top" />}
          <Note kind="warn">{s?.caveat ?? 'Not validated for this region.'} The map shows confident flood only; the GeoTIFF in the zip also has possible flood and probability.</Note>
          {r.problems.length > 0 && <Note kind="warn">{r.problems.join('; ')}</Note>}
          <div className="rg-row">
            {r.bbox && <button className="btn-ghost small" onClick={() => ctx.flyTo({ bounds: [[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]] })}>Zoom to result</button>}
            <button className="btn-ghost small" onClick={() => upd({ result: null })}>Clear</button>
          </div>
        </>
      )}
    </Card>
  )
}

export function RegionView({ ctx }) {
  const { region, setRegion, mode } = ctx
  const upd = (p) => setRegion((r) => ({ ...r, ...p }))
  return (
    <>
      <p className="muted small">{mode === 'beginner'
        ? 'Get a flood map for any place on Earth that NISAR has imaged: choose the place and date, check that the satellite passed, then make the map in a free online notebook.'
        : 'Map any area with the same JalDrishti pipeline. The dashboard checks NISAR coverage live from NASA; the mapping itself needs a NASA login and a few minutes of computing, so it runs in a free Colab notebook (or the command line). The result loads back here.'}</p>
      <AreaStep region={region} upd={upd} ctx={ctx} />
      <CheckStep region={region} upd={upd} />
      <MakeStep region={region} mode={mode} />
      <ResultStep region={region} upd={upd} ctx={ctx} />
    </>
  )
}
