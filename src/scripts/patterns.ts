// Site-wide scroll patterns, driven by data attributes so pages never need their own motion code.
// Loaded once by Base.astro. All motion is transform/opacity; with reduced motion everything stays in its
// final, static state (the `motion` class on <html> is never added, so nothing starts hidden).
//
//   data-sticky[="lg"]   CSS-sticky element. With the smoother on, CSS sticky can't work inside the transformed
//                        content, so it is re-created as a ScrollTrigger pin (same top offset, same containing
//                        block). "lg" = only from 1024px, matching an `lg:sticky` class.
//   data-assemble        Statement band (components/Statement.astro): pins while its letters fly in from
//                        scattered positions, scrubbed to scroll.
//   data-pop             Accent (icon tile, check mark) that scales in with a slight overshoot when it enters,
//                        in random order with its neighbours; resets when it leaves so it replays.
//   data-bg="glow|grid"  On a section: the fixed background layer of that name fades in while the section is
//                        on screen. Sections with tone base/glow are transparent, so the layer shows through.
//   data-flicker         On a link/button label: letters flicker in on hover (mouse/trackpad only).
//   data-code-rain       Canvas in a `terminal` Section: teal code rain (src/scripts/coderain.ts, loaded when near).
//   data-beams           Canvas in a `rain`/`terminal` Section: falling beams that burst into sparks on the band's
//                        floor (src/scripts/beams.ts, loaded when near). Not loaded with reduced motion.
//   data-scramble        Heading text decodes from random glyphs the first time it scrolls into view.
//   data-stat-rain       StatStrip `matrix` (hero stats): code rain locks onto each figure once
//                        (src/scripts/statrain.ts, loaded when near). Reduced motion: plain figures.
//   data-svg-mask        StatStrip `mask` (hero stats): figures hidden until a cursor-following blob mask reveals them
//                        (src/scripts/svgmask.ts). Fine pointer only; touch and reduced motion show plain figures.
import { gsap, ScrollTrigger, SplitText, SCRUB, EASE, prefersReducedMotion, finePointer, getSmoother, scrollKick, onVisible } from './motion';

const reduced = prefersReducedMotion();

// --- data-sticky -----------------------------------------------------------------------------------------------
if (getSmoother()) {
  const mm = gsap.matchMedia();
  document.querySelectorAll<HTMLElement>('[data-sticky]').forEach((el) => {
    mm.add(el.dataset.sticky === 'lg' ? '(min-width: 1024px)' : 'all', () => {
      // Read the CSS offset, then switch CSS sticky off: the wrapper is a scroll container, so leaving it on
      // would add the offset a second time on top of the pin.
      const top = parseFloat(getComputedStyle(el).top) || 0;
      el.style.position = 'relative';
      el.style.top = 'auto';
      const st = ScrollTrigger.create({
        trigger: el, pin: true, pinSpacing: false, invalidateOnRefresh: true,
        start: `top ${top}px`,
        endTrigger: el.parentElement!,
        end: () => `bottom ${top + el.offsetHeight}px`,
      });
      return () => { st.kill(); el.style.position = ''; el.style.top = ''; };
    });
  });
}

// --- data-assemble ---------------------------------------------------------------------------------------------
// The band pins for one screen; the letters start arriving as it comes up the viewport and are home before the
// pin releases. Positions are a function of scroll, so it plays the same forwards, backwards and on a jump.
if (!reduced) {
  document.querySelectorAll<HTMLElement>('[data-assemble]').forEach((band) => {
    const text = band.querySelector<HTMLElement>('[data-assemble-text]');
    if (!text) return;
    const hold = () => innerHeight; // pinned distance

    ScrollTrigger.create({ trigger: band, pin: true, start: 'top top', end: () => `+=${hold()}`, invalidateOnRefresh: true });

    SplitText.create(text, {
      type: 'words,chars', tag: 'span', wordsClass: 'split-word', charsClass: 'split-char', aria: 'none', autoSplit: true,
      onSplit(self) {
        paintGradient(text, self.chars as HTMLElement[]);
        // Scattered state is set explicitly (not as fromTo start values) so letters that haven't started yet are
        // already scattered before the trigger, never shown in place first. A resize re-splits (autoSplit) and
        // rebuilds this with the new viewport size, so no invalidateOnRefresh (it would re-record a half-assembled
        // state as the start).
        const r = gsap.utils.random;
        gsap.set(self.chars, {
          opacity: 0, scale: 0.5,
          x: () => r(-0.38, 0.38) * innerWidth, y: () => r(-0.42, 0.42) * innerHeight, rotation: () => r(-35, 35),
        });
        // Letters fade up early (visible while still scattered) and travel home on the site's in-out ease.
        // One random arrival order shared by both tweens, so each letter's fade and flight stay together.
        const order = gsap.utils.shuffle(self.chars.map((_, i) => i));
        const stagger = (i: number) => (order[i] / Math.max(1, order.length - 1)) * 0.25;
        return gsap.timeline({ scrollTrigger: { trigger: band, start: 'top 75%', end: () => `top+=${hold() * 0.8} top`, scrub: SCRUB } })
          .to(self.chars, { scale: 1, x: 0, y: 0, rotation: 0, ease: EASE.inOut, duration: 1, stagger }, 0)
          .to(self.chars, { opacity: 1, ease: 'power2.out', duration: 0.45, stagger }, 0);
      },
    });
  });
}

