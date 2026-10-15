// Hero stats SVG mask reveal (StatStrip `mask`). A blob mask follows the pointer over the strip and reveals the figures
// beneath on a teal fill; it grows while the pointer is over a figure, and the figure counts up. Pointer-driven, so
// only loaded for fine pointers.
import { gsap, EASE } from './motion';

const IDLE = 120;  // circle size (px) while the pointer is anywhere over the strip
const HOVER = 270; // circle size over a figure

export function initSvgMask(root: HTMLElement) {
  const reveal = root.querySelector<HTMLElement>('[data-mask-reveal]');
  if (!reveal) return;
  const cells = [...root.querySelectorAll<HTMLElement>('.mask-base > div')];
  const cur = { x: 0, y: 0, size: 0 };
  const to = { x: 0, y: 0, size: 0 };
  let running = false;

  // Eased per frame towards the target; stops itself once settled.
  const tick = (_t: number, dt: number) => {
    const k = (rate: number) => 1 - Math.exp(-rate * dt / 1000);
    cur.x += (to.x - cur.x) * k(14);
    cur.y += (to.y - cur.y) * k(14);
    cur.size += (to.size - cur.size) * k(8);
    reveal.style.setProperty('--mask-x', `${cur.x}px`);
    reveal.style.setProperty('--mask-y', `${cur.y}px`);
    reveal.style.setProperty('--mask-size', `${Math.max(cur.size, 0)}px`);
    if (Math.abs(to.size - cur.size) < 0.5 && Math.abs(to.x - cur.x) < 0.5 && Math.abs(to.y - cur.y) < 0.5) {
      gsap.ticker.remove(tick); running = false;
    }
  };
  const start = () => { if (!running) { running = true; gsap.ticker.add(tick); } };

  // Each time the pointer moves onto a figure, that figure counts up from 0 (the revealed copy only; the hidden
  // base copy keeps the final value for screen readers).
  const counters = [...reveal.querySelectorAll<HTMLElement>('[data-count-to]')];
  const tweens: (gsap.core.Tween | undefined)[] = [];
  const rampUp = (i: number) => {
    const el = counters[i];
    if (!el) return;
    const v = { n: 0 };
    tweens[i]?.kill();
    tweens[i] = gsap.to(v, {
      n: Number(el.dataset.countTo), duration: 1.9, ease: EASE.inOut,
      onUpdate: () => { el.textContent = String(Math.round(v.n)); },
    });
  };

  let entered = false;
  let hovered = -1;
  root.addEventListener('pointermove', (e) => {
    const r = reveal.getBoundingClientRect(); // mask coordinates are relative to the (bleeding) reveal layer
    to.x = e.clientX - r.left; to.y = e.clientY - r.top;
    if (!entered) { cur.x = to.x; cur.y = to.y; entered = true; } // grow from under the cursor, no fly-in
    const over = cells.findIndex((c) => {
      const b = c.getBoundingClientRect();
      return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
    });
    if (over !== hovered && over !== -1) rampUp(over);
    hovered = over;
    to.size = over !== -1 ? HOVER : IDLE;
    start();
  });
  root.addEventListener('pointerleave', () => { to.size = 0; entered = false; hovered = -1; start(); });
}
