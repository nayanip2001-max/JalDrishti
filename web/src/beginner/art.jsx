// Hand-built vector art for the Beginner view: Tamizhi (our satellite guide), a layered village scene that
// can flood, people, a water gauge and the four comic panels. Illustrations, never data.
import { useId } from 'react'

const useUid = () => useId().replace(/:/g, '')

// ---------------------------------------------------------------- Tamizhi
export function Tamizhi({ mood = 'happy', size = 120, className = '', title = 'Tamizhi, the satellite' }) {
  const id = useUid()
  return (
    <svg viewBox="0 0 200 190" width={size} height={size * 0.95} className={`tz ${className}`} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE7A8" /><stop offset=".55" stopColor="#FFC961" /><stop offset="1" stopColor="#F2A93B" /></linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8FD8FF" /><stop offset="1" stopColor="#3F7FF0" /></linearGradient>
        <radialGradient id={`${id}d`} cx=".5" cy=".35" r=".7"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".6" stopColor="#E6ECF5" /><stop offset="1" stopColor="#B8C4D8" /></radialGradient>
        <radialGradient id={`${id}c`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#FF9EB0" stopOpacity=".9" /><stop offset="1" stopColor="#FF9EB0" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="tz-float">
        {/* reflector dish (NISAR's big mesh antenna), worn like a sun hat */}
        <path d="M100 66 L100 84" stroke="#9AA8BE" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="100" cy="50" rx="66" ry="20" fill={`url(#${id}d)`} stroke="#9AA8BE" strokeWidth="2" />
        <path d="M44 48 Q100 30 156 48 M58 58 Q100 44 142 58 M100 30 V70 M70 34 Q86 50 76 68 M130 34 Q114 50 124 68" stroke="#C3CDDC" strokeWidth="1.4" fill="none" />
        <ellipse cx="82" cy="42" rx="18" ry="5" fill="#fff" opacity=".8" />
        {/* wings */}
        <g className="tz-wing-l">
          <rect x="6" y="104" width="50" height="38" rx="7" fill={`url(#${id}w)`} stroke="#2F5FC4" strokeWidth="2" />
          <path d="M23 104v38M39 104v38M6 117h50M6 130h50" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
          <path d="M10 110 L30 108 L14 124Z" fill="#fff" opacity=".35" />
          <rect x="54" y="119" width="12" height="8" rx="3" fill="#9AA8BE" />
        </g>
        <g className="tz-wing-r">
          <rect x="144" y="104" width="50" height="38" rx="7" fill={`url(#${id}w)`} stroke="#2F5FC4" strokeWidth="2" />
          <path d="M161 104v38M177 104v38M144 117h50M144 130h50" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
          <path d="M148 110 L168 108 L152 124Z" fill="#fff" opacity=".35" />
          <rect x="134" y="119" width="12" height="8" rx="3" fill="#9AA8BE" />
        </g>
        {/* body: gold foil */}
        <rect x="62" y="80" width="76" height="76" rx="24" fill={`url(#${id}b)`} stroke="#D98E22" strokeWidth="2.5" />
        <path d="M70 92 Q84 84 100 86" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".65" fill="none" />
        <path d="M74 146 Q100 154 126 146" stroke="#D98E22" strokeWidth="2" fill="none" opacity=".5" />
        {/* face */}
        <ellipse cx="78" cy="128" rx="9" ry="6" fill={`url(#${id}c)`} />
        <ellipse cx="122" cy="128" rx="9" ry="6" fill={`url(#${id}c)`} />
        <g className="tz-eyes">
          <ellipse cx="86" cy="114" rx="8.5" ry="10" fill="#fff" /><ellipse cx="114" cy="114" rx="8.5" ry="10" fill="#fff" />
          <circle cx="87" cy="116" r="5.5" fill="#2B2440" /><circle cx="115" cy="116" r="5.5" fill="#2B2440" />
          <circle cx="89" cy="113" r="2" fill="#fff" /><circle cx="117" cy="113" r="2" fill="#fff" />
        </g>
        {mood === 'excited'
          ? <><path d="M88 131 Q100 146 112 131 Z" fill="#7A2E3A" /><path d="M93 137 Q100 142 107 137" fill="#FF8FA3" /></>
          : mood === 'think'
            ? <ellipse cx="100" cy="134" rx="4" ry="3.5" fill="#7A2E3A" />
            : <path d="M90 131 Q100 140 110 131" stroke="#7A2E3A" strokeWidth="3.2" strokeLinecap="round" fill="none" />}
        {mood === 'excited' && <g className="tz-spark" fill="#FFD23F"><path d="M30 70 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" /><path d="M170 74 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" /></g>}
      </g>
      <ellipse cx="100" cy="182" rx="40" ry="5" fill="#2B4A7A" opacity=".12" className="tz-shadow" />
    </svg>
  )
}

// ---------------------------------------------------------------- village scene (water 0..1 floods it)
export function Village({ water = 0, maybe = false, rain = false, className = '', title, compact = false }) {
  const id = useUid()
  const top = 214 - water * 92                  // flood surface height
  return (
    <svg viewBox="0 0 400 240" className={`vl ${className}`} role="img" aria-label={title ?? 'Illustration of a village with rice fields'} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={rain ? '#9DB3D1' : '#9FDBFF'} /><stop offset="1" stopColor={rain ? '#DCE6F2' : '#F1FAFF'} /></linearGradient>
        <radialGradient id={`${id}sun`}><stop offset="0" stopColor="#FFF4C2" /><stop offset=".5" stopColor="#FFD86B" /><stop offset="1" stopColor="#FFD86B" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5EC2F7" /><stop offset="1" stopColor="#3A94E6" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CC6FF" stopOpacity=".88" /><stop offset="1" stopColor="#2A7BD8" stopOpacity=".92" /></linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B4E58F" /><stop offset="1" stopColor="#7CC765" /></linearGradient>
        <pattern id={`${id}rows`} width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 5h10" stroke="#5FAF52" strokeWidth="1.6" strokeLinecap="round" opacity=".7" /></pattern>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}s)`} />
      {!rain && <circle cx="330" cy="46" r="42" fill={`url(#${id}sun)`} className="vl-sun" />}
      {/* clouds */}
      {[[70, 44, 1], [210, 30, 0.8], [300, 70, 0.7]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="vl-cloud" style={{ animationDelay: `${i * -6}s` }}>
          <ellipse cx="0" cy="8" rx="38" ry="14" fill={rain ? '#C7D3E4' : '#fff'} /><circle cx="-14" cy="0" r="16" fill={rain ? '#CED9E8' : '#fff'} /><circle cx="10" cy="-6" r="20" fill={rain ? '#D7E0EC' : '#fff'} />
        </g>
      ))}
      {rain && <g className="vl-rain" stroke="#7DA6D9" strokeWidth="2" strokeLinecap="round" opacity=".7">{Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${12 + i * 18} ${60 + (i % 3) * 14} l-5 12`} />)}</g>}
      {/* hills */}
      <path d="M0 132 C 60 96, 120 110, 170 120 S 280 92, 400 118 V240 H0Z" fill="#B7E3C0" />
      <path d="M0 150 C 80 126, 160 140, 230 134 S 340 122, 400 140 V240 H0Z" fill="#9AD6A6" />
      {/* paddies in perspective */}
      <path d="M0 164 L400 156 L400 240 L0 240Z" fill={`url(#${id}p)`} />
      <path d="M0 164 L400 156 L400 240 L0 240Z" fill={`url(#${id}rows)`} />
      {[[0, 186, 400, 180], [0, 212, 400, 206]].map(([a, b, c, d], i) => <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke="#C9A36B" strokeWidth="3" />)}
      {[90, 210, 320].map((x) => <path key={x} d={`M${x} 160 L${x - 30} 240`} stroke="#C9A36B" strokeWidth="3" />)}
      {/* river */}
      <path d="M-10 176 C 60 168, 120 182, 190 176 S 330 166, 410 172" stroke={`url(#${id}r)`} strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M40 174 q10 -3 20 0 M210 175 q10 -3 20 0 M320 170 q10 -3 20 0" stroke="#fff" strokeWidth="1.6" opacity=".7" fill="none" />
      {/* palms */}
      {[[40, 158, 1], [362, 152, 0.9], [250, 150, 0.75]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="vl-palm" style={{ animationDelay: `${i * -1.3}s` }}>
          <path d="M0 0 C -2 -20, 4 -40, 2 -58" stroke="#B9825A" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M2 -58 C -14 -66, -28 -60, -34 -50 C -20 -56, -8 -56, 2 -58 Z M2 -58 C 18 -68, 32 -62, 38 -50 C 24 -56, 12 -56, 2 -58 Z M2 -58 C -6 -74, -2 -84, 6 -88 C 4 -76, 6 -66, 2 -58Z M2 -58 C 16 -60, 26 -48, 26 -40 C 18 -48, 10 -54, 2 -58Z M2 -58 C -12 -58, -22 -46, -22 -38 C -14 -46, -6 -52, 2 -58Z" fill="#3FAF6A" />
          <circle cx="0" cy="-56" r="4" fill="#8A5A2E" /><circle cx="6" cy="-54" r="3.5" fill="#8A5A2E" />
        </g>
      ))}
      {/* houses */}
      {[[118, 150, 1], [165, 156, 0.85], [286, 150, 0.95]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-22" y="-22" width="44" height="30" rx="2" fill="#FFF1DA" />
          <rect x="6" y="-22" width="16" height="30" fill="#F4DDBA" />
          <path d="M-28 -20 L0 -44 L28 -20 Z" fill="#F0866A" /><path d="M0 -44 L28 -20 L14 -20 L0 -36Z" fill="#D9694F" />
          <rect x="-8" y="-6" width="10" height="14" rx="2" fill="#B5764A" />
          <rect x="-18" y="-14" width="8" height="7" rx="1.5" fill="#7FC8F2" />
        </g>
      ))}
      {/* flood water */}
      {water > 0 && (
        <g className="vl-flood">
          <path d={`M0 ${top} q 25 -5 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 t 50 0 V240 H0Z`} fill={`url(#${id}f)`}
            stroke={maybe ? '#F6B93B' : '#BDE7FF'} strokeWidth={maybe ? 3 : 2} strokeDasharray={maybe ? '8 6' : undefined} opacity={maybe ? 0.55 : 1} />
          {!compact && [60, 150, 250, 340].map((x, i) => <path key={x} className="vl-ripple" style={{ animationDelay: `${i * 0.5}s` }} d={`M${x - 14} ${top + 14 + (i % 2) * 10} q 7 -4 14 0 t 14 0`} stroke="#fff" strokeWidth="2" fill="none" opacity=".75" />)}
          <path d={`M30 ${top + 8} h40 M210 ${top + 20} h50`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".5" />
        </g>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------- people
const OUTFIT = ['#FF8FA3', '#7CC4FF', '#FFC94D', '#8EDB8A', '#C6A2FF', '#FF9F68']
const SKIN = ['#8D5A3B', '#A86B45', '#6F4630', '#C08457']
export function Person({ i = 0, faded = false }) {
  return (
    <svg viewBox="0 0 40 56" className={`pp ${faded ? 'faded' : ''}`} aria-hidden="true">
      <path d="M6 54 C 6 36, 12 30, 20 30 C 28 30, 34 36, 34 54 Z" fill={OUTFIT[i % OUTFIT.length]} />
      <path d="M14 34 Q20 40 26 34" stroke="#fff" strokeOpacity=".6" strokeWidth="2" fill="none" />
      <circle cx="20" cy="18" r="11" fill={SKIN[i % SKIN.length]} />
      <path d={i % 2 ? 'M9 17 C 9 6, 31 6, 31 17 C 27 11, 13 11, 9 17Z' : 'M9 18 C 8 5, 32 5, 31 18 C 30 12, 25 10, 20 10 C 15 10, 10 12, 9 18Z M28 14 C 34 18, 34 26, 30 30 C 31 24, 30 18, 28 14Z'} fill="#2B1E1A" />
      <circle cx="16" cy="19" r="1.5" fill="#2B1E1A" /><circle cx="24" cy="19" r="1.5" fill="#2B1E1A" />
      <path d="M16.5 23.5 Q20 26 23.5 23.5" stroke="#2B1E1A" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
export function Crowd({ n = 5 }) {
  return <div className="crowd" aria-hidden="true">{Array.from({ length: n }, (_, i) => <Person key={i} i={i} />)}</div>
}

// ---------------------------------------------------------------- rice plant + water gauge
export function Rice({ wet = false }) {
  const id = useUid()
  return (
    <svg viewBox="0 0 160 120" className="rice" aria-hidden="true">
      <defs><linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C8F0A8" /><stop offset="1" stopColor="#8ED16F" /></linearGradient></defs>
      <rect y="78" width="160" height="42" rx="6" fill={wet ? '#5CB8F5' : '#C9A36B'} />
      {wet && <path d="M0 80 q 20 -5 40 0 t 40 0 t 40 0 t 40 0" stroke="#fff" strokeWidth="2.5" fill="none" opacity=".7" className="vl-ripple" />}
      {[20, 52, 84, 116, 148].map((x, i) => (
        <g key={x} transform={`translate(${x} 84)`} className="vl-palm" style={{ animationDelay: `${i * -0.7}s` }}>
          {[-14, -6, 2, 10].map((a, k) => <path key={k} d={`M0 0 Q ${a} -30 ${a * 1.6} -58`} stroke={`url(#${id}g)`} strokeWidth="4" fill="none" strokeLinecap="round" />)}
          <path d="M6 -46 q 6 -6 4 -14 M-6 -44 q -6 -8 -2 -16" stroke="#E9C25B" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  )
}
export function Gauge({ level = 0, label }) {
  const id = useUid()
  const h = 150 * Math.max(0, Math.min(1, level))
  return (
    <svg viewBox="0 0 110 190" className="gauge" role="img" aria-label={label}>
      <defs><linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7AD0FF" /><stop offset="1" stopColor="#2F86E0" /></linearGradient>
        <clipPath id={`${id}c`}><rect x="8" y="20" width="94" height="160" rx="18" /></clipPath></defs>
      <rect x="8" y="20" width="94" height="160" rx="18" fill="#F3F9FF" stroke="#BFD9F2" strokeWidth="3" />
      <g clipPath={`url(#${id}c)`}>
        <g className="gauge-water" style={{ transform: `translateY(${150 - h}px)` }}>
          <path d="M8 30 q 12 -6 24 0 t 24 0 t 24 0 t 24 0 V 200 H8Z" fill={`url(#${id}w)`} />
          <path d="M18 44 h18 M58 52 h22" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".55" />
        </g>
      </g>
      <rect x="49" y="10" width="12" height="172" rx="4" fill="#fff" stroke="#9AA8BE" strokeWidth="2" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} x="49" y={20 + i * 24} width="12" height="12" fill={i % 2 ? '#fff' : '#FF7A7A'} />)}
    </svg>
  )
}

// ---------------------------------------------------------------- comic panels
function Earth({ id }) {
  return (
    <g>
      <defs><radialGradient id={`${id}e`} cx=".5" cy=".1" r=".9"><stop offset="0" stopColor="#7FE0A0" /><stop offset=".45" stopColor="#4FB3F6" /><stop offset="1" stopColor="#2A6FD0" /></radialGradient></defs>
      <ellipse cx="200" cy="330" rx="300" ry="140" fill="#BFE8FF" opacity=".45" />
      <ellipse cx="200" cy="335" rx="282" ry="128" fill={`url(#${id}e)`} />
      <path d="M40 240 q 40 -20 90 -6 q 30 8 50 -4 M230 226 q 40 -14 80 2" stroke="#8EE09E" strokeWidth="14" strokeLinecap="round" fill="none" opacity=".9" />
      <path d="M90 222 q 20 -8 40 0 M250 214 q 26 -8 50 2" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".8" fill="none" />
    </g>
  )
}
export function ComicSpace() {
  const id = useUid()
  return (
    <svg viewBox="0 0 400 260" className="comic-svg" role="img" aria-label="Tamizhi flies high above the Earth">
      <defs><linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B4A9E" /><stop offset="1" stopColor="#8EA6F2" /></linearGradient></defs>
      <rect width="400" height="260" fill={`url(#${id}sky)`} />
      {[[30, 30], [80, 70], [340, 40], [300, 90], [180, 24], [380, 120], [20, 120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 2.4} fill="#fff" className="twinkle" style={{ animationDelay: `${i * 0.4}s` }} />)}
      <path d="M40 150 Q 200 40 360 150" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 8" fill="none" />
      <Earth id={id} />
      <g transform="translate(140 40)"><Tamizhi size={120} /></g>
    </svg>
  )
}
export function ComicRadar() {
  return (
    <div className="comic-stack">
      <Village rain title="Rain clouds over a village" />
      <svg viewBox="0 0 400 240" className="comic-over" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="radarbeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF5FA2" stopOpacity=".35" /><stop offset="1" stopColor="#FF5FA2" stopOpacity="0" /></linearGradient></defs>
        <path d="M200 40 L120 240 L280 240 Z" fill="url(#radarbeam)" />
        {/* ripples spreading down from Tamizhi, through the clouds, to the village */}
        {[0, 1, 2, 3].map((k) => (
          <path key={k} className="radar-arc" style={{ animationDelay: `${k * 0.5}s` }}
            d="M171 81 A 50 50 0 0 0 229 81" stroke="#FF5FA2" strokeWidth="4" fill="none" strokeLinecap="round" />
        ))}
      </svg>
      <div className="comic-tz"><Tamizhi size={92} mood="excited" /></div>
    </div>
  )
}
export function ComicMirror() {
  const id = useUid()
  return (
    <svg viewBox="0 0 400 240" className="comic-svg" role="img" aria-label="Radar waves bounce back from rough fields, but bounce away from calm water like a mirror">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CFEFFF" /><stop offset="1" stopColor="#F6FCFF" /></linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7AD0FF" /><stop offset="1" stopColor="#2F86E0" /></linearGradient>
        <marker id={`${id}a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#FF5FA2" /></marker>
        <marker id={`${id}g`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#24A148" /></marker>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}s)`} />
      <rect x="0" y="170" width="200" height="70" fill="#9AD67F" />
      <path d="M0 172 l10 -8 10 8 10 -10 10 10 10 -8 10 8 10 -9 10 9 10 -8 10 8 10 -10 10 10 10 -8 10 8 10 -9 10 9 10 -8 10 8 10 -9 10 9" fill="#7CC765" />
      <rect x="200" y="170" width="200" height="70" fill={`url(#${id}w)`} />
      <path d="M220 182 h40 M300 196 h50" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".6" />
      <path d="M70 40 L100 162" stroke="#FF5FA2" strokeWidth="5" markerEnd={`url(#${id}a)`} className="beam" />
      {[[60, 70], [100, 60], [140, 80]].map(([x, y], i) => <path key={i} d={`M104 166 L${x} ${y}`} stroke="#24A148" strokeWidth="4" markerEnd={`url(#${id}g)`} className="bounce" style={{ animationDelay: `${0.6 + i * 0.1}s` }} />)}
      <path d="M250 40 L282 162" stroke="#FF5FA2" strokeWidth="5" markerEnd={`url(#${id}a)`} className="beam" />
      <path d="M286 166 L360 60" stroke="#FF5FA2" strokeWidth="5" strokeDasharray="10 8" markerEnd={`url(#${id}a)`} className="bounce" style={{ animationDelay: '.6s' }} />
      {/* what Tamizhi sees: a bright patch for the field, a dark patch for the water */}
      {[[16, '#E9E9E9'], [306, '#141B2D']].map(([x, c]) => (
        <g key={x} transform={`translate(${x} 182)`}>
          <rect width="78" height="46" rx="14" fill="#fff" stroke="#2B2440" strokeWidth="2" />
          <path d="M10 23 Q 22 9 34 23 Q 22 37 10 23Z" fill="#fff" stroke="#2B2440" strokeWidth="2" /><circle cx="22" cy="23" r="4.5" fill="#2B2440" />
          <rect x="42" y="9" width="28" height="28" rx="7" fill={c} stroke="#2B2440" strokeWidth="2" />
        </g>
      ))}
    </svg>
  )
}
export function ComicCompare() {
  return (
    <div className="comic-compare">
      <figure className="polaroid tilt-l"><Village compact title="Before: dry fields" /><figcaption>✓</figcaption></figure>
      <span className="comic-arrow" aria-hidden="true">➜</span>
      <figure className="polaroid tilt-r"><Village compact water={0.62} title="Now: fields under water" /><figcaption>!</figcaption></figure>
      <div className="comic-tz2"><Tamizhi size={84} mood="excited" /></div>
    </div>
  )
}

// ---------------------------------------------------------------- dock icons
export function DockIcon({ kind }) {
  const id = useUid()
  if (kind === 'where') return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="12" width="52" height="40" rx="10" fill="#BDF0C5" /><path d="M6 38 C 20 30, 34 46, 58 34 V52 H6Z" fill="#5DBBF7" /><path d="M32 8 C 22 8, 18 16, 18 21 C 18 31, 32 42, 32 42 C 32 42, 46 31, 46 21 C 46 16, 42 8, 32 8Z" fill="#FF6B8B" /><circle cx="32" cy="21" r="5.5" fill="#fff" /></svg>)
  if (kind === 'village') return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 30 L32 14 L50 30Z" fill="#F0866A" /><rect x="18" y="29" width="28" height="22" rx="2" fill="#FFF1DA" /><rect x="28" y="38" width="8" height="13" fill="#B5764A" /><path d="M6 46 q 6 -4 13 0 t 13 0 t 13 0 t 13 0 V58 H6Z" fill="#5DBBF7" /><circle cx="49" cy="15" r="9" fill="#FFD23F" /><path d="M45 15 l3 3 6 -7" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>)
  if (kind === 'watch') return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="48" height="44" rx="10" fill="#fff" stroke="#FFB26B" strokeWidth="3" /><rect x="8" y="12" width="48" height="12" rx="6" fill="#FFB26B" /><circle cx="20" cy="10" r="3" fill="#E5484D" /><circle cx="44" cy="10" r="3" fill="#E5484D" /><circle cx="32" cy="40" r="11" fill="#7C6CF2" /><path d="M29 34 L38 40 L29 46Z" fill="#fff" /></svg>)
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE7A8" /><stop offset="1" stopColor="#F2A93B" /></linearGradient></defs>
      <ellipse cx="32" cy="14" rx="20" ry="6" fill="#E6ECF5" stroke="#9AA8BE" strokeWidth="1.5" /><path d="M32 19 V24" stroke="#9AA8BE" strokeWidth="3" />
      <rect x="4" y="32" width="14" height="12" rx="3" fill="#5DA0F5" /><rect x="46" y="32" width="14" height="12" rx="3" fill="#5DA0F5" />
      <rect x="18" y="24" width="28" height="28" rx="10" fill={`url(#${id}b)`} /><circle cx="27" cy="36" r="3" fill="#2B2440" /><circle cx="37" cy="36" r="3" fill="#2B2440" /><path d="M27 43 Q32 47 37 43" stroke="#7A2E3A" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>)
}
