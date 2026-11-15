import maplibregl from 'maplibre-gl'

// Lookup PNGs store values in RGB (alpha fixed at 255 so canvas readback is exact).
const cache = new Map()

function loadPixels(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        resolve({ w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data })
      }
      img.onerror = reject
      img.src = url
    }))
  }
  return cache.get(url)
}

// Fractional position of a lng/lat inside the image, in Web Mercator (images are warped to EPSG:3857).
function imageXY(lngLat, corners) {
  const tl = maplibregl.MercatorCoordinate.fromLngLat(corners[0])
  const br = maplibregl.MercatorCoordinate.fromLngLat(corners[2])
  const p = maplibregl.MercatorCoordinate.fromLngLat(lngLat)
  return [(p.x - tl.x) / (br.x - tl.x), (p.y - tl.y) / (br.y - tl.y)]
}

const dec = (v, [lo, hi]) => lo + (v / 255) * (hi - lo)

// The class exactly as the map draws it at one spot: read ONE pixel of the (lossless) class image, so the verdict
// always matches the colour under the cursor. (The 100 m lookups below average 25 pixels and can straddle an edge.)
const imgCache = new Map()
const loadImage = (url) => {
  if (!imgCache.has(url)) imgCache.set(url, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url }))
  return imgCache.get(url)
}
async function mapClass(url, fx, fy, classes) {
  const img = await loadImage(url)
  const c = document.createElement('canvas'); c.width = 1; c.height = 1
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false
  g.drawImage(img, Math.floor(fx * img.width), Math.floor(fy * img.height), 1, 1, 0, 0, 1, 1)
  const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data
  if (a < 20) return 1                                                  // transparent = dry (no data is caught earlier)
  let best = null, bd = Infinity
  for (const [k, v] of Object.entries(classes)) {
    if (+k < 2) continue
    const h = v.color, d = Math.abs(parseInt(h.slice(1, 3), 16) - r) + Math.abs(parseInt(h.slice(3, 5), 16) - gr) + Math.abs(parseInt(h.slice(5, 7), 16) - b)
    if (d < bd) { bd = d; best = +k }
  }
  return bd < 60 ? best : null
}

// Everything the pixel panel shows, read from the event's lookup images. Missing layers stay null.
export async function readPixel(base, scene, manifest, lngLat) {
  const [fx, fy] = imageXY(lngLat, manifest.aoi.corners)
  if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null
  const urls = [...scene.ev, scene.ev3, ...(manifest.anc?.files ?? [])]
  const imgs = await Promise.all(urls.map((u) => (u ? loadPixels(base + u).catch(() => null) : null)))
  const px = (img) => {
    if (!img) return null
    const i = (Math.floor(fy * img.h) * img.w + Math.floor(fx * img.w)) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }
  const [e1, e2, e3, a1, a2] = imgs.map(px)
  if (!e1 || (e1[0] === 0 && e1[1] === 0 && e1[2] === 0 && e2[0] === 0 && e2[1] === 0)) return null
  const s = manifest.evidence_scale, k = manifest.anc?.scale
  const out = {
    lNow: dec(e1[0], s.l_now), lBefore: dec(e1[1], s.l_before), lTerrain: dec(e1[2], s.l_terrain),
    pOpen: e2[0] / 255, pVeg: e2[1] / 255, dHH: dec(e2[2], s.d_hh),
    hh: null, hv: null, cls: null, hand: null, slope: null, jrc: null, wc: null, district: null, density: null,
  }
  out.pFlood = 1 - (1 - out.pOpen) * (1 - out.pVeg)
  out.mapCls = scene.cls ? await mapClass(base + scene.cls, fx, fy, manifest.classes).catch(() => null) : null
  if (e3) {
    out.hh = e3[0] ? dec(e3[0], k.hh_db) : null
    out.hv = e3[1] ? dec(e3[1], k.hv_db) : null
    out.cls = Math.round(e3[2] / (manifest.class_scale ?? 32))
  }
  if (a1 && k) { out.hand = dec(a1[0], k.hand_m); out.slope = dec(a1[1], k.slope_deg); out.jrc = dec(a1[2], k.jrc_pct) }
  if (a2) {
    out.wc = a2[0] || null
    out.district = manifest.anc.districts.find((d) => d.id === a2[1])?.name ?? null
    out.density = k ? 10 ** dec(a2[2], k.pop_log10_per_km2) - 1 : null
  }
  return out
}
