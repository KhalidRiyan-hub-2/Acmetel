// Radar canvas over a North-Pole-centred world map that can be spun like a wheel. Canvas 2D only.
// Draws the latitude rings, the meridians and longitude bezel (both turn with the map), the sweep, and blip
// glows and pings. The blips themselves are HTML <button>s overlaid by LiveNetwork.astro (keyboard + screen-reader
// accessible); this module repositions them as the map turns. Each `[data-blip]` wrapper carries data-x / data-y
// (0-1 across the square at rotation 0) and data-net. Each frame sets --o (dot opacity) and --l (label opacity).
// Driven by the clock in scripts/live/ops.ts, which turns each contact into a beat on the pulse.
import { latitudeRadius, meridianAngle } from '../../data/live';

const TEAL = '34,170,161';
const TEAL_LIGHT = '127,220,213';
export const SWEEP_PERIOD = 8; // seconds per revolution; the sweep points up at t = 0
const WEDGE = Math.PI * 0.38;  // trailing glow behind the sweep line
const FADE_S = 2.5;       // blip fade time after a contact
const PING_S = 1.1;       // ping ring lifetime
const LABEL_S = 2.2;      // how long a city label stays up after a contact
const MIN_OPACITY = 0.35; // idle blips stay readable
const TAU = Math.PI * 2;

export interface Blip { el: HTMLElement; x: number; y: number; net: string; cls: string }
interface Size { w: number; h: number; dpr: number }

const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
export const sweepAt = (t: number) => wrap((t * TAU) / SWEEP_PERIOD);

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

/** Blips with positions relative to the centre (x/y offsets in the -0.5..0.5 square, rotation 0). */
export function readBlips(stage: HTMLElement): Blip[] {
  return [...stage.querySelectorAll<HTMLElement>('[data-blip]')].map((el) => ({
    el, x: parseFloat(el.dataset.x || '0.5') - 0.5, y: parseFloat(el.dataset.y || '0.5') - 0.5, net: el.dataset.net || '', cls: '',
  }));
}

/** Blip offset after turning the map clockwise by `rot` radians. */
const turn = (b: { x: number; y: number }, rot: number) => ({
  x: b.x * Math.cos(rot) - b.y * Math.sin(rot),
  y: b.x * Math.sin(rot) + b.y * Math.cos(rot),
});
/** Screen angle of a blip (radians clockwise from up). */
const angleOf = (p: { x: number; y: number }) => wrap(Math.atan2(p.x, -p.y));

/**
 * Contact detector: reports every blip the sweep line crossed since the last call, whichever way it crossed
 * (the sweep moving on, or the map being spun under it).
 */
export function detector(blips: Blip[]) {
  let prev: number[] | null = null;
  return (sweep: number, rot: number): number[] => {
    const d = blips.map((b) => wrap(sweep - angleOf(turn(b, rot))));
    const hits = prev ? d.flatMap((v, i) => (Math.abs(v - prev![i]) > Math.PI ? [i] : [])) : [];
    prev = d;
    return hits;
  };
}

const LONGITUDES: [number, string][] = [[0, '0°'], [90, '90°E'], [180, '180°'], [-90, '90°W']];

