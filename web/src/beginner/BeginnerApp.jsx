// The Beginner view: a bright, picture-first "house" with four rooms.
//   Where is the water?  ·  Is my village flooded?  ·  Watch the flood  ·  How does it work?
// Same real data as the other levels (the App passes the map, the scene and the event); only the telling changes.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Tamizhi, Village, Crowd, Person, Rice, Gauge, ComicSpace, ComicRadar, ComicMirror, ComicCompare, DockIcon } from './art.jsx'
import { STRINGS, LANGS, PLACES } from './strings.js'
import { readPixel } from '../lib/evidence.js'
import { floodKm2, possibleKm2, peakOf, posts } from '../lib/format.js'
import { MODES } from '../lib/modes.js'
import './beginner.css'

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}
const TABS = ['where', 'village', 'watch', 'how']

// ---- numbers people can picture: acres in India, rai in Thailand; lakh for big Indian counts
function useFmt(lang, country) {
  return useMemo(() => {
    const loc = lang === 'ta' ? 'ta-IN' : 'en-IN'
    const t = STRINGS[lang]
    const round2 = (n) => { if (!n) return 0; const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p }
    const count = (n) => (country === 'India' && n >= 100000 ? `${(n / 1e5).toLocaleString(loc, { maximumFractionDigits: 1 })} ${t.lakh}` : round2(n).toLocaleString(loc))
    const land = (km2) => country === 'Thailand' ? { n: count(km2 * 625), u: t.rai } : { n: count(km2 * 247.1), u: t.acres }
    const date = (d, long = true) => new Date(d + 'T00:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' })
    // a range reads as one quantity: "3.2–6.6 lakh", "21,000–53,000"
    const range = (lo, hi) => {
      if (country === 'India' && lo >= 100000) return `${(lo / 1e5).toLocaleString(loc, { maximumFractionDigits: 1 })}–${(hi / 1e5).toLocaleString(loc, { maximumFractionDigits: 1 })} ${t.lakh}`
      return `${count(lo)}–${count(hi)}`
    }
    const landRange = (lo, hi) => country === 'Thailand' ? { n: range(lo * 625, hi * 625), u: t.rai } : { n: range(lo * 247.1, hi * 247.1), u: t.acres }
    return { count, range, land, landRange, date, km2: (k) => `${Math.round(k).toLocaleString(loc)} ${t.km2}` }
  }, [lang, country])
}

// ---- read aloud (browser voices only; the button hides when the device has no voice for the language)
function useSpeech(lang) {
  const [ok, setOk] = useState(false)
  const code = LANGS.find((l) => l.id === lang).speech
  useEffect(() => {
    const s = window.speechSynthesis
    if (!s) return
    const check = () => setOk(s.getVoices().some((v) => v.lang?.toLowerCase().startsWith(code.slice(0, 2))))
    check(); s.addEventListener?.('voiceschanged', check)
    return () => { s.removeEventListener?.('voiceschanged', check); s.cancel() }
  }, [code])
  const say = (text) => {
    const s = window.speechSynthesis; if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text); u.lang = code; u.rate = 0.9
    const v = s.getVoices().find((x) => x.lang?.toLowerCase().startsWith(code.slice(0, 2))); if (v) u.voice = v
    s.speak(u)
  }
  return ok ? say : null
}
function Listen({ say, text, t }) {
  if (!say) return null
  return <button className="bg-listen" onClick={(e) => { e.stopPropagation(); say(text) }} aria-label={t.listen} title={t.listen}>🔊</button>
}
function Bubble({ children, say, text, t, mood = 'happy', size = 86 }) {
  return (
    <div className="bg-bubble-row">
      <Tamizhi size={size} mood={mood} />
      <div className="bg-bubble"><p>{children}</p><Listen say={say} text={text ?? children} t={t} /></div>
    </div>
  )
}

// ---- a big centred card for any tile
function BigCard({ card, onClose, t, say }) {
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  return (
    <div className="bg-modal" onClick={onClose}>
      <div className={`bg-big tone-${card.tone}`} role="dialog" aria-modal="true" aria-label={card.title} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="bg-x" onClick={onClose} aria-label={t.close}>✕</button>
        <div className="bg-big-art">{card.art}</div>
        <h2>{card.title}</h2>
        <div className="bg-big-num">{card.num}<small>{card.unit}</small></div>
        {card.sub && <div className="bg-big-sub">{card.sub}</div>}
        <p className="bg-big-line">{card.line}</p>
        {card.extra}
        <Listen say={say} t={t} text={[card.title, card.num, card.unit, card.line].filter(Boolean).join('. ')} />
      </div>
    </div>
  )
}

