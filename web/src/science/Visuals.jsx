// Visuals for the "How do we know?" science panel. Two kinds, always labelled:
//  * REAL: crops exported from the actual pipeline by scripts/export_science.py (Assam, track 40), or numbers read
//    from the event manifests (validation, model, exposure).
//  * ILLUSTRATION: SVG diagrams that explain a concept; they are drawn, not observed.
import { useEffect, useId, useMemo, useState } from 'react'

const SCI = `${import.meta.env.BASE_URL}science/assam/`
const DATA = `${import.meta.env.BASE_URL}data/`
const C = { cy: '#22d3ee', ice: '#bae6fd', tq: '#2dd4bf', amber: '#f59e0b', blue: '#1e40af', text: '#e6edf7', muted: '#94a3b8', navy: '#0b1426', line: '#1e3a5f' }

export function Figure({ kind, caption, children }) {
  return (
    <figure className="sx-fig">
      <div className="sx-fig-b">{children}</div>
      <figcaption><span className={`sx-badge ${kind}`}>{kind === 'real' ? 'Real NISAR data' : kind === 'data' ? 'Real project figures' : 'Illustration'}</span>{caption}</figcaption>
    </figure>
  )
}

// ---------- shared SVG bits ----------
function Defs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050a18" /><stop offset="1" stopColor="#0c1a33" /></linearGradient>
      <linearGradient id={`${id}beam`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.cy} stopOpacity=".32" /><stop offset="1" stopColor={C.cy} stopOpacity=".05" /></linearGradient>
      <linearGradient id={`${id}water`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d4ed8" /><stop offset="1" stopColor="#0b2a6b" /></linearGradient>
      <marker id={`${id}ar`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={C.cy} /></marker>
      <marker id={`${id}am`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={C.amber} /></marker>
      <marker id={`${id}aw`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e2e8f0" /></marker>
    </defs>
  )
}
const Label = ({ x, y, children, anchor = 'start', size = 12, color = C.text, weight = 500 }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={color} fontWeight={weight} fontFamily="Inter, system-ui, sans-serif">{children}</text>
)
const Tree = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}><rect x="-2" y="-14" width="4" height="16" fill="#5b3a1e" /><circle cx="0" cy="-20" r="10" fill="#15803d" /><circle cx="-7" cy="-14" r="7" fill="#166534" /><circle cx="7" cy="-14" r="7" fill="#166534" /></g>
)

