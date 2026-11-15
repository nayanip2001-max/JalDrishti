// Recovery (how long land stayed under water) and flood-scar data, made by scripts/export_recovery.py.
// recovery.json: looks (every pass, all tracks, in time order), per-cover curves, totals, scars.
// lookup.png (100 m): R = first wet look (+128 if the water came back), G = last wet look, B = first dry look after (255 = none).
import maplibregl from 'maplibre-gl'

const cache = new Map()
export function loadRecovery(dir) {
  if (!cache.has(dir)) cache.set(dir, fetch(dir + 'recovery.json').then((r) => (r.ok ? r.json() : null)).catch(() => null))
  return cache.get(dir)
}

const imgs = new Map()
function pixels(url) {
  if (!imgs.has(url)) {
    imgs.set(url, new Promise((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => {
        const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0)
        res({ w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data })
      }
      i.onerror = rej; i.src = url
    }))
  }
  return imgs.get(url)
}

const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5)

// What happened at one spot over the whole season, or null outside the data.
export async function recoveryAt(dir, rec, lngLat) {
  if (!rec) return null
  const lookup = rec.lookupUrl ?? dir + 'lookup.png'
  const img = await pixels(lookup).catch(() => null)
  if (!img) return null
  const tl = maplibregl.MercatorCoordinate.fromLngLat(rec.corners[0]), br = maplibregl.MercatorCoordinate.fromLngLat(rec.corners[2])
  const p = maplibregl.MercatorCoordinate.fromLngLat(lngLat)
  const fx = (p.x - tl.x) / (br.x - tl.x), fy = (p.y - tl.y) / (br.y - tl.y)
  if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null
  const i = (Math.floor(fy * img.h) * img.w + Math.floor(fx * img.w)) * 4
  const r = img.d[i], g = img.d[i + 1], b = img.d[i + 2]
  if (r === 255) return { flooded: false }
  const first = r & 127, again = r >= 128 && r !== 255, last = g, dry = b === 255 ? null : b
  const L = rec.looks
  // the last dry look before the first wet one (for the upper bound): the nearest earlier look is the best we can say here
  const prevDry = first > 0 ? first - 1 : null
  const dmin = dayDiff(L[first].date, L[last].date)
  const dmax = dry != null && prevDry != null ? dayDiff(L[prevDry].date, L[dry].date) : null
  return { flooded: true, first: L[first].date, last: L[last].date, dryAgain: dry != null ? L[dry].date : null, again, dmin, dmax, lastLook: L[L.length - 1].date }
}

export const weeks = (d) => Math.max(0, Math.round(d / 7))
