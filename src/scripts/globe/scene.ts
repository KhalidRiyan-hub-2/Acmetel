// Hero globe: Three.js scene. Loaded lazily by components/home/GlobeHero.astro, never in the initial bundle.
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CatmullRomCurve3, CircleGeometry, Group, LineBasicMaterial,
  LineSegments, Mesh, PerspectiveCamera, Points, Quaternion, Scene, ShaderMaterial, SphereGeometry, TubeGeometry, Vector3, WebGLRenderer,
} from 'three';
import { gsap, visibleLoop, bindPauseButton } from '../motion';
import { chinaRoute, focus, latLonToVec3, markets } from '../../data/globe';

export interface GlobeOptions {
  /** URL of public/data/land-dots.bin (Float32 xyz triples on the unit sphere). */
  dotsUrl: string;
  /** HTML label that follows the Pakistan marker. */
  label?: HTMLElement | null;
  /** Small chip that explains zoom ("Click to zoom" / "Scroll to zoom · Esc to exit"). */
  hint?: HTMLElement | null;
  pauseButton?: HTMLButtonElement | null;
  /** Called after the first frame has been drawn (used to cross-fade the static image out). */
  onFirstFrame?: () => void;
  /** Called if the GL context is lost so the caller can restore the static image. */
  onContextLost?: () => void;
}

const FOV = 30;
const HOME_DIST = 4.0;
const MIN_DIST = 1.9;
const MAX_DIST = 4.8;
const IDLE_MS = 4000;
const TAU = Math.PI * 2;

// Brand tokens as raw sRGB triples (shaders output sRGB directly, so no colour-space conversion).
const hex = (h: string) => new Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TEAL_300 = hex('#7fdcd5');
const TEAL_400 = hex('#4cc6bd');
const TEAL_500 = hex('#22aaa1');
const NAVY_950 = hex('#0e1322');
const NAVY_700 = hex('#2a3556');

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const SPHERE_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const SPHERE_FRAG = /* glsl */ `
  uniform vec3 uDark; uniform vec3 uLit; uniform vec3 uRim; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float f = clamp(dot(n, v), 0.0, 1.0);
    float diff = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);
    vec3 col = mix(uDark, uLit, pow(diff, 1.3) * 0.85);
    col += uRim * pow(1.0 - f, 3.2) * 0.5;
    gl_FragColor = vec4(col, 0.93 * uOpacity);
  }`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float i = pow(clamp(f / 0.5, 0.0, 1.0), 3.0) * 0.55;
    gl_FragColor = vec4(uColor * i, i * uOpacity);
  }`;

const POINTS_VERT = /* glsl */ `
  uniform float uSize; uniform float uScale; uniform vec3 uFocus;
  varying float vFacing; varying float vFocus;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vec3 n = normalize(wp.xyz - modelMatrix[3].xyz);
    vFacing = dot(n, normalize(cameraPosition - wp.xyz));
    vFocus = smoothstep(0.55, 0.0, distance(position, uFocus));
    gl_PointSize = max(uSize * uScale / -mv.z * (1.0 + vFocus * 0.2), 1.5);
    gl_Position = projectionMatrix * mv;
  }`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uOpacity;
  varying float vFacing; varying float vFocus;
  void main() {
    if (vFacing < 0.0) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.3, d);
    float f = smoothstep(0.0, 0.65, vFacing);
    vec3 col = mix(uA, uB, clamp(pow(f, 1.6) * 0.75 + vFocus * 0.55, 0.0, 1.0));
    gl_FragColor = vec4(col, a * mix(0.2, 1.0, f) * (1.0 + vFocus * 0.25) * uOpacity);
  }`;

