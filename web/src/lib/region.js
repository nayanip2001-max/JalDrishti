// "Map a region": everything the dashboard can do in the browser without a server.
//  * find a place (OpenStreetMap Nominatim) and turn it into a box
//  * ask NASA's ASF archive which NISAR passes cover the box, using exactly the rules of scripts/map_region.py
//    (a pass within ±1 day of the date, best coverage wins, ≥ 2 earlier passes on the same track, ≥ 6 days earlier)
//  * read the result files a Colab/CLI run produced (zip, GeoJSON, summary.json, quicklook PNG) to show them on the map
// The flood mapping itself runs in Python (Colab or the CLI): it needs a NASA login and minutes of compute.
import { unzipSync, strFromU8 } from 'fflate'

export const MIN_KM2 = 25
export const MAX_KM2 = 12000                 // same limits as map_region.py check_bbox
export const BEFORE_DAYS = 75
export const COLAB_URL = 'https://colab.research.google.com/github/nayanip2001-max/JalDrishti/blob/main/notebooks/map_any_region.ipynb'

const r5 = (v) => Math.round(v * 1e4) / 1e4
export const boxKm2 = ([w, s, e, n]) => (e - w) * 111.32 * Math.cos(((s + n) / 2) * Math.PI / 180) * (n - s) * 110.57

export function boxProblem(b) {
  if (!b) return 'Choose an area first.'
  const [w, s, e, n] = b
  if (!(w < e && s < n && w >= -180 && e <= 180 && s >= -80 && n <= 80)) return 'The box is not valid.'
  const km2 = boxKm2(b)
  if (km2 < MIN_KM2) return `The box is ${Math.round(km2)} km²; make it at least ${MIN_KM2} km².`
  if (km2 > MAX_KM2) return `The box is ${Math.round(km2).toLocaleString()} km²; keep it under ${MAX_KM2.toLocaleString()} km² (zoom in or split the area).`
  return null
}

// A box around a point, `half` degrees each way: used when a place's own extent is too small or too big.
export const boxAround = ([lon, lat], half = 0.2) => [r5(lon - half), r5(lat - half), r5(lon + half), r5(lat + half)]

