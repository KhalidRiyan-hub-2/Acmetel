// Radar canvas: rings, compass ticks, rotating conic sweep, blip glows and ping rings. Canvas 2D only.
// The blips themselves are HTML <button>s overlaid by LiveNetwork.astro (keyboard + screen-reader accessible).
// Each `[data-blip]` wrapper carries data-x / data-y (0-1 across the square) and data-angle (radians clockwise from north).
// The loop sets two custom properties on each wrapper: --o (dot opacity) and --l (city label opacity).
import { visibleLoop, type Loop } from '../motion';

const TEAL = '34,170,161';
const TEAL_LIGHT = '127,220,213';
const SWEEP_PERIOD = 8;   // seconds per revolution
const WEDGE = Math.PI * 0.38; // trailing glow behind the sweep line
const FADE_S = 2.5;       // blip fade time after the sweep passes
const PING_S = 1.1;       // ping ring lifetime
const LABEL_S = 2.2;      // how long a city label stays up after its blip is swept
const MIN_OPACITY = 0.35; // idle blips stay readable

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

/**
 * Draws the scaffold and, if `sweep` is given (radians clockwise from north), the sweep wedge.
 * `since[i]` is seconds since the sweep last passed blip i (Infinity = never).
 */
function render(ctx: CanvasRenderingContext2D, { w, h, dpr }: Size, sweep: number | null, blips: Blip[], since: number[], font: string) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2;
  const at = (a: number, r: number): [number, number] => [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; // a: clockwise from north

  // Disc background.
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, `rgba(${TEAL},0.10)`);
  bg.addColorStop(1, `rgba(${TEAL},0.02)`);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  // Range rings: inner ones dashed and quiet, outer bezel solid.
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = `rgba(${TEAL},0.3)`;
  [0.25, 0.5, 0.75].forEach((f) => { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(${TEAL},0.6)`;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

  // Crosshairs, stopping short of the compass letters.
  const inner = R - 24;
  ctx.strokeStyle = `rgba(${TEAL},0.18)`;
  ctx.beginPath();
  ctx.moveTo(cx, cy - inner); ctx.lineTo(cx, cy + inner);
  ctx.moveTo(cx - inner, cy); ctx.lineTo(cx + inner, cy);
  ctx.stroke();

  // Bezel ticks every 5 degrees: longer at 15 and 45, none at the cardinals (they get letters).
  for (let d = 0; d < 360; d += 5) {
    if (d % 90 === 0) continue;
    const len = d % 45 === 0 ? 9 : d % 15 === 0 ? 5 : 2.5;
    ctx.strokeStyle = `rgba(${TEAL},${d % 15 === 0 ? 0.5 : 0.28})`;
    const a = (d * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(...at(a, R)); ctx.lineTo(...at(a, R - len)); ctx.stroke();
  }
  ctx.font = `500 ${R < 170 ? 9 : 10}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${TEAL_LIGHT},0.7)`;
  ['N', 'E', 'S', 'W'].forEach((c, i) => ctx.fillText(c, ...at((i * Math.PI) / 2, R - 12)));

  // Sweep: trailing glow with an eased falloff, then a line that brightens toward the rim.
  if (sweep !== null) {
    const head = sweep - Math.PI / 2;           // canvas angle (0 = east)
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(head - WEDGE, cx, cy);
      const f = WEDGE / (Math.PI * 2);
      g.addColorStop(0, `rgba(${TEAL},0)`);
      g.addColorStop(f * 0.5, `rgba(${TEAL},0.04)`);
      g.addColorStop(f * 0.82, `rgba(${TEAL},0.12)`);
      g.addColorStop(f, `rgba(${TEAL_LIGHT},0.3)`);
      g.addColorStop(Math.min(1, f + 0.001), `rgba(${TEAL},0)`);
      g.addColorStop(1, `rgba(${TEAL},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    } else {
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        ctx.fillStyle = `rgba(${TEAL},${(0.24 * (i / steps) ** 3).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, head - WEDGE + (WEDGE * i) / steps, head - WEDGE + (WEDGE * (i + 1)) / steps);
        ctx.fill();
      }
    }
    const [ex, ey] = [cx + Math.cos(head) * R, cy + Math.sin(head) * R];
    const line = ctx.createLinearGradient(cx, cy, ex, ey);
    line.addColorStop(0, `rgba(${TEAL_LIGHT},0.15)`);
    line.addColorStop(1, `rgba(${TEAL_LIGHT},0.95)`);
    ctx.strokeStyle = line; ctx.lineWidth = 1.5;
    ctx.shadowColor = `rgba(${TEAL},0.8)`; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Origin marker.
  ctx.fillStyle = `rgba(${TEAL_LIGHT},0.95)`;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(${TEAL_LIGHT},0.4)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();

  // Blip glows and pings (the clickable dots are HTML).
  blips.forEach((b, i) => {
    const s = since[i];
    const o = s < FADE_S ? 1 - s / FADE_S : 0;
    const x = b.x * w, y = b.y * h;
    if (o > 0.02) {
      const r = 8 + 14 * o;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${TEAL_LIGHT},${(0.7 * o).toFixed(3)})`);
      g.addColorStop(1, `rgba(${TEAL},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (s < PING_S) {
      const p = s / PING_S, e = 1 - (1 - p) ** 3;
      ctx.strokeStyle = `rgba(${TEAL_LIGHT},${(0.7 * (1 - p)).toFixed(3)})`;
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(x, y, 6 + 20 * e, 0, Math.PI * 2); ctx.stroke();
    }
  });
}

const monoFont = (el: Element) => getComputedStyle(el).getPropertyValue('--font-mono').trim() || 'monospace';

/** Static frame for reduced motion: wedge at a fixed angle, every blip fully visible, no labels. */
export function drawStatic(canvas: HTMLCanvasElement, stage: HTMLElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const blips = readBlips(stage);
  blips.forEach((b) => b.el.style.setProperty('--o', '1'));
  const since = blips.map(() => FADE_S * 0.45);
  const font = monoFont(canvas);
  const draw = () => render(ctx, fit(canvas), Math.PI * 0.62, blips, since, font);
  draw();
  new ResizeObserver(draw).observe(canvas);
}

export function initRadar(canvas: HTMLCanvasElement, stage: HTMLElement): Loop {
  const ctx = canvas.getContext('2d');
  const blips = readBlips(stage);
  if (!ctx) return { pause() {}, play() {}, paused: false, destroy() {} } as Loop;
  let size = fit(canvas);
  const font = monoFont(canvas);
  let lastSweep = 0;
  let elapsed = 0;
  const since = blips.map(() => Infinity);
  const frame = (t: number) => {
    const w = (Math.PI * 2) / SWEEP_PERIOD;
    lastSweep = (t * w) % (Math.PI * 2);
    blips.forEach((b, i) => {
      const s = (((lastSweep - b.angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / w; // seconds since sweep passed
      since[i] = s <= t ? s : Infinity; // not swept yet on the first revolution
      const o = since[i] < FADE_S ? 1 - since[i] / FADE_S : 0;
      const l = since[i] < LABEL_S ? Math.min(1, since[i] / 0.15, (LABEL_S - since[i]) / 0.6) : 0;
      b.el.style.setProperty('--o', (MIN_OPACITY + (1 - MIN_OPACITY) * o).toFixed(3));
      b.el.style.setProperty('--l', l.toFixed(3));
    });
    render(ctx, size, lastSweep, blips, since, font);
  };
  const loop = visibleLoop(canvas, (t) => { elapsed = t; frame(t); });
  const ro = new ResizeObserver(() => { size = fit(canvas); render(ctx, size, lastSweep, blips, since, font); });
  ro.observe(canvas);
  frame(elapsed);
  return {
    pause: () => loop.pause(),
    play: () => loop.play(),
    get paused() { return loop.paused; },
    destroy() { ro.disconnect(); loop.destroy(); },
  };
}
