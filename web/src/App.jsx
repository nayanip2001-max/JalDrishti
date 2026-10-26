import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import Timeline from './components/Timeline.jsx'
import Evidence from './components/Evidence.jsx'
import Story, { buildSteps } from './components/Story.jsx'
import { StatsCard, ExposureCard, SensorCard, ValidationCard, LayersCard, LegendCard } from './components/Panel.jsx'
import { readEvidence } from './lib/evidence.js'

const DATA = `${import.meta.env.BASE_URL}data/`
const DEFAULT_LAYERS = { flood: true, prob: false, sar: true, compare: false }
const peakOf = (m) => {
  const posts = m.scenes.filter((s) => s.kind === 'post')
  return posts.reduce((a, b) => (b.areas_km2['flood (open water)'] > a.areas_km2['flood (open water)'] ? b : a), posts[0])
}

export default function App() {
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState(() => window.location.hash.slice(1) || 'assam')
  const [manifest, setManifest] = useState(null)
  const [scene, setScene] = useState(null)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [opacity, setOpacity] = useState({ overlay: 0.9, sar: 0.55 })
  const [basemap, setBasemap] = useState('dark')
  const [compare, setCompare] = useState(false)
  const [pick, setPick] = useState(null)
  const [evidence, setEvidence] = useState(null)
  const [story, setStory] = useState(null)   // index of the current story step, or null
  const [camera, setCamera] = useState(null)
  const base = `${DATA}${eventId}/`

  useEffect(() => { fetch(DATA + 'events.json').then((r) => r.json()).then(setEvents).catch(() => setEvents([])) }, [])

  useEffect(() => {
    let live = true
    setManifest(null); setPick(null); setEvidence(null)
    fetch(base + 'manifest.json').then((r) => r.json()).then((m) => {
      if (!live) return
      setManifest(m); setScene(peakOf(m))
      let seen = false
      try { seen = !!sessionStorage.getItem('jd-story-seen') } catch { /* storage blocked */ }
      setStory((s) => (s === null && !seen ? 0 : s))
    })
    window.location.hash = eventId
    return () => { live = false }
  }, [eventId, base])

  useEffect(() => {
    if (!pick || !scene || !manifest) return
    let live = true
    readEvidence(base, scene, manifest, pick).then((e) => live && setEvidence(e))
    return () => { live = false }
  }, [pick, scene, manifest, base])

  const steps = useMemo(() => (manifest ? buildSteps(manifest) : []), [manifest])
  useEffect(() => {
    const s = story !== null && steps[story]
    if (!s) return
    setScene(s.scene); setLayers(s.layers); setCompare(s.compare); setCamera({ ...s.camera, t: Date.now() })
  }, [story, steps])
  const closeStory = () => {
    setStory(null); setCompare(false); setLayers(DEFAULT_LAYERS)
    try { sessionStorage.setItem('jd-story-seen', '1') } catch { /* storage blocked */ }
  }

  const posts = useMemo(() => manifest?.scenes.filter((s) => s.kind === 'post').sort((a, b) => a.date.localeCompare(b.date)) ?? [], [manifest])
  const prev = useMemo(() => {
    if (!scene) return null
    const same = posts.filter((s) => s.track === scene.track && s.date < scene.date)
    return same[same.length - 1] ?? null
  }, [posts, scene])
  const select = useCallback((s) => setScene(s), [])
  const toggleLayers = (l) => {
    // The L-vs-C agreement map exists for one date only; jump there when it is switched on.
    if (l.compare && !layers.compare && manifest?.sensor_compare) {
      const d = posts.find((s) => s.date === manifest.sensor_compare.date)
      if (d) setScene(d)
    }
    setLayers(l)
  }

  if (!manifest || !scene) return <div className="loading">Loading NISAR observations…</div>
  const ev = manifest.event
  const last = posts[posts.length - 1]

  return (
    <div className="app">
      <MapView key={eventId} base={base} manifest={manifest} scene={scene} layers={layers} opacity={opacity}
        basemap={basemap} compare={compare} onPick={setPick} pick={pick} camera={camera} />

      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M2 14c3-3 5 3 10 0s7 3 10 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M2 19c3-3 5 3 10 0s7 3 10 0" stroke="#a78bfa" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".8" /></svg>
          </div>
          <div><h1>JalDrishti</h1><small>NISAR L-band flood intelligence</small></div>
        </div>
        <div className="eventchip">
          {events.length > 1 ? (
            <select className="eventsel" value={eventId} onChange={(e) => { setStory(null); setEventId(e.target.value) }} aria-label="Flood event">
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.country}</option>)}
            </select>
          ) : <h2>{ev.title}</h2>}
          <span>{ev.subtitle}</span>
        </div>
        <div className="spacer" />
        <button className="storybtn" onClick={() => setStory(0)}>▶ Story</button>
        <div className="obs"><span className="pulse" />Latest NISAR observation <b>{last.date}</b> · track {last.track}</div>
      </header>

      <aside className="panel">
        <StatsCard scene={scene} prev={prev} />
        <Evidence evidence={evidence} pick={pick} scene={scene} />
        <ExposureCard scene={scene} caveat={ev.caveat} />
        <SensorCard manifest={manifest} />
        <LayersCard layers={layers} setLayers={toggleLayers} opacity={opacity} setOpacity={setOpacity}
          basemap={basemap} setBasemap={setBasemap} compare={compare} setCompare={setCompare} hasSensor={!!manifest.sensor_compare} />
        <ValidationCard manifest={manifest} />
        <LegendCard manifest={manifest} />
      </aside>

      {story !== null && <Story steps={steps} index={story} onIndex={setStory} onClose={closeStory} />}
      <Timeline manifest={manifest} scene={scene} onSelect={select} />
    </div>
  )
}