const MARKER_VERT = /* glsl */ `
  varying vec2 vUv; varying float vFacing;
  void main() {
    vUv = uv;
    vec3 c = modelMatrix[3].xyz;
    vFacing = dot(normalize(c), normalize(cameraPosition - c));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;

const MARKER_FRAG = /* glsl */ `
  uniform float uTime; uniform float uPeriod; uniform float uPhase; uniform float uIntensity; uniform float uCore; uniform float uRings;
  uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vUv; varying float vFacing;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    if (d > 1.0 || vFacing < 0.0) discard;
    float core = smoothstep(uCore, uCore * 0.55, d);
    float halo = exp(-d * d * 14.0) * 0.55;
    float t1 = fract(uTime / uPeriod + uPhase);
    float t2 = fract(t1 + 0.5);
    float r1 = smoothstep(0.08, 0.0, abs(d - t1 * 0.95)) * (1.0 - t1);
    float r2 = smoothstep(0.08, 0.0, abs(d - t2 * 0.95)) * (1.0 - t2);
    float a = clamp(core + halo + (r1 + r2) * uRings, 0.0, 1.0) * uIntensity * smoothstep(0.0, 0.2, vFacing) * uOpacity;
    vec3 col = mix(uColor, vec3(0.93, 1.0, 0.99), core);
    gl_FragColor = vec4(col, a);
  }`;

const ROUTE_VERT = /* glsl */ `
  varying float vU; varying float vFacing;
  void main() {
    vU = uv.x;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(wp.xyz - modelMatrix[3].xyz);
    vFacing = dot(n, normalize(cameraPosition - wp.xyz));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const ROUTE_FRAG = /* glsl */ `
  uniform float uTime; uniform float uOpacity; uniform vec3 uA; uniform vec3 uB;
  varying float vU; varying float vFacing;
  void main() {
    if (vFacing < 0.0) discard;
    float flow = fract(vU * 9.0 - uTime * 0.35);
    float dash = smoothstep(0.0, 0.1, flow) * smoothstep(0.42, 0.18, flow);
    float ends = smoothstep(0.0, 0.04, vU) * smoothstep(1.0, 0.96, vU);
    float a = (0.42 + dash * 0.95) * ends * smoothstep(0.0, 0.25, vFacing) * uOpacity;
    gl_FragColor = vec4(mix(uA, uB, dash), a);
  }`;

export function initGlobe(container: HTMLElement, opts: GlobeOptions): { destroy(): void } {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;opacity:0;';
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  const globe = new Group();
  scene.add(globe);

  // --- Body, rim glow, graticule -------------------------------------------------------------
  const sphereGeo = track(new SphereGeometry(0.995, 72, 48));
  const sphereMat = track(new ShaderMaterial({
    vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG, transparent: true,
    uniforms: { uDark: { value: NAVY_950 }, uLit: { value: NAVY_700 }, uRim: { value: TEAL_500 }, uOpacity: { value: 1 } },
  }));
  const body = new Mesh(sphereGeo, sphereMat);
  body.renderOrder = 0;
  globe.add(body);

  const glowGeo = track(new SphereGeometry(1.2, 64, 40));
  const glowMat = track(new ShaderMaterial({
    vertexShader: SPHERE_VERT, fragmentShader: GLOW_FRAG, transparent: true, side: BackSide, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uColor: { value: TEAL_500 }, uOpacity: { value: 1 } },
  }));
  const glow = new Mesh(glowGeo, glowMat);
  glow.renderOrder = 1;
  globe.add(glow);

  const gratPos: number[] = [];
  const seg = (a: Vector3, b: Vector3) => gratPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = 0; lon < 360; lon += 4) seg(latLonToVec3(lat, lon, 1.0015), latLonToVec3(lat, lon + 4, 1.0015));
  }
  for (let lon = 0; lon < 360; lon += 30) {
    for (let lat = -84; lat < 84; lat += 4) seg(latLonToVec3(lat, lon, 1.0015), latLonToVec3(lat + 4, lon, 1.0015));
  }
  const gratGeo = track(new BufferGeometry());
  gratGeo.setAttribute('position', new BufferAttribute(new Float32Array(gratPos), 3));
  const gratMat = track(new LineBasicMaterial({ color: 0x4cc6bd, transparent: true, opacity: 0.075, depthWrite: false }));
  const graticule = new LineSegments(gratGeo, gratMat);
  graticule.renderOrder = 2;
  globe.add(graticule);

  // --- Land dots (loaded async; one draw call) -----------------------------------------------
  const focusDir = latLonToVec3(focus.lat, focus.lon, 1);
  const pointsMat = track(new ShaderMaterial({
    vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG, transparent: true, depthWrite: false,
    uniforms: {
      uSize: { value: 0.0098 }, uScale: { value: 500 }, uFocus: { value: focusDir },
      uA: { value: TEAL_500 }, uB: { value: TEAL_300 }, uOpacity: { value: 1 },
    },
  }));
  let points: Points | null = null;
  let destroyed = false;
  fetch(opts.dotsUrl)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      if (destroyed) return;
      const geo = track(new BufferGeometry());
      geo.setAttribute('position', new BufferAttribute(new Float32Array(buf), 3));
      geo.computeBoundingSphere();
      points = new Points(geo, pointsMat);
      points.frustumCulled = false;
      points.renderOrder = 3;
      globe.add(points);
    })
    .catch(() => { /* globe still renders without land dots */ });

  // --- Route + markers -----------------------------------------------------------------------
  const routeBase = new CatmullRomCurve3(chinaRoute.map((p) => latLonToVec3(p.lat, p.lon, 1)), false, 'centripetal');
  const samples = routeBase.getPoints(160);
  const lifted = samples.map((p, i) => p.normalize().multiplyScalar(1.004 + 0.028 * Math.sin((Math.PI * i) / (samples.length - 1))));
  const routeGeo = track(new TubeGeometry(new CatmullRomCurve3(lifted), 240, 0.0034, 5, false));
  const routeMat = track(new ShaderMaterial({
    vertexShader: ROUTE_VERT, fragmentShader: ROUTE_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uA: { value: TEAL_500 }, uB: { value: TEAL_300 } },
  }));
  const route = new Mesh(routeGeo, routeMat);
  route.renderOrder = 4;
  globe.add(route);

  const markerGeo = track(new CircleGeometry(1, 40));
  const markerMats: ShaderMaterial[] = [];
  const zAxis = new Vector3(0, 0, 1);
  const addMarker = (lat: number, lon: number, size: number, intensity: number, o: { phase?: number; period?: number; rings?: number; core?: number; color?: Vector3 } = {}) => {
    const mat = track(new ShaderMaterial({
      vertexShader: MARKER_VERT, fragmentShader: MARKER_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uPeriod: { value: o.period ?? 2.6 }, uPhase: { value: o.phase ?? 0 }, uIntensity: { value: intensity },
        uCore: { value: o.core ?? 0.16 }, uRings: { value: o.rings ?? 1 }, uColor: { value: o.color ?? TEAL_300 }, uOpacity: { value: 1 },
      },
    }));
    markerMats.push(mat);
    const m = new Mesh(markerGeo, mat);
    const dir = latLonToVec3(lat, lon, 1);
    m.position.copy(dir).multiplyScalar(1.006);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(zAxis, dir));
    m.scale.setScalar(size);
    m.renderOrder = 5;
    globe.add(m);
    return m;
  };
  const marker = addMarker(focus.lat, focus.lon, 0.105, 0.9, { period: 2.4, core: 0.15 });
  markets.forEach((m, i) => addMarker(m.lat, m.lon, 0.048, 0.62, { phase: i * 0.19, period: 3.4, rings: 0.55, core: 0.26 }));
  const urumqi = chinaRoute[chinaRoute.length - 1];
  addMarker(urumqi.lat, urumqi.lon, 0.04, 0.55, { rings: 0, core: 0.3 });

  // --- View state ----------------------------------------------------------------------------
  // Rotation order XYZ: yaw (y) is applied first, then pitch (x). yaw = -90deg - lon brings a longitude to the front.
  const home = { yaw: -Math.PI / 2 - (focus.lon * Math.PI) / 180, pitch: (focus.lat * Math.PI) / 180, dist: HOME_DIST };
  const view = { yaw: home.yaw - 2.4, pitch: home.pitch * 0.35, dist: HOME_DIST + 1.8 };
  const intro = { o: 0, s: 0.88, label: 0 };
  let introDone = false;
  let motionPaused = false;
  let animT = 0;
  let velYaw = 0;
  let velPitch = 0;
  let focused = false;
  let hovering = false;
  let returning = false;
  let lastInteract = performance.now();
  let returnTween: gsap.core.Tween | null = null;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 1;
  let height = 1;
  let firstFrame = false;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const setHint = () => {
    const el = opts.hint;
    if (!el) return;
    el.textContent = focused ? (coarse ? 'Pinch to zoom · Tap outside to exit' : 'Scroll to zoom · Esc to exit') : (coarse ? 'Tap to zoom' : 'Click to zoom');
    el.dataset.show = String(focused || (hovering && introDone));
  };
  const touch = () => { lastInteract = performance.now(); returnTween?.kill(); returnTween = null; returning = false; };
  const setFocused = (v: boolean) => { focused = v; canvas.style.cursor = v ? 'zoom-in' : 'grab'; setHint(); };

  const startIntro = () => {
    gsap.to(intro, { o: 1, duration: 1.1, ease: 'power2.out' });
    gsap.to(intro, { s: 1, duration: 1.8, ease: 'expo.out' });
    gsap.to(view, {
      yaw: home.yaw, pitch: home.pitch, dist: home.dist, duration: 3, ease: 'power3.out',
      onComplete: () => { introDone = true; lastInteract = performance.now(); gsap.to(intro, { label: 1, duration: 0.8 }); },
    });
  };

  // --- Sizing --------------------------------------------------------------------------------
  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    pointsMat.uniforms.uScale.value = (height * dpr) / (2 * Math.tan((FOV * Math.PI) / 360));
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // --- Interaction ---------------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let moved = 0;
  let downAt = 0;
  let pinchStart = 0;
  let pinchDist = 0;

  const pxToRad = () => (2 * Math.tan((FOV * Math.PI) / 360) * view.dist) / height;

  const onDown = (e: PointerEvent) => {
    if (!introDone || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    touch();
    velYaw = velPitch = 0;
    if (pointers.size === 1) { dragging = true; moved = 0; downAt = performance.now(); canvas.style.cursor = 'grabbing'; }
    if (pointers.size === 2 && focused) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchDist = view.dist;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const r = canvas.getBoundingClientRect();
      parallax.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      parallax.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    touch();
    if (pointers.size >= 2 && focused) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0) view.dist = clamp(pinchDist * (pinchStart / d), MIN_DIST, MAX_DIST);
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    const k = pxToRad();
    view.yaw += dx * k;
    view.pitch = clamp(view.pitch + dy * k, -1.3, 1.3);
    velYaw = dx * k * 60 * 0.35 + velYaw * 0.5;
    velPitch = dy * k * 60 * 0.35 + velPitch * 0.5;
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.size === 0) {
      dragging = false;
      canvas.style.cursor = focused ? 'zoom-in' : 'grab';
      if (e.type === 'pointerup' && moved < 6 && performance.now() - downAt < 500) { setFocused(true); velYaw = velPitch = 0; }
    }
    pinchStart = 0;
    touch();
  };
  const onWheel = (e: WheelEvent) => {
    if (!focused) return;
    e.preventDefault();
    touch();
    view.dist = clamp(view.dist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST);
  };
  const onEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') { hovering = true; setHint(); } };
  const onLeave = () => { hovering = false; parallax.tx = parallax.ty = 0; setHint(); };
  const onDocDown = (e: PointerEvent) => { if (focused && !container.contains(e.target as Node)) setFocused(false); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && focused) setFocused(false); };
  const onLost = (e: Event) => { e.preventDefault(); opts.onContextLost?.(); };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerenter', onEnter);
  container.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('pointerdown', onDocDown);
  document.addEventListener('keydown', onKey);

  // --- Frame ---------------------------------------------------------------------------------
  const tmp = new Vector3();
  const frame = (_t: number, dt: number) => {
    if (!motionPaused) animT += dt;

    if (introDone) {
      // Inertia after a drag.
      if (!dragging && (Math.abs(velYaw) > 1e-4 || Math.abs(velPitch) > 1e-4)) {
        view.yaw += velYaw * dt;
        view.pitch = clamp(view.pitch + velPitch * dt, -1.3, 1.3);
        const damp = Math.exp(-3.2 * dt);
        velYaw *= damp; velPitch *= damp;
      }
      // Idle: ease back to the Pakistan view (and release focus so page scroll is never held).
      if (!dragging && !returning && performance.now() - lastInteract > IDLE_MS) {
        let dy = view.yaw - home.yaw;
        dy -= Math.round(dy / TAU) * TAU;
        const far = Math.abs(dy) > 0.01 || Math.abs(view.pitch - home.pitch) > 0.01 || Math.abs(view.dist - home.dist) > 0.02;
        if (far) {
          returning = true;
          velYaw = velPitch = 0;
          if (focused) setFocused(false);
          view.yaw = home.yaw + dy;
          returnTween = gsap.to(view, { yaw: home.yaw, pitch: home.pitch, dist: home.dist, duration: 1.6, ease: 'power3.inOut', onComplete: () => { returning = false; } });
        }
      }
      parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 3);
      parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 3);
    }

    const drift = introDone ? Math.sin(animT * 0.22) * 0.045 : 0;
    const par = dragging || focused ? 0 : 1;
    globe.rotation.set(view.pitch + parallax.y * 0.04 * par, view.yaw + drift + parallax.x * 0.07 * par, 0);
    globe.scale.setScalar(intro.s);
    camera.position.set(0, 0, view.dist);
    camera.lookAt(0, 0, 0);
    globe.updateMatrixWorld(true);

    routeMat.uniforms.uTime.value = animT;
    for (const m of markerMats) m.uniforms.uTime.value = animT;
    for (const m of [sphereMat, glowMat, pointsMat, routeMat, ...markerMats]) m.uniforms.uOpacity.value = 1;
    gratMat.opacity = 0.075;
    canvas.style.opacity = String(intro.o);

    // Project the Pakistan marker for the HTML label; hide it on the far side.
    const label = opts.label;
    if (label) {
      tmp.copy(marker.position).applyMatrix4(globe.matrixWorld);
      const toCam = camera.position.clone().sub(tmp).normalize();
      const facing = tmp.clone().normalize().dot(toCam);
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * width;
      const y = (-tmp.y * 0.5 + 0.5) * height;
      const vis = clamp((facing - 0.1) / 0.25, 0, 1) * intro.label;
      label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      label.style.opacity = vis.toFixed(3);
    }

    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      opts.onFirstFrame?.();
      startIntro();
    }
  };

  const loop = visibleLoop(container, frame);
  const pauseApi = { pause() { motionPaused = true; }, play() { motionPaused = false; } };
  bindPauseButton(opts.pauseButton ?? null, pauseApi);
  setHint();

  return {
    destroy() {
      destroyed = true;
      loop.destroy();
      gsap.killTweensOf(view);
      gsap.killTweensOf(intro);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      container.removeEventListener('pointerenter', onEnter);
      container.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
