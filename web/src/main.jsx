import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.jsx'

// The globe landing is shown only at the bare address (no #event). Every existing link (#assam, #chennai,
// #thailand) opens the dashboard directly, exactly as before. The landing and three.js load on demand.
const Landing = lazy(() => import('./landing/Landing.jsx'))
const atGlobe = () => !window.location.hash.slice(1)

function Root() {
  const [globe, setGlobe] = useState(atGlobe)
  useEffect(() => {
    const f = () => setGlobe(atGlobe())                  // browser Back from #event to the bare address shows the globe
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  if (globe) {
    return (
      <Suspense fallback={<div className="lg-boot" style={{ position: 'fixed', inset: 0, background: '#040816' }} />}>
        <Landing onEnter={(id) => { window.location.hash = id; setGlobe(false) }} />
      </Suspense>
    )
  }
  return <App onHome={() => { window.history.pushState(null, '', window.location.pathname + window.location.search); setGlobe(true) }} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