/** .text-gradient clips its background to its own text, which transformed letters escape. Give each letter its
 *  own slice of the gradient instead, positioned by its offset inside the highlight (transforms ignored). */
function paintGradient(root: HTMLElement, chars: HTMLElement[]) {
  root.querySelectorAll<HTMLElement>('.text-gradient').forEach((hl) => {
    const own = chars.filter((c) => hl.contains(c));
    if (!own.length) return;
    const left = Math.min(...own.map((c) => c.offsetLeft));
    const width = Math.max(...own.map((c) => c.offsetLeft + c.offsetWidth)) - left;
    const bg = getComputedStyle(hl).backgroundImage;
    hl.style.background = 'none';
    own.forEach((c) => {
      Object.assign(c.style, {
        backgroundImage: bg, backgroundSize: `${width}px 100%`, backgroundPosition: `${left - c.offsetLeft}px 0`,
        backgroundClip: 'text', webkitBackgroundClip: 'text', color: 'transparent',
        // The inline-block letter box is one tight line tall; extend the painted area so descenders aren't clipped.
        paddingBlock: '0.12em 0.2em', marginBlock: '-0.12em -0.2em',
      });
    });
  });
}

// --- data-pop --------------------------------------------------------------------------------------------------
if (!reduced) {
  const pops = gsap.utils.toArray<HTMLElement>('[data-pop]');
  if (pops.length) {
    const hide = (els: Element[]) => gsap.set(els, { opacity: 0, scale: 0, overwrite: true });
    const show = (els: Element[]) => gsap.to(els, {
      opacity: 1, scale: 1, duration: 0.7, ease: EASE.pop, overwrite: true,
      stagger: { amount: Math.min(0.4, els.length * 0.06), from: 'random' },
    });
    hide(pops);
    ScrollTrigger.batch(pops, { start: 'top 92%', end: 'bottom 8%', onEnter: show, onEnterBack: show, onLeave: hide, onLeaveBack: hide });
  }
}

// --- data-bg ---------------------------------------------------------------------------------------------------
// One fixed layer per kind (Base.astro). Counted, so overlapping or adjacent sections with the same layer don't
// flicker it off and on. With the smoother, scroll speed nudges the layer (scroll kick).
if (!reduced) {
  const layers = new Map([...document.querySelectorAll<HTMLElement>('[data-bg-layer]')].map((l) => [l.dataset.bgLayer!, l]));
  const host = document.querySelector<HTMLElement>('[data-bg-layers]');
  const active = new Map<string, number>();
  document.querySelectorAll<HTMLElement>('[data-bg]').forEach((section) => {
    const layer = layers.get(section.dataset.bg!);
    if (!layer) return;
    // A pinned section (Statement) stays on screen for its pin distance too: measure the pin spacer instead.
    const parent = section.parentElement;
    ScrollTrigger.create({
      trigger: parent?.classList.contains('pin-spacer') ? parent : section, start: 'top 55%', end: 'bottom 45%',
      onToggle: (self) => {
        const n = (active.get(section.dataset.bg!) ?? 0) + (self.isActive ? 1 : -1);
        active.set(section.dataset.bg!, n);
        gsap.to(layer, { opacity: n > 0 ? 1 : 0, duration: 1.2, ease: EASE.out, overwrite: true });
      },
    });
  });
  if (host && layers.size && getSmoother()) {
    const setY = gsap.quickSetter(host, 'y', 'px');
    const setSY = gsap.quickSetter(host, 'scaleY');
    let last = 0;
    gsap.ticker.add(() => {
      const k = scrollKick();
      if (k === last) return;
      last = k;
      setY(k * -48);
      setSY(1 + Math.abs(k) * 0.12);
    });
  }
}

