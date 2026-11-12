// One dashboard, three depths. Navigation and how much each view shows depend on the mode;
// the data underneath never changes.

export const MODES = [
  { id: 'beginner', label: 'Beginner', who: 'Students' },
  { id: 'intermediate', label: 'Intermediate', who: 'Educators · Analysts' },
  { id: 'advanced', label: 'Advanced', who: 'Researchers · Professionals' },
]

const RANK = { beginner: 0, intermediate: 1, advanced: 2 }
export const atLeast = (mode, level) => RANK[mode] >= RANK[level]
// Pick the text for the current mode, falling back to the nearest simpler one.
export const byMode = (mode, v) => v[mode] ?? (mode === 'advanced' ? v.intermediate : undefined) ?? v.beginner

export const NAV = {
  beginner: [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'flood', label: 'Flood Map', icon: 'map' },
    { id: 'temporal', label: 'Timeline', icon: 'clock' },
    { id: 'impact', label: 'Impact', icon: 'people' },
    { id: 'how', label: 'How It Works', icon: 'bulb' },
  ],
  intermediate: [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'flood', label: 'Flood Analysis', icon: 'map' },
    { id: 'temporal', label: 'Temporal Analysis', icon: 'clock' },
    { id: 'impact', label: 'Impact Assessment', icon: 'people' },
    { id: 'validation', label: 'Model Performance', icon: 'check' },
    { id: 'data', label: 'Data & Sources', icon: 'database' },
  ],
  advanced: [
    { id: 'event', label: 'Event', icon: 'home' },
    { id: 'observations', label: 'Observations', icon: 'radar' },
    { id: 'features', label: 'Features', icon: 'layers' },
    { id: 'model', label: 'Model', icon: 'cpu' },
    { id: 'validation', label: 'Validation', icon: 'check' },
    { id: 'impact', label: 'Impact', icon: 'people' },
    { id: 'data', label: 'Data', icon: 'database' },
  ],
}

// Events with live monitoring get a Live Monitor entry, second in every mode.
const LIVE_ITEM = { id: 'live', label: 'Live Monitor', icon: 'pulse' }
// "Map a Region" (any area, any date) closes every mode's list.
const REGION_ITEM = { id: 'region', label: 'Map a Region', icon: 'target' }
export const navFor = (mode, live) => [...(live ? [NAV[mode][0], LIVE_ITEM, ...NAV[mode].slice(1)] : NAV[mode]), REGION_ITEM]

// Where a section lives when the mode changes and it has no exact twin.
export const SECTION_FALLBACK = { event: 'overview', overview: 'event', how: 'overview', observations: 'flood', features: 'flood',
  model: 'validation', flood: 'observations', temporal: 'observations' }
export const resolveSection = (mode, id, live = false) => {
  const ids = navFor(mode, live).map((n) => n.id)
  if (ids.includes(id)) return id
  const alt = SECTION_FALLBACK[id]
  return ids.includes(alt) ? alt : ids[0]
}

// Default map layers for each lens.
export const LENS_LAYERS = {
  science: { flood: true, prob: false, sar: true, compare: false, cropland: false, population: false, districts: false, roads: false },
  impact: { flood: true, prob: false, sar: false, compare: false, cropland: false, population: false, districts: true, roads: true },
}
