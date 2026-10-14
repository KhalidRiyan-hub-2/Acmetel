// Code rain for the `terminal` Section tone: falling columns of half-width Katakana, digits and Latin letters.
// Colours come from the design tokens (read from CSS custom properties), so the effect stays on-brand teal.
// Runs only while on screen (visibleLoop) and at ~30 fps; reduced motion gets one static frame.
import { visibleLoop, prefersReducedMotion, type Loop } from './motion';

// GLYPHS, pick, rainFont and rainColors are exported for reuse by other canvases.
export const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFXZ:=*+<>';
export const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
/** Canvas font for rain glyphs at `size` px. */
export const rainFont = (size: number) => `${size}px "JetBrains Mono Variable", ui-monospace, monospace`;
/** Rain colours from the design tokens: bright head, trail, ground, and ink for the brightest highlight. */
export function rainColors() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    head: token('--color-teal-300') || 'rgb(127 220 213)',
    trail: token('--color-teal-500') || 'rgb(34 170 161)',
    ground: token('--color-navy-950') || 'rgb(14 19 34)',
    ink: token('--color-ink') || 'rgb(238 242 248)',
  };
}

export function initCodeRain(canvas: HTMLCanvasElement): Loop | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { head, trail, ground } = rainColors();

  let w = 0, h = 0, size = 16, cols: { y: number; speed: number; len: number; glyphs: string[] }[] = [];
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = w < 640 ? 14 : 16;
    const n = Math.ceil(w / (size * 1.15));
    cols = Array.from({ length: n }, () => ({
      y: Math.random() * h * 1.5 - h * 0.5,
      speed: size * (5 + Math.random() * 9),            // px per second
      len: 8 + ((Math.random() * 18) | 0),
      glyphs: Array.from({ length: 32 }, pick),
    }));
  };

  const draw = () => {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);
    ctx.font = rainFont(size);
    ctx.textBaseline = 'top';
    const step = w / cols.length;
    cols.forEach((c, i) => {
      const x = i * step;
      for (let k = 0; k < c.len; k++) {
        const y = c.y - k * size;
        if (y < -size || y > h) continue;
        ctx.globalAlpha = k === 0 ? 1 : (1 - k / c.len) * 0.55;
        ctx.fillStyle = k === 0 ? head : trail;
        ctx.fillText(c.glyphs[(k + ((c.y / size) | 0)) % c.glyphs.length], x, y);
      }
    });
    ctx.globalAlpha = 1;
  };

  resize();
  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);
  draw();
  if (prefersReducedMotion()) return null;

  let acc = 0;
  return visibleLoop(canvas, (_t, dt) => {
    acc += dt;
    if (acc < 1 / 30) return;                 // ~30 fps is plenty for this and halves the cost
    const elapsed = acc; acc = 0;
    cols.forEach((c) => {
      c.y += c.speed * elapsed;
      if (Math.random() < 0.04) c.glyphs[(Math.random() * c.glyphs.length) | 0] = pick(); // glyphs mutate in place
      if (c.y - c.len * size > h) { c.y = -Math.random() * h * 0.4; c.speed = size * (5 + Math.random() * 9); }
    });
    draw();
  });
}
