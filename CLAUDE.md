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
- Build pages from existing components: `Section` (tone base|raised|glow), `SectionHeading` (eyebrow/title/highlight/lede), `FeatureCard`, `CheckList`, `StatStrip`, `SplitSection`, `AnchorNav`, `CtaBand`, `ContactForm`, `SignalPath`, `NetworkGlobe`, `PhoneMockup`, `Button`, `Icon`.
- Alternate section tones down the page (base → raised → base/glow …) so sections read as distinct bands. End each page with `CtaBand` or `ContactForm`.
- Use `data-reveal` on single blocks and `data-stagger` on grids for scroll animation. Keep it to that; do not add new animation libraries or client JS frameworks.
- Need an icon that doesn't exist? Add it to `components/Icon.astro` (24px stroke, Lucide style). Need a genuinely new component? Create it under `src/components/` only if no existing one fits, and keep it token-only.
- `src/pages/index.astro` is the reference for quality and density. Match it.
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