function render(ctx: CanvasRenderingContext2D, { w, h, dpr }: Size, sweep: number | null, rot: number, blips: Blip[], since: number[], font: string) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2, side = Math.min(w, h);
  const at = (a: number, r: number): [number, number] => [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; // a: clockwise from up

  // Disc background.
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, `rgba(${TEAL},0.10)`);
  bg.addColorStop(1, `rgba(${TEAL},0.02)`);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

  // Latitude rings every 30°, the equator a touch stronger; outer bezel solid.
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  [60, 30, 0, -30, -60].forEach((lat) => {
    ctx.strokeStyle = `rgba(${TEAL},${lat === 0 ? 0.42 : 0.24})`;
    ctx.beginPath(); ctx.arc(cx, cy, latitudeRadius(lat) * side, 0, TAU); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(${TEAL},0.6)`;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

  // Meridians every 30°, turning with the map.
  const rim = latitudeRadius(-60) * side;
  ctx.strokeStyle = `rgba(${TEAL},0.14)`;
  ctx.beginPath();
  for (let lon = -180; lon < 180; lon += 30) {
    const a = meridianAngle(lon) + rot;
    ctx.moveTo(...at(a, 8)); ctx.lineTo(...at(a, rim));
  }
  ctx.stroke();

  // Longitude bezel: ticks every 5°, longer every 30°, labels at the quarter meridians. Text stays upright.
  for (let lon = -180; lon < 180; lon += 5) {
    const major = lon % 30 === 0, len = lon % 90 === 0 ? 0 : major ? 7 : 2.5;
    if (!len) continue;
    ctx.strokeStyle = `rgba(${TEAL},${major ? 0.5 : 0.28})`;
    const a = meridianAngle(lon) + rot;
    ctx.beginPath(); ctx.moveTo(...at(a, R)); ctx.lineTo(...at(a, R - len)); ctx.stroke();
  }
  ctx.font = `500 ${R < 170 ? 9 : 10}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${TEAL_LIGHT},0.7)`;
  LONGITUDES.forEach(([lon, label]) => ctx.fillText(label, ...at(meridianAngle(lon) + rot, R - 13)));

  // Sweep: trailing glow with an eased falloff, then a line that brightens toward the rim.
  if (sweep !== null) {
    const head = sweep - Math.PI / 2;           // canvas angle (0 = east)
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(head - WEDGE, cx, cy);
      const f = WEDGE / TAU;
      g.addColorStop(0, `rgba(${TEAL},0)`);
      g.addColorStop(f * 0.5, `rgba(${TEAL},0.04)`);
      g.addColorStop(f * 0.82, `rgba(${TEAL},0.12)`);
      g.addColorStop(f, `rgba(${TEAL_LIGHT},0.3)`);
      g.addColorStop(Math.min(1, f + 0.001), `rgba(${TEAL},0)`);
      g.addColorStop(1, `rgba(${TEAL},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
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

  // North Pole marker (the hub of the wheel).
  ctx.fillStyle = `rgba(${TEAL_LIGHT},0.95)`;
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(${TEAL_LIGHT},0.4)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.stroke();

  // Blip glows and pings (the clickable dots are HTML).
  blips.forEach((b, i) => {
    const s = since[i];
    const o = s < FADE_S ? 1 - s / FADE_S : 0;
    const p = turn(b, rot);
    const x = cx + p.x * side, y = cy + p.y * side;
    if (o > 0.02) {
      const r = 8 + 14 * o;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${TEAL_LIGHT},${(0.7 * o).toFixed(3)})`);
      g.addColorStop(1, `rgba(${TEAL},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    if (s < PING_S) {
      const q = s / PING_S, e = 1 - (1 - q) ** 3;
      ctx.strokeStyle = `rgba(${TEAL_LIGHT},${(0.7 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.arc(x, y, 6 + 20 * e, 0, TAU); ctx.stroke();
    }
  });
}

/** Moves the HTML blips and the land map to rotation `rot`; flips tooltip/label sides to keep them on the disc. */
function place(blips: Blip[], map: SVGElement | null, rot: number) {
  if (map) map.style.transform = `rotate(${rot}rad)`;
  blips.forEach((b) => {
    const p = turn(b, rot), x = 0.5 + p.x, y = 0.5 + p.y;
    b.el.style.left = `${(x * 100).toFixed(2)}%`;
    b.el.style.top = `${(y * 100).toFixed(2)}%`;
    const cls = `blip-h-${x < 0.3 ? 'left' : x > 0.7 ? 'right' : 'center'} blip-v-${y < 0.5 ? 'below' : 'above'} blip-side-${x < 0.5 ? 'l' : 'r'}`;
    if (cls === b.cls) return;
    b.el.classList.remove(...[...b.el.classList].filter((c) => /^blip-(h|v|side)-/.test(c)));
    b.el.classList.add(...cls.split(' '));
    b.cls = cls;
  });
}

const monoFont = (el: Element) => getComputedStyle(el).getPropertyValue('--font-mono').trim() || 'monospace';

export interface Radar {
  /** Live frame at time `t` and rotation `rot`. `lastHit[i]` is the time of blip i's latest contact. */
  frame(t: number, rot: number, lastHit: number[]): void;
  /** Reduced-motion frame: sweep parked, every blip fully visible, no labels. */
  still(rot: number): void;
  destroy(): void;
}

export function createRadar(canvas: HTMLCanvasElement, stage: HTMLElement, blips: Blip[]): Radar {
  const ctx = canvas.getContext('2d');
  const map = stage.querySelector<SVGElement>('.radar-map');
  if (!ctx) return { frame() {}, still() {}, destroy() {} };
  let size = fit(canvas);
  const font = monoFont(canvas);
  let redraw = () => {};
  const ro = new ResizeObserver(() => { size = fit(canvas); redraw(); });
  ro.observe(canvas);
  return {
    frame(t, rot, lastHit) {
      place(blips, map, rot);
      const since = lastHit.map((h) => t - h);
      blips.forEach((b, i) => {
        const s = since[i];
        const o = s < FADE_S ? 1 - s / FADE_S : 0;
        const l = s < LABEL_S ? Math.min(1, s / 0.15, (LABEL_S - s) / 0.6) : 0;
        b.el.style.setProperty('--o', (MIN_OPACITY + (1 - MIN_OPACITY) * o).toFixed(3));
        b.el.style.setProperty('--l', l.toFixed(3));
      });
      redraw = () => render(ctx, size, sweepAt(t), rot, blips, since, font);
      redraw();
    },
    still(rot) {
      place(blips, map, rot);
      blips.forEach((b) => b.el.style.setProperty('--o', '1'));
      const since = blips.map(() => FADE_S * 0.45);
      redraw = () => render(ctx, size, Math.PI * 0.62, rot, blips, since, font);
      redraw();
    },
    destroy() { ro.disconnect(); },
  };
}
