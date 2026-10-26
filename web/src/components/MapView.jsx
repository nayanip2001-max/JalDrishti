import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const BASEMAPS = {
  dark: {
    tiles: [`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
    labels: [`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
    attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors', maxzoom: 16,
  },
  satellite: {
    tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
    labels: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxzoom: 19,
  },
}

// Room the floating UI takes up. On phones the panel sits at the bottom instead of the left.
const fitPadding = () => (window.innerWidth < 760
  ? { top: 70, bottom: Math.round(window.innerHeight * 0.45), left: 16, right: 16 }
  : { top: 90, bottom: 150, left: 380, right: 40 })

// Overlays are inserted below the 'labels' layer so place names stay readable on top.
function style(basemap) {
  const b = BASEMAPS[basemap]
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: b.tiles, tileSize: 256, attribution: b.attribution, maxzoom: b.maxzoom },
      labels: { type: 'raster', tiles: b.labels, tileSize: 256, maxzoom: b.maxzoom },
    },
    layers: [
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-saturation': basemap === 'satellite' ? -0.35 : 0 } },
      { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
    ],
  }
}

// Add or update one georeferenced image overlay. Call only after the style has loaded.
function setImage(map, id, url, corners, opacity, visible) {
  const src = map.getSource(id)
  if (!url) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    return
  }
  if (!src) {
    map.addSource(id, { type: 'image', url, coordinates: corners })
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, 'raster-resampling': id === 'sar' ? 'linear' : 'nearest' } }, 'labels')
  } else if (src.url !== url) {
    src.updateImage({ url, coordinates: corners })
    src.url = url
  }
  map.setPaintProperty(id, 'raster-opacity', opacity)
  map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

export default function MapView({ base, manifest, scene, layers, opacity, basemap, compare, onPick, pick, camera }) {
  const mainEl = useRef(null)
  const beforeEl = useRef(null)
  const maps = useRef({})
  const marker = useRef(null)
  const [ready, setReady] = useState(0)
  const [split, setSplit] = useState(0.5)
  const corners = manifest.aoi.corners

  useEffect(() => {
    const opts = { style: style(basemap), bounds: manifest.aoi.bounds, fitBoundsOptions: { padding: fitPadding() }, attributionControl: { compact: true } }
    const main = new maplibregl.Map({ container: mainEl.current, ...opts })
    const before = new maplibregl.Map({ container: beforeEl.current, ...opts, interactive: false, attributionControl: false })
    main.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    main.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    const sync = () => before.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: main.getPitch() })
    main.on('move', sync)
    main.on('click', (e) => onPick([e.lngLat.lng, e.lngLat.lat]))
    main.getCanvas().style.cursor = 'crosshair'
    let loaded = 0
    const done = () => { if (++loaded === 2) setReady((r) => r + 1) }
    main.on('load', done); before.on('load', done)
    maps.current = { main, before }
    window.__maps = maps.current  // lets the screenshot script wait for real render (harmless in production)
    return () => { main.remove(); before.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A style swap drops custom sources; bumping `ready` after both styles reload re-adds the overlays.
  const firstStyle = useRef(true)
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return }
    const { main, before } = maps.current
    let pending = 2
    const after = () => { if (--pending === 0) setReady((r) => r + 1) }
    main.once('style.load', after); before.once('style.load', after)
    main.setStyle(style(basemap)); before.setStyle(style(basemap))
  }, [basemap])

  useEffect(() => {
    const { main, before } = maps.current
    if (!ready || !scene) return
    setImage(main, 'sar', base + scene.sar, corners, opacity.sar, layers.sar)
    setImage(main, 'prob', base + scene.prob, corners, opacity.overlay, layers.prob)
    setImage(main, 'cls', base + scene.cls, corners, opacity.overlay, layers.flood)
    const cmp = manifest.sensor_compare
    setImage(main, 'cmp', cmp && base + cmp.image, corners, opacity.overlay, !!(cmp && layers.compare && scene.date === cmp.date))
    const ref = manifest.refs[String(scene.track)]
    setImage(before, 'sar', ref && base + ref.sar, corners, 1, true)
  }, [ready, scene, layers, opacity, base, corners, manifest])

  useEffect(() => {
    const { main } = maps.current
    if (!main || !camera) return
    if (camera.bounds) main.fitBounds(camera.bounds, { padding: fitPadding(), duration: 1200 })
    else if (camera.center) main.flyTo({ center: camera.center, zoom: camera.zoom ?? 10, duration: 1400 })
  }, [camera])

  useEffect(() => {
    const { main } = maps.current
    if (!main) return
    marker.current?.remove()
    if (pick) {
      const el = document.createElement('div')
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 3px #0b1220aa,0 0 14px #22d3ee'
      marker.current = new maplibregl.Marker({ element: el }).setLngLat(pick).addTo(main)
    }
  }, [pick])

  const drag = (e) => {
    const rect = mainEl.current.getBoundingClientRect()
    const move = (ev) => setSplit(Math.min(0.98, Math.max(0.02, (ev.clientX - rect.left) / rect.width)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    e.preventDefault()
  }

  const ref = scene && manifest.refs[String(scene.track)]
  return (
    <div className="map-wrap">
      <div ref={mainEl} className="map" />
      <div ref={beforeEl} className="map top" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)`, visibility: compare ? 'visible' : 'hidden', pointerEvents: 'none' }} />
      {compare && (
        <>
          <div className="swipe-handle" style={{ left: `${split * 100}%` }} onPointerDown={drag} />
          <div className="swipe-label" style={{ left: `calc(${split * 100}% - 12px)`, transform: 'translateX(-100%)' }}>
            Before · NISAR {ref?.dates?.length}-pass median
          </div>
          <div className="swipe-label" style={{ left: `calc(${split * 100}% + 12px)` }}>After · {scene?.date}</div>
        </>
      )}
    </div>
  )
}
