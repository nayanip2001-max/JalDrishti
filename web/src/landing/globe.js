// The landing globe: NASA Blue Marble (July 2004, 3x5400x2700) on a lit sphere, NASA Blue Marble clouds,
// an atmosphere halo, a twinkling star field, great-circle links between the event sites and a ring that lights
// up the site under the pointer. The pins themselves are HTML buttons (hover, focus, keyboard, screen readers),
// placed every frame from the 3D positions computed here. Lives in its own chunk: the dashboard never loads it.
import * as THREE from 'three'
import { createWater } from './water.js'

const D = Math.PI / 180
const R_ATM = 1.13
// (lon, lat) on the unit sphere, matching THREE.SphereGeometry's equirectangular UVs (u = 0 at lon -180).
export const toVec = (lon, lat, r = 1) => {
  const t = (lon + 180) * D, p = lat * D
  return new THREE.Vector3(-Math.cos(t) * Math.cos(p) * r, Math.sin(p) * r, Math.sin(t) * Math.cos(p) * r)
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const wrap = (a) => ((a + 540) % 360) - 180

const EARTH_V = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const EARTH_F = /* glsl */`
  uniform sampler2D day; uniform sampler2D clouds; uniform vec3 sun; uniform float cloudShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN), v = normalize(vV), l = normalize(sun);
    vec3 c = texture2D(day, vUv).rgb;
    float ndl = dot(n, l);
    float lit = smoothstep(-0.18, 0.42, ndl);
    // cloud shadows, offset a little away from the sun
    float sh = texture2D(clouds, vUv + vec2(cloudShift - 0.0015, 0.001)).r;
    c *= 1.0 - 0.32 * sh * lit;
    // open water: blue-dominant and dark in Blue Marble; gets a soft sun glint
    float water = smoothstep(0.015, 0.08, c.b - c.r) * (1.0 - smoothstep(0.10, 0.30, dot(c, vec3(0.33))));
    float glint = pow(max(dot(reflect(-l, n), v), 0.0), 38.0) * water * lit;
    vec3 col = c * (0.035 + 1.08 * lit) + vec3(0.55, 0.75, 0.95) * glint * 0.55;
    // atmospheric scattering towards the limb, stronger on the day side
    float fr = pow(1.0 - max(dot(n, v), 0.0), 2.6);
    col += vec3(0.20, 0.50, 1.0) * fr * (0.15 + 0.85 * lit) * 0.75;
    col += vec3(0.02, 0.05, 0.10) * (1.0 - lit);               // faint night-side airglow
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
const CLOUD_F = /* glsl */`
  uniform sampler2D clouds; uniform vec3 sun; uniform float cloudShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    float a = texture2D(clouds, vUv + vec2(cloudShift, 0.0)).r;
    a = smoothstep(0.12, 0.95, a) * 0.82;
    float lit = smoothstep(-0.12, 0.5, dot(n, normalize(sun)));
    float limb = smoothstep(0.0, 0.35, dot(n, normalize(vV)));  // thin out at the limb so the edge stays crisp
    gl_FragColor = vec4(vec3(0.97, 0.98, 1.0) * (0.06 + 0.98 * lit), a * (0.25 + 0.75 * lit) * limb);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
const ATM_F = /* glsl */`
  uniform vec3 sun; uniform float s0; varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    float rim = dot(n, normalize(vV));                          // back faces: 0 at the halo's edge, -1 behind the centre
    float s = sqrt(max(0.0, 1.0 - rim * rim));                  // projected distance from the centre, 1 = halo edge
    float glow = pow(clamp((1.0 - s) / (1.0 - s0), 0.0, 1.0), 2.4);  // brightest at the Earth's limb (s0), 0 at the edge
    float day = 0.35 + 0.65 * smoothstep(-0.5, 0.6, dot(n, normalize(sun)));
    gl_FragColor = vec4(vec3(0.24, 0.62, 1.0) * glow * day, glow * day);
  }`
const STAR_V = /* glsl */`
  attribute float size; attribute float phase; uniform float time; uniform float px; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = 0.55 + 0.45 * sin(time * (0.6 + fract(phase * 7.3) * 1.6) + phase * 6.2831);
    gl_PointSize = size * px;
    gl_Position = projectionMatrix * mv;
  }`
const STAR_F = /* glsl */`
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.82, 0.9, 1.0), a * a * vA);
  }`
const ARC_V = /* glsl */`
  attribute float t; varying float vT;
  void main() { vT = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const ARC_F = /* glsl */`
  uniform float time; uniform float k; varying float vT;
  void main() {
    float head = fract(time * 0.12 + k);
    float d = vT - head; d = d < 0.0 ? d + 1.0 : d;
    float pulse = exp(-d * 9.0) * step(0.0, d);
    float ends = smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
    gl_FragColor = vec4(vec3(0.45, 0.88, 1.0), (0.10 + 0.55 * pulse) * ends);
  }`

export function createGlobe(canvas, { textures, sites, home = { lon: 90, lat: 17 }, reduced = false, onReady }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x040816, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200)
  const sunWorld = new THREE.Vector3(-0.55, 0.42, 0.72).normalize()   // upper left, in front: day side faces us
  const sunView = new THREE.Vector3()

  // ---- stars (fixed to the camera, so dragging the globe keeps them still)
  // spread through the view frustum (with margin for wide screens and the off-centre view)
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const z = 40 + Math.random() * 30
    pos.set([(Math.random() * 2 - 1) * z * 1.1, (Math.random() * 2 - 1) * z * 0.5, -z], i * 3)
    size[i] = Math.random() < 0.06 ? 2.2 + Math.random() * 1.4 : 0.8 + Math.random() * 1.0
    phase[i] = Math.random()
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  sg.setAttribute('size', new THREE.BufferAttribute(size, 1))
  sg.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_V, fragmentShader: STAR_F, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, px: { value: renderer.getPixelRatio() } } })
  const stars = new THREE.Points(sg, starMat)
  camera.add(stars); scene.add(camera)

  // ---- earth
  const globe = new THREE.Group(); scene.add(globe)
  const earthGroup = new THREE.Group(); globe.add(earthGroup)
  const loader = new THREE.TextureLoader()
  const shared = { sun: { value: sunView }, cloudShift: { value: 0 } }
  const day = loader.load(textures.day, () => done())
  const cloudsTex = loader.load(textures.clouds, () => done())
  day.colorSpace = THREE.SRGBColorSpace
  day.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  for (const t of [day, cloudsTex]) { t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true }
  let loaded = 0
  function done() { if (++loaded === 2) onReady?.() }

  const sphere = new THREE.SphereGeometry(1, 128, 96)
  const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: EARTH_V, fragmentShader: EARTH_F,
    uniforms: { day: { value: day }, clouds: { value: cloudsTex }, ...shared } }))
  const cloud = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: EARTH_V, fragmentShader: CLOUD_F, transparent: true, depthWrite: false,
    uniforms: { clouds: { value: cloudsTex }, ...shared } }))
  cloud.scale.setScalar(1.009)
  const atm = new THREE.Mesh(new THREE.SphereGeometry(R_ATM, 96, 64), new THREE.ShaderMaterial({ vertexShader: EARTH_V, fragmentShader: ATM_F,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...shared, s0: { value: 1 / R_ATM } } }))
  earthGroup.add(earth, cloud); globe.add(atm)
  const water = createWater({ sunWorld, pixelRatio: renderer.getPixelRatio(), reduced })
  scene.add(water.group)

  // ---- site rings (light up under hover) and great-circle links between sites
  const ringGeo = new THREE.RingGeometry(0.018, 0.026, 64), discGeo = new THREE.CircleGeometry(0.06, 48)
  const marks = sites.map((s) => {
    const g = new THREE.Group()
    const n = toVec(s.lon, s.lat).normalize()
    g.position.copy(n.clone().multiplyScalar(1.004)); g.lookAt(n.clone().multiplyScalar(2))
    const mk = (geo, op) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    const ring = mk(ringGeo, 0), disc = mk(discGeo, 0)
    g.add(disc, ring); earthGroup.add(g)
    return { ...s, n, ring, disc, glow: 0, target: 0 }
  })
  const arcs = []
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    const a = marks[i].n, b = marks[j].n, steps = 96, p = [], t = []
    const ang = a.angleTo(b)
    for (let k = 0; k <= steps; k++) {
      const f = k / steps
      const v = new THREE.Vector3().copy(a).multiplyScalar(Math.sin((1 - f) * ang)).addScaledVector(b, Math.sin(f * ang)).divideScalar(Math.sin(ang))
      v.multiplyScalar(1.006 + Math.sin(f * Math.PI) * ang * 0.12); p.push(v.x, v.y, v.z); t.push(f)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('t', new THREE.Float32BufferAttribute(t, 1))
    const m = new THREE.ShaderMaterial({ vertexShader: ARC_V, fragmentShader: ARC_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, k: { value: (i * 0.37 + j * 0.21) % 1 } } })
    const line = new THREE.Line(g, m); earthGroup.add(line); arcs.push(line)
  }

  // ---- view state: the globe turns so that `view` (lon, lat) faces the camera
  const view = { lon: home.lon, lat: home.lat }, vel = { lon: 0, lat: 0 }
  let layoutBox = { x: 0, y: 0, w: 1, h: 1, W: 1, H: 1, fill: 0.84 }, dist0 = 4, dist = 4
  let focus = null, drag = null, lastUser = -1e9, pins = [], frame = 0, t0 = performance.now(), hoverId = null, hold = false, selId = null, aimFast = false
  const home0 = { ...home }

  function layout(box) {
    if (box.W !== layoutBox.W || box.H !== layoutBox.H) renderer.setSize(box.W, box.H, false)
    layoutBox = box
    camera.aspect = box.W / box.H
    // pick the camera distance so the globe's disc fills `fill` of the smaller side of its box
    const halfFov = (camera.fov / 2) * D
    const rPx = Math.min(box.w, box.h) * box.fill / 2
    const k = (rPx / (box.H / 2)) * Math.tan(halfFov)
    dist0 = 1 / Math.sin(Math.atan(k))
    if (!focus) dist = dist0
    // shift the image so the globe sits at the centre of its box instead of the window's centre
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2
    camera.setViewOffset(box.W, box.H, box.W / 2 - cx, box.H / 2 - cy, box.W, box.H)
    camera.updateProjectionMatrix()
  }

  const tmp = new THREE.Vector3(), camPos = new THREE.Vector3()
  function tick(now) {
    frame = requestAnimationFrame(tick)
    const t = (now - t0) / 1000
    if (hold && hoverId && !focus) lastUser = now  // hold still while a pin is hovered, so it stays under the pointer
    const idle = now - lastUser > 2600
    // drift: a slow sway around home + a gentle float; drag inertia; ease back home when left alone
    if (focus) {
      const f = Math.min(1, (now - focus.t0) / focus.ms), e = ease(f)
      view.lon = focus.from.lon + wrap(focus.lon - focus.from.lon) * e
      view.lat = focus.from.lat + (focus.lat - focus.from.lat) * e
      dist = focus.from.dist + (focus.dist - focus.from.dist) * e
      if (f >= 1 && !focus.fired) { focus.fired = true; focus.cb?.() }
      focus.go = f
    } else if (!drag) {
      view.lon += vel.lon; view.lat += vel.lat; vel.lon *= 0.92; vel.lat *= 0.92
      if (idle) {
        const sway = reduced ? 0 : Math.sin(t * 0.09) * 4.5
        const k = aimFast ? 0.045 : 0.012
        view.lon += wrap(home.lon + sway - view.lon) * k
        view.lat += (home.lat - view.lat) * k
        if (Math.abs(wrap(home.lon - view.lon)) < 5 && Math.abs(home.lat - view.lat) < 1) aimFast = false
      }
      view.lat = Math.max(-60, Math.min(60, view.lat))
    }
    globe.rotation.set(view.lat * D, Math.PI / 2 - (view.lon + 180) * D, 0, 'XYZ')
    globe.position.y = reduced ? 0 : Math.sin(t * 0.55) * 0.012
    camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    sunView.copy(sunWorld).transformDirection(camera.matrixWorldInverse)
    shared.cloudShift.value = reduced ? 0 : (t * 0.0009) % 1
    starMat.uniforms.time.value = reduced ? 0 : t
    for (const a of arcs) a.material.uniforms.time.value = t
    water.update(t, camera, focus ? focus.go ?? 0 : 0)

    // site rings: pulse; brighten under hover
    for (const m of marks) {
      m.target = m.id === hoverId || m.id === selId ? 1 : 0
      m.glow += (m.target - m.glow) * 0.12
      const pulse = reduced ? 0.5 : (Math.sin(t * 2.4 + m.lon) + 1) / 2
      m.ring.material.opacity = 0.25 + 0.35 * pulse + 0.4 * m.glow
      m.ring.scale.setScalar((1 + 0.25 * pulse + 0.7 * m.glow) * (0.55 + 0.45 * (dist - 1) / (dist0 - 1)))   // shrink as we move in
      m.disc.material.opacity = 0.05 + 0.22 * m.glow
      m.disc.scale.setScalar(0.6 + 0.8 * m.glow)
    }
    renderer.render(scene, camera)

    // place the HTML pins over their sites; fade them as they turn towards the limb
    camPos.copy(camera.position)
    for (const p of pins) {
      const m = marks.find((x) => x.id === p.id); if (!m || !p.el) continue
      tmp.copy(m.n).multiplyScalar(1.004); earthGroup.localToWorld(tmp)
      const facing = tmp.clone().normalize().dot(camPos.clone().sub(tmp).normalize())
      tmp.project(camera)
      const x = (tmp.x + 1) / 2 * layoutBox.W, y = (1 - tmp.y) / 2 * layoutBox.H
      const vis = Math.max(0, Math.min(1, (facing - 0.08) / 0.2))
      p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      p.el.style.opacity = vis.toFixed(3)
      p.el.style.pointerEvents = vis > 0.5 && !focus ? 'auto' : 'none'
      // label to the right; on the left near the right edge; centred above on narrow screens
      const flip = layoutBox.W < 600 ? 'up' : x > layoutBox.W - 250 ? '1' : ''
      if (p.el.dataset.flip !== flip) p.el.dataset.flip = flip
    }
  }
  frame = requestAnimationFrame(tick)

  // ---- drag to turn the globe
  const el = canvas
  const down = (e) => { if (focus) return; drag = { x: e.clientX, y: e.clientY }; vel.lon = vel.lat = 0; lastUser = performance.now(); el.setPointerCapture?.(e.pointerId); el.style.cursor = 'grabbing' }
  const move = (e) => {
    if (!drag) return
    const s = 90 / Math.max(240, Math.min(layoutBox.w, layoutBox.h)) * (dist / dist0)
    const dl = -(e.clientX - drag.x) * s, dt = (e.clientY - drag.y) * s
    view.lon = wrap(view.lon + dl); view.lat = Math.max(-60, Math.min(60, view.lat + dt))
    vel.lon = dl * 0.6; vel.lat = dt * 0.6
    drag = { x: e.clientX, y: e.clientY }; lastUser = performance.now()
  }
  const up = () => { if (drag) { drag = null; lastUser = performance.now(); el.style.cursor = '' } }
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)

  return {
    layout,
    setPins(list) { pins = list },
    // hold: the pointer is on the pin itself, so the globe stops drifting under it
    hover(id, holdStill = false) { hoverId = id; hold = holdStill && !!id },
    // a chosen site: keep its ring lit and turn the globe to face it
    select(id) {
      selId = id
      const m = marks.find((x) => x.id === id)
      Object.assign(home, m ? { lon: m.lon, lat: m.lat } : home0)
      aimFast = true; lastUser = -1e9
    },
    // turn to a site and move in; `cb` runs when the move ends
    focus(id, cb) {
      const m = marks.find((x) => x.id === id); if (!m) { cb?.(); return }
      hoverId = id
      focus = { lon: m.lon, lat: m.lat, dist: 1 + (dist0 - 1) * 0.22, from: { ...view, dist }, t0: performance.now(), ms: reduced ? 350 : 1900, cb }
    },
    dispose() {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up)
      scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      water.dispose(); day.dispose(); cloudsTex.dispose(); renderer.dispose()
    },
  }
}
