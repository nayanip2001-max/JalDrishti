import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import Timeline from './components/Timeline.jsx'
import Header from './components/Header.jsx'
import Story, { buildSteps } from './components/Story.jsx'
import { NavRail, Drawer, MapLegend } from './components/Shell.jsx'
import { Overview, EventView, FloodView, TemporalView, ImpactView, HowItWorks } from './components/Sections.jsx'
import { ObservationsView, FeaturesView, ModelView, ValidationView, DataView } from './components/Science.jsx'
import { DETAILS } from './components/Details.jsx'
import { LiveView, LiveBanner } from './components/Live.jsx'
import { RegionView } from './components/Region.jsx'
import { Icon } from './components/ui.jsx'
import { readPixel } from './lib/evidence.js'
import { MODES, LENS_LAYERS, resolveSection, navFor } from './lib/modes.js'
import { peakOf, posts as postsOf } from './lib/format.js'

const latestOf = (m) => { const ps = postsOf(m); return ps[ps.length - 1] }

const DATA = `${import.meta.env.BASE_URL}data/`
const SECTIONS = { overview: Overview, event: EventView, flood: FloodView, temporal: TemporalView, impact: ImpactView, how: HowItWorks,
  observations: ObservationsView, features: FeaturesView, model: ModelView, validation: ValidationView, data: DataView, live: LiveView, region: RegionView }
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

