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

// The map has its own grid cell now, so only a small margin is needed around the area of interest.
const fitPadding = () => (window.innerWidth < 760 ? { top: 16, bottom: 16, left: 12, right: 12 } : { top: 36, bottom: 36, left: 36, right: 36 })

// Overlays are inserted below the 'labels' layer so place names stay readable on top.
function style(basemap) {
  const b = BASEMAPS[basemap]
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
function setImage(map, id, url, corners, opacity, visible, beforeId = 'labels') {
  const src = map.getSource(id)
  if (!url) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    return
  }
  if (!src) {
    map.addSource(id, { type: 'image', url, coordinates: corners })
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, 'raster-resampling': id === 'sar' ? 'linear' : 'nearest' } }, map.getLayer(beforeId) ? beforeId : 'labels')
  } else if (src.url !== url) {
    src.updateImage({ url, coordinates: corners })
    src.url = url
  }
  map.setPaintProperty(id, 'raster-opacity', opacity)
  map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

// District outlines + labels and roads/rail, drawn above the rasters but below basemap labels.
function setVectors(map, base, il, layers) {
  if (!map.getSource('districts')) {
    map.addSource('districts', { type: 'geojson', data: base + il.districts })
    map.addSource('roads', { type: 'geojson', data: base + il.roads })
    map.addLayer({ id: 'roads-line', type: 'line', source: 'roads', filter: ['!=', ['get', 'kind'], 'railway'],
      paint: { 'line-color': '#fde68a', 'line-opacity': 0.75,
        'line-width': ['match', ['get', 'kind'], ['motorway', 'trunk'], 2, 'primary', 1.5, 1] } }, 'labels')
    map.addLayer({ id: 'rail-line', type: 'line', source: 'roads', filter: ['==', ['get', 'kind'], 'railway'],
      paint: { 'line-color': '#f87171', 'line-width': 1.6, 'line-dasharray': [3, 2] } }, 'labels')
    map.addLayer({ id: 'districts-line', type: 'line', source: 'districts',
      paint: { 'line-color': '#e2e8f0', 'line-opacity': 0.7, 'line-width': 1.1, 'line-dasharray': [4, 3] } })
    map.addLayer({ id: 'districts-label', type: 'symbol', source: 'districts',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 },
      paint: { 'text-color': '#e2e8f0', 'text-halo-color': '#0b1220', 'text-halo-width': 1.6 } })
  }
  const vis = (on) => (on ? 'visible' : 'none')
  map.setLayoutProperty('roads-line', 'visibility', vis(layers.roads))
  map.setLayoutProperty('rail-line', 'visibility', vis(layers.roads))
  map.setLayoutProperty('districts-line', 'visibility', vis(layers.districts))
  map.setLayoutProperty('districts-label', 'visibility', vis(layers.districts))
}

// "Map a Region" overlays: the chosen box (dashed amber) and a loaded result's confident flood (cyan).
const rect = (b) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } })
const EMPTY = { type: 'FeatureCollection', features: [] }
function setGeo(map, id, data, layers) {
  const src = map.getSource(id)
  if (src) src.setData(data)
  else {
    map.addSource(id, { type: 'geojson', data })
    for (const l of layers) map.addLayer({ ...l, id: `${id}-${l.type}`, source: id })
  }
}

export default function MapView({ base, manifest, scene, layers, opacity, basemap, compare, onPick, pick, camera, modelDay, region, onRegionBox }) {
  const mainEl = useRef(null)
  const beforeEl = useRef(null)
  const maps = useRef({})
  const marker = useRef(null)
  const [ready, setReady] = useState(0)
  const [split, setSplit] = useState(0.5)
  const corners = manifest.aoi.corners
  // Box drawing reads the latest props from a ref, so the map's click handler is registered once.
  const draw = useRef({ on: false, a: null })
  draw.current.on = !!region?.drawing
  draw.current.onBox = onRegionBox
  draw.current.onPick = onPick
  if (!region?.drawing) draw.current.a = null

  useEffect(() => {
    const opts = { style: style(basemap), bounds: manifest.aoi.bounds, fitBoundsOptions: { padding: fitPadding() }, attributionControl: { compact: true } }
    const main = new maplibregl.Map({ container: mainEl.current, ...opts })
    const before = new maplibregl.Map({ container: beforeEl.current, ...opts, interactive: false, attributionControl: false })
    main.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    main.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    const sync = () => before.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: main.getPitch() })
    main.on('move', sync)
    main.on('click', (e) => {
      const d = draw.current, p = [e.lngLat.lng, e.lngLat.lat]
      if (!d.on) return d.onPick(p)
      if (!d.a) { d.a = p; return }
      const r5 = (v) => Math.round(v * 1e4) / 1e4
      const b = [Math.min(d.a[0], p[0]), Math.min(d.a[1], p[1]), Math.max(d.a[0], p[0]), Math.max(d.a[1], p[1])].map(r5)
      d.a = null
      d.onBox?.(b)
    })
    main.on('mousemove', (e) => {
      const d = draw.current
      if (d.on && d.a) main.getSource('rg-box')?.setData(rect([Math.min(d.a[0], e.lngLat.lng), Math.min(d.a[1], e.lngLat.lat), Math.max(d.a[0], e.lngLat.lng), Math.max(d.a[1], e.lngLat.lat)]))
    })
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
    // A modelled day replaces the observed flood layers, never overlays them.
    const tr = manifest.tracker
    setImage(main, 'model', modelDay && tr && base + tr.image.replace('{date}', modelDay), corners, opacity.overlay, !!modelDay)
    setImage(main, 'prob', base + scene.prob, corners, opacity.overlay, layers.prob && !modelDay)
    setImage(main, 'cls', base + scene.cls, corners, opacity.overlay, layers.flood && !modelDay)
    const cmp = manifest.sensor_compare
    setImage(main, 'cmp', cmp && base + cmp.image, corners, opacity.overlay, !!(cmp && layers.compare && scene.date === cmp.date))
    const ref = manifest.refs[String(scene.track)]
    setImage(before, 'sar', ref && base + ref.sar, corners, 1, true)
    const il = manifest.impact_layers
    if (il) {
      setImage(main, 'cropland', base + il.cropland, corners, 0.75, layers.cropland, 'prob')  // under the flood layers
      setImage(main, 'population', base + il.population, corners, 0.8, layers.population, 'prob')
      setVectors(main, base, il, layers)
    }
  }, [ready, scene, layers, opacity, base, corners, manifest, modelDay])

  useEffect(() => {
    const { main } = maps.current
    if (!ready || !main) return
    setGeo(main, 'rg-res', region?.result?.geojson ?? EMPTY, [
      { type: 'fill', paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.6 } },
      { type: 'line', paint: { 'line-color': '#67e8f9', 'line-width': 0.8 } }])
    setGeo(main, 'rg-box', region?.box ? rect(region.box) : EMPTY, [
      { type: 'fill', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.06 } },
      { type: 'line', paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [3, 2] } }])
  }, [ready, region?.box, region?.result, region?.drawing])

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