// ---- room 1: where is the water?
function Where({ ctx, t, f, say, openBig }) {
  const s = ctx.scene, e = s.exposure
  const water = floodKm2(s), maybe = possibleKm2(s)
  const day = f.date(s.date)
  const L = f.land(water), Lm = f.land(maybe)
  const tiles = [
    { key: 'water', tone: 'sky', title: t.tWater, art: <Village water={0.6} compact title={t.tWater} />, num: L.n, unit: L.u, sub: maybe ? t.maybeMore(`${Lm.n} ${Lm.u}`) : null,
      big: { art: <Village water={0.66} title={t.tWater} />, line: t.waterLine(day), sub: `${f.km2(water)}${maybe ? ` · ${t.maybeMore(f.km2(maybe))}` : ''}` } },
    e && { key: 'people', tone: 'pink', title: t.tPeople, art: <Crowd n={4} />, num: f.range(e.low.people, e.high.people), unit: t.people,
      big: { art: <PeopleGrid low={e.low.people} high={e.high.people} t={t} f={f} />, line: t.peopleLine, extra: <p className="bg-note">🤝 {t.notHurt}</p> } },
    e && { key: 'farm', tone: 'leaf', title: t.tFarm, art: <Rice wet />, num: f.landRange(e.low.cropland_km2, e.high.cropland_km2).n, unit: f.land(1).u,
      big: { art: <Rice wet />, line: t.farmLine(day), sub: `${f.km2(e.low.cropland_km2)}–${f.km2(e.high.cropland_km2)}` } },
  ].filter(Boolean)
  return (
    <div className="bg-room">
      <Bubble say={say} t={t}>{t.hello} {t.helloWhere}</Bubble>
      <div className="bg-tiles">
        {tiles.map((x) => (
          <button key={x.key} className={`bg-tile tone-${x.tone}`} onClick={() => openBig({ title: x.title, num: x.num, unit: x.unit, tone: x.tone, ...x.big })}>
            <span className="bg-tile-art">{x.art}</span>
            <span className="bg-tile-t">{x.title}</span>
            <span className="bg-tile-n">{x.num} <small>{x.unit}</small></span>
            {x.sub && <span className="bg-tile-s">{x.sub}</span>}
            <span className="bg-tile-more" aria-hidden="true">⤢</span>
          </button>
        ))}
      </div>
    </div>
  )
}
function PeopleGrid({ low, high, t, f }) {
  const raw = high / 30
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const each = [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw) ?? 10 * p
  const sure = Math.round(low / each), all = Math.max(sure, Math.round(high / each))
  return (
    <div className="bg-pgrid">
      <div className="bg-pgrid-g" role="img" aria-label={`${f.range(low, high)} ${t.people}`}>
        {Array.from({ length: all }, (_, i) => <Person key={i} i={i} faded={i >= sure} />)}
      </div>
      <div className="bg-pgrid-k"><span><Person i={1} />{t.sure}</span><span><Person i={2} faded />{t.maybeShort}</span><span>{t.each(f.count(each))}</span></div>
    </div>
  )
}