// ---------- 1. NISAR orbit + radar ----------
export function NisarOrbit() {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 640 380" className="sx-svg" role="img" aria-labelledby={`${id}t`}>
      <title id={`${id}t`}>Illustration: NISAR in orbit sends L-band radar pulses through clouds; land scatters some energy back, vegetation scatters it in all directions, smooth water reflects it away like a mirror.</title>
      <Defs id={id} />
      <rect width="640" height="380" fill={`url(#${id}sky)`} />
      {[[40, 30], [120, 70], [590, 40], [520, 110], [300, 20], [420, 60], [60, 140]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.2" fill="#cbd5e1" opacity=".7" />)}
      <path d="M-20 110 Q 320 10 660 110" fill="none" stroke={C.ice} strokeOpacity=".35" strokeDasharray="4 6" />
      <Label x={560} y={92} size={11} color={C.muted}>orbit ≈ 747 km</Label>
      {/* satellite: bus, solar array, 12 m reflector on its boom */}
      <g transform="translate(150 70)">
        <rect x="-60" y="-6" width="44" height="12" rx="2" fill="#1e3a8a" stroke="#93c5fd" strokeWidth=".8" />
        <path d="M-56 -6v12M-48 -6v12M-40 -6v12M-32 -6v12M-24 -6v12" stroke="#93c5fd" strokeWidth=".5" />
        <rect x="-14" y="-10" width="22" height="20" rx="3" fill="#cbd5e1" />
        <line x1="8" y1="0" x2="34" y2="14" stroke="#cbd5e1" strokeWidth="2" />
        <ellipse cx="44" cy="22" rx="24" ry="9" fill="#e2e8f0" stroke="#94a3b8" transform="rotate(-25 44 22)" />
        <Label x={-60} y={-16} size={12} weight={600}>NISAR</Label>
      </g>
      {/* beam: one wide swath covering all three surfaces */}
      <path d="M192 96 L40 298 L600 298 Z" fill={`url(#${id}beam)`} />
      {[[100, 290], [285, 262], [470, 294]].map(([x, y], k) => <path key={k} className="sx-pulse" style={{ animationDelay: `${k * 0.4}s` }} d={`M194 96 L${x} ${y}`} stroke={C.cy} strokeWidth="2.2" fill="none" strokeDasharray="10 26" markerEnd={`url(#${id}ar)`} />)}
      <Label x={22} y={128} size={11} color={C.cy}>L-band pulses, λ ≈ 24 cm</Label>
      {/* clouds across the beam */}
      <g opacity=".85">
        {[[90, 214], [130, 206], [250, 218], [290, 210], [400, 216], [440, 208], [530, 214]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="28" ry="11" fill="#e2e8f0" opacity=".5" />)}
      </g>
      <Label x={22} y={246} size={11} color="#e2e8f0">clouds and rain: L-band passes straight through</Label>
      {/* ground: land | vegetation | water */}
      <path d="M0 300 Q 320 286 640 300 L640 380 L0 380 Z" fill="#3f2d1d" />
      <path d="M0 300 Q 120 296 210 296 L210 380 L0 380Z" fill="#6b4f2a" />
      <path d="M40 300l8-4 8 3 7-5 9 4 8-3 9 5 8-4 9 3 8-4 8 4 9-3 8 4" stroke="#a8875a" fill="none" />
      {[240, 262, 284, 306, 328].map((x) => <Tree key={x} x={x} y={298} s={1.1} />)}
      <path d="M380 296 L640 300 L640 380 L380 380Z" fill={`url(#${id}water)`} />
      <path d="M392 298h240" stroke="#93c5fd" strokeOpacity=".5" />
      {/* returns */}
      <path d="M104 290 L176 108" stroke="#e2e8f0" strokeWidth="1.8" strokeDasharray="5 4" markerEnd={`url(#${id}aw)`} />
      {[[60, 262], [140, 266]].map(([x, y], i) => <path key={i} d={`M104 292 L${x} ${y}`} stroke="#e2e8f0" strokeOpacity=".55" markerEnd={`url(#${id}aw)`} />)}
      <path d="M288 262 L204 110" stroke={C.tq} strokeWidth="1.8" strokeDasharray="5 4" markerEnd={`url(#${id}ar)`} />
      {[[250, 240], [330, 238], [312, 228]].map(([x, y], i) => <path key={i} d={`M288 264 L${x} ${y}`} stroke={C.tq} strokeOpacity=".65" markerEnd={`url(#${id}ar)`} />)}
      <path d="M474 296 L606 180" stroke={C.amber} strokeWidth="2.2" markerEnd={`url(#${id}am)`} />
      <Label x={618} y={170} anchor="end" size={11} color={C.amber}>reflected away</Label>
      <Label x={14} y={330} size={12} weight={600}>Bare / dry land</Label>
      <Label x={14} y={346} size={11} color={C.muted}>rough: part of the echo returns</Label>
      <Label x={226} y={330} size={12} weight={600}>Vegetation</Label>
      <Label x={226} y={346} size={11} color={C.muted}>scatters in all directions</Label>
      <Label x={404} y={330} size={12} weight={600}>Smooth water</Label>
      <Label x={404} y={346} size={11} color={C.muted}>mirror: echo bounces away</Label>
    </svg>
  )
}

// ---------- 2. three surfaces ----------
function Panel({ x, title, kind, ret, look, lookFill, id }) {
  const g = { land: 1, veg: 2, water: 3 }[kind]
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="6" y="6" width="196" height="300" rx="12" fill="#0d1a31" stroke={C.line} />
      <Label x={104} y={30} anchor="middle" size={13} weight={600}>{title}</Label>
      <path d="M44 52 L100 160" stroke={C.cy} strokeWidth="2.5" markerEnd={`url(#${id}ar)`} />
      <Label x={16} y={46} size={10} color={C.cy}>incoming pulse</Label>
      {g === 1 && <>
        <path d="M20 176 l12 -8 10 6 12 -9 14 7 10 -6 14 8 12 -7 12 6 12 -8 14 7 12 -5 14 6 12 -4" stroke="#a8875a" strokeWidth="2" fill="none" />
        <rect x="16" y="176" width="176" height="40" fill="#6b4f2a" />
        {[[60, 70], [104, 64], [150, 80], [76, 112]].map(([a, b], i) => <path key={i} d={`M104 168 L${a} ${b + 30}`} stroke="#e2e8f0" strokeOpacity={i === 0 ? 1 : 0.55} strokeWidth={i === 0 ? 2 : 1.2} markerEnd={`url(#${id}aw)`} />)}
      </>}
      {g === 2 && <>
        <rect x="16" y="176" width="176" height="40" fill="#3f2d1d" />
        {[40, 72, 104, 136, 168].map((tx) => <Tree key={tx} x={tx} y={176} s={1.25} />)}
        {[[40, 96], [66, 112], [150, 100], [176, 130], [120, 84]].map(([a, b], i) => <path key={i} d={`M104 150 L${a} ${b}`} stroke={C.tq} strokeOpacity={i === 0 ? 1 : 0.6} strokeWidth={i === 0 ? 2 : 1.2} markerEnd={`url(#${id}ar)`} />)}
      </>}
      {g === 3 && <>
        <rect x="16" y="176" width="176" height="40" fill={`url(#${id}water)`} />
        <path d="M16 176h176" stroke="#93c5fd" strokeOpacity=".7" />
        <path d="M104 176 L176 62" stroke={C.amber} strokeWidth="2.5" markerEnd={`url(#${id}am)`} />
        <path d="M100 172 L84 150" stroke="#e2e8f0" strokeOpacity=".35" markerEnd={`url(#${id}aw)`} />
      </>}
      <Label x={20} y={238} size={11} color={C.muted}>Back to the satellite</Label>
      <rect x="20" y="246" width="168" height="8" rx="4" fill="#1e293b" />
      <rect x="20" y="246" width={168 * ret} height="8" rx="4" fill={C.cy} />
      <Label x={20} y={278} size={11} color={C.muted}>Looks in a radar image</Label>
      <rect x="150" y="266" width="38" height="20" rx="4" fill={lookFill} stroke="#475569" />
      <Label x={20} y={296} size={12} weight={600}>{look}</Label>
    </g>
  )
}
export function ThreeSurfaces() {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 632 312" className="sx-svg" role="img" aria-labelledby={`${id}t`}>
      <title id={`${id}t`}>Illustration comparing radar reflections: dry land returns a medium echo (grey), vegetation scatters strongly (bright, especially in HV), smooth water reflects the pulse away (dark).</title>
      <Defs id={id} />
      <Panel id={id} x={0} title="1 · Dry land" kind="land" ret={0.5} look="Medium grey" lookFill="#8a8f98" />
      <Panel id={id} x={212} title="2 · Vegetation" kind="veg" ret={0.75} look="Bright (strong in HV)" lookFill="#d4d7dc" />
      <Panel id={id} x={424} title="3 · Smooth water" kind="water" ret={0.08} look="Dark (HH < −15 dB)" lookFill="#0b0d12" />
    </svg>
  )
}

