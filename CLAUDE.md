# Acmetel website prototype

Astro 7 + Tailwind v4, static output. Dark navy brand site. This is a **prototype**: no CMS, no real form backend.

## Commands
- `npm run build` — must pass with zero errors before any commit.
- `npm run preview -- --port 4321` then `PORT=4321 node scripts/screenshot.mjs <outDir> /route ...` — full-page screenshots at 375px and 1440px; reports JS errors and horizontal overflow.

## Copy rules
- Page copy comes from `content/source/*.md` (verbatim client copy extracted from their Word docs) and `content/source/home-current-site.md` (live site). Do not invent product claims, numbers, certifications or customers.
- You may tighten headings, split long paragraphs, convert sentences into card titles + text, and fix grammar. You may not change facts.
- Emoji in the source copy are NOT reproduced; use `<Icon>` instead.
- Mark anything assumed with `<!-- PLACEHOLDER: ... -->` in the page source.

## Design system (do not fork it)
- Tokens live in `src/styles/global.css` (`navy-*`, `teal-*`, `green-700/800`, `ink`, `ink-muted`, `ink-faint`, `line`). Never use raw hex or Tailwind's default palette (no `slate-`, `gray-`, `emerald-`, etc.) in pages.
- Every page uses `layouts/Base.astro` and starts with `components/PageHero.astro` (Home is the only exception).
- Build pages from existing components: `Section` (tone base|raised|glow|terminal, optional bg glow|grid, optional `rain` = quieter teal code rain behind a non-terminal band, currently Home → SMS Firewall, Fraud Management and Probe Testing; `RainGroup` wraps several consecutive transparent bands in one continuous rain (Home → "Products for operators" + SMS Firewall, with SMS Firewall's own `rain` off); `terminal` = navy-950 band with teal code rain, CRT scanlines and mono headings, at most one per page, currently Network Intelligence → Portfolio), `SectionHeading` (eyebrow/title/highlight/lede), `Statement` (pinned full-screen line whose letters assemble on scroll; verbatim source copy only, at most one per page), `SignalName` (brand band: a word drawn by WebGL signal threads that settle when the visitor clicks the band (toggle), with the heading as the `h2`; currently Home twice: "Acmetel" over the verbatim tagline, and "Operators" over Products for operators), `FeatureCard`, `CheckList`, `StatStrip`, `SplitSection`, `AnchorNav`, `CtaBand`, `ContactForm`, `SignalPath`, `NetworkGlobe`, `PhoneMockup`, `Button`, `Icon`.
- Alternate section tones down the page (base → raised → base/glow …) so sections read as distinct bands. End each page with `CtaBand` or `ContactForm`.
- Use `data-reveal` on single blocks and `data-stagger` on grids for scroll animation. The other scroll patterns live in `src/scripts/patterns.ts` and are attribute-driven: `data-pop` (accent scales in, replays), `data-bg` (via `Section`/`Statement` `bg` prop), `data-assemble` (via `Statement`), `data-flicker` (hover letter flicker on a link/button label), `data-sticky` (put it on any CSS-sticky element, `data-sticky="lg"` for `lg:sticky`; required because CSS sticky can't work inside the smoothed content), `data-scramble` (heading decodes from ASCII glyphs once in view; `SectionHeading scramble`; use only in mono-type contexts so the line width doesn't jitter), `data-code-rain` (canvas, rendered by `Section tone="terminal"` and `Section rain`), `data-beams` (canvas next to the rain in those same bands: beams fall and burst into sparks on the band's floor, src/scripts/beams.ts). The typing animation is hero-only (`DynamicHeadline`); other headings' teal highlights are static. Don't write per-section motion code in pages, and do not add new animation libraries or client JS frameworks.
- Scrolling: GSAP ScrollSmoother on mouse/trackpad only (`src/scripts/motion.ts`); touch and reduced motion stay native. Everything scroll-linked imports `SCRUB` and `EASE` from `motion.ts` rather than hard-coding values. Never put `position: fixed` inside `<main>`/footer (it would be inside the transformed content); fixed layers go in `Base.astro` outside `#smooth-wrapper`. Use `scrollToElement()` from `motion.ts` for programmatic scrolling.
- Need an icon that doesn't exist? Add it to `components/Icon.astro` (24px stroke, Lucide style). Need a genuinely new component? Create it under `src/components/` only if no existing one fits, and keep it token-only.
- `src/pages/index.astro` is the reference for quality and density. Match it.
- Blog posts come from `src/data/blog.ts` (copy: `content/source/blog.md`), rendered by `components/home/BlogSection.astro`. Featured = `featured: true` locally, or WordPress sticky posts when `WP_API_URL` is set at build time.
- Nav and cross-links come from `src/data/site.ts`. Don't hardcode SIS sub-page URLs; use `SIS_BASE` / `sisPages`.

## Routes
| Route | Source |
|---|---|
| `/` | home-current-site.md, about.md |
| `/about` | about.md, home-current-site.md (About section) |
| `/services/voice` (anchors `#wholesale-voice`, `#did-toll-free`, `#fraud-management`) | voice.md |
| `/services/messaging` (anchors `#a2p`, `#firewall`, `#p2a`, `#p2p`, `#silent-authentication`, `#penetration-testing`, `#managed-services`) | messaging.md |
| `/services/sovereign-intelligence-stack` + `/connectivity`, `/connectivity/terrestrial-transit`, `/data-center`, `/cloud-computing`, `/intelligent-automation`, `/network-intelligence` | sovereign-intelligence-stack.md |
| `/products/acmesim` | acmesim.md — links out to https://acmesim.global/ and https://esim.acmesim.global/ |
| `/contact` | general contact form |

Anchor IDs above are linked from nav/home: they must exist.
