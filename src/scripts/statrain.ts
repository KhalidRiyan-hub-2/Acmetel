// Hero stats "rain lock" (StatStrip `matrix`, docs/agents/QUEUE.md J03). Plays once, the first time the strip is half
// on screen: dim teal code rain falls behind the strip and the figures appear one at a time (~1 s apart): a bright
// drop lands on each character, left to right, and locks it (a slow teal blur → ink, CSS in StatStrip.astro). The
// rain fades by ~4.6 s (under 5 s), the canvas is cleared and the loop stops. Mouse/trackpad: moving the pointer onto a figure replays that cell only (real pointer
// movement only: ScrollSmoother gliding the strip under a still mouse fires pointerenter, which must not replay).
//
// Every character is a slot (StatStrip renders an invisible copy of the final character that sizes it, with the live
// glyph overlaid), so nothing reflows. Loaded by patterns.ts ([data-stat-rain]), never with reduced motion.
import { visibleLoop, finePointer } from './motion';
import { pick, rainFont, rainColors } from './coderain';

const FIRST = 0.6;        // s: first drop lands
const FIGURE_GAP = 0.95;  // s: between the first landings of neighbouring figures (one number at a time)
const CHAR_GAP = 0.16;    // s: between characters within a figure
const JITTER = 0.4;       // random spread on each landing, as a fraction of CHAR_GAP (< 1 keeps them in order)
const END = 4.6;          // s: rain gone, loop stops (whole intro stays under 5 s)
const FADE = 0.9;         // s: rain fade-out before END
const TRAIL_FADE = 0.7;   // s: a drop's trail fades after it lands
const RAIN_ALPHA = 0.25;  // ceiling for the ambient rain everywhere, and for any glyph over a label
const SWAP = 0.055;       // s: scramble glyph change interval
const MAX_DT = 0.5;       // s: cap on one frame's step of the lock clock (wall time, so a busy first frame can't stretch it)
const SCROLL_QUIET = 200; // ms: pointer moves this soon after a wheel/scroll don't count as hover

type Rect = { x: number; y: number; w: number; h: number };
interface Slot { el: HTMLElement; live: HTMLElement; final: string; x: number; y: number; arrive: number; trail: string[]; locked: boolean }
interface Cell { el: HTMLElement; label: HTMLElement; slots: Slot[]; rect: Rect; labelRect: Rect }
interface Col { x: number; y: number; speed: number; len: number; g: string[] }

