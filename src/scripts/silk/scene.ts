// Silk threads (three.js). After the user's "silk wave" reference (lab.usestate.org/report06), rebuilt the cheap
// way: every vertex moves in the vertex shader (simplex noise + uTime), so nothing is uploaded per frame, and all
// threads are one LineSegments draw call.
//   mode 'settle'  the ribbon's threads fan out into evenly spaced rows; inside the letters of the word (a soft
//                  mask texture sampled in the vertex shader) the rows oscillate, so the threads spell the name.
//                  `settle(0..1)` drives the hand-off (SignalName tweens it on click).
//   mode 'ribbon'  the ribbon alone, pinched at the centre (for a future background use).
// Motion budget: the loop runs while there is "energy". Energy refills to HOLD seconds when the settle value
// changes or the canvas comes back on screen, and the motion eases to a stop as it runs out, then the loop sleeps
// (WCAG 2.2.2: nothing moves for more than ~5 s on its own). visibleLoop pauses it off screen; it renders every
// other frame; DPR is capped. Loaded lazily: this module is the only one that pulls in three.js here.
import {
  WebGLRenderer, Scene, OrthographicCamera, BufferGeometry, BufferAttribute, LineSegments, ShaderMaterial,
  CanvasTexture, LinearFilter, AdditiveBlending, Vector3,
} from 'three';
import { visibleLoop } from '../motion';
import { ROW_SPAN, isSmall, threadCount, pointCount, drawMask, oscillation, palette, ALPHA_CALM, ALPHA_INK } from './shared';

/** Seconds of motion after the last settle change or re-entry, and the ease-out at the end of it. */
const HOLD = 5, FADE = 1.4;

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
varying float vX; varying float vInk; varying float vS; varying float vFade;
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
  // Threads settle bottom to top in a short wave (and lift off top first when scrolled back).
  float s = smoothstep(0.0, 1.0, clamp(uSettle * 1.5 - aLine * 0.5, 0.0, 1.0));
  gl_Position = vec4(mix(ribbonX, x, s), mix(ribbonY, rowY + osc, s), 0.0, 1.0);
  vX = x; vInk = ink; vS = s;
  // Calm rows fade out toward the edges, so the settled field has no hard rectangle around it.
  vFade = (1.0 - smoothstep(0.55, 1.0, abs(x))) * (1.0 - smoothstep(0.6, 1.0, abs(rowY) / uRowSpan));
}`;

const FRAG = /* glsl */ `
uniform vec3 uA, uB, uC; uniform float uDim, uCalm, uInkA;
varying float vX; varying float vInk; varying float vS; varying float vFade;
void main() {
  // Mint at the edges, deep green toward the centre (the reference fades by clip-space x).
  vec3 ribbon = mix(uA, uB, 1.0 - abs(vX));
  vec3 col = mix(ribbon, mix(uC, uA, vInk), vS);
  float a = mix(0.32, mix(uCalm * vFade, uInkA, vInk), vS) * uDim;
  gl_FragColor = vec4(col * a, a);
}`;

export interface Silk {
  /** Hand-off from ribbon (0) to name (1). Wakes the loop. */
  settle(v: number): void;
  destroy(): void;
}

export function initSilk(
  canvas: HTMLCanvasElement,
  { mode = 'settle', word = 'Acmetel', settle = 0, onLost }: { mode?: 'settle' | 'ribbon'; word?: string; settle?: number; onLost?: () => void } = {},
): Silk {
  const small = isSmall();
  const LINES = threadCount(small, mode), PTS = pointCount(small);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // LINES threads of PTS points as segment pairs. Positions are computed in the shader; `position` only sizes it.
  const n = LINES * PTS;
  const aT = new Float32Array(n), aLine = new Float32Array(n);
  const idx = new Uint32Array(LINES * (PTS - 1) * 2);
  for (let l = 0, k = 0; l < LINES; l++) for (let p = 0; p < PTS; p++) {
    const i = l * PTS + p;
    aT[i] = p / (PTS - 1); aLine[i] = l / (LINES - 1);
    if (p < PTS - 1) { idx[k++] = i; idx[k++] = i + 1; }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aT', new BufferAttribute(aT, 1));
  geo.setAttribute('aLine', new BufferAttribute(aLine, 1));
  geo.setIndex(new BufferAttribute(idx, 1));

  const maskCanvas = document.createElement('canvas');
  const mask = new CanvasTexture(maskCanvas);
  mask.minFilter = LinearFilter; mask.magFilter = LinearFilter; mask.generateMipmaps = false;

  // Token colours as raw sRGB vectors: the shader writes them straight out, so they match the 2D still exactly.
  const pal = palette();
  const uniforms = {
    uTime: { value: 0 }, uSettle: { value: mode === 'settle' ? settle : 0 }, uRowSpan: { value: ROW_SPAN },
    uAmp: { value: 0 }, uFreq: { value: 0 }, uMask: { value: mask }, uDim: { value: mode === 'ribbon' ? 0.8 : 1 },
    uCalm: { value: ALPHA_CALM }, uInkA: { value: ALPHA_INK },
    uA: { value: new Vector3(...pal.a) }, uB: { value: new Vector3(...pal.b) }, uC: { value: new Vector3(...pal.c) },
  };
  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, premultipliedAlpha: true,
  });
  const lines = new LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  const render = () => renderer.render(scene, camera);

  // Size: the box is reserved by CSS aspect ratio, so only a width change rebuilds the mask.
  let lastW = 0, lastH = 0;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    renderer.setSize(w, h, false);
    if (mode === 'settle' && w !== lastW) {
      drawMask(maskCanvas, word, w, h);
      mask.needsUpdate = true;
      const o = oscillation(w, LINES);
      uniforms.uAmp.value = o.amp; uniforms.uFreq.value = o.freq;
    }
    lastW = w; lastH = h;
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // Motion budget (see header).
  let t = 0, rate = 0, energy = HOLD, frame = 0, asleep = false;
  const loop = visibleLoop(canvas, (_e, dt) => {
    energy = Math.max(0, energy - dt);
    const target = Math.min(1, energy / FADE);
    rate += (target * target * (3 - 2 * target) - rate) * Math.min(1, dt * 4);
    t += dt * rate;
    uniforms.uTime.value = t;
    if (energy === 0 && rate < 0.01) { render(); asleep = true; loop.pause(); return; }
    if (++frame % 2) return; // every other frame, like the reference
    render();
  });
  const wake = () => {
    energy = HOLD;
    if (asleep) { asleep = false; loop.play(); }
  };
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) wake(); });
  io.observe(canvas);

  const lost = (e: Event) => { e.preventDefault(); destroy(); onLost?.(); };
  canvas.addEventListener('webglcontextlost', lost);

  function destroy() {
    loop.destroy(); ro.disconnect(); io.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    geo.dispose(); mat.dispose(); mask.dispose(); renderer.dispose();
  }

  return {
    settle(v) {
      if (mode !== 'settle' || v === uniforms.uSettle.value) return;
      uniforms.uSettle.value = v;
      wake();
    },
    destroy,
  };
}
