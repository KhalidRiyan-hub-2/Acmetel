// Shared bits for the J05/J06 lab pages: Base.astro's reveal observer (the lab shell has none), token colours,
// a DPR-capped canvas fitter and a replay registry. Lab only; the real build uses Base.astro + motion.ts.

export function initReveal() {
  document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((group) => {
    [...group.children].forEach((el, i) => {
      (el as HTMLElement).dataset.reveal ??= '';
      (el as HTMLElement).style.setProperty('--reveal-delay', `${i * 70}ms`);
    });
  });
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }),
    { rootMargin: '0px 0px -8% 0px' },
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
}

export function tokens() {
  const css = getComputedStyle(document.documentElement);
  const t = (n: string) => css.getPropertyValue(n).trim();
  return {
    t300: t('--color-teal-300'), t400: t('--color-teal-400'), t500: t('--color-teal-500'), t600: t('--color-teal-600'),
    g700: t('--color-green-700'), g800: t('--color-green-800'),
    n950: t('--color-navy-950'), n900: t('--color-navy-900'), n800: t('--color-navy-800'), n700: t('--color-navy-700'), n600: t('--color-navy-600'),
    ink: t('--color-ink'), muted: t('--color-ink-muted'), faint: t('--color-ink-faint'),
    line: t('--color-line'), strong: t('--color-line-strong'),
  };
}

export interface Fit { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number }
export function fit(canvas: HTMLCanvasElement, maxDpr = 2): Fit {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

export const replays: Record<string, () => void> = {};
export function bindReplays() {
  document.querySelectorAll<HTMLButtonElement>('[data-replay]').forEach((b) => b.addEventListener('click', () => replays[b.dataset.replay!]?.()));
}

/** Runs `cb` once when `el` is at least `threshold` visible. */
export function whenSeen(el: Element, cb: () => void, threshold = 0.4) {
  const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { io.disconnect(); cb(); } }, { threshold });
  io.observe(el);
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = (x: number) => { const c = clamp01(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