// ---------- 3. before / during / after (real) ----------
export function BeforeDuringAfter({ sci }) {
  const [pt, setPt] = useState(null)
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    setPt({ x: (p.clientX - r.left) / r.width, y: (p.clientY - r.top) / r.height })
  }
  const d = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const panes = [
    ['Before', 'bda_before', `Reference: median of ${sci.refs.map(d).join(', ')}`],
    ['During', 'bda_during', `${d(sci.during)}: flood classes on top`],
    ['After', 'bda_after', `${d(sci.after)}: water has drained`],
  ]
  return (
    <div className="sx-bda">
      {panes.map(([t, f, s], i) => (
        <div key={t} className="sx-bda-p">
          <div className="sx-bda-h"><b>{t}</b><span aria-hidden="true">{i < 2 ? '→' : ''}</span></div>
          <div className="sx-bda-img" onPointerMove={move} onPointerLeave={() => setPt(null)} onTouchMove={move}>
            <img src={`${SCI}${f}.webp`} alt={`${t}: NISAR HH radar image of the same 15 km area in Upper Assam${i ? ' with JalDrishti flood classes' : ''}`} loading="lazy" />
            {pt && <span className="sx-cross" style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }} />}
          </div>
          <small>{s}</small>
        </div>
      ))}
      <div className="sx-key">{[['#22d3ee', 'Flood'], ['#f59e0b', 'Maybe flood'], ['#a78bfa', 'Flood under plants'], ['#1e40af', 'River / lake (not flood)'], ['#94a3b8', 'Uncertain']].map(([c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
    </div>
  )
}

// ---------- 4. preprocessing pipeline ----------
function RawGrid() {
  // native 10 m pixels with speckle; the 2 x 2 blocks that are averaged into one 20 m pixel are outlined
  const cells = useMemo(() => {
    let s = 7
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    return Array.from({ length: 64 }, (_, i) => { const base = (i % 8) < 4 ? 0.25 : 0.62; return Math.min(1, Math.max(0, base + (rnd() - 0.5) * 0.7)) })
  }, [])
  return (
    <svg viewBox="0 0 160 160" className="sx-svg" role="img" aria-label="Illustration: a grid of native 10 m pixels with random speckle; each outlined 2 by 2 block is averaged into one 20 m pixel.">
      {cells.map((v, i) => <rect key={i} x={(i % 8) * 20} y={Math.floor(i / 8) * 20} width="20" height="20" fill={`rgb(${v * 255},${v * 255},${v * 255})`} />)}
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={(i % 4) * 40 + 1} y={Math.floor(i / 4) * 40 + 1} width="38" height="38" fill="none" stroke={C.cy} strokeWidth="1.5" />)}
    </svg>
  )
}
export function Pipeline({ sci }) {
  const steps = [
    ['1', 'NISAR GCOV, native grid', <RawGrid key="r" />, `${sci.native_spacing_m} m pixels; outlined 2×2 blocks (illustration)`, 'ill'],
    ['2', 'Subset + multilook', <img key="m" src={`${SCI}proc_multilook_zoom.webp`} alt="Real NISAR HH at 20 m after 2 by 2 multilooking, before filtering: grainy speckle" />, `2×2 mean in linear power → ${sci.grid_m} m (≈ ${sci.looks_mean} native looks × 4)`, 'real'],
    ['3', 'Lee speckle filter', <img key="l" src={`${SCI}proc_lee_zoom.webp`} alt="Real NISAR HH after the 5 by 5 Lee filter: speckle reduced, edges kept" />, `${sci.lee.window}×${sci.lee.window} window, ENL ${sci.lee.enl}`, 'real'],
    ['4', 'Prepared layers', <img key="p" src={`${SCI}proc_reference.webp`} alt="Real pre-flood reference: per-pixel median of three earlier passes, in dB" />, 'dB on the event grid + pre-flood reference median', 'real'],
  ]
  return (
    <div className="sx-pipe">
      {steps.map(([n, t, img, s, k], i) => (
        <div key={n} className="sx-pipe-s">
          <div className="sx-pipe-img">{img}<span className={`sx-mini ${k}`}>{k === 'real' ? 'Real' : 'Illustration'}</span></div>
          <b><i>{n}</i>{t}</b>
          <small>{s}</small>
          {i < steps.length - 1 && <span className="sx-pipe-ar" aria-hidden="true">→</span>}
        </div>
      ))}
    </div>
  )
}

