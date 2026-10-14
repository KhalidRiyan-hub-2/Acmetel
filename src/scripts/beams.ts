// Beams with collision, behind the digital rain bands (Section `rain` and `terminal`). After Aceternity's
// "Background Beams With Collision", rebuilt in Canvas 2D without React or Framer Motion: thin beams fall from above
// the band at their own speed and delay; when one hits the band's bottom edge it bursts into a spray of particles
// with a short glow on the floor, then waits and falls again. Brand tokens only (teal/green, read at runtime).
// Runs only while on screen (visibleLoop), DPR ≤ 2, fewer beams on narrow screens. Never loaded with reduced motion.
import { visibleLoop, type Loop } from './motion';
import { tokenRGB } from './silk/shared';

interface Beam { x: number; y: number; len: number; speed: number; wait: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number }
interface Glow { x: number; age: number }

const BEAM_W = 1.5;        // px
const SPARKS = 20;         // particles per collision
const GLOW_LIFE = 1.4;     // s
const GRAVITY = 60;        // px/s², a slight fall on the sparks

export function initBeams(canvas: HTMLCanvasElement): Loop | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rgba = (name: string) => {
    const [r, g, b] = tokenRGB(name).map((v) => Math.round(v * 255));
    return (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  };
  const head = rgba('--color-teal-300'), body = rgba('--color-teal-500'), tail = rgba('--color-green-700');

  let w = 0, h = 0;
  let beams: Beam[] = [];
  const sparks: Spark[] = [];
  const glows: Glow[] = [];
  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  // A beam starts above the band, with a fresh column, speed and delay each time it relaunches.
  const launch = (b: Beam, first = false) => {
    b.x = rand(0.04, 0.96) * w;
    b.len = rand(48, 96);
    b.y = -b.len - rand(0, 160);
    b.speed = h / rand(2.6, 7);              // crosses the band in 2.6–7 s
    b.wait = first ? rand(0, 3.5) : rand(0.8, 3.2);
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(3, Math.min(9, Math.round(w / 170)));
    beams = Array.from({ length: n }, () => { const b = { x: 0, y: 0, len: 0, speed: 0, wait: 0 }; launch(b, true); return b; });
  };

  const collide = (x: number) => {
    glows.push({ x, age: 0 });
    for (let i = 0; i < SPARKS; i++) {
      sparks.push({ x, y: h - 1, vx: rand(-80, 80), vy: rand(-90, -20), life: rand(0.5, 1.6), age: 0, size: rand(1, 2.4) });
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineWidth = BEAM_W;
    for (const b of beams) {
      if (b.wait > 0 || b.y + b.len < 0) continue;
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.len);
      g.addColorStop(0, tail(0));
      g.addColorStop(0.55, body(0.55));
      g.addColorStop(1, head(1));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, Math.min(b.y + b.len, h));
      ctx.stroke();
    }
    // Floor glow where a beam landed: a soft horizontal flare that fades.
    for (const gl of glows) {
      const a = 1 - gl.age / GLOW_LIFE;
      const rg = ctx.createRadialGradient(gl.x, h, 0, gl.x, h, 44);
      rg.addColorStop(0, body(0.55 * a));
      rg.addColorStop(1, body(0));
      ctx.fillStyle = rg;
      ctx.save();
      ctx.translate(gl.x, h);
      ctx.scale(1, 0.22);
      ctx.translate(-gl.x, -h);
      ctx.fillRect(gl.x - 44, h - 44, 88, 88);
      ctx.restore();
    }
    for (const s of sparks) {
      const a = 1 - s.age / s.life;
      ctx.fillStyle = (s.size > 1.8 ? head : body)(a);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  resize();
  new ResizeObserver(resize).observe(canvas);

  return visibleLoop(canvas, (_t, dt) => {
    for (const b of beams) {
      if (b.wait > 0) { b.wait -= dt; continue; }
      b.y += b.speed * dt;
      if (b.y + b.len >= h) { collide(b.x); launch(b); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
    }
    for (let i = glows.length - 1; i >= 0; i--) if ((glows[i].age += dt) >= GLOW_LIFE) glows.splice(i, 1);
    draw();
  });
}
