# Homepage Motion Upgrade Implementation Plan

> For agentic workers: execute task by task; each task ends with `npm run build` clean, screenshot check, commit.

**Goal:** Implement `docs/superpowers/specs/2026-10-01-homepage-motion-design.md`.
**Architecture:** One shared GSAP module (`src/scripts/motion.ts`); one Astro component per feature under `src/components/home/`; heavy code (Three.js, canvases) dynamically imported when the component nears the viewport.
**Tech stack:** Astro 7, Tailwind v4, GSAP 3 + ScrollTrigger, Three.js (globe only), Canvas 2D, world-atlas + topojson-client (build-time only).

Verification for every task: `npm run build` (0 errors) → `npm run preview -- --port <p> &` → `PORT=<p> node scripts/screenshot.mjs <dir> /` prints `no errors, no overflow` → inspect 375 + 1440 screenshots → also capture with `--reduced` emulation where the task has a fallback.

### Task 1 — Foundation (lead)
Files: `package.json` (+gsap, three; dev: world-atlas, topojson-client), create `src/scripts/motion.ts`, modify `src/components/Section.astro` padding (`py-16 sm:py-20`, tight `py-12 sm:py-14`), `scripts/screenshot.mjs` (add `REDUCED=1` → `reducedMotion: 'reduce'`).
motion.ts exports: `gsap`, `ScrollTrigger`, `prefersReducedMotion(): boolean`, `onVisible(el, cb, rootMargin='200px'): void` (fires once), `visibleLoop(el, tick: (t:number, dt:number)=>void): { pause(), play(), destroy() }` (rAF, auto-pauses off-screen / tab hidden / user pause), `pauseButton(btn, loop)` helper wiring aria-pressed.
Commit: "Add shared motion module and tighten section spacing".

### Task 2 — Globe (agent A, worktree)
Create `scripts/build-land-dots.mjs` → `public/data/land-dots.bin` (Float32 xyz, ~8–12k points), `src/data/globe.ts` (markers, markets, Pakistan–China route coords, focus lat/lon), `src/scripts/globe/scene.ts`, `src/components/home/GlobeHero.astro`, `public/images/globe-fallback.png`. Public API: `<GlobeHero class? />` with fixed aspect-square box. Commit in worktree.

### Task 3 — Brand belt (lead)
Create `src/data/logos.ts`, `public/logos/partners/partner-01..08.svg`, `src/components/home/BrandBelt.astro`. Two rows, duplicated tracks, GSAP `xPercent` tween per row with `timeScale` nudged by ScrollTrigger velocity, pause button, hover/focus pause, reduced → wrapped grid. Commit.

### Task 4 — Deal cards (lead)
Create `src/components/home/DealCards.astro` (props: intro slot + cards[]). Cards absolutely stacked under the copy on desktop at start; ScrollTrigger once at 70% → timeline staggers each card to its grid slot (FLIP via `gsap.from` with measured offsets), back.out ease, rotation from random ±8°. Mobile/reduced → plain grid with data-reveal. Commit.

### Task 5 — Services rail (lead)
Create `src/components/home/ServicesRail.astro`. ≥1024px & motion: pin section, `x` scrub over `(trackWidth - viewport)`, `end` = `+=` that distance (≈2 vh), progress text + bar, active card by nearest center. `ScrollTrigger.matchMedia` so resize recalculates and fallback is scroll-snap carousel. Commit.

### Task 6 — Live network (agent B, worktree)
Create `src/data/live.ts` (config + `subscribe(cb)` jitter generator), `src/scripts/live/heartbeat.ts`, `src/scripts/live/radar.ts`, `src/components/home/LiveNetwork.astro` (two panels, "Simulated preview" chips, HTML readouts, pause buttons, blip buttons with tooltips linking to `acmesimStoreUrl`). Commit in worktree.

### Task 7 — Restructure homepage (lead)
Modify `src/pages/index.astro` to the 8-section order; merge Products+ACMeSIM; Why Acmetel → chip row under LiveNetwork; Events+Blog → "Latest"; stats only in hero. Commit.

### Task 8 — Integrate + QA (lead)
Merge agent branches, wire GlobeHero and LiveNetwork into index, run screenshots normal + reduced, Lighthouse mobile (`npx lighthouse` with Chromium at /opt/pw-browsers if installable; else report), fix, commit, push.
