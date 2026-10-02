# Homepage motion upgrade — design

Source brief: Acmetel master prompt (homepage upgrade, Worx-style motion). This spec records the decisions made with the user on 2026-10-01 and where they deviate from the brief.

## Decisions

| Topic | Decision | Deviation from brief |
|---|---|---|
| Live data | Heartbeat and radar show simulated values, each panel carries a visible "Simulated preview" chip | Brief had unlabelled metrics |
| Globe focus | Centre on **Pakistan** (≈30.4°N, 69.3°E), marker "Pakistan · Core network" | Brief said UAE · HQ — not supported by client content |
| Heartbeat renderer | Canvas 2D with perspective projection, not Three.js | Same look, ~0 KB vs a second WebGL context |
| Radar renderer | Canvas 2D | Brief allowed either |
| Services | Compact pin: cards ~60vh, two visible, pin ≈2 viewport heights | Brief had near-full-height cards |
| Page structure | 12 sections → 8 (below) | Approved |
| Extras | Pakistan–China fiber arc + market dots on globe; clickable radar blips linking to the ACMeSIM store | New |
| Pause controls | Per-component pause button on each continuously moving element (belt, heartbeat, radar, globe auto-rotate) | Global toggle declined |

## New homepage order

1. **Hero** — headline + CTAs left, Three.js globe right. Stats (150+ / 6B+ / 2B+ / 16) stay here, count-up on view. *Only instance of the stats.*
2. **Brand belt** — two opposite-moving rows.
3. **Who we are** — copy + 4 cards dealt from behind the text.
4. **Services** — compact pinned horizontal scroll (desktop ≥1024px, motion allowed); scroll-snap swipe carousel otherwise.
5. **Products + ACMeSIM** — one section: ACMeSIM as a large featured card with phone mockup, SMS Firewall / Fraud Management / Probe Testing as three compact cards beside/below it.
6. **Live network** — heartbeat panel + radar panel, followed by the six "Why Acmetel" points as a compact chip row (no stat numbers, they live in the hero).
7. **Latest** — Events (3 compact rows) and Blog (3 compact cards) in two columns.
8. **Contact**.

No content or links are removed. Section padding moves from `py-20 sm:py-28` to `py-16 sm:py-20` (tight: `py-12 sm:py-14`) in `Section.astro`, which tightens every page.

## Architecture

- `src/scripts/motion.ts` — single GSAP entry: registers ScrollTrigger once, exports `gsap`, `ScrollTrigger`, `prefersReducedMotion()`, `onVisible(el, cb)` (IntersectionObserver lazy-init helper), `whenVisibleLoop(el, tick)` (rAF loop that pauses when off-screen or tab hidden). Refreshes ScrollTrigger on `document.fonts.ready` and debounced resize.
- Each feature is one component under `src/components/home/` with its own `<script>`; heavy code is behind `await import()` triggered by `onVisible`, so Three.js and canvas code are not in the initial bundle.
- New tokens (glows, shadows) go in `global.css` `@theme`, not hardcoded.

### Components

| Component | Responsibility | Depends on |
|---|---|---|
| `home/GlobeHero.astro` + `scripts/globe/*.ts` | Reserved-size container, static fallback image, lazy Three.js scene | three, `public/data/land-dots.bin` |
| `scripts/build-land-dots.mjs` | Build-time: sample world-atlas 110m land TopoJSON on a Fibonacci sphere → Float32 xyz binary | world-atlas, topojson-client (dev) |
| `home/BrandBelt.astro` + `src/data/logos.ts` | Two marquee rows, scroll-velocity speed, pause button, static grid fallback | motion.ts |
| `home/DealCards.astro` | Who-we-are cards dealt from behind copy | motion.ts |
| `home/ServicesRail.astro` | Pinned horizontal rail + progress "02 / 05", carousel fallback | motion.ts |
| `home/LiveNetwork.astro` + `scripts/live/heartbeat.ts`, `radar.ts`, `src/data/live.ts` | Two canvases, HTML readouts, simulated data config | motion.ts |

### Globe behaviour

Points (single draw call) for land dots, fresnel rim shader in teal, faint graticule lines, marker sprite + HTML label for Pakistan, market dots for GCC (UAE, KSA, Oman), Africa (Kenya, Nigeria, South Africa), UK. Pakistan–China route as an animated tube/line arc. Intro: fade/scale in, ease to Pakistan view (~2s). Drag rotate with damping; cursor parallax when idle; zoom only after the user clicks/taps the globe to "focus" it (Esc or click-outside releases) so page scroll is never captured; idle 4s → ease back. DPR capped at 2. Fallback: static PNG of the Pakistan view, generated once by screenshotting the scene with Playwright and committed.

### Live data shape

`src/data/live.ts` exports one config object: `heartbeat: { status, uptime, latencyMs, msgsPerSec }` with jitter ranges, and `radar: { destinations: [{ city, country, lat, lon, network: '5G'|'4G', plan }] }` (16 destinations). Bearings/distances are computed from Karachi. Swapping in a real API means replacing the jitter generator with a fetch; components read through one `subscribe(cb)` function.

### Logos

`public/logos/operators/*.svg` (5) and `public/logos/partners/partner-01.svg` … `partner-08.svg` (labelled placeholders), referenced from `src/data/logos.ts`. Operator entries still render as wordmarks until real files exist.

## Reduced motion / failure

Reduced motion: no pin (carousel), no deal (cards in grid), belt becomes a wrapped grid, globe shows static image, heartbeat/radar draw one static frame, counters show final values. No WebGL: same static globe image. All decorative canvases `aria-hidden`; readouts are real text.

## Verification

`npm run build` clean; screenshot script at 375/1440 with no errors or overflow; Lighthouse mobile run locally via Chromium (target 90+ Performance and Accessibility); manual check that the services pin doesn't overlap the next section after resize. Safari/Firefox cannot be tested in this sandbox (Chromium only) — called out in the final summary.

## Staffing

- Me: motion.ts, Section padding, BrandBelt, DealCards, ServicesRail, page restructure, integration, QA.
- Sonnet agent A (worktree): globe + land-dot build script + fallback image.
- Sonnet agent B (worktree): LiveNetwork band + live.ts.
Agents touch only their own files; I integrate into `index.astro`.