// --- data-flicker ----------------------------------------------------------------------------------------------
// Split on first hover only. The label is duplicated into a screen-reader-only span and the split copy is
// aria-hidden, so the accessible name and reading order never change.
if (!reduced && finePointer()) {
  const split = new WeakMap<HTMLElement, Element[]>();
  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element | null)?.closest?.('a, button');
    if (!target || target.contains(e.relatedTarget as Node | null)) return;
    target.querySelectorAll<HTMLElement>('[data-flicker]').forEach((el) => {
      let chars = split.get(el);
      if (!chars) {
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = el.textContent;
        el.before(sr);
        el.setAttribute('aria-hidden', 'true');
        chars = SplitText.create(el, { type: 'words,chars', tag: 'span', wordsClass: 'split-word', charsClass: 'split-char', aria: 'none' }).chars;
        split.set(el, chars);
      }
      gsap.fromTo(chars, { opacity: 0.15 }, {
        opacity: 1, duration: 0.06, ease: 'steps(1)', overwrite: true,
        stagger: { amount: 0.28, from: 'random' },
      });
    });
  });
}

// --- data-code-rain --------------------------------------------------------------------------------------------
// Loaded only when a band comes near; reduced motion still gets one static frame (the texture, no movement).
document.querySelectorAll<HTMLCanvasElement>('canvas[data-code-rain]').forEach((canvas) => {
  onVisible(canvas, async () => { (await import('./coderain')).initCodeRain(canvas); }, '400px');
});

// --- data-beams ------------------------------------------------------------------------------------------------
if (!reduced) document.querySelectorAll<HTMLCanvasElement>('canvas[data-beams]').forEach((canvas) => {
  onVisible(canvas, async () => { (await import('./beams')).initBeams(canvas); }, '400px');
});

// --- data-stat-rain --------------------------------------------------------------------------------------------
// Armed now, so StatStrip's CSS failsafe stands down and the slots stay blank (never the final figures) until
// statrain.ts fills them with glyphs. If the script can't load, the figures are shown as they are.
if (!reduced) document.querySelectorAll<HTMLElement>('[data-stat-rain]').forEach((root) => {
  root.dataset.statRain = 'armed';
  onVisible(root, () => {
    import('./statrain').then((m) => m.initStatRain(root)).catch(() => { root.dataset.statRain = 'done'; });
  }, '400px');
});

// --- data-svg-mask ---------------------------------------------------------------------------------------------
if (!reduced && finePointer()) document.querySelectorAll<HTMLElement>('[data-svg-mask]').forEach((root) => {
  onVisible(root, () => { import('./svgmask').then((m) => m.initSvgMask(root)); }, '400px');
});

// --- data-scramble ---------------------------------------------------------------------------------------------
// Each text node resolves left to right through random glyphs, so nested spans (the gradient highlight) keep
// their styling. The heading's accessible name is pinned to the final text while it scrambles.
if (!reduced) {
  // ASCII only: every glyph has the same width in the mono face, so the line never jitters while decoding.
  const GLYPHS = '0123456789ABCDEFXZ<>/=*+#%';
  const scramble = (el: HTMLElement) => {
    const nodes: { node: Text; text: string }[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent!.trim()) nodes.push({ node: n as Text, text: n.textContent! });
    const total = nodes.reduce((sum, n) => sum + n.text.length, 0);
    if (!total) return;
    const hadLabel = el.hasAttribute('aria-label');
    if (!hadLabel) el.setAttribute('aria-label', el.textContent!.replace(/\s+/g, ' ').trim());
    const state = { p: 0 };
    gsap.to(state, {
      p: 1, duration: Math.min(1.4, 0.5 + total * 0.02), ease: 'none',
      onUpdate: () => {
        let offset = 0;
        const done = Math.floor(state.p * total);
        nodes.forEach(({ node, text }) => {
          let out = '';
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            out += ch === ' ' || offset + i < done ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
          node.textContent = out;
          offset += text.length;
        });
      },
      onComplete: () => { nodes.forEach(({ node, text }) => { node.textContent = text; }); if (!hadLabel) el.removeAttribute('aria-label'); },
    });
  };
  document.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => scramble(el) });
  });
}