export async function geocode(q) {
  const u = new URL('https://nominatim.openstreetmap.org/search')
  u.search = new URLSearchParams({ format: 'jsonv2', q, limit: '6' })
  const r = await fetch(u, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Place search failed (${r.status})`)
  return (await r.json()).map((p) => {
    const [s, n, w, e] = p.boundingbox.map(Number)
    let box = [r5(w), r5(s), r5(e), r5(n)]
    if (boxProblem(box)) box = boxAround([+p.lon, +p.lat])
    return { name: p.display_name, short: p.name || p.display_name.split(',')[0], center: [+p.lon, +p.lat], box }
  })
}

// ---- NISAR coverage -------------------------------------------------------------------------------------
const day = (iso) => iso.slice(0, 10)
const addDays = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10) }
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 864e5)

// Fraction of the box covered by a footprint polygon (Sutherland–Hodgman clip, planar on lon/lat: fine at these sizes).
function clip(poly, [w, s, e, n]) {
  const edges = [[(p) => p[0] >= w, (a, b) => [w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n]]]
  let out = poly
  for (const [inside, cut] of edges) {
    const inp = out; out = []
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length]
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b) } else if (inside(a)) out.push(cut(a, b))
    }
    if (!out.length) break
  }
  return out
}
const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0)) / 2
function coverage(geom, b) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []
  const tot = (b[2] - b[0]) * (b[3] - b[1])
  return Math.min(1, polys.reduce((s, rings) => s + area(clip(rings[0], b)), 0) / tot)
}

export async function nisarPasses(box, date) {
  const u = new URL('https://api.daac.asf.alaska.edu/services/search/param')
  u.search = new URLSearchParams({ dataset: 'NISAR', processingLevel: 'GCOV', bbox: box.join(','), output: 'geojson', maxResults: '1000',
    start: addDays(date, -BEFORE_DAYS) + 'T00:00:00Z', end: addDays(date, 14) + 'T23:59:59Z' })
  const r = await fetch(u)
  if (!r.ok) throw new Error(`NASA ASF search failed (${r.status})`)
  const feats = (await r.json()).features ?? []
  // One record per (track, date): the science product (PR) is preferred over Urgent Response (UR), as in the pipeline.
  const by = new Map()
  for (const f of feats) {
    const p = f.properties, kind = p.sceneName.split('_')[2]
    if (kind !== 'PR' && kind !== 'UR') continue
    const k = `${p.pathNumber}|${day(p.startTime)}`
    const rec = { track: +p.pathNumber, date: day(p.startTime), time: p.startTime, dir: p.flightDirection === 'ASCENDING' ? 'Ascending' : 'Descending',
      product: kind, cover: coverage(f.geometry, box), granule: p.sceneName }
    const cur = by.get(k)
    if (!cur || (cur.product === 'UR' && kind === 'PR')) by.set(k, { ...rec, cover: Math.max(rec.cover, cur?.cover ?? 0) })
    else cur.cover = Math.max(cur.cover, rec.cover)
  }
  const passes = [...by.values()].sort((a, b) => a.date.localeCompare(b.date) || a.track - b.track)
  const near = passes.filter((p) => Math.abs(diffDays(p.date, date)) <= 1).map((p) => ({
    ...p, refs: passes.filter((q) => q.track === p.track && diffDays(p.date, q.date) >= 6).map((q) => q.date),
  })).sort((a, b) => b.cover - a.cover)
  const best = near[0]
  let verdict
  if (!best) verdict = { ok: false, text: `NISAR did not pass over this box within a day of ${date}.` }
  else if (best.refs.length < 2) verdict = { ok: false, text: `Track ${best.track} has only ${best.refs.length} earlier pass(es) in the ${BEFORE_DAYS} days before; JalDrishti needs 2 "before" images to see change.` }
  else if (best.cover < 0.3) verdict = { ok: true, warn: true, text: `Ready, but the pass covers only ${Math.round(best.cover * 100)}% of the box. Consider moving the box.` }
  else verdict = { ok: true, text: `Ready: track ${best.track} covers ${Math.round(best.cover * 100)}% of the box, with ${best.refs.length} earlier passes to compare against.` }
  return { passes, near, best, verdict, window: [addDays(date, -BEFORE_DAYS), addDays(date, 14)] }
}

// The one line pasted into the Colab notebook's form (name | W S E N | date).
export const slug = (s) => (s || 'my_region').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'my_region'
export const settingsLine = (name, box, date) => `${slug(name)} | ${box.map((v) => v.toFixed(4)).join(' ')} | ${date}`
export const cliCommand = (name, box, date) => `python scripts/map_region.py --name ${slug(name)} --bbox ${box.map((v) => v.toFixed(4)).join(' ')} --date ${date}`

// ---- result files -----------------------------------------------------------------------------------------
function bboxOf(fc) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c) => { if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]) } else c.forEach(walk) }
  for (const f of fc.features ?? []) if (f.geometry) walk(f.geometry.coordinates)
  return Number.isFinite(b[0]) ? b : null
}

// Accepts the zip from the notebook, or the loose files. Returns { geojson, summary, image, bbox, files, problems }.
export async function readResult(fileList) {
  const entries = []
  for (const f of fileList) {
    const buf = new Uint8Array(await f.arrayBuffer())
    if (/\.zip$/i.test(f.name)) {
      try { for (const [n, d] of Object.entries(unzipSync(buf))) if (!n.endsWith('/')) entries.push({ name: n.split('/').pop(), data: d }) }
      catch { throw new Error(`${f.name} is not a readable zip file.`) }
    } else entries.push({ name: f.name, data: buf })
  }
  const out = { files: entries.map((e) => e.name), problems: [] }
  for (const e of entries) {
    if (/\.geojson$/i.test(e.name) || (/\.json$/i.test(e.name) && !/summary/i.test(e.name))) {
      try {
        const g = JSON.parse(strFromU8(e.data))
        if (g.type !== 'FeatureCollection') throw new Error()
        out.geojson = g
      } catch { out.problems.push(`${e.name}: not a GeoJSON FeatureCollection`) }
    } else if (/summary.*\.json$/i.test(e.name)) {
      try { out.summary = JSON.parse(strFromU8(e.data)) } catch { out.problems.push(`${e.name}: not valid JSON`) }
    } else if (/\.(png|jpe?g|webp)$/i.test(e.name)) {
      out.image = URL.createObjectURL(new Blob([e.data], { type: /png$/i.test(e.name) ? 'image/png' : /webp$/i.test(e.name) ? 'image/webp' : 'image/jpeg' }))
    } else if (/\.tiff?$/i.test(e.name)) {
      out.tif = e.name          // kept for GIS use; the dashboard draws the GeoJSON of the same map
    }
  }
  if (!out.geojson && !out.summary) throw new Error('No JalDrishti result found. Drop the zip from the notebook, or the flood_<date>.geojson and summary.json files.')
  if (out.geojson) {
    const c = out.geojson.features?.[0]?.geometry?.coordinates?.flat(3)
    if (c && (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90)) throw new Error('The GeoJSON is not in longitude/latitude (EPSG:4326).')
    out.bbox = out.summary?.bbox ?? bboxOf(out.geojson)
  } else out.bbox = out.summary?.bbox ?? null
  return out
}
