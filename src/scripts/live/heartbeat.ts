// Heartbeat canvas: perspective grid floor + scrolling ECG line drawn in 3D perspective. Canvas 2D only.
import { visibleLoop, type Loop } from '../motion';
import { live } from '../../data/live';

const TEAL = '34,170,161';        // #22aaa1
const TEAL_LIGHT = '127,220,213';  // #7fdcd5
const WINDOW_S = 6;                // seconds of waveform visible
const SAMPLES = 520;
const TALL_EVERY = 7;              // every 7th beat gets a taller R spike

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

/** P-QRS-T shape. `phase` is 0-1 within a beat; `tall` scales the R spike. */
function beatShape(phase: number, tall: number) {
  return (
    0.13 * gauss(phase, 0.12, 0.028) -   // P
    0.13 * gauss(phase, 0.265, 0.01) +   // Q
    1.0 * tall * gauss(phase, 0.3, 0.0105) - // R
    0.26 * gauss(phase, 0.335, 0.011) +  // S
    0.27 * gauss(phase, 0.6, 0.05)       // T
  );
}

function ecg(tau: number, period: number) {
  const beats = tau / period;
  const k = Math.floor(beats);
  const tall = (((k % TALL_EVERY) + TALL_EVERY) % TALL_EVERY) === TALL_EVERY - 1 ? 1.38 : 1;
  return beatShape(beats - k, tall);
}

interface Size { w: number; h: number; dpr: number }

function fit(canvas: HTMLCanvasElement): Size {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

function render(ctx: CanvasRenderingContext2D, { w, h, dpr }: Size, t: number) {
  const period = 60 / live.heartbeat.bpm;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const hy = h * 0.34; // horizon / vanishing point y

  // Soft glow at the vanishing point.
  const glow = ctx.createRadialGradient(cx, hy, 0, cx, hy, w * 0.55);
  glow.addColorStop(0, `rgba(${TEAL},0.16)`);
  glow.addColorStop(1, `rgba(${TEAL},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Floor grid: radial lines to the vanishing point, horizontal lines scrolling toward the viewer.
  ctx.lineWidth = 1;
  const floorH = h - hy;
  const lines = 21;
  for (let i = -lines; i <= lines; i++) {
    const bx = cx + (i / lines) * w * 1.25;
    const g = ctx.createLinearGradient(0, hy, 0, h);
    g.addColorStop(0, `rgba(${TEAL},0)`);
    g.addColorStop(1, `rgba(${TEAL},0.34)`);
    ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(cx, hy); ctx.lineTo(bx, h); ctx.stroke();
  }
  const rows = 12;
  const scroll = (t * 0.22) % 1;
  for (let k = 0; k < rows; k++) {
    const d = (k + scroll) / rows;            // 0 = horizon, 1 = viewer
    const y = hy + floorH * Math.pow(d, 2.1);
    ctx.strokeStyle = `rgba(${TEAL},${(0.05 + 0.3 * d).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${TEAL},0.4)`;
  ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(w, hy); ctx.stroke();

  // ECG: u = 0 (oldest, far left, farther away) .. 1 (head, right, nearest).
  const amp = h * 0.36;
  const pts: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const tau = t - (1 - u) * WINDOW_S;
    const s = 0.5 + 0.5 * u;                    // depth scale: recedes toward the vanishing point
    const x = cx + (u - 0.5) * w * 0.9 * (0.82 + 0.18 * u);
    const base = hy + floorH * 0.6 * s;
    pts.push([x, base - ecg(tau, period) * amp * s]);
  }
  const trail = ctx.createLinearGradient(pts[0][0], 0, pts[SAMPLES][0], 0);
  trail.addColorStop(0, `rgba(${TEAL},0)`);
  trail.addColorStop(0.55, `rgba(${TEAL},0.55)`);
  trail.addColorStop(1, `rgba(${TEAL_LIGHT},1)`);
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(${TEAL},0.9)`; ctx.shadowBlur = 14;
  ctx.strokeStyle = trail; ctx.lineWidth = 2.4; path(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1; ctx.strokeStyle = trail; path(); ctx.stroke();

  // Bright head with halo.
  const [hx, hyp] = pts[SAMPLES];
  const halo = ctx.createRadialGradient(hx, hyp, 0, hx, hyp, 22);
  halo.addColorStop(0, `rgba(${TEAL_LIGHT},0.95)`);
  halo.addColorStop(0.25, `rgba(${TEAL_LIGHT},0.35)`);
  halo.addColorStop(1, `rgba(${TEAL},0)`);
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(hx, hyp, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hyp, 2.4, 0, Math.PI * 2); ctx.fill();
}

/** One nice frame (spike mid-window), no animation. Used for prefers-reduced-motion. */
export function drawStatic(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const period = 60 / live.heartbeat.bpm;
  const draw = () => render(ctx, fit(canvas), (TALL_EVERY - 1) * period + 0.3 * period + WINDOW_S * 0.42);
  draw();
  new ResizeObserver(draw).observe(canvas);
}

export function initHeartbeat(canvas: HTMLCanvasElement, opts: { onFrame?: (t: number) => void } = {}): Loop {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { pause() {}, play() {}, paused: false, destroy() {} } as Loop;
  let size = fit(canvas);
  let now = 0;
  const loop = visibleLoop(canvas, (t) => { now = t; render(ctx, size, t); opts.onFrame?.(t); });
  const ro = new ResizeObserver(() => { size = fit(canvas); render(ctx, size, now); });
  ro.observe(canvas);
  render(ctx, size, now);
  return {
    pause: () => loop.pause(),
    play: () => loop.play(),
    get paused() { return loop.paused; },
    destroy() { ro.disconnect(); loop.destroy(); },
  };
}
