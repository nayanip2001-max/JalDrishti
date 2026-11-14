// Decorative ocean-water spiral around the landing globe: two thick, twisting bands of water that cross at the
// globe's left and right limbs (so they never pass over the event sites in front), with flowing normals, sky
// reflections, a sun glint, edge foam, cyan rim light and droplet splashes where the bands cross.
// Drawn inside the WebGL canvas: it can never sit above or intercept the HTML pins and controls.
import * as THREE from 'three'

const NOISE = /* glsl */`
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`

const WATER_V = /* glsl */`
  uniform float time; uniform float flow;
  varying vec2 vUv; varying vec3 vW; varying vec3 vN;
  void main() {
    vUv = uv;
    // a travelling swell along the band
    float swell = sin(uv.x * 75.0 - time * 2.6 * flow) * 0.5 + sin(uv.x * 31.0 + time * 1.3) * 0.5;
    vec3 p = position + normal * swell * 0.006;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`
const WATER_F = /* glsl */`
  uniform float time; uniform float flow; uniform float fade; uniform vec3 sunW; uniform vec3 cam;
  varying vec2 vUv; varying vec3 vW; varying vec3 vN;
  ${NOISE}
  void main() {
    vec2 q = vec2(vUv.x * 46.0 - time * 0.9 * flow, vUv.y * 5.0);
    float n = fbm(q), n2 = fbm(q * 1.9 + vec2(4.1, time * 0.25));
    vec3 V = normalize(cam - vW);
    vec3 N = normalize(vN + (vec3(n, n2, n * 0.5 + n2 * 0.5) - 0.5) * 0.9);
    if (dot(N, V) < 0.0) N = -N;                                    // two-sided
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(vec3(0.015, 0.05, 0.11), vec3(0.55, 0.85, 1.0), smoothstep(-0.2, 1.0, R.y * 0.6 + dot(R, sunW) * 0.5));
    float spec = pow(max(dot(R, sunW), 0.0), 120.0) * 2.2 + pow(max(dot(R, sunW), 0.0), 18.0) * 0.18;
    vec3 deep = vec3(0.0, 0.10, 0.19), shallow = vec3(0.02, 0.48, 0.60);
    vec3 col = mix(deep, shallow, 0.2 + 0.6 * n);
    col = mix(col, sky, fres * 0.8) + vec3(1.0) * spec;
    col += vec3(0.25, 0.9, 1.0) * pow(n2, 4.0) * 0.9;                 // caustic-like light streaks inside the water
    // foam: along both edges of the band and on breaking crests
    float edge = pow(abs(cos(vUv.y * 6.2831853)), 9.0);
    float crest = 0.5 + 0.5 * sin(vUv.x * 150.0 - time * 3.4 * flow + n * 6.0);
    float fine = fbm(vec2(vUv.x * 220.0 - time * 2.2 * flow, vUv.y * 14.0));
    float foam = smoothstep(0.66, 0.92, fine * 0.55 + edge * 0.5 + crest * 0.1 + n * 0.15);
    col = mix(col, vec3(0.9, 0.97, 1.0), foam * 0.9);
    col += vec3(0.13, 0.83, 0.93) * fres * 0.55;                     // cyan rim light
    float a = clamp(0.14 + fres * 0.6 + foam * 0.65 + spec + pow(n2, 4.0) * 0.3, 0.0, 1.0) * fade;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
const DROP_V = /* glsl */`
  attribute vec3 origin; attribute vec3 vel; attribute float seed;
  uniform float time; uniform float px; uniform float boost;
  varying float vA;
  void main() {
    float life = 0.7 + seed * 0.9;
    float age = mod(time * (0.8 + 0.6 * boost) + seed * 17.0, life);
    float k = age / life;
    vec3 p = origin + vel * age * (1.0 + boost) * (1.0 - 0.45 * k) - normalize(origin) * 0.05 * k * k;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = pow(1.0 - k, 1.6) * smoothstep(0.0, 0.08, k);
    gl_PointSize = (2.0 + seed * 3.5) * px * (4.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const DROP_F = /* glsl */`
  uniform float fade; varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    float body = smoothstep(0.5, 0.15, d);
    float hi = smoothstep(0.16, 0.0, length(c - vec2(-0.12, -0.12)));
    gl_FragColor = vec4(mix(vec3(0.55, 0.9, 1.0), vec3(1.0), hi), (body * 0.75 + hi * 0.4) * vA * fade);
  }`

// One closed band: a ring of radius r tilted about the screen's horizontal axis, with a gentle wobble,
// and an elliptical cross-section (w x h) that twists 2.5 turns round the loop (a closed helix).
function band(r, tilt, phase, w, h, segs = 420, rad = 18) {
  const P = (th) => {
    const rr = r + 0.035 * Math.sin(3 * th + phase)
    const y = 0.04 * Math.sin(2 * th + phase)
    const v = new THREE.Vector3(rr * Math.cos(th), y, rr * Math.sin(th))
    return v.applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt)
  }
  const pos = [], nor = [], uv = [], idx = []
  for (let i = 0; i <= segs; i++) {
    const th = (i / segs) * Math.PI * 2
    const p = P(th), T = P(th + 1e-3).sub(P(th - 1e-3)).normalize()
    const N0 = p.clone().normalize(), B = new THREE.Vector3().crossVectors(T, N0).normalize()
    const N1 = new THREE.Vector3().crossVectors(B, T).normalize()
    const al = 2.5 * th + phase                                          // twist: 2.5 turns per loop (a multiple of pi: seamless)
    const A = N1.clone().multiplyScalar(Math.cos(al)).addScaledVector(B, Math.sin(al))
    const C = N1.clone().multiplyScalar(-Math.sin(al)).addScaledVector(B, Math.cos(al))
    for (let j = 0; j <= rad; j++) {
      const ph = (j / rad) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph)
      const q = p.clone().addScaledVector(A, c * w).addScaledVector(C, s * h)
      const n = A.clone().multiplyScalar(c / w).addScaledVector(C, s / h).normalize()
      pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); uv.push(i / segs, j / rad)
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return { geo: g, at: P }
}

export function createWater({ sunWorld, pixelRatio, radius = 1.3, reduced = false }) {
  const group = new THREE.Group()
  const uniforms = { time: { value: 0 }, flow: { value: 1 }, fade: { value: 1 }, sunW: { value: sunWorld }, cam: { value: new THREE.Vector3() } }
  const bands = [band(radius, 0.44, 0, 0.088, 0.05), band(radius * 1.02, -0.44, Math.PI / 2, 0.088, 0.05)]
  for (const b of bands) {
    // back faces first, then front faces: reads as a thick, see-through body of water
    for (const [side, order] of [[THREE.BackSide, 10], [THREE.FrontSide, 11]]) {
      const m = new THREE.Mesh(b.geo, new THREE.ShaderMaterial({ vertexShader: WATER_V, fragmentShader: WATER_F, uniforms,
        transparent: true, depthWrite: false, side }))
      m.renderOrder = order; group.add(m)
    }
  }
  // splashes: mostly where the bands cross (left and right limbs), some anywhere along them
  const M = reduced ? 0 : 520, org = [], vel = [], seed = []
  for (let i = 0; i < M; i++) {
    const b = bands[i % 2]
    const th = Math.random() < 0.65 ? (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.5 : Math.random() * Math.PI * 2
    const p = b.at(th), out = p.clone().normalize()
    const v = out.multiplyScalar(0.08 + Math.random() * 0.16).add(new THREE.Vector3().randomDirection().multiplyScalar(0.07))
    org.push(p.x, p.y, p.z); vel.push(v.x, v.y, v.z); seed.push(Math.random())
  }
  const dg = new THREE.BufferGeometry()
  dg.setAttribute('position', new THREE.Float32BufferAttribute(org, 3))
  dg.setAttribute('origin', new THREE.Float32BufferAttribute(org, 3))
  dg.setAttribute('vel', new THREE.Float32BufferAttribute(vel, 3))
  dg.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1))
  const dropU = { time: uniforms.time, fade: uniforms.fade, px: { value: pixelRatio }, boost: { value: 0 } }
  const drops = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DROP_V, fragmentShader: DROP_F, uniforms: dropU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  drops.renderOrder = 12; drops.frustumCulled = false; group.add(drops)

  return {
    group,
    // t: seconds; camera; go: 0..1 progress of the entry transition (swirl, expand past the camera, fade)
    update(t, camera, go = 0) {
      uniforms.time.value = reduced ? 0 : t
      uniforms.cam.value.copy(camera.position)
      const e = go * go
      uniforms.flow.value = 1 + 7 * e
      uniforms.fade.value = 1 - THREE.MathUtils.smoothstep(go, 0.72, 1)
      dropU.boost.value = 2.5 * e
      group.rotation.set(reduced ? 0 : Math.sin(t * 0.21) * 0.035, 0, (reduced ? 0 : Math.sin(t * 0.13) * 0.03) + e * 1.9)
      group.scale.setScalar(1 + e * 2.4)
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() }) },
  }
}