// ---- room 2: is my village flooded?
function statusOf(px) {
  if (!px) return 'none'
  const c = px.cls
  if (c === 3 || c === 5) return 'flood'
  if (c === 4 || c === 6 || c === 7) return 'maybe'
  if (c === 2) return 'river'
  if (c === 1) return 'dry'
  if (c === 0) return 'none'
  return px.pFlood > 0.8 ? 'flood' : px.pFlood > 0.5 ? 'maybe' : 'dry'
}
function VillageRoom({ ctx, t, f, say, lang, goWatch }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState(null)
  const [busy, setBusy] = useState(false)
  const [place, setPlace] = useState(null)
  const [px, setPx] = useState(undefined)            // undefined = not asked, null = no data
  const { pick, scene, manifest, base } = ctx
  useEffect(() => {
    if (!pick) return
    let live = true
    setPx('loading')
    readPixel(base, scene, manifest, pick).then((p) => live && setPx(p)).catch(() => live && setPx(null))
    return () => { live = false }
  }, [pick, scene, manifest, base])
  const search = async (e) => {
    e.preventDefault(); if (!q.trim()) return
    setBusy(true); setHits(null)
    const [w, s, ea, n] = manifest.aoi.bounds
    const u = new URL('https://nominatim.openstreetmap.org/search')
    u.search = new URLSearchParams({ format: 'jsonv2', q, limit: '5', viewbox: `${w},${n},${ea},${s}`, bounded: '1', 'accept-language': lang === 'ta' ? 'ta,en' : 'en' })
    try {
      const r = await fetch(u, { headers: { Accept: 'application/json' } })
      const j = r.ok ? await r.json() : []
      const list = j.map((p) => ({ name: p.name || p.display_name.split(',')[0], full: p.display_name, ll: { lng: +p.lon, lat: +p.lat } }))
      setHits(list)
      if (list.length === 1) choose(list[0])
    } catch { setHits([]) }
    setBusy(false)
  }
  const choose = (h) => { setPlace(h.name); setHits(null); ctx.flyTo({ center: [h.ll.lng, h.ll.lat], zoom: 13 }); ctx.pickAt(h.ll) }
  const st = px === 'loading' ? null : px === undefined ? undefined : statusOf(px)
  const ART = { flood: <Village water={0.62} />, maybe: <Village water={0.4} maybe />, dry: <Village />, river: <Village />, none: <Village rain /> }
  const WORD = { flood: t.ansFlood, maybe: t.ansMaybe, dry: t.ansDry, river: t.ansRiver, none: t.ansNone }
  return (
    <div className="bg-room">
      <form className="bg-search" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.villageAsk} aria-label={t.villageAsk} />
        <button type="submit" disabled={busy}>{busy ? '…' : `🔎 ${t.find}`}</button>
      </form>
      <p className="bg-or">👆 {t.orTap}</p>
      {hits && (hits.length ? <div className="bg-hits">{hits.map((h) => <button key={h.full} onClick={() => choose(h)}><b>{h.name}</b><small>{h.full}</small></button>)}</div>
        : <p className="bg-note">{t.notFound}</p>)}
      {px === 'loading' && <Bubble t={t} mood="think">{t.searching}</Bubble>}
      {st === undefined && !hits && <Bubble t={t} mood="think" say={say}>{t.orTap} 🗺️</Bubble>}
      {st && (
        <div className={`bg-answer st-${st}`}>
          <div className="bg-answer-art">{ART[st]}</div>
          <div className="bg-answer-b">
            {place && <small className="bg-answer-place">📍 {place}</small>}
            <b>{WORD[st]}</b>
            <span>{t.onDay(f.date(scene.date))}</span>
            <Listen say={say} t={t} text={`${place ?? ''} ${WORD[st]} ${t.onDay(f.date(scene.date))}`} />
          </div>
          <div className="bg-answer-act">
            <button className="bg-btn" onClick={goWatch}>📅 {t.otherDays}</button>
            <small>{t.tapAgain}</small>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- room 3: watch the flood (flip-book through one track's passes)
function Watch({ ctx, t, f, say, lang }) {
  const loc = lang === 'ta' ? 'ta-IN' : 'en-GB'
  const m = ctx.manifest
  const track = useMemo(() => (m.event.live ? posts(m).at(-1) : peakOf(m)).track, [m])
  const days = useMemo(() => m.scenes.filter((s) => s.track === track && s.cls).sort((a, b) => a.date.localeCompare(b.date)), [m, track])
  const max = Math.max(1, ...days.map(floodKm2))
  const i = Math.max(0, days.findIndex((s) => s.id === ctx.scene.id))
  const s = days[i] ?? ctx.scene
  const [playing, setPlaying] = useState(false)
  // warm the browser cache with this track's flood pictures, so the flip-book steps instantly
  useEffect(() => { days.forEach((d) => { const im = new Image(); im.src = ctx.base + d.cls }) }, [days, ctx.base])
  useEffect(() => {
    if (!days.some((d) => d.id === ctx.scene.id)) ctx.setScene(days.find((d) => d.kind === 'post') ?? days[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => {
      const k = days.findIndex((d) => d.id === ctx.scene.id)
      if (k >= days.length - 1) { setPlaying(false); return }
      ctx.setScene(days[k + 1])
    }, 1900)
    return () => clearInterval(h)
  }, [playing, days, ctx])
  const phases = m.event.phases ?? []
  const pIdx = Math.max(0, phases.findIndex((p) => s.date >= p.from && s.date < p.to))
  const phase = s.kind === 'null_test' || pIdx === 0 ? 'before' : pIdx === 1 ? 'during' : 'after'
  const km = floodKm2(s), isPeak = km === max && km > 0
  const L = f.land(km)
  const d = new Date(s.date + 'T00:00:00Z')
  return (
    <div className="bg-room">
      <div className="bg-watch">
        <div className={`bg-cal ph-${phase}`}>
          <span className="bg-cal-top">{d.toLocaleDateString(loc, { month: 'long', timeZone: 'UTC' })}</span>
          <span className="bg-cal-day">{d.getUTCDate()}</span>
          <span className="bg-cal-y">{d.getUTCFullYear()}</span>
          <span className="bg-cal-ph">{t[phase]}</span>
        </div>
        <div className="bg-gauge-w">
          <Gauge level={km / max} label={`${t.level}: ${L.n} ${L.u}`} />
          <b>{L.n} <small>{L.u}</small></b>
        </div>
        <div className="bg-watch-tz">{isPeak && <span className="bg-pop">{t.mostWater}</span>}<Tamizhi size={78} mood={isPeak ? 'excited' : 'happy'} /></div>
      </div>
      <div className="bg-play-row">
        <button className="bg-play" onClick={() => { if (!playing && i >= days.length - 1) ctx.setScene(days[0]); setPlaying(!playing) }} aria-label={playing ? t.pause : t.play}>
          {playing ? '❚❚' : '▶'} <span>{playing ? t.pause : t.play}</span>
        </button>
        <Listen say={say} t={t} text={`${f.date(s.date)}. ${t[phase]}. ${L.n} ${L.u}`} />
      </div>
      <div className="bg-strip" role="listbox" aria-label={t.watch}>
        {days.map((x) => {
          const k = floodKm2(x)
          const ph = x.kind === 'null_test' ? 'before' : (() => { const j = phases.findIndex((p) => x.date >= p.from && x.date < p.to); return j <= 0 ? 'before' : j === 1 ? 'during' : 'after' })()
          return (
            <button key={x.id} role="option" aria-selected={x.id === s.id} className={`bg-chip ph-${ph} ${x.id === s.id ? 'on' : ''}`} onClick={() => { setPlaying(false); ctx.setScene(x) }}>
              <i style={{ '--h': `${Math.max(8, (k / max) * 100)}%` }} />
              <b>{new Date(x.date + 'T00:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</b>
            </button>
          )
        })}
      </div>
      <p className="bg-note">🛰️ {t.modelledNote}</p>
    </div>
  )
}

// ---- room 4: how does it work? (comic)
const COMIC = [ComicSpace, ComicRadar, ComicMirror, ComicCompare]
const CAPS = ['c1', 'c2', 'c3', 'c4']
// The comic's pictures fill the big stage (where the map is); the side shows the words and the buttons.
function ComicStage({ k, t }) {
  const P = COMIC[k]
  return <div className="bg-stage" key={k} role="img" aria-label={t[CAPS[k]]}><P /></div>
}
function How({ t, say, onDone, k, setK }) {
  const panels = CAPS.map((c) => t[c])
  const last = k === panels.length - 1
  return (
    <div className="bg-room">
      <div className="bg-comic" key={k}>
        <div className="bg-comic-art bg-comic-mini">{(() => { const P = COMIC[k]; return <P /> })()}</div>
        <p className="bg-comic-cap"><span className="bg-comic-n">{k + 1}</span>{panels[k]}<Listen say={say} t={t} text={panels[k]} /></p>
      </div>
      <div className="bg-comic-nav">
        <button className="bg-btn ghost" onClick={() => setK(k - 1)} disabled={k === 0}>← {t.back}</button>
        <span className="bg-dots">{panels.map((_, j) => <i key={j} className={j === k ? 'on' : ''} />)}</span>
        {last ? <button className="bg-btn" onClick={onDone}>🏡 {t.cEnd}</button> : <button className="bg-btn" onClick={() => setK(k + 1)}>{t.next} →</button>}
      </div>
    </div>
  )
}

// ---- the house
export default function BeginnerApp({ ctx, events, eventId, onEvent, onMode, onHome, map, switching, loadError, onStay }) {
  const [lang, setLangS] = useState(() => (store.get('jd-lang', 'en') === 'ta' ? 'ta' : 'en'))
  const [tab, setTab] = useState(() => {
    let seen = true
    try { seen = !!sessionStorage.getItem('jd-story-seen'); sessionStorage.setItem('jd-story-seen', '1') } catch { /* storage blocked */ }
    return seen ? 'where' : 'how'
  })
  const [big, setBig] = useState(null)
  const [comicK, setComicK] = useState(0)
  const t = STRINGS[lang]
  const f = useFmt(lang, ctx.manifest.event.country)
  const say = useSpeech(lang)
  const setLang = (l) => { setLangS(l); store.set('jd-lang', l) }
  const firstPick = useRef(ctx.pick)
  useEffect(() => { if (ctx.pick && ctx.pick !== firstPick.current) setTab('village') }, [ctx.pick])
  const live = ctx.manifest.event.live
  const age = Math.round((Date.now() - new Date(ctx.scene.date + 'T00:00:00Z')) / 864e5)
  const place = (id) => PLACES[id]?.[lang] ?? events.find((e) => e.id === id)?.title ?? id

  return (
    <div className={`bg-app mode-beginner lang-${lang}`} lang={lang}>
      <header className="bg-top">
        <button className="bg-brand" onClick={onHome} disabled={!onHome} title={t.home} aria-label={`JalDrishti: ${t.home}`}>
          <span className="bg-logo"><Tamizhi size={40} /></span><b>JalDrishti</b>
        </button>
        <nav className="bg-events" aria-label="Flood event">
          {(events.length ? events : [{ id: eventId }]).map((e) => (
            <button key={e.id} className={e.id === eventId ? 'on' : ''} onClick={() => e.id !== eventId && onEvent(e.id)} aria-pressed={e.id === eventId}>
              {place(e.id)}{e.live && <i className="bg-live">LIVE</i>}
            </button>
          ))}
        </nav>
        <div className="bg-top-r">
          <div className="bg-lang" role="radiogroup" aria-label={t.lang}>
            {LANGS.map((l) => <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>)}
          </div>
          <div className="bg-modes modes" role="radiogroup" aria-label="Detail level">
            {MODES.map((m) => <button key={m.id} role="radio" aria-checked={m.id === 'beginner'} className={m.id === 'beginner' ? 'on' : ''} onClick={() => onMode(m.id)} title={m.who}><b>{m.label}</b></button>)}
          </div>
        </div>
      </header>

      <main className="bg-map">
        {map}
        {tab === 'how' && <ComicStage k={comicK} t={t} />}
        <div className="bg-badge">🛰️ <span><b>{t.picture}</b> · {f.date(ctx.scene.date)}{live && ` · ${t.daysAgo(age)}`}</span><small>{t.notLive}</small></div>
        <div className="bg-legend">
          <span><i className="lg-flood" />{t.flood}</span><span><i className="lg-maybe" />{t.maybe}</span><span><i className="lg-river" />{t.river}</span>
        </div>
        {switching && (
          <div className="bg-loading" role="status">
            <Tamizhi size={110} mood={loadError ? 'think' : 'happy'} />
            <p>{loadError ? <button className="bg-btn" onClick={onStay}>↩︎</button> : t.loadingEvent(place(eventId))}</p>
          </div>
        )}
      </main>

      <section className="bg-side" aria-live="polite">
        <h1 className="bg-h1">{t[tab]}</h1>
        {tab === 'where' && <Where ctx={ctx} t={t} f={f} say={say} openBig={setBig} />}
        {tab === 'village' && <VillageRoom ctx={ctx} t={t} f={f} say={say} lang={lang} goWatch={() => setTab('watch')} />}
        {tab === 'watch' && <Watch ctx={ctx} t={t} f={f} say={say} lang={lang} />}
        {tab === 'how' && <How t={t} say={say} k={comicK} setK={setComicK} onDone={() => { setTab('village'); setComicK(0) }} />}
      </section>

      <nav className="bg-dock" aria-label="Sections">
        {TABS.map((id) => (
          <button key={id} className={`dk-${id} ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="bg-dock-i"><DockIcon kind={id} /></span><span className="bg-dock-l">{t[id]}</span>
          </button>
        ))}
      </nav>

      {big && <BigCard card={big} onClose={() => setBig(null)} t={t} say={say} />}
    </div>
  )
}