// ---------- 5. feature stack (real crops) ----------
const FEATURE_IMG = {
  hh_rel_p10: 'feat_hh_rel_p10', hh_rel_p50: 'feat_hh_rel_p10', hv_rel_p50: 'feat_hv_rel_p50', hh_minus_hv: 'feat_hh_minus_hv',
  d_hh: 'feat_d_hh', d_hv: 'feat_d_hv', hh_s7: 'feat_hh_s7', d_hh_m7: 'feat_d_hh_m15', d_hh_m15: 'feat_d_hh_m15',
  hand: 'feat_hand', slope: 'feat_slope', jrc: 'feat_jrc', worldcover: 'feat_worldcover',
}
const STACK = [
  ['hh_rel_p10', 'HH (scene-relative)'], ['hv_rel_p50', 'HV (scene-relative)'], ['hh_minus_hv', 'HH − HV'], ['d_hh', 'Change in HH'],
  ['hh_s7', 'Texture (7×7)'], ['hand', 'HAND'], ['slope', 'Slope'], ['worldcover', 'Land cover'],
]
export function FeatureStack({ features }) {
  const [on, setOn] = useState(null)
  const desc = (n) => features?.find((f) => f.name === n)?.description
  return (
    <div className="sx-stack">
      <div className="sx-stack-3d" aria-hidden="true">
        {STACK.map(([n], i) => (
          <img key={n} src={`${SCI}${FEATURE_IMG[n]}.webp`} alt="" className={on === n ? 'on' : ''}
            style={{ '--i': i, '--n': STACK.length }} />
        ))}
      </div>
      <div className="sx-stack-l">
        <ul>
          {STACK.map(([n, l]) => (
            <li key={n}><button className={on === n ? 'on' : ''} onPointerEnter={() => setOn(n)} onPointerLeave={() => setOn(null)} onFocus={() => setOn(n)} onBlur={() => setOn(null)}
              onClick={() => setOn(on === n ? null : n)} aria-describedby="sx-stack-d">{l}<code>{n}</code></button></li>
          ))}
        </ul>
        <p id="sx-stack-d" className="sx-stack-d" aria-live="polite">{on ? desc(on) : 'Point at a layer to lift it out of the stack. Each pixel gets one value from every layer.'}</p>
        <div className="sx-stack-out">→ 13 numbers per pixel → LightGBM</div>
      </div>
    </div>
  )
}
export function Importance({ features }) {
  if (!features?.length) return null
  const tot = features.reduce((s, f) => s + f.gain, 0)
  const rows = [...features].sort((a, b) => b.gain - a.gain)
  return (
    <div className="sx-bars" role="table" aria-label="Feature importance (share of total split gain) in the deployed model">
      {rows.map((f) => (
        <div key={f.name} role="row" className="sx-bar">
          <code role="cell">{f.name}</code>
          <span role="cell" className="sx-bar-t"><i style={{ width: `${(100 * f.gain) / rows[0].gain}%` }} /></span>
          <b role="cell">{((100 * f.gain) / tot).toFixed(1)}%</b>
        </div>
      ))}
    </div>
  )
}

// ---------- 6. detector flowchart (only implemented stages) ----------
export function Flowchart({ model }) {
  const box = (t, s, k = '') => <div className={`sx-fc-b ${k}`}><b>{t}</b><small>{s}</small></div>
  return (
    <div className="sx-fc" role="img" aria-label="Flowchart of the implemented detector: satellite features, feature extraction, a bright or steep gate, LightGBM, the physics rescue rule, comparison with the pre-flood reference, removal of permanent water, and the final classes; a separate physics rule detects flooded vegetation.">
      {box('Satellite + terrain inputs', 'NISAR HH, HV (this pass + same-track pre-flood passes) · HAND · slope · JRC water · WorldCover')}
      <span className="sx-fc-a" />
      {box('Feature extraction', '13 per-pixel features (Topic 5)')}
      <span className="sx-fc-a" />
      {box('Gate', 'HH > −6 dB or slope ≥ 10° → not water (p = 0)', 'sx-rule')}
      <span className="sx-fc-a" />
      {box('LightGBM classifier', `${model?.trees ?? '—'} trees → P(water now)`, 'sx-ml')}
      <span className="sx-fc-a" />
      {box('Physics rescue rule', 'HH < −15 dB and HAND < 10 m → p = max(p, 0.51)', 'sx-rule')}
      <span className="sx-fc-a" />
      {box('Change vs before', 'P(open flood) = P(water now) × (1 − P(water before)); JRC ≥ 50% = permanent water')}
      <span className="sx-fc-a" />
      <div className="sx-fc-row">
        {box('Final flood classes', 'confident > 0.8 · possible 0.5–0.8 · uncertain 0.35–0.5', 'sx-out')}
        <div className="sx-fc-side">{box('Flooded-vegetation rule', 'HH rises ≥ 3σ (double bounce), HV barely changes; vegetated land cover only', 'sx-rule')}<span className="sx-fc-l">joins the classes</span></div>
      </div>
      <div className="sx-fc-key"><span className="sx-ml">Machine learning</span><span className="sx-rule">Physics rule</span></div>
    </div>
  )
}

