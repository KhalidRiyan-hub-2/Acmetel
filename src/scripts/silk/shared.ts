// Shared by the silk scene (scene.ts, three.js) and its static Canvas 2D frame (still.ts), so both draw the same
// settled picture: the same rows, the same word mask and the same oscillation inside the letters.

/** Fraction of the canvas height (from the centre, in clip space) the settled rows span. */
export const ROW_SPAN = 0.86;
/** Time value the static frame is drawn at (any value works; fixed so every still looks the same). */
export const STILL_TIME = 12;
/** Phones get fewer, shorter threads (and a lower DPR). */
export const isSmall = () => innerWidth < 768;
export const threadCount = (small: boolean, mode: 'settle' | 'ribbon') => (mode === 'settle' ? (small ? 44 : 84) : small ? 40 : 70);
export const pointCount = (small: boolean) => (small ? 420 : 900);

/** Font of the word mask: the display face at bold, same as the site's headings. */
export const maskFont = (px: number) => `700 ${px}px Poppins, ui-sans-serif, system-ui, sans-serif`;
/** Resolves once the mask font can be drawn (or failed to load; the fallback face is fine then). */
export const fontReady = () => document.fonts?.load(maskFont(100)).then(() => undefined, () => undefined) ?? Promise.resolve();

/**
 * Draws `word` in white into `c`, sized for a `w`×`h` (CSS px) canvas at 1/3 scale so linear filtering softens the
 * glyph edges: fitted to 94% of the width and 80% of the height, centred.
 */
export function drawMask(c: HTMLCanvasElement, word: string, w: number, h: number) {
  const mw = Math.max(1, Math.round(w / 3)), mh = Math.max(1, Math.round(h / 3));
  c.width = mw; c.height = mh;
  const m = c.getContext('2d')!;
  m.font = maskFont(100);
  const met = m.measureText(word);
  const capH = met.actualBoundingBoxAscent / 100;
  const fs = Math.min((mw * 0.94) / (met.width / 100), (mh * 0.8) / capH);
  m.clearRect(0, 0, mw, mh);
  m.font = maskFont(fs);
  m.fillStyle = 'white';
  m.fillText(word, (mw - (met.width / 100) * fs) / 2, (mh + capH * fs) / 2);
}

/** Oscillation inside the letters: amplitude about one row gap, one carrier cycle every ~10 CSS px. */
export const oscillation = (w: number, lines: number) => ({
  amp: ((2 * ROW_SPAN) / (lines - 1)) * 1.15,
  freq: (w / 10) * Math.PI * 2,
});

/** A colour token (`--color-teal-300`) as sRGB 0..1 components, so both renderers use the token value exactly. */
export function tokenRGB(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let hex = v.startsWith('#') ? v : '';
  if (!hex) { // Not a hex literal: let canvas normalise it.
    const c = document.createElement('canvas').getContext('2d')!;
    c.fillStyle = v;
    hex = c.fillStyle.startsWith('#') ? c.fillStyle : '#000000';
  }
  if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((x) => x + x).join('');
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Thread colours: mint at the edges of the ribbon (A), deep green toward its centre (B), calm rows (C). */
export const palette = () => ({ a: tokenRGB('--color-teal-300'), b: tokenRGB('--color-green-800'), c: tokenRGB('--color-navy-600') });

/** Alpha of a settled thread outside (0) and inside (1) the letters. */
export const ALPHA_CALM = 0.16, ALPHA_INK = 0.95;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Calm rows fade out toward the edges (x, rowY in clip space), so the settled field has no hard rectangle. */
export const calmFade = (x: number, rowY: number) => smooth(1, 0.55, Math.abs(x)) * smooth(1, 0.6, Math.abs(rowY) / ROW_SPAN);
