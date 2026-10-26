// Click-to-explain: shows how each independent clue moved the flood odds at one pixel.

// Log-odds clues are coloured by direction (cyan = towards flood); raw measurements stay neutral.
function Clue({ label, value, range = 8, title, neutral = false, unit = '' }) {
  const v = Math.max(-range, Math.min(range, value))
  const pct = (Math.abs(v) / range) * 50
  const color = neutral ? '#64748b' : v >= 0 ? 'var(--flood)' : 'var(--possible)'
  return (
    <div className="clue" title={title}>
      <span>{label}</span>
      <span className="bar"><span className="fill" style={{ left: v >= 0 ? '50%' : `${50 - pct}%`, width: `${pct}%`, background: color }} /></span>
      <span className="num">{value >= 0 ? '+' : ''}{value.toFixed(1)}{unit}</span>
    </div>
  )
}

function verdict(e) {
  if (e.pOpen > 0.8) return ['Flood · open water', 'var(--flood)']
  if (e.pVeg > 0.8) return ['Flood · water under vegetation', 'var(--veg)']
  if (e.pOpen > 0.5 || e.pVeg > 0.5) return ['Possible flood', 'var(--possible)']
  if (e.lNow > 2 && e.lBefore < 0) return ['River / water already present', 'var(--perm)']
  return ['No flood detected', 'var(--muted)']
}

export default function Evidence({ evidence, pick, scene }) {
  if (!pick) {
    return (
      <div className="card evidence">
        <h3>Why this pixel?</h3>
        <p className="hint" style={{ margin: 0 }}>Click anywhere on the map. You'll see each radar and terrain clue and how much it pushed the decision toward "flood" or "no flood".</p>
      </div>
    )
  }
  if (!evidence) {
    return <div className="card evidence"><h3>Why this pixel?</h3><p className="hint" style={{ margin: 0 }}>No radar coverage at this point.</p></div>
  }
  const [label, color] = verdict(evidence)
  const p = Math.max(evidence.pOpen, evidence.pVeg)
  return (
    <div className="card evidence">
      <h3>Why this pixel? <span className="tag observed">{scene.date}</span></h3>
      <div className="p">
        <b style={{ color }}>{Math.round(p * 100)}%</b>
        <span className="verdict" style={{ color }}>{label}</span>
      </div>
      <Clue label="Looks like water now" value={evidence.lNow} title="Radar echo on this date vs the scene's learned water/land signatures (log-odds)" />
      <Clue label="Was dry before" value={evidence.lBefore} title="Same test on the pre-flood reference passes; positive = it was land, so any water is new" />
      <Clue label="Low ground / flat" value={evidence.lTerrain} range={8} title="Height above nearest drainage and slope from Copernicus GLO-30" />
      <Clue label="Radar echo change" value={evidence.dHH} range={15} neutral unit=" dB" title="HH change vs the pre-flood reference. A strong drop means new open water; a strong rise under trees means double bounce from water beneath the canopy" />
      <div className="coords">{pick[1].toFixed(4)}°N {pick[0].toFixed(4)}°E · open {Math.round(evidence.pOpen * 100)}% · under-canopy {Math.round(evidence.pVeg * 100)}%</div>
    </div>
  )
}
