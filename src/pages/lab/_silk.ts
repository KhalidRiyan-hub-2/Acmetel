// LAB J04 silk ribbon (user reference: lab.usestate.org/report06), rebuilt the cheap way: every vertex is moved in
// the vertex shader (simplex noise + uTime), so the CPU uploads nothing per frame. One LineSegments draw call.
//   mode 'settle'  the ribbon's threads fan out into rows; inside the letters of "Acmetel" (a soft mask texture,
//                  sampled in the vertex shader) the rows keep oscillating, so the name is formed by the threads.
//   mode 'ribbon'  the ribbon alone, pinched at the centre, as a background behind the tagline.
// Lazy-loaded (three.js chunk), visibleLoop, every other frame, DPR capped, reduced motion = one settled frame.
import {
  WebGLRenderer, Scene, OrthographicCamera, BufferGeometry, BufferAttribute, LineSegments, ShaderMaterial,
  CanvasTexture, LinearFilter, AdditiveBlending, Color,
} from 'three';
import { visibleLoop, prefersReducedMotion } from '../../scripts/motion';

const NOISE = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) { // Ashima Arts / Stefan Gustavson 2D simplex noise (MIT)
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

const VERT = /* glsl */ `
${NOISE}
attribute float aT;     // 0..1 along the thread
attribute float aLine;  // 0..1 across the threads
uniform float uTime, uSettle, uRowSpan, uAmp, uFreq;
uniform sampler2D uMask;
varying float vX; varying float vInk; varying float vS;
void main() {
  float x = aT * 2.0 - 1.0;
  // Ribbon: neighbouring threads share almost the same noise, so together they read as one surface.
  float n = snoise(vec2(aT * 1.5 + uTime * 0.04, aLine * 0.9 + uTime * 0.11));
  float pinch = 0.12 + 0.88 * abs(sin(x * 1.7));
  float ribbonY = (n * 0.5 + (aLine - 0.5) * 0.22) * pinch;
  float ribbonX = x + (aLine - 0.5) * 0.06;
  // Settled: evenly spaced rows; inside the letters the row oscillates.
  float rowY = (aLine - 0.5) * 2.0 * uRowSpan;
  float ink = texture2D(uMask, vec2(aT, rowY * 0.5 + 0.5)).a;
  float osc = ink * uAmp * sin(aT * uFreq + uTime * 2.6 + aLine * 37.0);
  // Threads settle top to bottom in a short wave.
  float s = smoothstep(0.0, 1.0, clamp(uSettle * 1.5 - aLine * 0.5, 0.0, 1.0));
  gl_Position = vec4(mix(ribbonX, x, s), mix(ribbonY, rowY + osc, s), 0.0, 1.0);
  vX = x; vInk = ink; vS = s;
}`;

const FRAG = /* glsl */ `
uniform vec3 uA, uB, uC; uniform float uDim;
varying float vX; varying float vInk; varying float vS;
void main() {
  // Mint at the edges, deep green toward the centre (the reference fades by clip-space x).
  vec3 ribbon = mix(uA, uB, 1.0 - abs(vX));
  vec3 col = mix(ribbon, mix(uC, uA, vInk), vS);
  float a = mix(0.32, mix(0.10, 0.95, vInk), vS) * uDim;
  gl_FragColor = vec4(col * a, a);
}`;

export function initSilk(canvas: HTMLCanvasElement, mode: 'settle' | 'ribbon', word = 'Acmetel') {
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string) => new Color(css.getPropertyValue(n).trim());
  const reduced = prefersReducedMotion();
  const small = innerWidth < 768;
  const LINES = mode === 'settle' ? (small ? 44 : 84) : small ? 40 : 70;
  const PTS = small ? 420 : 900;

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Geometry: LINES threads of PTS points, as segment pairs (one draw call).
  const aT = new Float32Array(LINES * PTS), aLine = new Float32Array(LINES * PTS), pos = new Float32Array(LINES * PTS * 3);
  const idx: number[] = [];
  for (let l = 0; l < LINES; l++) for (let p = 0; p < PTS; p++) {
    const i = l * PTS + p;
    aT[i] = p / (PTS - 1); aLine[i] = l / (LINES - 1);
    if (p < PTS - 1) idx.push(i, i + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aT', new BufferAttribute(aT, 1));
  geo.setAttribute('aLine', new BufferAttribute(aLine, 1));
  geo.setIndex(idx);

  // Soft word mask: drawn small, so linear filtering blurs its edges.
  const maskCanvas = document.createElement('canvas');
  const mask = new CanvasTexture(maskCanvas);
  mask.minFilter = LinearFilter; mask.magFilter = LinearFilter; mask.generateMipmaps = false;

  const uniforms = {
    uTime: { value: 0 }, uSettle: { value: mode === 'settle' && reduced ? 1 : 0 }, uRowSpan: { value: 0.86 },
    uAmp: { value: 0.03 }, uFreq: { value: 300 }, uMask: { value: mask }, uDim: { value: 1 },
    uA: { value: tok('--color-teal-300') }, uB: { value: tok('--color-green-800') }, uC: { value: tok('--color-navy-600') },
  };
  const mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest: false, blending: AdditiveBlending, premultipliedAlpha: true });
  scene.add(new LineSegments(geo, mat));

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    // Mask at 1/3 size, same fit as the 2D directions (94% of width, 80% of height).
    const mw = Math.max(1, Math.round(w / 3)), mh = Math.max(1, Math.round(h / 3));
    maskCanvas.width = mw; maskCanvas.height = mh;
    const m = maskCanvas.getContext('2d')!;
    m.font = '700 100px Poppins, sans-serif';
    const met = m.measureText(word);
    const capH = met.actualBoundingBoxAscent / 100;
    const fs = Math.min((mw * 0.94) / (met.width / 100), (mh * 0.8) / capH);
    m.font = `700 ${fs}px Poppins, sans-serif`;
    m.fillStyle = '#fff';
    m.fillText(word, (mw - (met.width / 100) * fs) / 2, (mh + capH * fs) / 2);
    mask.needsUpdate = true;
    // Row spacing vs. oscillation: the amplitude is about one row gap, the carrier ~ every 7 CSS px.
    const rows = LINES - 1;
    uniforms.uAmp.value = ((2 * uniforms.uRowSpan.value) / rows) * 1.15;
    uniforms.uFreq.value = (w / 10) * Math.PI * 2; // one carrier cycle every ~10 CSS px, in radians across the width
    render();
  };
  const render = () => renderer.render(scene, camera);
  if (mode === 'ribbon') uniforms.uDim.value = 0.8;

  new ResizeObserver(resize).observe(canvas);
  resize();
  if (reduced) { uniforms.uTime.value = 12; render(); return { replay() {} }; }

  let t = 0, settleAt = mode === 'settle' ? 0.9 : Infinity, frame = 0;
  const loop = visibleLoop(canvas, (_e, dt) => {
    t += dt;
    uniforms.uTime.value = t;
    if (t > settleAt) uniforms.uSettle.value = Math.min(1, (t - settleAt) / 2.2);
    if (++frame % 2) return; // every other frame, like the reference
    render();
  });
  return { replay() { t = 0; uniforms.uSettle.value = 0; loop.play(); } };
}
