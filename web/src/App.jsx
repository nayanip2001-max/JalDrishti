import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import Timeline from './components/Timeline.jsx'
import Header from './components/Header.jsx'
import { TourButton, TourCard, TourResume } from './components/Tours.jsx'
import { buildTours, loadTourData, TOUR_MODE } from './lib/tours.js'
import { NavRail, Drawer, MapLegend } from './components/Shell.jsx'
import { Overview, EventView, FloodView, TemporalView, ImpactView, HowItWorks } from './components/Sections.jsx'
import { ObservationsView, FeaturesView, ModelView, ValidationView, DataView } from './components/Science.jsx'
import { DETAILS } from './components/Details.jsx'
import { LiveView, LiveBanner } from './components/Live.jsx'
import { RegionView } from './components/Region.jsx'
import { RecoveryView } from './components/Recovery.jsx'
import BeginnerApp from './beginner/BeginnerApp.jsx'
import { Icon, Boundary } from './components/ui.jsx'
import { readPixel } from './lib/evidence.js'
import { MODES, LENS_LAYERS, resolveSection, navFor } from './lib/modes.js'
import { peakOf, posts as postsOf } from './lib/format.js'

// "How do we know?" science panel (beginner view): its own chunk, loaded when first opened.
const SciencePanel = lazy(() => import('./science/SciencePanel.jsx'))
// Intermediate: "How We Know" tab (topic list + data sources). Advanced: a visual-explainer link atop matching tabs.
const ScienceTab = lazy(() => import('./science/ScienceTab.jsx'))
const SciBanner = lazy(() => import('./science/ScienceTab.jsx').then((m) => ({ default: m.SciBanner })))
const BANNER = { observations: 'prep', features: 'features', model: 'model', validation: 'accuracy', impact: 'impact' }
// Beginner map: flood classes on a satellite basemap, nothing else.
const BEGINNER_LAYERS = { ...LENS_LAYERS.science, sar: false }
const NO_REGION = {}
const BEGINNER_NO_FLOOD = { ...BEGINNER_LAYERS, flood: false }

const latestOf = (m) => { const ps = postsOf(m); return ps[ps.length - 1] }

const DATA = `${import.meta.env.BASE_URL}data/`
const SECTIONS = { overview: Overview, event: EventView, flood: FloodView, temporal: TemporalView, impact: ImpactView, how: HowItWorks,
  observations: ObservationsView, features: FeaturesView, model: ModelView, validation: ValidationView, data: DataView, live: LiveView, region: RegionView, science: ScienceTab, recovery: RecoveryView }
// Links: #assam, or #assam/tour/<tour>/<step>. Read when the dashboard mounts (the globe sets the hash first).
const readHash = () => window.location.hash.slice(1).split('/')
const linkTour = (h) => (h[1] === 'tour' && h[2] ? { id: h[2], i: Math.max(0, (parseInt(h[3], 10) || 1) - 1), paused: false } : null)
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

