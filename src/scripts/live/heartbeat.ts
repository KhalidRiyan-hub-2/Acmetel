// Pulse canvas: flat 2D monitor. Static grid, trace written left to right like a bedside monitor
// (an erase gap runs just ahead of the head, older trace fades out). Canvas 2D only.
// The trace has no rhythm of its own: it plots `signal(tau)`, which scripts/live/ops.ts builds from radar
// contacts, so every contact on the map shows up here as one clean beat on a flat line.
import type { Loop } from '../motion';

const TEAL = '34,170,161';        // #22aaa1
const TEAL_LIGHT = '127,220,213';  // #7fdcd5
const PX_PER_S = 88;               // trace speed; the window scales with width so spacing matches across sizes
const WINDOW_MIN_S = 3.5, WINDOW_MAX_S = 6;
const SAMPLES = 520;
const GAP = 0.05;                  // erase gap ahead of the head (fraction of width)
const BASELINE = 0.62;             // baseline y (fraction of height); beats rise above it
const AMP = 0.4;                   // height of a unit beat (fraction of height)

/** Signal at time `tau` (seconds on the shared clock): 0 = flat line, 1 = a full beat's R peak. */
export type Signal = (tau: number) => number;

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

/** Monitor grid (minor + major cells, baseline), vignetted toward the edges. Cached per size. */
let gridCache: { key: string; canvas: HTMLCanvasElement } | undefined;
function grid({ w, h, dpr }: Size): HTMLCanvasElement {
  const key = `${w}x${h}@${dpr}`;
  if (gridCache?.key === key) return gridCache.canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = Math.max(10, Math.round(h / 20));
  const by = Math.round(h * BASELINE);
  const line = (x0: number, y0: number, x1: number, y1: number) => { g.moveTo(x0, y0); g.lineTo(x1, y1); };
  // Cells are anchored on the baseline and the horizontal centre so the grid sits symmetrically.
  const x0 = (w / 2) % cell, y0 = by % cell;
  g.lineWidth = 1;
  g.strokeStyle = `rgba(${TEAL},0.07)`;
  g.beginPath();
  for (let x = x0; x <= w; x += cell) line(Math.round(x) + 0.5, 0, Math.round(x) + 0.5, h);
  for (let y = y0; y <= h; y += cell) line(0, Math.round(y) + 0.5, w, Math.round(y) + 0.5);
  g.stroke();
  g.strokeStyle = `rgba(${TEAL},0.16)`;
  g.beginPath();
  for (let x = w / 2 - Math.floor(w / 2 / (cell * 5)) * cell * 5; x <= w; x += cell * 5) line(Math.round(x) + 0.5, 0, Math.round(x) + 0.5, h);
  for (let y = by - Math.floor(by / (cell * 5)) * cell * 5; y <= h; y += cell * 5) line(0, Math.round(y) + 0.5, w, Math.round(y) + 0.5);
  g.stroke();
  g.strokeStyle = `rgba(${TEAL},0.32)`;
  g.setLineDash([2, 4]);
  g.beginPath(); line(0, by + 0.5, w, by + 0.5); g.stroke();
  // Vignette: keep the grid strong in the middle, let it dissolve at the edges.
  g.globalCompositeOperation = 'destination-in';
  const v = g.createRadialGradient(w / 2, by, 0, w / 2, by, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  gridCache = { key, canvas: c };
  return c;
}

const windowS = (w: number) => Math.min(WINDOW_MAX_S, Math.max(WINDOW_MIN_S, w / PX_PER_S));

function render(ctx: CanvasRenderingContext2D, size: Size, t: number, signal: Signal) {
  const { w, h, dpr } = size;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(grid(size), 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const win = windowS(w);
  const head = (t / win) % 1;            // head position, 0-1 across the width
  const by = h * BASELINE, amp = h * AMP;
  const xOf = (u: number) => u * w;
  const now = signal(t);
  const hx = xOf(head), hy = by - now * amp;

  // Write bar: a faint band trailing the head, feathered on both sides.
  const bar = ctx.createLinearGradient(hx - 60, 0, hx + 8, 0);
  bar.addColorStop(0, `rgba(${TEAL},0)`);
  bar.addColorStop(60 / 68, `rgba(${TEAL},0.05)`);
  bar.addColorStop(1, `rgba(${TEAL},0)`);
  ctx.fillStyle = bar; ctx.fillRect(hx - 60, 0, 68, h);

  // Trace. Column u shows the moment the head passed it: age = (head - u) mod 1, in sweeps.
  // Skip the erase gap just ahead of the head; start a new subpath after it.
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    if (pen && u > head && u - 1 / SAMPLES <= head) ctx.lineTo(hx, hy); // end the fresh trace exactly at the head
    const age = (((head - u) % 1) + 1) % 1;
    if (age > 1 - GAP) { pen = false; continue; }
    const y = by - signal(t - age * win) * amp;
    if (pen) ctx.lineTo(xOf(u), y); else { ctx.moveTo(xOf(u), y); pen = true; }
  }
  // Alpha falls off linearly with age, so a single horizontal gradient with a hard step at the head covers it.
  const fade = ctx.createLinearGradient(0, 0, w, 0);
  const a = (age: number) => `rgba(${TEAL_LIGHT},${Math.max(0, 1 - age).toFixed(3)})`;
  fade.addColorStop(0, a(head));
  fade.addColorStop(head, a(0));
  fade.addColorStop(Math.min(1, head + 0.0001), a(1 - GAP));
  fade.addColorStop(1, a(head));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = fade;
  ctx.shadowColor = `rgba(${TEAL},0.9)`; ctx.shadowBlur = 12;
  ctx.lineWidth = 2.2; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1; ctx.stroke();

  // Head: halo swells with the signal so each contact reads as a pulse.
  const beat = Math.max(0, Math.min(1, now));
  const r = 16 + 18 * beat;
  const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
  halo.addColorStop(0, `rgba(${TEAL_LIGHT},0.95)`);
  halo.addColorStop(0.25, `rgba(${TEAL_LIGHT},${(0.3 + 0.25 * beat).toFixed(3)})`);
  halo.addColorStop(1, `rgba(${TEAL},0)`);
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, Math.PI * 2); ctx.fill();
}

/** Pulse renderer driven by an external clock: call `frame(t)` from the shared loop. */
export function createPulse(canvas: HTMLCanvasElement, signal: Signal): { frame(t: number): void } & Pick<Loop, 'destroy'> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { frame() {}, destroy() {} };
  let size = fit(canvas);
  let now = 0;
  const ro = new ResizeObserver(() => { size = fit(canvas); render(ctx, size, now, signal); });
  ro.observe(canvas);
  return {
    frame(t) { now = t; render(ctx, size, t, signal); },
    destroy() { ro.disconnect(); },
  };
}