export default function App() {
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState(() => window.location.hash.slice(1) || 'assam')
  const [manifest, setManifest] = useState(null)
  const [live, setLive] = useState(null)              // live-monitor status (live events only)
  const [region, setRegion] = useState({})              // "Map a Region": box, NISAR check, loaded result (this browser only)
  const [modelDay, setModelDay] = useState(null)      // a day of the MODELLED between-pass estimate shown on the map, or null
  const [scene, setScene] = useState(null)
  const [mode, setModeState] = useState(() => store.get('jd-mode', 'beginner'))
  const [lens, setLens] = useState('science')
  const [section, setSection] = useState(() => resolveSection(store.get('jd-mode', 'beginner'), 'overview'))
  const [details, setDetails] = useState([])               // drill-down stack shown in the drawer
  const [drawerOpen, setDrawerOpen] = useState(() => window.innerWidth >= 760)
  const [layers, setLayers] = useState(LENS_LAYERS.science)
  const [opacity, setOpacity] = useState({ overlay: 0.9, sar: 0.55 })
  const [basemap, setBasemap] = useState('dark')
  const [compare, setCompare] = useState(false)
  const [pick, setPick] = useState(null)
  const [pixel, setPixel] = useState(null)
  const [story, setStory] = useState(null)
  const [camera, setCamera] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const base = `${DATA}${eventId}/`
  const shown = manifest ? `${DATA}${manifest.aoi.id}/` : base      // data folder of the event on screen (lags `base` while switching)

  useEffect(() => { fetch(DATA + 'events.json').then((r) => r.json()).then(setEvents).catch(() => setEvents([])) }, [])
  // Switching events: keep showing the current event until the new one has loaded, then swap everything at once
  // (manifest, scene, section, camera). The map is rebuilt only for the new manifest, never replays the old
  // event's camera moves, and events already opened come from memory.
  const cache = useRef({})
  useEffect(() => {
    let live = true
    setModelDay(null); setPick(null); setPixel(null); setDetails([]); setCompare(false); setCamera(null)
    const got = cache.current[eventId] ? Promise.resolve(cache.current[eventId]) : fetch(base + 'manifest.json').then((r) => r.json())
    got.then((m) => {
      if (!live) return
      cache.current[eventId] = m
      setCamera(null); setLive(null)
      setManifest(m); setScene(m.event.live ? latestOf(m) : peakOf(m))
      setSection((sec) => resolveSection(store.get('jd-mode', 'beginner'), sec, !!m.event.live))
      if (m.event.live) fetch(base + 'live.json', { cache: 'no-store' }).then((r) => r.json()).then((l) => live && setLive(l)).catch(() => {})
      let seen = true
      try { seen = !!sessionStorage.getItem('jd-story-seen') } catch { /* storage blocked */ }
      if (store.get('jd-mode', 'beginner') === 'beginner' && !seen) {          // guided tour once, on a beginner's first visit
        setStory(0)
        try { sessionStorage.setItem('jd-story-seen', '1') } catch { /* storage blocked */ }
      }
    }).catch(() => live && setLoadError(eventId))
    window.location.hash = eventId
    return () => { live = false }
  }, [eventId, base])

  useEffect(() => {
    if (!pick || !scene || !manifest) return
    let live = true
    readPixel(shown, scene, manifest, pick).then((p) => live && setPixel(p)).catch(() => live && setPixel(null))
    return () => { live = false }
  }, [pick, scene, manifest, shown])

  const open = useCallback((type, props = {}) => {
    setDrawerOpen(true)
    setDetails((st) => (st.length && st[st.length - 1].type === type && type === 'pixel' ? st : [...st, { type, props }]))
  }, [])
  const back = () => setDetails((st) => st.slice(0, -1))
  const go = (id) => { setSection(id); setDetails([]); setDrawerOpen(true) }
  const isLive = !!manifest?.event.live
  const pickScene = (s) => { setModelDay(null); setScene(s) }   // choosing an observed pass leaves the modelled view
  const nav = navFor(mode, isLive)
  const setMode = (m) => { setModeState(m); store.set('jd-mode', m); setSection((s) => resolveSection(m, s, isLive)) }
  const switchLens = (l) => {
    setLens(l); setLayers((cur) => ({ ...LENS_LAYERS[l], compare: false, prob: l === 'science' && cur.prob }))
    setCompare(false); setDetails([]); setSection(l === 'impact' ? 'impact' : nav[0].id); setDrawerOpen(true)
  }
  const flyTo = (c) => setCamera({ ...c, t: Date.now() })
  const allPosts = useMemo(() => (manifest ? postsOf(manifest) : []), [manifest])
  const setLayersCompare = (on) => {
    // The L-vs-C agreement map exists for one date only; jump there when it is switched on.
    if (on && manifest?.sensor_compare) {
      const d = allPosts.find((s) => s.date === manifest.sensor_compare.date)
      if (d) setScene(d)
      if (manifest.sensor_compare.bounds) flyTo({ bounds: manifest.sensor_compare.bounds })
    }
    setLayers((l) => ({ ...l, compare: on }))
  }

  const steps = useMemo(() => (manifest ? buildSteps(manifest) : []), [manifest])
  useEffect(() => {
    const s = story !== null && steps[story]
    if (!s) return
    setScene(s.scene); setLayers({ ...LENS_LAYERS.science, ...s.layers }); setCompare(s.compare); flyTo(s.camera)
  }, [story, steps])
  const closeStory = () => {
    setStory(null); setCompare(false); setLayers(LENS_LAYERS[lens]); setScene(isLive ? latestOf(manifest) : peakOf(manifest)); flyTo({ bounds: manifest.aoi.bounds })
    try { sessionStorage.setItem('jd-story-seen', '1') } catch { /* storage blocked */ }
  }

  const onPick = useCallback((ll) => { setPick(ll); open('pixel') }, [open])
  const onSearchPick = (r) => {
    if (r.kind === 'District') { flyTo({ bounds: [[r.payload.bbox[0], r.payload.bbox[1]], [r.payload.bbox[2], r.payload.bbox[3]]] }); open('district', { name: r.payload.name }) }
    if (r.kind === 'NISAR pass') { setScene(r.payload); open('observation', { scene: r.payload }) }
    if (r.kind === 'Section') go(r.payload.id)
    if (r.kind === 'Explain') open('term', { term: r.payload })
  }

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && document.activeElement?.tagName !== 'INPUT') setDetails((st) => st.slice(0, -1)) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  if (!manifest || !scene) return <div className="loading">{loadError ? 'Could not load this event. Check the connection and reload.' : <><span className="spinner" />Loading NISAR observations…</>}</div>
  const switching = manifest.aoi.id !== eventId

  const ctx = { manifest, scene, setScene: pickScene, modelDay, setModelDay, mode, lens, layers, setLayers, setLayersCompare, opacity, setOpacity, basemap, setBasemap,
    compare, setCompare, open, go, flyTo, pick, pixel, country: manifest.event.country, startTour: () => setStory(0), base: shown, live, region, setRegion }
  const top = details[details.length - 1]
  const navItem = nav.find((n) => n.id === section)
  const D = top && DETAILS[top.type]
  const Section = SECTIONS[section] ?? Overview
  const title = D ? (typeof D.title === 'function' ? D.title(top.props) : D.title) : navItem?.label
  const crumb = D ? navItem?.label : MODES.find((m) => m.id === mode)?.label + ' view'

  return (
    <div className={`app mode-${mode} lens-${lens} ${drawerOpen ? '' : 'drawer-closed'}`}>
      <Header events={events} eventId={eventId} onEvent={(id) => { setStory(null); setLoadError(null); setEventId(id) }} manifest={manifest} scene={scene}
        mode={mode} onMode={setMode} lens={lens} onLens={switchLens} onSearchPick={onSearchPick}
        onHelp={() => open('help')} onSeeing={() => open('seeing')} />
      <NavRail items={nav} section={section} onSection={go} />
      <main className="stage">
        <MapView key={manifest.aoi.id} base={shown} manifest={manifest} scene={scene} layers={layers} opacity={opacity}
          basemap={basemap} compare={compare} onPick={onPick} pick={pick} camera={camera} modelDay={modelDay}
          region={region} onRegionBox={(box) => setRegion((r) => ({ ...r, box, name: r.name, check: null, drawing: false }))} />
        {section === 'region' && (region.box || region.result)
          ? <div className="legend-float">{region.box && <span><i style={{ border: '2px dashed #f59e0b' }} />Your area</span>}
            {region.result && <span><i style={{ background: '#22d3ee' }} />Confident flood (your result, not validated here)</span>}</div>
          : <MapLegend manifest={manifest} layers={layers} mode={mode} scene={scene} modelDay={modelDay} />}
        {modelDay && <div className="live-banner modelled" role="status"><b>MODELLED</b> · {modelDay}: estimate between passes, not an observation. <button onClick={() => setModelDay(null)}>Show observed</button></div>}
        {isLive && story === null && !modelDay && <LiveBanner manifest={manifest} live={live} scene={scene} onLatest={() => setScene(latestOf(manifest))} />}
        {region.drawing && <div className="live-banner modelled" role="status">Click two opposite corners on the map to draw your box. <button onClick={() => setRegion((r) => ({ ...r, drawing: false }))}>Cancel</button></div>}
        {mode === 'beginner' && <button className="seeing-fab" onClick={() => open('seeing')}><Icon name="eye" size={16} />What am I seeing?</button>}
        {!drawerOpen && <button className="drawer-tab" onClick={() => setDrawerOpen(true)}><Icon name="drawer" size={16} />{navItem?.label}</button>}
        {switching && <div className="map-loading" role="status">{loadError
          ? <>Could not load this event. <button className="btn-ghost small" onClick={() => setEventId(manifest.aoi.id)}>Stay on the current event</button></>
          : <><span className="spinner" />Loading {events.find((e) => e.id === eventId)?.title ?? 'event'}…</>}</div>}
        {story !== null && <Story steps={steps} index={story} onIndex={setStory} onClose={closeStory} />}
      </main>
      <Drawer open={drawerOpen} title={title} crumb={crumb} onBack={top ? back : null} onClose={() => setDrawerOpen(false)}>
        {D ? <D.C ctx={ctx} {...top.props} /> : <Section ctx={ctx} />}
      </Drawer>
      <Timeline manifest={manifest} scene={scene} onSelect={pickScene} mode={mode} />
    </div>
  )
}