export default function App({ onHome }) {
  const [events, setEvents] = useState([])
  const [link] = useState(() => { const h = readHash(); return { event: h[0], tour: linkTour(h) } })
  const [eventId, setEventId] = useState(() => link.event || 'assam')
  const [manifest, setManifest] = useState(null)
  const [live, setLive] = useState(null)              // live-monitor status (live events only)
  const [region, setRegion] = useState({})              // "Map a Region": box, NISAR check, loaded result (this browser only)
  const [modelDay, setModelDay] = useState(null)      // a day of the MODELLED between-pass estimate shown on the map, or null
  const [scene, setScene] = useState(null)
  // A tour link opens the level the tour belongs to (Beginner has no tours: it opens Intermediate).
  const [mode, setModeState] = useState(() => {
    const m = store.get('jd-mode', 'beginner')
    if (!link.tour) return m
    const need = TOUR_MODE[link.tour.id] ?? (m === 'beginner' ? 'intermediate' : m)
    store.set('jd-mode', need)
    return need
  })
  const [section, setSection] = useState(() => resolveSection(store.get('jd-mode', 'beginner'), 'overview'))
  const [details, setDetails] = useState([])               // drill-down stack shown in the drawer
  const [drawerOpen, setDrawerOpen] = useState(() => window.innerWidth >= 760)
  const [layers, setLayers] = useState(LENS_LAYERS.science)
  const [opacity, setOpacity] = useState({ overlay: 0.9, sar: 0.55 })
  const [basemap, setBasemap] = useState('dark')
  const [compare, setCompare] = useState(false)
  const [pick, setPick] = useState(null)
  const [pixel, setPixel] = useState(null)
  const [tour, setTour] = useState(link.tour)           // { id, i, paused } or null
  const [tourData, setTourData] = useState(null)      // every event's manifest + recovery, for the tours
  const [camera, setCamera] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [science, setScience] = useState(null)        // null = closed, 'index' = all topics, or a topic id
  const lens = section === 'impact' ? 'impact' : 'science'       // the Impact tab shows the impact layers
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
  const go = (id) => {
    if ((id === 'impact') !== (section === 'impact')) { setLayers(LENS_LAYERS[id === 'impact' ? 'impact' : 'science']); setCompare(false) }
    setSection(id); setDetails([]); setDrawerOpen(true)
  }
  const isLive = !!manifest?.event.live
  const pickScene = (s) => { setModelDay(null); setScene(s) }   // choosing an observed pass leaves the modelled view
  const nav = navFor(mode, isLive)
  const setMode = (m) => { setModeState(m); store.set('jd-mode', m); setSection((s) => resolveSection(m, s, isLive)); if (m !== 'beginner') setScience(null) }
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

  // ---- guided tours: each step sets the date, layers, panel, camera and pixel; the URL names the step
  const eventIds = useMemo(() => (events.length ? events.map((e) => e.id) : ['assam', 'thailand', 'chennai']), [events])
  const wantTourData = useCallback(() => {
    if (!tourData) loadTourData(DATA, eventIds).then(setTourData).catch(() => {})
  }, [tourData, eventIds])
  useEffect(() => { if (tour) wantTourData() }, [tour, wantTourData])
  const tours = useMemo(() => (manifest && mode !== 'beginner' ? buildTours(mode, manifest, tourData, eventIds) : []), [manifest, mode, tourData, eventIds])
  const curTour = tour && tours.find((t) => t.id === tour.id)
  const step = curTour?.steps[tour.i]
  useEffect(() => {      // an unknown tour (old link, or a level without it) ends quietly once everything has loaded
    if (tour && tourData && manifest && !curTour) setTour(null)
  }, [tour, tourData, manifest, curTour])
  useEffect(() => {
    if (!step || tour.paused || !manifest) return
    if (step.event && step.event !== manifest.aoi.id) { setEventId(step.event); return }   // wait for that event to load
    const sc = step.scene && manifest.scenes.find((x) => x.date === step.scene.date && x.track === step.scene.track)
    setModelDay(null)
    if (sc) setScene(sc)
    const sec = step.section ? resolveSection(mode, step.section, !!manifest.event.live) : null
    setLayers({ ...LENS_LAYERS[sec === 'impact' ? 'impact' : 'science'], ...step.layers })
    setCompare(!!step.compare)
    if (sec) setSection(sec)
    setPick(step.pick ?? null)
    setDetails(step.detail ? [step.detail] : [])
    if (step.region) setRegion((r) => ({ ...r, ...step.region }))
    setDrawerOpen(window.innerWidth >= 760 || !!step.detail || !!sec)
    if (step.camera) flyTo(step.camera)
    window.history.replaceState(null, '', `#${manifest.aoi.id}/tour/${tour.id}/${tour.i + 1}`)
  }, [step, tour?.paused, manifest])    // eslint-disable-line react-hooks/exhaustive-deps
  const startTour = (id) => { setTour({ id, i: 0, paused: false }); try { localStorage.setItem('jd-tours-seen', '1') } catch { /* storage blocked */ } }
  const endTour = () => {
    setTour(null); setCompare(false)
    if (manifest) window.history.replaceState(null, '', `#${manifest.aoi.id}`)
  }
  const pauseTour = () => { setTour((t) => ({ ...t, paused: true })); if (manifest) window.history.replaceState(null, '', `#${manifest.aoi.id}`) }
  const toursFresh = (() => { try { return !localStorage.getItem('jd-tours-seen') } catch { return false } })()

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
  const dashExtra = { dur: layers.dur ? { url: shown + 'recovery/duration.webp', opacity: 0.85 } : null, scar: layers.scar ? { url: shown + 'recovery/scars.webp', opacity: 1 } : null,
    rdur: region.result?.recovery?.dur && section === 'region' && (region.showRec?.dur ?? true) ? { url: region.result.recovery.dur, corners: region.result.recovery.corners, opacity: 0.85 } : null,
    rscar: region.result?.recovery?.scar && section === 'region' && region.showRec?.scar ? { url: region.result.recovery.scar, corners: region.result.recovery.corners, opacity: 1 } : null }

  const ctx = { manifest, scene, setScene: pickScene, modelDay, setModelDay, mode, lens, layers, setLayers, setLayersCompare, opacity, setOpacity, basemap, setBasemap,
    compare, setCompare, open, go, flyTo, pick, pixel, country: manifest.event.country, startTour: () => startTour('story'), base: shown, live, region, setRegion,
    openScience: mode !== 'beginner' ? (id = 'index') => setScience(id) : undefined, pickAt: onPick }
  const top = details[details.length - 1]
  const navItem = nav.find((n) => n.id === section)
  const D = top && DETAILS[top.type]
  const Section = SECTIONS[section] ?? Overview
  const title = D ? (typeof D.title === 'function' ? D.title(top.props) : D.title) : navItem?.label
  const crumb = D ? navItem?.label : MODES.find((m) => m.id === mode)?.label + ' view'

  // Beginner: its own bright, picture-first house around the same map, scene and event.
  if (mode === 'beginner') {
    return (
      <BeginnerApp ctx={ctx} events={events} eventId={eventId} onMode={setMode} onHome={onHome} switching={switching} loadError={loadError}
        onEvent={(id) => { setLoadError(null); setEventId(id) }} onStay={() => setEventId(manifest.aoi.id)}
        renderMap={(o = {}) => <MapView key={manifest.aoi.id} base={shown} manifest={manifest} scene={scene} layers={o.flood === false ? BEGINNER_NO_FLOOD : BEGINNER_LAYERS}
          opacity={opacity} basemap="satellite" compare={false} onPick={onPick} pick={pick} camera={camera} modelDay={null} region={NO_REGION} extra={o.extra} />} />
    )
  }

  return (
    <div className={`app mode-${mode} lens-${lens} ${drawerOpen ? '' : 'drawer-closed'}`}>
      <Header events={events} eventId={eventId} onEvent={(id) => { setTour(null); setLoadError(null); setEventId(id) }} manifest={manifest}
        mode={mode} onMode={setMode} onSearchPick={onSearchPick} onSeeing={() => open('seeing')} onHome={onHome}
        tours={<TourButton tours={tours} loading={!tourData} fresh={toursFresh && !tour} onOpen={wantTourData} onStart={startTour} />} />
      <NavRail items={nav} section={section} onSection={go} />
      <main className="stage">
        <MapView key={manifest.aoi.id} base={shown} manifest={manifest} scene={scene} layers={layers} opacity={opacity} extra={dashExtra}
          basemap={basemap} compare={compare} onPick={onPick} pick={pick} camera={camera} modelDay={modelDay}
          region={region} onRegionBox={(box) => setRegion((r) => ({ ...r, box, name: r.name, check: null, drawing: false }))} />
        {section === 'region' && (region.box || region.result)
          ? <div className="legend-float">{region.box && <span><i style={{ border: '2px dashed #f59e0b' }} />Your area</span>}
            {region.result && <span><i style={{ background: '#22d3ee' }} />Confident flood (your result, not validated here)</span>}
            {region.result?.recovery?.dur && (region.showRec?.dur ?? true) && <><span><i style={{ background: '#bae6fd' }} />&lt; 2 wk</span><span><i style={{ background: '#60a5fa' }} />2–4 wk</span><span><i style={{ background: '#6366f1' }} />4–8 wk</span><span><i style={{ background: '#7c3aed' }} />&gt; 8 wk</span><span><i style={{ background: '#f43f5e' }} />Not dry again</span></>}
            {region.result?.recovery?.scar && region.showRec?.scar && <><span><i style={{ background: '#f97316' }} />Land → river</span><span><i style={{ background: '#facc15' }} />River → land</span></>}</div>
          : <MapLegend manifest={manifest} layers={layers} mode={mode} scene={scene} modelDay={modelDay} />}
        {modelDay && <div className="live-banner modelled" role="status"><b>MODELLED</b> · {modelDay}: estimate between passes, not an observation. <button onClick={() => setModelDay(null)}>Show observed</button></div>}
        {isLive && (!tour || tour.paused) && !modelDay && <LiveBanner manifest={manifest} live={live} scene={scene} onLatest={() => setScene(latestOf(manifest))} />}
        {region.drawing && <div className="live-banner modelled" role="status">Click two opposite corners on the map to draw your box. <button onClick={() => setRegion((r) => ({ ...r, drawing: false }))}>Cancel</button></div>}
        {!drawerOpen && <button className="drawer-tab" onClick={() => setDrawerOpen(true)}><Icon name="drawer" size={16} />{navItem?.label}</button>}
        {switching && <div className="map-loading" role="status">{loadError
          ? <>Could not load this event. <button className="btn-ghost small" onClick={() => setEventId(manifest.aoi.id)}>Stay on the current event</button></>
          : <><span className="spinner" />Loading {events.find((e) => e.id === eventId)?.title ?? 'event'}…</>}</div>}
        {curTour && (tour.paused
          ? <TourResume tour={curTour} index={tour.i} onResume={() => setTour((t) => ({ ...t, paused: false }))} onClose={endTour} />
          : <TourCard tour={curTour} index={tour.i} pixel={pixel} onIndex={(i) => setTour((t) => ({ ...t, i: Math.max(0, Math.min(i, curTour.steps.length - 1)) }))}
            onPause={pauseTour} onClose={endTour} link={`${window.location.origin}${window.location.pathname}#${manifest.aoi.id}/tour/${tour.id}/${tour.i + 1}`} />)}
        {tour && !curTour && <div className="tour-pill" role="status"><span className="spinner" />Loading the tour…</div>}
      </main>
      <Drawer open={drawerOpen} title={title} crumb={crumb} onBack={top ? back : null} onClose={() => setDrawerOpen(false)}>
        <Suspense fallback={<div className="loading"><span className="spinner" /></div>}>
          {!D && mode === 'advanced' && BANNER[section] && <Boundary><SciBanner topic={BANNER[section]} ctx={ctx} /></Boundary>}
          {D ? <D.C ctx={ctx} {...top.props} /> : <Section ctx={ctx} />}
        </Suspense>
      </Drawer>
      <Timeline manifest={manifest} scene={scene} onSelect={pickScene} mode={mode} />
      {science && mode !== 'beginner' && (
        <Boundary><Suspense fallback={null}>
          <SciencePanel topic={science} onTopic={setScience} onClose={() => setScience(null)} ctx={ctx} events={events}
            onDeeper={({ mode: dm, section: sec }) => { const m = dm ?? mode; setScience(null); if (m !== mode) setMode(m); go(resolveSection(m, sec, isLive)) }} />
        </Suspense></Boundary>
      )}
    </div>
  )
}
