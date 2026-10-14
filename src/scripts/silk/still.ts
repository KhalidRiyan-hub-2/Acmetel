// Static settled frame of the silk name, drawn with Canvas 2D: for reduced motion, no WebGL, or a lost context.
// Same math as the vertex shader in scene.ts (rows, soft word mask, oscillation inside the letters), with no
// three.js download. Segments are bucketed by ink level so the whole frame is a handful of strokes.
import {
  ROW_SPAN, STILL_TIME, isSmall, threadCount, pointCount, drawMask, oscillation, palette, calmFade, ALPHA_CALM, ALPHA_INK,
} from './shared';

/** Buckets: ink levels × edge-fade levels. */
const LEVELS = 12, FADES = 6;

export function drawStill(canvas: HTMLCanvasElement, word = 'Acmetel') {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const small = isSmall();
  const dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const lines = threadCount(small, 'settle'), pts = pointCount(small);
  const { amp, freq } = oscillation(w, lines);
  const mc = document.createElement('canvas');
  drawMask(mc, word, w, h);
  const mw = mc.width, mh = mc.height;
  const alpha = mc.getContext('2d')!.getImageData(0, 0, mw, mh).data;
  // Bilinear sample like a LinearFilter texture (texel centres at +0.5). u, v in 0..1, v = 1 at the top.
  const texel = (x: number, y: number) => alpha[(Math.min(mh - 1, Math.max(0, y)) * mw + Math.min(mw - 1, Math.max(0, x))) * 4 + 3] / 255;
  const ink = (u: number, v: number) => {
    const x = u * mw - 0.5, y = (1 - v) * mh - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const top = texel(x0, y0) * (1 - fx) + texel(x0 + 1, y0) * fx;
    const bot = texel(x0, y0 + 1) * (1 - fx) + texel(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bot * fy;
  };

  const paths = Array.from({ length: LEVELS * FADES }, () => new Path2D());
  for (let l = 0; l < lines; l++) {
    const line = l / (lines - 1);
    const rowY = (line - 0.5) * 2 * ROW_SPAN;
    const v = rowY * 0.5 + 0.5;
    let px = 0, py = 0, pk = 0, pf = 0;
    for (let p = 0; p < pts; p++) {
      const t = p / (pts - 1);
      const k = ink(t, v), f = calmFade(t * 2 - 1, rowY);
      const y = rowY + k * amp * Math.sin(t * freq + STILL_TIME * 2.6 + line * 37);
      const x = t * w, yy = (1 - y) * 0.5 * h;
      if (p) { // Segment coloured by its mean ink and fade, like the interpolated varyings.
        const ki = Math.min(LEVELS - 1, Math.round(((pk + k) / 2) * (LEVELS - 1)));
        const fi = Math.min(FADES - 1, Math.round(((pf + f) / 2) * (FADES - 1)));
        const path = paths[fi * LEVELS + ki];
        path.moveTo(px, py); path.lineTo(x, yy);
      }
      px = x; py = yy; pk = k; pf = f;
    }
  }

  const { a, c } = palette();
  const mix = (x: number, y: number, k: number) => Math.round((x + (y - x) * k) * 255);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1 / dpr; // one device pixel, like WebGL lines
  paths.forEach((path, i) => {
    const k = (i % LEVELS) / (LEVELS - 1), calm = ALPHA_CALM * (Math.floor(i / LEVELS) / (FADES - 1));
    const alpha = calm + (ALPHA_INK - calm) * k;
    if (alpha < 0.005) return;
    ctx.strokeStyle = `rgb(${mix(c[0], a[0], k)} ${mix(c[1], a[1], k)} ${mix(c[2], a[2], k)} / ${alpha})`;
    ctx.stroke(path);
  });
  ctx.globalCompositeOperation = 'source-over';
}
