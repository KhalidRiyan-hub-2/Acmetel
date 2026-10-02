// Shared motion layer. Every animated homepage component imports from here so GSAP and
// ScrollTrigger are registered exactly once and all loops obey the same pause rules.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let refreshQueued = false;
if (typeof window !== 'undefined' && !(window as any).__acmeMotion) {
  (window as any).__acmeMotion = true;
  // Fonts change text metrics, which changes pin/start positions.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('resize', () => {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => { refreshQueued = false; ScrollTrigger.refresh(); }, 200);
  });
}

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `cb` once, the first time `el` comes within `rootMargin` of the viewport. Used to lazy-load heavy code. */
export function onVisible(el: Element, cb: () => void, rootMargin = '200px') {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); cb(); }
  }, { rootMargin });
  io.observe(el);
}

export interface Loop { pause(): void; play(): void; readonly paused: boolean; destroy(): void }

/**
 * requestAnimationFrame loop bound to an element. Runs only while the element is on screen,
 * the tab is visible and the user hasn't paused it. `tick` receives elapsed seconds and delta seconds.
 */
export function visibleLoop(el: Element, tick: (t: number, dt: number) => void): Loop {
  let onScreen = false;
  let userPaused = false;
  let raf = 0;
  let last = 0;
  let elapsed = 0;

  const running = () => onScreen && !userPaused && !document.hidden;
  const frame = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    elapsed += dt;
    tick(elapsed, dt);
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    if (running() && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    else if (!running() && raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(el);
  document.addEventListener('visibilitychange', sync);

  return {
    pause() { userPaused = true; sync(); },
    play() { userPaused = false; sync(); },
    get paused() { return userPaused; },
    destroy() { io.disconnect(); document.removeEventListener('visibilitychange', sync); cancelAnimationFrame(raf); raf = 0; },
  };
}

/** Wires a toggle button (with aria-pressed) to anything that can pause/play. */
export function bindPauseButton(btn: HTMLButtonElement | null, target: { pause(): void; play(): void }) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const pause = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(pause));
    btn.setAttribute('aria-label', pause ? 'Play animation' : 'Pause animation');
    pause ? target.pause() : target.play();
  });
}
