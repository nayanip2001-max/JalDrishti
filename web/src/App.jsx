import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import Timeline from './components/Timeline.jsx'
import Header from './components/Header.jsx'
import Story, { buildSteps } from './components/Story.jsx'
import { NavRail, Drawer, MapLegend } from './components/Shell.jsx'
import { Overview, EventView, FloodView, TemporalView, ImpactView, HowItWorks } from './components/Sections.jsx'
import { ObservationsView, FeaturesView, ModelView, ValidationView, DataView } from './components/Science.jsx'
import { DETAILS } from './components/Details.jsx'
import { Icon } from './components/ui.jsx'
import { readPixel } from './lib/evidence.js'
import { NAV, MODES, LENS_LAYERS, resolveSection } from './lib/modes.js'
import { peakOf, posts as postsOf } from './lib/format.js'

const DATA = `${import.meta.env.BASE_URL}data/`
const SECTIONS = { overview: Overview, event: EventView, flood: FloodView, temporal: TemporalView, impact: ImpactView, how: HowItWorks,
  observations: ObservationsView, features: FeaturesView, model: ModelView, validation: ValidationView, data: DataView }
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

export default function App() {
  const [events, setEvents] = useState([])
  const [eventId, setEventId] = useState(() => window.location.hash.slice(1) || 'assam')
  const [manifest, setManifest] = useState(null)
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
  const base = `${DATA}${eventId}/`

  useEffect(() => { fetch(DATA + 'events.json').then((r) => r.json()).then(setEvents).catch(() => setEvents([])) }, [])
  useEffect(() => {
    let live = true
    setManifest(null); setPick(null); setPixel(null); setDetails([])
    fetch(base + 'manifest.json').then((r) => r.json()).then((m) => {
      if (!live) return
      setManifest(m); setScene(peakOf(m))
      let seen = true
      try { seen = !!sessionStorage.getItem('jd-story-seen') } catch { /* storage blocked */ }
      if (store.get('jd-mode', 'beginner') === 'beginner' && !seen) setStory(0)  // guided tour on a beginner's first visit
    })
    window.location.hash = eventId
    return () => { live = false }
  }, [eventId, base])

  useEffect(() => {
    if (!pick || !scene || !manifest) return
    let live = true
    readPixel(base, scene, manifest, pick).then((p) => live && setPixel(p)).catch(() => live && setPixel(null))
    return () => { live = false }
  }, [pick, scene, manifest, base])

  const open = useCallback((type, props = {}) => {
    setDrawerOpen(true)
    setDetails((st) => (st.length && st[st.length - 1].type === type && type === 'pixel' ? st : [...st, { type, props }]))
  }, [])
  const back = () => setDetails((st) => st.slice(0, -1))
  const go = (id) => { setSection(id); setDetails([]); setDrawerOpen(true) }
  const setMode = (m) => { setModeState(m); store.set('jd-mode', m); setSection((s) => resolveSection(m, s)) }
  const switchLens = (l) => {
    setLens(l); setLayers((cur) => ({ ...LENS_LAYERS[l], compare: false, prob: l === 'science' && cur.prob }))
    setCompare(false); setDetails([]); setSection(l === 'impact' ? 'impact' : NAV[mode][0].id); setDrawerOpen(true)
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
    setStory(null); setCompare(false); setLayers(LENS_LAYERS[lens]); setScene(peakOf(manifest)); flyTo({ bounds: manifest.aoi.bounds })
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

  if (!manifest || !scene) return <div className="loading"><span className="spinner" />Loading NISAR observations…</div>

  const ctx = { manifest, scene, setScene, mode, lens, layers, setLayers, setLayersCompare, opacity, setOpacity, basemap, setBasemap,
    compare, setCompare, open, go, flyTo, pick, pixel, country: manifest.event.country, startTour: () => setStory(0), base }
  const top = details[details.length - 1]
  const navItem = NAV[mode].find((n) => n.id === section)
  const D = top && DETAILS[top.type]
  const Section = SECTIONS[section] ?? Overview
  const title = D ? (typeof D.title === 'function' ? D.title(top.props) : D.title) : navItem?.label
  const crumb = D ? navItem?.label : MODES.find((m) => m.id === mode)?.label + ' view'

  return (
    <div className={`app mode-${mode} lens-${lens} ${drawerOpen ? '' : 'drawer-closed'}`}>
      <Header events={events} eventId={eventId} onEvent={(id) => { setStory(null); setEventId(id) }} manifest={manifest} scene={scene}
        mode={mode} onMode={setMode} lens={lens} onLens={switchLens} onSearchPick={onSearchPick}
        onHelp={() => open('help')} onSeeing={() => open('seeing')} />
      <NavRail mode={mode} section={section} onSection={go} />
      <main className="stage">
        <MapView key={eventId} base={base} manifest={manifest} scene={scene} layers={layers} opacity={opacity}
          basemap={basemap} compare={compare} onPick={onPick} pick={pick} camera={camera} />
        <MapLegend manifest={manifest} layers={layers} mode={mode} scene={scene} />
        {mode === 'beginner' && <button className="seeing-fab" onClick={() => open('seeing')}><Icon name="eye" size={16} />What am I seeing?</button>}
        {!drawerOpen && <button className="drawer-tab" onClick={() => setDrawerOpen(true)}><Icon name="drawer" size={16} />{navItem?.label}</button>}
        {story !== null && <Story steps={steps} index={story} onIndex={setStory} onClose={closeStory} />}
      </main>
      <Drawer open={drawerOpen} title={title} crumb={crumb} onBack={top ? back : null} onClose={() => setDrawerOpen(false)}>
        {D ? <D.C ctx={ctx} {...top.props} /> : <Section ctx={ctx} />}
      </Drawer>
      <Timeline manifest={manifest} scene={scene} onSelect={setScene} mode={mode} />
    </div>
  )
}
