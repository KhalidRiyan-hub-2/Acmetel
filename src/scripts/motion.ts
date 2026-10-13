// Shared motion layer. Every animated component imports from here so GSAP, ScrollTrigger, ScrollSmoother and
// SplitText are registered exactly once, every scroll-linked animation shares one scrub and easing, and all
// loops obey the same pause rules.
//
// Smooth scrolling: ScrollSmoother (Base.astro's #smooth-wrapper / #smooth-content) on mouse/trackpad devices
// only. Touch devices and reduced motion keep native scrolling, so CSS sticky and hash jumps work as usual there.
// The smoother is created when this module is first evaluated, which is before any component script runs, so
// every ScrollTrigger is created against it.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

export { gsap, ScrollTrigger, SplitText };

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Mouse or trackpad as the primary pointer: the only case that gets wheel smoothing, hover effects and scroll kick. */
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Lag (seconds) of every scroll-scrubbed animation. One value so the whole site trails scroll by the same amount. */
export const SCRUB = 1.5;
/** Site easing. `out` matches --ease-out-expo in global.css (CSS reveals); `inOut` for scrubbed travel; `pop` overshoots. */
export const EASE = { out: 'expo.out', inOut: 'power3.inOut', pop: 'back.out(2)' } as const;
/** Seconds the page glides after a wheel or trackpad input. */
const SMOOTH = 1;

let smoother: ScrollSmoother | null = null;
/** The active ScrollSmoother, or null when scrolling is native (touch, reduced motion). */
export const getSmoother = () => smoother;

let kick = 0;
/** Smoothed scroll speed, -1 (fast up) … 1 (fast down). Always 0 on touch devices and with reduced motion. */
export const scrollKick = () => kick;

/** Scroll position at which `el`'s top sits just under the fixed header (html scroll-padding-top). */
const anchorOffset = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

/** Scrolls to an element the way a hash link would, through the smoother when there is one. */
export function scrollToElement(el: Element, smooth = true) {
  if (smoother) smoother.scrollTo(el, smooth, `top ${anchorOffset()}px`);
  else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - anchorOffset(), behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
}

let refreshQueued = false;
if (typeof window !== 'undefined' && !(window as any).__acmeMotion) {
  (window as any).__acmeMotion = true;
  const reduced = prefersReducedMotion();

  const wrapper = document.getElementById('smooth-wrapper');
  // Our own focus moves (hash links) must not trigger the smoother's "jump focused element to centre".
  let ownFocus = false;
  if (wrapper && finePointer() && !reduced) {
    smoother = ScrollSmoother.create({
      wrapper, content: '#smooth-content', smooth: SMOOTH, smoothTouch: false, effects: false,
      onFocusIn: () => !ownFocus,
    });
    document.documentElement.classList.add('has-smoother');
  }

  // Refresh in page order. Pins add space below themselves, so every trigger must be measured after the pins
  // above it: hero entrance → Services rail → ACMeSIM → everything further down. Sorting by position (rather than
  // hand-set refreshPriority values) keeps that true for any pin added later. Runs once all module scripts ran.
  document.addEventListener('DOMContentLoaded', () => ScrollTrigger.sort());

  // Fonts change text metrics, which changes pin/start positions.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('resize', () => {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => { refreshQueued = false; ScrollTrigger.refresh(); }, 200);
  });

  // --- Hash links ------------------------------------------------------------------------------------------
  // With the smoother, content is moved by a transform, so native anchor jumps land in the wrong place. Same-page
  // hash links are routed through it; focus moves to the target like a native jump (keyboard users continue from
  // there). A hash in the URL on load is re-applied after each refresh (fonts, pins) until the visitor scrolls.
  if (smoother) {
    const focusTarget = (el: HTMLElement) => {
      const hadTabindex = el.hasAttribute('tabindex');
      if (!hadTabindex) el.setAttribute('tabindex', '-1');
      ownFocus = true;
      el.focus({ preventScroll: true });
      ownFocus = false;
      if (!hadTabindex) el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
    };
    const targetOf = (hash: string) => (hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null);

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href*="#"]');
      if (!a || (a.target && a.target !== '_self')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname) return;
      const target = targetOf(url.hash);
      if (!target) return;
      e.preventDefault();
      if (location.hash !== url.hash) history.pushState(null, '', url.hash);
      scrollToElement(target);
      focusTarget(target);
    });

    let pending = targetOf(location.hash);
    if (pending) {
      const apply = () => { if (pending) smoother!.scrollTo(pending, false, `top ${anchorOffset()}px`); };
      const stop = () => { pending = null; ['wheel', 'keydown', 'pointerdown', 'touchstart'].forEach((t) => removeEventListener(t, stop)); };
      ['wheel', 'keydown', 'pointerdown', 'touchstart'].forEach((t) => addEventListener(t, stop, { passive: true }));
      ScrollTrigger.addEventListener('refresh', apply);
      addEventListener('load', apply);
    }
    // Back/forward between hash entries of the same page.
    addEventListener('popstate', () => { const t = targetOf(location.hash); if (t) scrollToElement(t, false); });
  }

  // --- Scroll kick -----------------------------------------------------------------------------------------
  // A small, smoothed signal of how fast the page is moving, for decoration that reacts to scrolling
  // (background layer, globe tilt). Mouse/trackpad only; touch scrolling is left completely alone.
  if (smoother) {
    gsap.ticker.add((_t, dtMs) => {
      const target = gsap.utils.clamp(-1, 1, smoother!.getVelocity() / 3500);
      kick += (target - kick) * Math.min(1, (dtMs / 1000) * 6);
      if (Math.abs(kick) < 1e-4) kick = 0;
    });
  }
}

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
