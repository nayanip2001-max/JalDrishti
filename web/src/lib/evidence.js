import maplibregl from 'maplibre-gl'

// Evidence PNGs store log-odds/probabilities in RGB (alpha fixed at 255 so readback is exact).
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

export async function readEvidence(base, scene, manifest, lngLat) {
  const [fx, fy] = imageXY(lngLat, manifest.aoi.corners)
  if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null
  const [a, b] = await Promise.all(scene.ev.map((u) => loadPixels(base + u)))
  const px = (img) => {
    const i = (Math.floor(fy * img.h) * img.w + Math.floor(fx * img.w)) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }
  const s = manifest.evidence_scale
  const [r1, g1, b1] = px(a)
  const [r2, g2, b2] = px(b)
  if (r1 === 0 && g1 === 0 && b1 === 0 && r2 === 0 && g2 === 0) return null
  return {
    lNow: dec(r1, s.l_now),
    lBefore: dec(g1, s.l_before),
    lTerrain: dec(b1, s.l_terrain),
    pOpen: r2 / 255,
    pVeg: g2 / 255,
    dHH: dec(b2, s.d_hh),
  }
}