// ---------- 7. flood map legend (real crop) ----------
const CLASS_TEXT = {
  3: ['Flood', 'Confident new open water: P > 0.8'],
  4: ['Maybe flood', 'Possible new open water: P 0.5–0.8'],
  5: ['Flood under plants', 'Confident flooded vegetation (double bounce)'],
  6: ['Maybe flood under plants', 'Possible flooded vegetation'],
  2: ['River / lake', 'Permanent or pre-existing water: not counted as flood'],
  7: ['Uncertain', 'Combined flood probability 0.35–0.5'],
}
export function MapLegendSample({ classes, sci }) {
  const a = sci.areas_km2?.during ?? {}
  return (
    <div className="sx-legend">
      <img src={`${SCI}bda_during.webp`} alt="Real JalDrishti flood map for a 15 km area of Upper Assam on 22 July 2026 over the NISAR HH image" />
      <ul>
        {[3, 4, 5, 6, 2, 7].map((k) => (
          <li key={k}><i style={{ background: classes?.[k]?.color }} /><span><b>{CLASS_TEXT[k][0]}</b><small>{CLASS_TEXT[k][1]}</small></span>
            {a[k] != null && <em>{a[k]} km²</em>}</li>
        ))}
      </ul>
    </div>
  )
}

// ---------- 8. IoU: two masks drawn to scale from real precision and recall ----------
function lensArea(r1, r2, d) {
  if (d >= r1 + r2) return 0
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
  return a + b - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2))
}
export function IoUVenn({ events, current }) {
  const [mans, setMans] = useState({})
  const [ev, setEv] = useState(current)
  const [pick, setPick] = useState(null)
  const [show, setShow] = useState('inter')
  useEffect(() => {
    let live = true
    Promise.all((events.length ? events : [{ id: current }]).map((e) => fetch(`${DATA}${e.id}/manifest.json`).then((r) => r.json()).then((m) => [e.id, m]).catch(() => null)))
      .then((xs) => live && setMans(Object.fromEntries(xs.filter(Boolean))))
    return () => { live = false }
  }, [events, current])
  const v = mans[ev]?.validation
  const rows = v ? Object.entries(v.rules).flatMap(([rule, ds]) => Object.entries(ds).map(([date, s]) => ({ rule, date, ...s }))) : []
  const sel = rows.find((r) => pick && r.rule === pick.rule && r.date === pick.date) ?? rows.find((r) => r.rule === v?.selected) ?? rows[0]
  // TP = 1; FP = TP (1/P - 1); FN = TP (1/R - 1): areas to scale
  const geo = useMemo(() => {
    if (!sel) return null
    const tp = 1, fp = 1 / sel.precision - 1, fn = 1 / sel.recall - 1
    const k = 17000 / (tp + fp + fn)
    const r1 = Math.sqrt(((tp + fp) * k) / Math.PI), r2 = Math.sqrt(((tp + fn) * k) / Math.PI), want = tp * k
    let lo = Math.abs(r1 - r2), hi = r1 + r2
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (lensArea(r1, r2, m) > want) lo = m; else hi = m }
    return { r1, r2, d: (lo + hi) / 2, tp, fp, fn, iou: tp / (tp + fp + fn) }
  }, [sel])
  const id = useId().replace(/:/g, '')
  if (!v || !geo) return <div className="sx-loading">Loading validation figures…</div>
  const cx = 260, cy = 124, x1 = cx - geo.d / 2, x2 = cx + geo.d / 2
  const dim = show === 'union' ? 0.75 : 0.35
  return (
    <div className="sx-iou">
      <div className="sx-iou-ctl">
        <label>Event <select value={ev} onChange={(e) => { setEv(e.target.value); setPick(null) }}>{Object.keys(mans).map((k) => <option key={k} value={k}>{events.find((e) => e.id === k)?.title ?? k}</option>)}</select></label>
        <label>Method and date <select value={`${sel.rule}|${sel.date}`} onChange={(e) => { const [rule, date] = e.target.value.split('|'); setPick({ rule, date }) }}>
          {rows.map((r) => <option key={`${r.rule}|${r.date}`} value={`${r.rule}|${r.date}`}>{r.rule} · {r.date}</option>)}</select></label>
      </div>
      <svg viewBox="0 0 520 250" className="sx-svg" role="img" aria-labelledby={`${id}t`}>
        <title id={`${id}t`}>{`Two overlapping masks drawn to scale: predicted flood (cyan) and Sentinel-2 reference water (amber). Their overlap is the intersection; together they form the union. IoU ${sel.IoU.toFixed(3)}.`}</title>
        <defs><clipPath id={`${id}c`}><circle cx={x2} cy={cy} r={geo.r2} /></clipPath></defs>
        <circle cx={x2} cy={cy} r={geo.r2} fill={C.amber} fillOpacity={dim} />
        <circle cx={x1} cy={cy} r={geo.r1} fill={C.cy} fillOpacity={dim} />
        <circle cx={x1} cy={cy} r={geo.r1} fill="#f0f9ff" fillOpacity={show === 'inter' ? 0.95 : 0.3} clipPath={`url(#${id}c)`} />
        {show === 'union' && <><circle cx={x1} cy={cy} r={geo.r1 + 3} fill="none" stroke="#f0f9ff" strokeWidth="2" /><circle cx={x2} cy={cy} r={geo.r2 + 3} fill="none" stroke="#f0f9ff" strokeWidth="2" /></>}
        <circle cx={x1} cy={cy} r={geo.r1} fill="none" stroke={C.cy} strokeWidth="2" />
        <circle cx={x2} cy={cy} r={geo.r2} fill="none" stroke={C.amber} strokeWidth="2" strokeDasharray="6 4" />
        <Label x={cx} y={cy + 5} anchor="middle" size={13} color="#0b1426" weight={700}>{show === 'inter' ? 'Intersection (TP)' : 'Union'}</Label>
        <path d={`M${x1 - geo.r1 + 4} ${cy - 18} L${x1 - geo.r1 - 26} ${cy - 46}`} stroke={C.cy} />
        <Label x={x1 - geo.r1 - 28} y={cy - 52} anchor="end" size={11.5} color={C.cy} weight={600}>False alarm (FP)</Label>
        <Label x={x1 - geo.r1 - 28} y={cy - 38} anchor="end" size={10.5} color={C.muted}>predicted, not in reference</Label>
        <path d={`M${x2 + geo.r2 - 4} ${cy + 18} L${x2 + geo.r2 + 26} ${cy + 46}`} stroke={C.amber} />
        <Label x={x2 + geo.r2 + 28} y={cy + 52} size={11.5} color={C.amber} weight={600}>Missed (FN)</Label>
        <Label x={x2 + geo.r2 + 28} y={cy + 66} size={10.5} color={C.muted}>in reference, not predicted</Label>
        <Label x={x1 - geo.r1} y={cy - geo.r1 - 10} size={12} color={C.cy} weight={600}>Predicted (JalDrishti)</Label>
        <Label x={x2 + geo.r2} y={cy + geo.r2 + 20} anchor="end" size={12} color={C.amber} weight={600}>Reference (Sentinel-2)</Label>
      </svg>
      <div className="sx-iou-tg" role="group" aria-label="Highlight">
        <button className={show === 'inter' ? 'on' : ''} onClick={() => setShow('inter')} aria-pressed={show === 'inter'}>Intersection</button>
        <button className={show === 'union' ? 'on' : ''} onClick={() => setShow('union')} aria-pressed={show === 'union'}>Union</button>
      </div>
      <div className="sx-iou-eq">
        <span>IoU = <b className="i">Intersection</b> ÷ <b className="u">Union</b> = TP ÷ (TP + FP + FN)</span>
        <span>Reported: <b>{sel.IoU.toFixed(3)}</b> (95% CI {sel.ci?.[0]?.toFixed(3)}–{sel.ci?.[1]?.toFixed(3)}) · precision {sel.precision.toFixed(3)} · recall {sel.recall.toFixed(3)}</span>
        <span className="muted">Circles drawn to scale from that precision and recall (TP : FP : FN = 1 : {geo.fp.toFixed(2)} : {geo.fn.toFixed(2)}), giving IoU {geo.iou.toFixed(3)}.</span>
      </div>
      <p className="sx-note">{v.protocol}</p>
    </div>
  )
}

