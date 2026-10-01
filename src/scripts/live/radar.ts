// Radar canvas: rings, crosshairs, rotating conic sweep, blip glows. Canvas 2D only.
// The blips themselves are HTML <button>s overlaid by LiveNetwork.astro (keyboard + screen-reader accessible).
// Each `[data-blip]` wrapper carries data-x / data-y (0-1 across the square) and data-angle (radians clockwise from north).
import { visibleLoop, type Loop } from '../motion';

const TEAL = '34,170,161';
const TEAL_LIGHT = '127,220,213';
const SWEEP_PERIOD = 8;   // seconds per revolution
const FADE_S = 2.5;       // blip fade time after the sweep passes
const MIN_OPACITY = 0.3;  // idle blips stay readable

interface Blip { el: HTMLElement; x: number; y: number; angle: number }
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

function readBlips(stage: HTMLElement): Blip[] {
  return [...stage.querySelectorAll<HTMLElement>('[data-blip]')].map((el) => ({
    el, x: parseFloat(el.dataset.x || '0.5'), y: parseFloat(el.dataset.y || '0.5'), angle: parseFloat(el.dataset.angle || '0'),
  }));
}

/** Draws the static scaffold and, if `sweep` is given (radians clockwise from north), the sweep wedge. */
function render(ctx: CanvasRenderingContext2D, { w, h, dpr }: Size, sweep: number | null, blips: Blip[], lit: number[]) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2;

  // Disc background.
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, `rgba(${TEAL},0.10)`);
  bg.addColorStop(1, `rgba(${TEAL},0.015)`);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // Rings.
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((f, i) => {
    ctx.strokeStyle = `rgba(${TEAL},${i === 3 ? 0.55 : 0.25})`;
    ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke();
  });
  // Crosshairs + diagonal ticks.
  ctx.strokeStyle = `rgba(${TEAL},0.22)`;
  ctx.beginPath();
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${TEAL},0.4)`;
  for (let d = 0; d < 360; d += 15) {
    const a = (d * Math.PI) / 180, major = d % 90 === 0 ? 0 : d % 45 === 0 ? 10 : 5;
    if (!major) continue;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
    ctx.lineTo(cx + Math.sin(a) * (R - major), cy - Math.cos(a) * (R - major));
    ctx.stroke();
  }

  // Sweep wedge with trailing fade.
  if (sweep !== null) {
    const head = sweep - Math.PI / 2;           // canvas angle (0 = east)
    const wedge = Math.PI * 0.55;
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(head - wedge, cx, cy);
      const f = wedge / (Math.PI * 2);
      g.addColorStop(0, `rgba(${TEAL},0)`);
      g.addColorStop(f, `rgba(${TEAL_LIGHT},0.42)`);
      g.addColorStop(Math.min(1, f + 0.002), `rgba(${TEAL},0)`);
      g.addColorStop(1, `rgba(${TEAL},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    } else {
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        ctx.fillStyle = `rgba(${TEAL},${(0.28 * (i / steps) ** 2).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, head - wedge + (wedge * i) / steps, head - wedge + (wedge * (i + 1)) / steps);
        ctx.fill();
      }
    }
    ctx.strokeStyle = `rgba(${TEAL_LIGHT},0.9)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(head) * R, cy + Math.sin(head) * R); ctx.stroke();
  }

  // Origin marker.
  ctx.fillStyle = `rgba(${TEAL_LIGHT},0.95)`;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(${TEAL_LIGHT},0.4)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();

  // Blip glows (the clickable dots are HTML).
  blips.forEach((b, i) => {
    const o = lit[i];
    if (o <= 0.02) return;
    const x = b.x * w, y = b.y * h, r = 8 + 16 * o;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${TEAL_LIGHT},${(0.75 * o).toFixed(3)})`);
    g.addColorStop(1, `rgba(${TEAL},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
}

/** Static frame for reduced motion: wedge at a fixed angle, every blip fully visible. */
export function drawStatic(canvas: HTMLCanvasElement, stage: HTMLElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const blips = readBlips(stage);
  blips.forEach((b) => b.el.style.setProperty('--o', '1'));
  const lit = blips.map(() => 0.55);
  const draw = () => render(ctx, fit(canvas), Math.PI * 0.62, blips, lit);
  draw();
  new ResizeObserver(draw).observe(canvas);
}

export function initRadar(canvas: HTMLCanvasElement, stage: HTMLElement): Loop {
  const ctx = canvas.getContext('2d');
  const blips = readBlips(stage);
  if (!ctx) return { pause() {}, play() {}, paused: false, destroy() {} } as Loop;
  let size = fit(canvas);
  let lastSweep = 0;
  const lit = blips.map(() => 0);
  const frame = (t: number) => {
    const w = (Math.PI * 2) / SWEEP_PERIOD;
    lastSweep = (t * w) % (Math.PI * 2);
    blips.forEach((b, i) => {
      const since = (((lastSweep - b.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / w; // seconds since sweep passed
      const o = since < FADE_S ? 1 - since / FADE_S : 0;
      lit[i] = o;
      b.el.style.setProperty('--o', (MIN_OPACITY + (1 - MIN_OPACITY) * o).toFixed(3));
    });
    render(ctx, size, lastSweep, blips, lit);
  };
  const loop = visibleLoop(canvas, (t) => frame(t));
  const ro = new ResizeObserver(() => { size = fit(canvas); render(ctx, size, lastSweep, blips, lit); });
  ro.observe(canvas);
  frame(0.8);
  return {
    pause: () => loop.pause(),
    play: () => loop.play(),
    get paused() { return loop.paused; },
    destroy() { ro.disconnect(); loop.destroy(); },
  };
}