export function initStatRain(root: HTMLElement) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) { root.dataset.statRain = 'done'; return; }
  const { head, trail, ink } = rainColors();

  const cells: Cell[] = [...root.querySelectorAll<HTMLElement>('[data-cell]')].map((el) => ({
    el,
    label: el.querySelector<HTMLElement>('dt')!,
    slots: [...el.querySelectorAll<HTMLElement>('[data-final]')].map((s) => ({
      el: s, live: s.querySelector<HTMLElement>('[data-live]')!, final: s.dataset.final!,
      x: 0, y: 0, arrive: 0, trail: [], locked: true,
    })),
    rect: { x: 0, y: 0, w: 0, h: 0 },
    labelRect: { x: 0, y: 0, w: 0, h: 0 },
  }));
  const allSlots = cells.flatMap((c) => c.slots);

  let w = 0, h = 0, size = 15, speed = 500;
  let cols: Col[] = [];
  let active: Slot[] = [];
  let clip: Rect | null = null;
  let t = 0, endAt = END, swap = 0, running = false, played = false, lastNow = 0;

  const measure = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = w < 640 ? 13 : 15;
    speed = size * 34;
    const local = (el: Element): Rect => {
      const b = el.getBoundingClientRect();
      return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
    };
    for (const c of cells) {
      c.rect = local(c.el);
      const l = local(c.label);
      c.labelRect = { x: l.x - 4, y: l.y - 4, w: l.w + 8, h: l.h + 8 };
      // Each drop's head comes to rest centred on its character.
      for (const s of c.slots) { const g = local(s.el); s.x = g.x + g.w / 2; s.y = g.y + g.h / 2 - size / 2; }
    }
  };

  /** Alpha for a glyph at (x, y), held down to RAIN_ALPHA over any label so the labels stay readable. */
  const capped = (x: number, y: number, a: number) => {
    if (a <= RAIN_ALPHA) return a;
    const cy = y + size / 2;
    for (const c of cells) {
      const L = c.labelRect;
      if (x >= L.x && x <= L.x + L.w && cy >= L.y && cy <= L.y + L.h) return RAIN_ALPHA;
    }
    return a;
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
    ctx.font = rainFont(size);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const fade = Math.min(1, Math.max(0, (endAt - t) / FADE));
    // Ambient rain: dim, never above RAIN_ALPHA.
    for (const c of cols) for (let k = 0; k < c.len; k++) {
      const y = c.y - k * size;
      if (y < -size || y > h) continue;
      ctx.globalAlpha = fade * (k === 0 ? RAIN_ALPHA : (1 - k / c.len) * RAIN_ALPHA * 0.65);
      ctx.fillStyle = k === 0 ? head : trail;
      ctx.fillText(c.g[(k + ((c.y / size) | 0)) % c.g.length], c.x, y);
    }
    // Lock drops: one per character, bright head until it lands, then the trail fades out.
    for (const s of active) {
      const hy = s.locked ? s.y : s.y - speed * (s.arrive - t);
      const a = s.locked ? Math.max(0, 1 - (t - s.arrive) / TRAIL_FADE) : 1;
      if (a <= 0) continue;
      if (!s.locked && hy > -size) {
        ctx.globalAlpha = capped(s.x, hy, 1);
        ctx.fillStyle = ink; ctx.shadowColor = head; ctx.shadowBlur = 10;
        ctx.fillText(s.trail[0], s.x, hy);
        ctx.shadowBlur = 0;
      }
      for (let k = 1; k < s.trail.length; k++) {
        const y = hy - k * size;
        if (y < -size || y > h) continue;
        ctx.globalAlpha = capped(s.x, y, a * (1 - k / s.trail.length) * 0.9);
        ctx.fillStyle = k === 1 ? head : trail;
        ctx.fillText(s.trail[k], s.x, y);
      }
    }
    ctx.restore();
  };

  const finish = () => {
    for (const s of active) if (!s.locked) lock(s);
    running = false; active = []; cols = []; clip = null;
    ctx.clearRect(0, 0, w, h);
    root.dataset.statRain = 'done';
    // Pausing from inside the tick would be undone when visibleLoop schedules its next frame; pause right after it.
    queueMicrotask(() => loop.pause());
  };
  const lock = (s: Slot) => { s.locked = true; s.el.dataset.state = 'lock'; s.live.textContent = s.final; };

  const loop = visibleLoop(root, (_elapsed, dt) => {
    if (!running) return;
    // The lock schedule runs on wall time (visibleLoop clamps dt to 0.1 s, which stretched the intro while the globe
    // boots on the same frames). dt === 0 marks a (re)start after a pause, so off-screen time never counts.
    const now = performance.now();
    t += dt === 0 || !lastNow ? dt : Math.min((now - lastNow) / 1000, MAX_DT);
    lastNow = now;
    for (const c of cols) {
      c.y += c.speed * dt;
      if (Math.random() < 0.05) c.g[(Math.random() * c.g.length) | 0] = pick();
      // Columns recycle until the fade starts; after that the rain just runs out.
      if (c.y - c.len * size > h && t < endAt - FADE) { c.y = -Math.random() * h * 0.5; c.speed = size * (9 + Math.random() * 10); }
    }
    swap += dt;
    const scramble = swap > SWAP;
    if (scramble) swap = 0;
    for (const s of active) {
      if (s.locked) continue;
      if (t >= s.arrive) lock(s);
      else if (scramble) s.live.textContent = pick();
    }
    draw();
    if (t >= endAt) finish();
  });
  loop.pause();

  /** Runs the rain over `subset` (the whole strip, or one cell on hover). */
  const run = (subset: Cell[]) => {
    measure();
    const whole = subset.length === cells.length;
    clip = whole ? null : subset[0].rect;
    const x0 = clip ? clip.x : 0, cw = clip ? clip.w : w;
    const n = Math.max(1, Math.ceil(cw / (size * 1.2)));
    cols = Array.from({ length: n }, (_, i) => ({
      x: x0 + (i + 0.5) * (cw / n), y: -Math.random() * h * 1.2, speed: size * (9 + Math.random() * 10),
      len: 5 + ((Math.random() * 9) | 0), g: Array.from({ length: 16 }, pick),
    }));
    active = subset.flatMap((c) => c.slots);
    // One figure at a time: figures FIGURE_GAP apart, their characters CHAR_GAP apart, strictly in reading order.
    subset.forEach((c, f) => c.slots.forEach((s, j) => {
      s.arrive = FIRST + f * FIGURE_GAP + (j + Math.random() * JITTER) * CHAR_GAP;
    }));
    active.forEach((s) => {
      s.trail = Array.from({ length: 9 }, pick);
      s.locked = false;
      s.el.dataset.state = 'scramble';
      s.live.textContent = pick();
    });
    const last = Math.max(...active.map((s) => s.arrive));
    endAt = whole ? Math.max(END, last + TRAIL_FADE + 0.1) : last + TRAIL_FADE + 0.4;
    t = 0; swap = 0; lastNow = 0; running = true;
    root.dataset.statRain = 'running';
    loop.play();
  };

  // Pre-state until the strip is seen: every character a dim scrambled glyph, the canvas empty.
  for (const s of allSlots) { s.el.dataset.state = 'scramble'; s.live.textContent = pick(); }
  root.dataset.statRain = 'ready';

  new ResizeObserver(() => { if (running) { measure(); draw(); } }).observe(canvas);

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    played = true;
    run(cells);
  }, { threshold: 0.5 });
  io.observe(root);

  // Hover replay: a cell replays when a real pointer move carries the pointer into it. Not pointerenter: with
  // ScrollSmoother the strip glides under a still mouse and the browser fires enter (and hover-update moves) with the
  // pointer's screen position unchanged. So a move only counts if the position actually changed and no wheel/scroll
  // happened in the last SCROLL_QUIET ms.
  if (finePointer()) {
    let px = NaN, py = NaN, scrolledAt = -Infinity;
    let over: Cell | null = null;
    const quiet = () => { scrolledAt = performance.now(); };
    addEventListener('wheel', quiet, { passive: true });
    addEventListener('scroll', quiet, { passive: true });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const moved = Number.isNaN(px) ? e.movementX !== 0 || e.movementY !== 0 : e.clientX !== px || e.clientY !== py;
      px = e.clientX; py = e.clientY;
      if (!moved || performance.now() - scrolledAt < SCROLL_QUIET) return;
      const el = e.target instanceof Element ? e.target.closest('[data-cell]') : null;
      const c = el ? cells.find((k) => k.el === el) ?? null : null;
      if (c === over) return;
      over = c;
      if (c && played && !running) run([c]);
    }, { passive: true });
  }
}