// ---------- 9. exposure GIS illustration ----------
export function ExposureGIS() {
  const id = useId().replace(/:/g, '')
  const houses = [[70, 70], [92, 82], [80, 96], [300, 60], [322, 74], [470, 160], [490, 176], [508, 160], [220, 190], [240, 205], [260, 188]]
  const inside = (x, y) => ((x - 250) / 190) ** 2 + ((y - 140) / 80) ** 2 < 1
  return (
    <svg viewBox="0 0 560 336" className="sx-svg" role="img" aria-labelledby={`${id}t`}>
      <title id={`${id}t`}>Illustration of an exposure overlay: the flood extent (cyan) is laid over settlements, cropland, a road and a railway; only what falls inside the extent is counted as exposed. Exposed is not the same as damaged.</title>
      <rect width="560" height="280" fill="#0a1426" />
      {Array.from({ length: 6 }, (_, i) => <rect key={i} x={120 + (i % 3) * 70} y={96 + Math.floor(i / 3) * 52} width="62" height="44" fill="#365314" stroke="#4d7c0f" />)}
      {Array.from({ length: 3 }, (_, i) => <rect key={i} x={400 + i * 40} y={40} width="34" height="40" fill="#365314" stroke="#4d7c0f" />)}
      <path d="M0 252 C 120 226, 220 266, 330 242 S 500 216, 560 230" stroke="#1d4ed8" strokeWidth="14" fill="none" />
      <Label x={540} y={212} anchor="end" size={10} color="#93c5fd">river (permanent water: not flood)</Label>
      <ellipse cx="250" cy="140" rx="190" ry="80" fill={C.cy} fillOpacity=".28" stroke={C.cy} strokeWidth="2" />
      <path d="M0 40 L560 250" stroke="#fde68a" strokeWidth="4" />
      <path d="M40 280 L420 0" stroke="#f87171" strokeWidth="3" />
      <path d="M40 280 L420 0" stroke="#0a1426" strokeWidth="1.5" strokeDasharray="2 8" />
      {houses.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M-6 0 L0 -6 L6 0 V6 H-6Z" fill={inside(x, y) ? '#fbbf24' : '#64748b'} stroke="#0a1426" /></g>)}
      <Label x={250} y={237} anchor="middle" size={11} color={C.cy} weight={600}>Flood extent (one pass)</Label>
      <Label x={152} y={160} size={10} color="#d9f99d">exposed cropland</Label>
      <Label x={318} y={176} size={10} color="#fde68a">exposed road length</Label>
      <Label x={196} y={124} anchor="end" size={10} color="#fecaca">exposed railway</Label>
      <rect x="12" y="12" width="148" height="40" rx="8" fill="#1f1607" stroke={C.amber} />
      <Label x={22} y={29} size={11} color={C.amber} weight={600}>Exposed ≠ damaged</Label>
      <Label x={22} y={44} size={10} color={C.muted}>damage needs ground reports</Label>
      <g fontFamily="Inter, system-ui, sans-serif" fontSize="11" fill={C.text}>
        <rect x="0" y="288" width="560" height="48" rx="8" fill="#0d1a31" stroke={C.line} />
        <rect x="14" y="300" width="11" height="11" fill={C.cy} fillOpacity=".5" stroke={C.cy} /><text x="31" y="310">Flood extent</text>
        <rect x="14" y="318" width="11" height="11" fill="#365314" stroke="#4d7c0f" /><text x="31" y="328">Cropland</text>
        <path d="M140 302 l6 -6 6 6 v6 h-12z" fill="#fbbf24" /><text x="160" y="310">Home inside: exposed</text>
        <path d="M140 320 l6 -6 6 6 v6 h-12z" fill="#64748b" /><text x="160" y="328">Home outside: not counted</text>
        <path d="M330 305h16" stroke="#fde68a" strokeWidth="3" /><text x="352" y="310">Road</text>
        <path d="M330 323h16" stroke="#f87171" strokeWidth="3" /><text x="352" y="328">Railway</text>
        <path d="M420 305h16" stroke="#1d4ed8" strokeWidth="5" /><text x="442" y="310">River</text>
      </g>
    </svg>
  )
}

// ---------- 10. limitations ----------
function Mini({ title, children, note }) {
  return <div className="sx-lim"><svg viewBox="0 0 200 110" className="sx-svg" aria-hidden="true">{children}</svg><b>{title}</b><small>{note}</small></div>
}
export function Limitations() {
  const id = useId().replace(/:/g, '')
  return (
    <div className="sx-lims" role="img" aria-label="Illustrated examples of uncertainty: flood between passes, radar shadow behind hills, cities, wind-roughened water, dense canopy, and fields flooded on purpose.">
      <svg width="0" height="0" style={{ position: 'absolute' }}><Defs id={id} /></svg>
      <Mini title="Between passes" note="A flood that rises and drains between two passes is never seen.">
        <path d="M10 90 H190" stroke="#475569" />
        <path d="M10 88 C 60 88, 80 20, 100 20 S 140 88, 190 88" stroke={C.cy} strokeWidth="2" fill="none" />
        {[30, 170].map((x) => <g key={x}><line x1={x} y1="30" x2={x} y2="90" stroke={C.amber} strokeDasharray="3 3" /><circle cx={x} cy="88" r="4" fill={C.amber} /></g>)}
        <Label x={100} y={14} anchor="middle" size={10} color={C.cy}>peak missed</Label>
        <Label x={30} y={104} anchor="middle" size={10} color={C.amber}>pass</Label><Label x={170} y={104} anchor="middle" size={10} color={C.amber}>pass +12 d</Label>
      </Mini>
      <Mini title="Hills: radar shadow" note="Slopes facing away get no signal and look dark like water.">
        <path d="M0 95 L70 30 L110 95 Z" fill="#6b4f2a" />
        <path d="M110 95 H200" stroke="#475569" />
        <path d="M20 5 L70 30" stroke={C.cy} strokeWidth="2" markerEnd={`url(#${id}ar)`} />
        <path d="M70 30 L150 95" stroke={C.cy} strokeDasharray="3 4" />
        <rect x="70" y="92" width="80" height="6" fill="#0b0d12" stroke="#475569" />
        <Label x={112} y={108} anchor="middle" size={10} color={C.amber}>shadow: dark ≠ water</Label>
      </Mini>
      <Mini title="Cities" note="Walls and streets bounce the signal back brightly; water between buildings is hard to see.">
        {[20, 60, 100, 140].map((x, i) => <rect key={x} x={x} y={40 + (i % 2) * 15} width="26" height={55 - (i % 2) * 15} fill="#334155" stroke="#64748b" />)}
        <rect x="0" y="92" width="200" height="6" fill="#1d4ed8" opacity=".7" />
        <path d="M10 10 L46 92 L46 60 L4 20" stroke={C.cy} fill="none" strokeWidth="1.6" />
        <Label x={196} y={20} anchor="end" size={10} color={C.amber}>double bounce: bright</Label>
      </Mini>
      <Mini title="Wind on water" note="Waves roughen the surface, so open water looks brighter than usual.">
        <path d="M0 80 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#93c5fd" fill="none" strokeWidth="2" />
        <rect x="0" y="82" width="200" height="20" fill="#1d4ed8" opacity=".6" />
        <path d="M60 10 L100 78" stroke={C.cy} strokeWidth="2" markerEnd={`url(#${id}ar)`} />
        <path d="M100 78 L70 30" stroke="#e2e8f0" strokeDasharray="3 3" />
        <Label x={196} y={30} anchor="end" size={10} color={C.amber}>echo returns: missed</Label>
      </Mini>
      <Mini title="Dense canopy" note="Under thick forest even L-band may not reach the water.">
        {[20, 50, 80, 110, 140, 170].map((x) => <Tree key={x} x={x} y={86} s={1.6} />)}
        <rect x="0" y="88" width="200" height="10" fill="#1d4ed8" opacity=".6" />
        <Label x={100} y={14} anchor="middle" size={10} color={C.amber}>water hidden below</Label>
      </Mini>
      <Mini title="Water on purpose" note="Rice paddies flooded for planting show up as new water too.">
        {[0, 1, 2, 3].map((i) => <rect key={i} x={8 + i * 48} y="50" width="42" height="42" fill="#1d4ed8" opacity=".55" stroke="#4d7c0f" strokeWidth="3" />)}
        {[0, 1, 2, 3].map((i) => [0, 1, 2].map((j) => <path key={`${i}${j}`} d={`M${18 + i * 48 + j * 11} 84 v-10`} stroke="#4ade80" strokeWidth="2" />))}
        <Label x={100} y={30} anchor="middle" size={10} color={C.amber}>new water, not a disaster</Label>
      </Mini>
    </div>
  )
}

// small art for the topic cards
export function Thumb({ n }) {
  const img = { 3: 'bda_during', 4: 'proc_lee_zoom', 5: 'feat_d_hh', 7: 'bda_during' }[n]
  if (img) return <img src={`${SCI}${img}.webp`} alt="" loading="lazy" />
  const art = {
    1: <><circle cx="60" cy="150" r="90" fill="#0f2a4a" /><path d="M20 40 L60 92 L100 40" fill={C.cy} fillOpacity=".2" /><rect x="48" y="22" width="24" height="12" rx="2" fill="#cbd5e1" /><path d="M34 28h14M72 28h14" stroke="#93c5fd" strokeWidth="5" /></>,
    2: <><rect x="6" y="66" width="34" height="16" fill="#6b4f2a" /><rect x="43" y="66" width="34" height="16" fill="#166534" /><rect x="80" y="66" width="34" height="16" fill="#1d4ed8" /><path d="M23 64 L23 30M60 64 L52 28M60 64 L68 28M97 64 L116 32" stroke={C.cy} strokeWidth="2" /></>,
    6: <>{[14, 36, 58].map((y, i) => <rect key={y} x="30" y={y} width="60" height="14" rx="4" fill={i === 1 ? C.cy : '#1e3a5f'} fillOpacity={i === 1 ? 0.7 : 1} />)}<path d="M60 28v8M60 50v8" stroke={C.ice} /></>,
    8: <><circle cx="50" cy="50" r="28" fill={C.cy} fillOpacity=".35" stroke={C.cy} /><circle cx="72" cy="50" r="28" fill={C.amber} fillOpacity=".25" stroke={C.amber} strokeDasharray="4 3" /></>,
    9: <><ellipse cx="60" cy="50" rx="44" ry="24" fill={C.cy} fillOpacity=".3" stroke={C.cy} /><path d="M0 20 L120 84" stroke="#fde68a" strokeWidth="3" />{[[40, 46], [56, 54], [80, 40]].map(([x, y]) => <path key={x} d={`M${x - 5} ${y} l5 -5 5 5 v5 h-10z`} fill="#fbbf24" />)}</>,
    10: <><path d="M10 80 C 40 80, 50 20, 60 20 S 80 80, 110 80" stroke={C.cy} strokeWidth="2.5" fill="none" />{[20, 100].map((x) => <line key={x} x1={x} y1="30" x2={x} y2="84" stroke={C.amber} strokeDasharray="3 3" />)}<text x="60" y="14" textAnchor="middle" fontSize="16" fill={C.amber}>?</text></>,
  }[n]
  return <svg viewBox="0 0 120 96" aria-hidden="true"><rect width="120" height="96" fill="#0a1426" />{art}</svg>
}
