# Job queue

Owned by the **tester** agent (`.claude/agents/tester.md`). The **designer** agents (`.claude/agents/designer.md`, the front-end design team) prototype open-ended jobs in parallel, one job each; the **frontend** agent builds jobs marked `ready to build`; **qc** reviews jobs marked `ready for QC` and logs results in [QC-LOG.md](QC-LOG.md).

**Two teams (user, 2026-10-14):** the tester works the Order list **front to back**; the designer team works it **back to front**. Each claims a job by setting its status before starting, and skips anything already claimed or with an existing lab page.

Flow: `queued` → `prototyping (designer|tester)` → `ready to build` → `in progress (frontend)` → `ready for QC` → `QC passed` / `changes requested (see QC-LOG)` → `done`. Anything waiting on the user is `blocked` with the exact question.

Repo rules that bite these jobs (see `CLAUDE.md`): copy only from `content/source/` or the user, assumptions marked `<!-- PLACEHOLDER -->`, tokens only, motion via `patterns.ts`/`motion.ts`, no new animation libraries, reduced-motion and off-screen pause for every animation. Other sessions edit this repo concurrently.

---

## Order (tester, updated 2026-10-14 after user answers)

Frontend takes the first `ready to build` job it isn't blocked on. QC jobs run in parallel.

1. **J01** globe offices: in progress (frontend). Nobody else touches globe files until it lands; J02's QC fixes follow in the same files.
2. **J04** silk name band replacing the homepage Statement: in progress (frontend).
3. **J03** hero stats "rain lock": ready for QC.
4. **J05 → J06** SMS Firewall searchlight and Fraud Management mask scan, as **dedicated homepage sections** after the ACMeSIM/products band (user decision): ready to build. Both edit `index.astro`, so build them one after the other, not in parallel.
5. **J10a** homepage Featured Blogs (homepage only, user decision): ready to build.
6. **J09a → J09b** "Powered by" band after Live network: being prototyped by the designer (`/lab/j09`).
7. **J08** radar filter + infrared (teal heat, user decision): after the uncommitted live-network edits land.

QC: J02 (changes requested), J07 (passed, minors open).

---

## Hero & homepage

### J01 · Globe: zoom to the Acmetel offices (Islamabad, US)
- **Owner:** frontend · **Status:** ready for QC
- **Goal:** the hero globe flies down to Acmetel's Islamabad and US offices.
- **Decided (user, 2026-10-14):** office stops for **Islamabad** (Office 01, First Floor, VIP Square, I-8 Markaz) and the **US** (Acmetel USA LLC, 17W695C Butterfield Road, Oakbrook Terrace, IL 60181). **No UAE office stop:** Dubai → Downtown → Burj Khalifa stays a geography showcase.
- **Source:** `content/source/offices.md` (user-supplied, verbatim). Captions may use only these address facts.
- **Acceptance:**
  - Islamabad: new child stop under `islamabad` at the VIP Square building (geocode it from OpenStreetMap, record the coordinates and source in a code comment), with a street-level OpenStreetMap layer for Islamabad (new `cities` entry in `src/data/globe-regions.json`, built by `npm run build:osm-cities`), 3D buildings around the office if OSM has them, and a landmark-style label on the building.
  - US: a Chicago-area stop under `us`, then the office stop at Butterfield Road, Oakbrook Terrace, with its own street-level layer and label.
  - Offices visibly marked as Acmetel offices (label/marker), distinct from geography stops.
  - Chips, breadcrumb and caption work; flights clean at 375 and 1440; no console errors; build passes; new data files lazy-loaded, with sizes noted in the handoff.
- **Notes:** reuse the street-level pipeline (`scripts/build-osm-cities.mjs`, city layers + `elev`/`head`/orbit camera in `src/scripts/globe/scene.ts`). Overpass is flaky; `z.overpass-api.de` was the most reliable mirror, and the script caches and retries. The OSM attribution already shows whenever a city layer is on screen.
- **Handoff (frontend, 2026-10-14):**
  - **Built.** Tree is now `pakistan → islamabad → islamabad-office` and `us → chicago → us-office` (chips read "Acmetel office"). Islamabad and the new "Chicago area" stop drop to street-map level (alt 0.011/0.013); the office stops go to rooftop level with the street-level orbit. Each office gets a teal light column with a signal pulse running up it and rings pulsing across the ground (scene), plus a boxed **office tag** (kicker / name / address line, teal diamond on a solid stem) that is distinct from geography labels, and teal **office chips** with a diamond and a teal breadcrumb leaf. US caption now names Acmetel USA LLC (placeholder comment removed); captions use only `content/source/offices.md` facts.
  - **Geocoding (comments in `globe.ts`).** US: 17W695C isn't in OSM; neighbouring unit 17W697 F (node 13598789256) sits inside office building way 1229730923, used as the office footprint (glass-teal landmark) at 41.849514, -87.974663. The US Census geocoder puts 17W695 on the Butterfield Rd frontage 55 m north, which agrees. Islamabad: **"VIP Square" is not in OSM** (I-8 Markaz has a "VIP Plaza", way 556437799, not assumed to be the same), so the stop is the centre of the I-8 Markaz block (way 568907931, 33.66786, 73.07452), address level, no footprint highlighted. Both marked `PLACEHOLDER`.
  - **Street layers** (`globe-regions.json` `cities`, `npm run build:osm-cities`): `globe-islamabad-city.bin` 245 KB (207 KB gz), `globe-islamabad-buildings.bin` 2 KB (61 buildings; OSM is sparse there), `globe-chicago-city.bin` 480 KB (415 KB gz, includes Lake Michigan built from its shoreline), `globe-chicago-buildings.bin` 27 KB (695 buildings). All lazy (fetched when a flight heads to Islamabad / Chicago). Script additions are opt-in per city (`landmarkWays`, `skipWater`, `lake`); Dubai/Lahore output is byte-identical (md5 checked).
  - **How to see it.** Home hero: chip Pakistan → Islamabad → Acmetel office; United States → Chicago area → Acmetel office. Drag at the office to orbit.
  - **Also in scene.ts (shared with J02 fixes):** label collision pass (lower-priority tags fade out when they'd overlap; office cards win and slide sideways to stay in the box), faster city-line conversion (Lahore/Chicago builds were ~170 ms of main thread).
  - **Checked:** build passes; flights at 375 and 1440 with no console errors; home screenshots 375/1440 no overflow; reduced motion keeps the static globe (unchanged path).
  - **Known limits:** the US building has no height in OSM (default 10 m). Chicago-area range rings are centred on the framing point, not a place. Ground under the US street map is the coarse `usa` region dot field.
  - **User to decide:** confirm the VIP Square building (or give a map pin) so the Islamabad stop can highlight it; confirm 17W695C is footprint way 1229730923.

### J02 · Globe: more granularity and visual detail
- **Owner:** frontend · **Status:** ready for QC
- **QC (major):** Western China city labels collide at country zoom, and show at the UAE and Pakistan stops too (no `near`). At 375 the China stop's top-right is an unreadable pile (Shihezi/Urumqi/Turpan/Hami/Kuqa/Korla, Khunjerab Pass over Hotan). Fix in `src/data/globe.ts` Western China tags: add `near`/later `z`, thin the set.
- **QC (minor, same pass if cheap):** about 320 ms main-thread hitch building Dubai buildings (`buildBuildings`). Lahore lost its marker and range rings (`cityStops` filter `alt > 0.01`). `globe-dubai-osm.bin` fetched twice. Airport/Gulberg and Dubai/Deira label overlaps. Lat/lon/alt readout illegible over the city at Burj/Downtown (375 especially).
- **Done so far:** Dubai street map + 3D Downtown + Burj Khalifa rooftop stop; Lahore street map; China provinces/rivers/lakes/roads/rail + Western China cities (`src/scripts/globe/scene.ts`, `src/data/globe.ts`, `scripts/build-osm-cities.mjs`, `scripts/build-globe-data.mjs`).
- **Acceptance:** QC review of the above; further detail ideas queued by tester as follow-ups.
- **Notes:** after changing globe dependencies the long-running dev server can serve a stale `three.js` (`504 Outdated Optimize Dep`); restart with `npx astro dev --port 4400 --force`.
- **Fixes (frontend, 2026-10-14), QC items 1–6:**
  1. Western China labels: `near: 10` around the China stop and `z` from 0.85; Shihezi, Kuqa and Hami dropped; plus a scene-wide collision pass (`rank` per tag kind, data-rank in GlobeHero): overlapping lower-priority labels fade out. China stop clean at 375 and 1440; none at UAE/Pakistan.
  2. `cityStops` = `alt < 0.2 && elev === undefined` (Lahore back; Downtown, Burj and office stops excluded). The city-marker street fade now runs 3.05–3.45 so Lahore (level ≈ 3.0) keeps its marker.
  3. Data fetches are memoised in `scene.ts` (`load`), so `globe-dubai-osm.bin` loads once.
  4. `buildBuildings` extrudes in ~6 ms slices per frame (decode ~10 ms, final arrays ~12 ms). City line conversion also rewritten without per-point arrays.
  5. Collision pass hides Gulberg under the airport label at Lahore and Deira next to the Dubai coordinate line at 375; district labels slightly brighter with a tighter navy shadow.
  6. Readout has a `bg-navy-950/75` backdrop with blur and `text-ink-muted`.
  - Not done (nits 7–10): minorBox edge fade, Dubai box edge, comment level numbers, Lahore PLACEHOLDER wording, Float32 footprint precision, ODbL note in `public/data/`.

### J03 · Hero statistics: Matrix "rain lock"
- **Owner:** frontend · **Status:** ready for QC (fixes for QC-LOG 2026-10-14 below)
- **QC (major):** scrolling replays a cell. ScrollSmoother slides the strip under a stationary mouse, which fires the per-cell `pointerenter` replay (`statrain.ts`, last block). Repro at 1440: after the intro, pointer above the strip, wheel down without moving the mouse → `done` → `running` → `done`. Trigger the replay only on real pointer movement inside the cell.
- **QC (minor/nits):** the intro stretches to about 1.9 s / 3.0 s when it starts alongside the globe boot (dt clamp). Jitter > step gives occasional out-of-order locks. Everything else passed: no layout shift, loop fully stops (also after replay, also with main's `visibleLoop` fix), reduced/no-JS/failsafe/chunk-failure fallbacks, sr-only figures, `/about` count-up unchanged.
- **Goal:** the hero `StatStrip` (150+ clients, 6B+ minutes, 2B+ messages, 16 years; `src/pages/index.astro` `stats`) plays once as a Matrix-style simulation: code rain falls behind the strip, a bright drop lands on every character of every figure and locks it, then everything settles into today's strip.
- **Prototype:** `/lab/j03` (`src/pages/lab/j03.astro`), **direction A "Rain lock" chosen**. Rejected: B "Glyph reels" (reads as a slot machine; glyphs half-cut mid-roll), C "Terminal strip" (endless rain behind the figures competes with the globe and the typing headline; mono figures change the hero type; long mono labels wrap and misalign the figures).
- **Why A:** the most Matrix-literal (falling glyphs that become the figures); one ~2.5 s moment, not ambient noise next to the globe; ends exactly as the current strip (Poppins, same box); one 2D canvas, under ~1k glyphs a frame, then the loop stops.
- **Acceptance:**
  - `StatStrip` gets an opt-in prop (e.g. `matrix`); only the homepage hero uses it. `/about` keeps today's count-up. Figures and labels unchanged (150+, 6B+, 2B+, 16).
  - Each character is a slot: an invisible copy of the final character sizes it and the live glyph is overlaid on top. Strip height and cell widths are identical before, during and after (no layout shift).
  - On first view (≥50% visible): dim teal rain behind the strip (glyphs and token colours from `coderain.ts`; export its glyph set rather than copying it). Each character shows a dim scrambling glyph until its bright drop lands, left to right, all locked within ~1.6 s, with a short teal → ink flash. The rain fades out by ~2.5 s and the loop stops (no rAF afterwards).
  - The final state matches today's strip (ink Poppins, tabular numerals). Screen readers always get the plain figure (sr-only); the glyph layer and the canvas are `aria-hidden`.
  - Reduced motion and no JS: plain figures, no canvas animation. No flash of the final figures before the scramble: apply the pre-state under `.motion` before first paint, with a CSS failsafe that reveals the figures if the script never runs.
  - Motion code goes in `src/scripts/` (e.g. `statrain.ts`), lazy-loaded from an attribute in `patterns.ts` the way `data-code-rain` is, using `visibleLoop`/`prefersReducedMotion` from `motion.ts`. No script in `index.astro`.
  - At 375 (2×2) and 1440 (4 across), labels stay readable over the rain (rain alpha ≤ ~0.25 behind labels). No console errors, no overflow, build passes.
- **User change (2026-10-14):** grid dividers removed from `StatStrip` in both modes (matrix `.rain-cell` shadows and the default `gap-px bg-line`); outer border kept. Requested by the user, not a regression.
- **Notes:** in matrix mode, don't emit `data-count`, so the count-up in `Base.astro` doesn't fight it. Don't replay on scroll. An optional per-cell replay on hover (fine pointer only) is fine. Don't touch `GlobeHero`/globe files (J01/J02). `index.astro` has uncommitted edits from other sessions, so edit it surgically. Tester deletes `src/pages/lab/j03.astro` once this is built.
- **Handoff (frontend, 2026-10-14):**
  - **Built:** `StatStrip` `matrix` prop (homepage hero only; `/about` unchanged, still 4 × `data-count`). Matrix mode: one wrapper (`bg-navy-900`, border, `[data-stat-rain]`) holding an `aria-hidden` canvas behind a transparent `dl`; cell hairlines are box-shadows. Each character is a slot (`.slot-size` invisible sizer + absolutely positioned `.slot-live`, so wide rain glyphs can't widen it); sr-only plain figure per `dd`; glyph layer `aria-hidden` + `select-none`. No `data-count`, no `data-stagger` in matrix mode (the rain is the entrance).
  - **Motion:** `src/scripts/statrain.ts`, lazy-loaded by `patterns.ts` (`[data-stat-rain]`, 400px ahead, skipped with reduced motion). Root states: server `""` → `armed` (patterns) → `ready` (slots scrambled) → `running` → `done`. Starts at ≥50% visible, once. Measured in Chromium: first lock +0.57 s, all 12 locked by +1.47 s, rain gone and canvas cleared at +2.51 s; then zero canvas draws and no rAF from this loop. Ambient rain capped at alpha 0.25; drop heads/trails clamp to 0.25 over any label rect. Fine pointer: hovering a cell after the intro replays that cell only (clipped to it).
  - **Fallbacks:** pre-state CSS (scoped in StatStrip) hides `.slot-live` under `.motion` until statrain fills it; failsafe shows the figures after 2 s if `patterns.ts` never arms the strip; a failed import sets `done` (plain figures). Reduced motion and no-JS: plain figures, canvas never drawn.
  - **Shared code:** `coderain.ts` now exports `GLYPHS`, `pick`, `rainFont`, `rainColors` (initCodeRain uses them too; behaviour unchanged). `patterns.ts` header + one block added after `data-code-rain`. `index.astro`: only `<StatStrip stats={stats} matrix />`.
  - **Files:** `src/components/StatStrip.astro`, `src/scripts/statrain.ts` (new), `src/scripts/coderain.ts`, `src/scripts/patterns.ts`, `src/pages/index.astro` (one attribute).
  - **How to see it:** `/`, scroll until the stat strip under the globe is half on screen (at 1440 it sits just below the fold). Hover a figure afterwards to replay that cell. Compare `/about` (count-up).
  - **Checks:** build passes; screenshot script on `/` and `/about` at 375/1440, normal and `REDUCED=1`: no errors, no overflow. Strip box and every slot width identical before/during/after (375: 343×282, 1440: 1168×126) in motion, reduced and no-JS.
  - **Known limits:** final strip uses shadow hairlines over one `navy-900` box instead of the `gap-px bg-line` grid, so it's the same look but the cells are ~1px wider in total. Glyph slots break kerning between characters (tabular digits are unaffected; "B+" may sit a hair apart). Latent bug spotted, not fixed (shared file): `visibleLoop` in `motion.ts` reschedules its next frame after `tick`, so calling `loop.pause()` from inside a tick doesn't stop the rAF (the lab prototype had this). statrain works around it with `queueMicrotask`. Lab files left in place for QC.
- **Fixes (frontend, 2026-10-14):** only `src/scripts/statrain.ts` changed.
  - **Major (scroll replay), fixed.** The per-cell `pointerenter` listeners are gone. One passive window `pointermove` listener replays a cell only when a real move carries the pointer into it: the pointer's client position must have changed since the last move (or, for the very first event, `movementX/Y` ≠ 0), no `wheel`/`scroll` in the last 200 ms, and not `pointerType` touch. Moving around inside the same cell doesn't replay again; leaving it and coming back does. It's still `finePointer()` only.
  - **Repro re-run** (headless Chrome, 1440, built to a temp outDir, served on :4333): after the intro, pointer 150 px above the strip, 6 wheel steps of 60 px with the mouse still. Chrome still fires `pointerenter` on a cell (counted: 1), and the state stays `done` with no events. With 3 steps (the strip ends up under the still pointer) it also stays `done`. Positive control: a real move into cell 3 → `running`, only slots 7–9 lock in order → `done`.
  - **Minor (intro stretched by the dt clamp), fixed.** The lock clock `t` now advances on wall time (per-frame step capped at 0.5 s; a `dt === 0` frame from `visibleLoop` marks a resume, so time off screen still doesn't count). Rain columns keep the clamped dt, so they don't jump. Measured with the globe booting on the same first scroll: first lock +0.56 s, all 12 locked +1.59 s, `done` +2.51 s (spec 1.6 / 2.5).
  - **Nit (out-of-order locks), fixed.** `JITTER` is now a fraction (0.8) of `STEP`, and `STEP = (LOCK_BY − FIRST) / (n − 1 + JITTER)`, so each landing stays inside its own slot of time. Locks are strictly left to right (intro and replay logs show 0…11 and 7, 8, 9 in order), and the last lock is still due by 1.6 s.
  - **Checks:** `npx astro build` passes. Screenshot script on `/` and `/about` at 375/1440 plus `REDUCED=1` on `/`: no errors, no overflow. The strip box is unchanged (375: 343×282, 1440: 1168×126) in motion and reduced; reduced stays `""` with plain figures. Strip captures mid-run (375) and after `done` (both widths) look as before.
  - **Not changed:** QC nits 4–6 (static pre-state below the fold, `rainColors()` rgb fallback in `coderain.ts`, lab pages in `dist/`) are outside statrain.ts or this brief.

### J04 · Acmetel name drawn by signal oscillations + tagline
- **Owner:** frontend · **Status:** QC passed (2026-10-14, nits only; see QC-LOG). Placement confirmed by the user: replaces the homepage Statement.
- **QC:** lazy-load, shared three chunk, scrubbed settle, sleep after ~5 s (0 frames), no-WebGL / reduced / context-loss stills, verbatim `h2` and the CLAUDE.md line all check out. Nits: with JS off the canvas box is empty; thread count fixed at init; `tokenRGB` `#000000` fallback.
- **Goal:** the name "Acmetel" forms out of signal/oscillation waveforms, with the tagline "Empowering seamless communication in the digital age."
- **Decided (user, 2026-10-14):** **replace the homepage `Statement` after "Who we are"** with this band. It is the same slot doing the same job (the brand line, mid-page) with the same tagline. It keeps `bg="glow"`, so tone alternation is unchanged. The `Statement` component stays in use on `/about`. Not the hero: the globe is WebGL already, and two WebGL scenes in one viewport compete.
- **Prototype:** `/lab/j04` (`src/pages/lab/j04.astro`, `src/pages/lab/_silk.ts`), **direction D "Silk to name" chosen**. It is the user's silk-wave reference rebuilt with the noise in the vertex shader. The ribbon flows in, then its threads fan out into rows, and inside the letters (a soft word mask sampled in the vertex shader) the rows keep oscillating, so the threads themselves spell the name. Rejected: A "Carrier trace" (the best 2D option, crisp and cheap, but not the reference; keep it as plan B if WebGL is vetoed), B "Scanline field" (a 2D cousin of D; reuse its renderer as D's static fallback), C "Tuning lock" (ends as plain gradient type; the glitch reads off-brand), E "Carrier name + silk under the tagline" (two motifs compete; the ribbon crosses the tagline).
- **Acceptance:**
  - Band: canvas box reserved by aspect ratio (3:1 phone, 3.3:1 from 640px; no layout shift), tagline below it as the `h2`: `<span class="sr-only">Acmetel. </span>Empowering seamless communication <span class="text-gradient">in the digital age.</span>` (source Hero lines, sentence case). Canvas `aria-hidden`.
  - Engine in `src/scripts/` (start from `_silk.ts`): one `LineSegments` draw call; ~84 threads × 900 points on desktop, ~44 × 420 under 768px; noise, settle and letter oscillation all in the vertex shader (static `aT`/`aLine` attributes, `uTime`/`uSettle` uniforms, nothing uploaded per frame); additive blending; colours are uniforms read from tokens (`teal-300`, `green-800`, `navy-600`); renders every other frame; DPR ≤ 2 (≤ 1.5 on phones). Reusable: a `ribbon` mode (no name) can later back `Section bg="silk"`.
  - Word mask: Poppins 700 "Acmetel", fitted to 94% of width / 80% of height, drawn at 1/3 size so linear filtering softens it. Wait for `document.fonts.load` first; rebuild on width change only.
  - Sequence: the ribbon flows as the band enters, then settles into the name. Preferred: settle scrubbed to scroll (ScrollTrigger with `SCRUB` from `motion.ts`, roughly `top 75%` → `center center`), so it plays the same forwards and backwards. Fallback: 2.2 s time-based on first view. Note in the handoff which one you used. After settling, the letters oscillate for at most ~5 s, then ease to still and the loop sleeps (WCAG 2.2.2), or add `PauseButton`.
  - The name is readable in the settled state at 375 and 1440 (check a 2× DPR capture at 375).
  - three.js loads only through `onVisible()` (it shares the globe's three chunk, ~550 KB raw); no WebGL context until near; `visibleLoop` pauses it off screen.
  - Reduced motion and no-WebGL: a static settled frame drawn with Canvas 2D (rows, with oscillation inside the letters, as in lab direction B), with no three.js download.
  - No console errors, no overflow at 375/1440, build passes.
- **Notes:** CLAUDE.md caps pages at one `Statement`; with this band in its place the homepage has none, which is fine. The hero `DynamicHeadline` still types the tagline before rewriting it, as today. Tester deletes `src/pages/lab/j04.astro` and `_silk.ts` once this is built.
- **Visual reference (user, 2026-10-14):** the "silk wave" at https://lab.usestate.org/report06. How it works, read from their bundle: ~100 `THREE.Line`s × 1000 points, stacked a little apart in depth and tilted (`rotation.y = rotation.z = 0.4`, `scale 2`). Each line's y = 2D simplex noise of (point index / (700 + line), line / 100 + time / 6000); because neighbouring lines share nearly the same noise, together they read as one ribbon. Vertex shader pinches it with `y *= sin(x)` (thin at the centre, open at the edges). Fragment shader mixes mint → near-black green by clip-space x. Transparent renderer, every other frame.
- **Build notes for this effect:**
  - Do the noise in the vertex shader. Upload static `aT` (position along the line) and `aLine` (line index) attributes, animate with a `uTime` uniform. The reference updates 100k vertices on the CPU every frame drawn, which is too heavy next to the globe.
  - Colours are uniforms read from tokens (`teal-300` → `green-800`/`navy-950`), never raw hex.
  - Run it through `visibleLoop()` and lazy-load three.js with `onVisible()` (`src/scripts/motion.ts`). `prefersReducedMotion()` renders one still frame. On phones (< 768px): ~60 lines × 400 points, DPR capped at 1.5. `aria-hidden` canvas.
  - Package it as a reusable background (e.g. `Section bg="silk"` or a small component), not per-page code. Not behind the hero globe: two WebGL scenes in one viewport compete.
  - Tie-in for this job: the ribbon can carry or settle under the "Acmetel" wordmark and tagline (e.g. the oscillations flatten into the name, or the ribbon runs behind the tagline). Tester to prototype 2 directions against the placement question above.
- **Handoff (frontend, 2026-10-14):**
  - **Built:** `SignalName` band (direction D) replacing the homepage `Statement` after "Who we are" (`<SignalName text="Empowering seamless communication" highlight="in the digital age." bg="glow" />`, `Section tone="glow"`, so the glow feel and tone alternation stay). `h2` = `<span class="sr-only">Acmetel. </span>Empowering seamless communication <span class="text-gradient">in the digital age.</span>`; canvas `aria-hidden`, box reserved by `aspect-[3/1] sm:aspect-[33/10]`. `Statement` stays (still used on `/about`).
  - **Sequence:** scroll-scrubbed (preferred option): `gsap` tween on a proxy with ScrollTrigger `scrub: SCRUB`, canvas top at 75% of the viewport → canvas centred; plays the same backwards (threads lift off the top rows first). Motion budget: the loop runs ~5 s after the last scroll change or re-entry, eases to still over the last 1.4 s, then `loop.pause()` (verified: moving at 3.5 s, identical frames at 9 s, moving again after scrolling back). No PauseButton needed.
  - **Engine:** `src/scripts/silk/scene.ts` (from `_silk.ts`): one `LineSegments` call, 84×900 desktop / 44×420 under 768px, noise + settle + letter oscillation in the vertex shader, static `aT`/`aLine`, `Uint32` index, additive, every other frame, DPR ≤ 2 (≤ 1.5 phones). Token colours (`teal-300`, `green-800`, `navy-600`) passed as raw sRGB vectors so WebGL and the 2D still match exactly (brighter than the lab, which ran them through three's linear conversion). `mode: 'ribbon'` kept for a future `Section bg="silk"`. Change from the lab: the calm rows outside the letters fade toward the edges (`calmFade`) so the settled field has no hard rectangle.
  - **Loading:** nothing three-related at load (verified by request log). `onVisible(canvas, …, '400px')` probes WebGL on a throwaway canvas, then `import('../scripts/silk/scene')`, which shares the globe's `three.module` chunk. No WebGL / init failure / context loss: Canvas 2D still (`src/scripts/silk/still.ts`, same math, bucketed strokes) with no three.js request (verified with `--disable-webgl`). Reduced motion: the still is drawn on idle (also no three.js).
  - **Files:** new `src/components/SignalName.astro`, `src/scripts/silk/{scene,still,shared}.ts`; edited `src/pages/index.astro` (import swap + the band line only), one line in `CLAUDE.md` component list. Lab files untouched. Bytes: page script +1.5 KB raw; lazy scene 5.2 KB + shared 1.5 KB (+ still 1.6 KB only on fallback); three chunk shared, not duplicated.
  - **How to see it:** `/` → scroll past "Who we are": the ribbon flows in as the band enters and settles into "Acmetel" by the time the canvas is centred; scroll back up to unsettle it. Full-page captures from `scripts/screenshot.mjs` show an empty canvas with motion on (it never scrolls, so the lazy load never fires); the `REDUCED=1` capture shows the still. Checked 375 @2× and 1440: name readable in WebGL and 2D; no console errors, no overflow (`/`, `/about`).
  - **Placeholders / limits:** none in copy. Thread count is fixed at init (crossing 768px on resize keeps the original count; the mask and size rebuild on width change).

## Products for operators (`src/pages/index.astro` section 6, `FeatureCard` grid)

**Decided (user, 2026-10-14):** J05 and J06 are **dedicated homepage sections**, as originally asked, alongside the existing card grid (not card visuals). Probe Testing (J07) stays a card.

**Placement (tester):** both sections go **directly after the `AcmesimStory` band** (which ends with the "Products for operators" card grid) and before Live network. Each is its own `Section` built on `SplitSection`. The sequence becomes AcmesimStory (raised) → **SMS Firewall (`base`, text left, visual right)** → **Fraud Management (`raised`, `SplitSection reverse`, visual left)** → Live network (glow), so tones keep alternating. The three cards in the grid stay as they are and keep linking to the service pages. Section ids: `sms-firewall` and `fraud-management-home`. Don't reuse `fraud-management` or `firewall`: those anchors belong to the service pages, and keeping them unique avoids confusion.

### J05 · SMS Firewall section: watchtower searchlight
- **Owner:** frontend · **Status:** ready for QC
- **Goal:** a dedicated homepage section for SMS Firewall whose visual is a watchtower sweeping a searchlight over incoming traffic, letting allowed messages through and stopping blocked ones.
- **Prototype:** `/lab/j05` (`src/pages/lab/j05.astro`, helpers in `src/pages/lab/_kit.ts`), **direction A "Searchlight" chosen**. Rejected: B "Top-down watch" (reads as a second radar, right above the Live network radar), C "Checkpoint log" (clean and legible, but an inbox UI rather than a watchtower; it loses the brief's image).
- **Why A:** the watchtower is literal and readable at a glance. The three lanes come straight from the source bullet ("SMS, Voice, and Flash Call firewall deployment"), so the visual explains the product rather than decorating it. It's one Canvas 2D scene, cheap at section size.
- **Acceptance:**
  - Text column, all verbatim from `content/source/messaging.md` "Firewall & Security Solutions": `SectionHeading` with eyebrow "SMS Firewall", title "Firewall &", highlight "security solutions", lede "Protect operator networks while maximizing international messaging revenues through AI-driven security and monetization platforms."; a `CheckList` with four of its bullets ("SMS, Voice, and Flash Call firewall deployment", "Grey route and international bypass prevention", "AI-powered fraud detection and traffic filtering", "Real-time analytics and threat intelligence"); an outline `Button` "Explore SMS Firewall" → `/services/messaging#firewall`.
  - Visual in a `glass` panel, 4:3, `aria-hidden` canvas. A generic lattice watchtower (cabin, roof, lit window band, lamp) on the left. Three dashed lanes labelled SMS / Voice / Flash call (mono, `ink-faint`). Put the labels at the **left** end of each lane, by the tower: at 375 the right-end labels in the lab collide with incoming messages. An additive searchlight cone from the lamp sweeps about 25°–53° below horizontal, so it crosses the lanes in their middle third.
  - Messages enter from the right, one glyph per lane type (bubble, wave, bolt), and are classified when the cone touches them. Allowed: teal stroke + check mark above, continues and fades into the tower. Blocked: `ink-faint` dashed stroke + cross above, stops in the beam, then drops out of its lane and fades. The verdict is carried by shape (check/cross, dashed), never colour alone. About a third of the traffic is blocked; it's simulated, and a comment in code says so.
  - The scene opens mid-flow (pre-warmed), not on empty lanes. It runs only while on screen (`visibleLoop`), DPR ≤ 2, and stays ambient at low amplitude. Since it loops for more than 5 s, either add `PauseButton` (as `LiveNetwork` does) or slow it to still after ~6 s and resume on hover. Note which in the handoff.
  - Reduced motion: one static frame with lanes, cone mid-sweep and messages in all three states (unscanned, allowed, blocked).
  - Colours come only from tokens read via CSS custom properties (the lab's `rgb()` cone and fill stops must become token-derived, e.g. `color-mix` strings or tokens + `globalAlpha`). Code lives in `src/scripts/` (e.g. `watchtower.ts`), loaded from the component with `onVisible`. No per-page script in `index.astro`.
  - At 375, the visual stacks under the text, message glyphs are at least ~22 px wide, and the cone and labels don't overlap the glyph checks. At 1440, the visual column height roughly matches the text column. No console errors, no overflow, build passes.
- **Notes:** the radar in `src/scripts/live/radar.ts` is being edited by another session; don't import it. Tester deletes `src/pages/lab/j05.astro` once built (keep `_kit.ts` until J06 is built too).
- **Handoff (frontend, 2026-10-14):**
  - **Built:** `SmsFirewall` section (`id="sms-firewall"`, `base`) directly after `AcmesimStory`, before Live network. Text column verbatim from messaging.md (eyebrow, title/highlight, lede, four bullets, outline "Explore SMS Firewall" → `/services/messaging#firewall`). Visual: direction A as specified, in a `glass` panel (4:3, square at `lg` so it roughly matches the text column at 1440). Lane labels moved to the **tower end**, set just *below* each lane line so they never meet the check/cross marks above passing messages. Opens mid-flow (5 s pre-warm), denser spawn on wide panels, slightly slower traffic than the lab (ambient).
  - **Pause choice:** `PauseButton` (top-right of the panel, wired with `bindPauseButton`), as in `LiveNetwork`. The loop also stops off screen and in hidden tabs (`visibleLoop`). Verified: moving → paused (canvas unchanged) → resumes.
  - **Tokens:** all colours read from CSS custom properties; alpha variants derived from the token hex via `alpha()` in the new shared helper `src/scripts/canvas.ts` (no raw `rgb()` anywhere). Traffic is commented as simulated in `watchtower.ts`.
  - **Reduced motion:** static frame (lanes, cone mid-sweep, unscanned/allowed/blocked messages); the pause button is removed since nothing moves.
  - **Files:** new `src/components/home/SmsFirewall.astro`, `src/scripts/watchtower.ts`, `src/scripts/canvas.ts` (shared with J06); `src/pages/index.astro` +2 lines (import, `<SmsFirewall />`). Lab files untouched.
  - **How to see it:** `/` → scroll past the ACMeSIM story and the "Products for operators" cards. Script loads via `onVisible` (300 px margin), so full-page captures from `scripts/screenshot.mjs` show the empty panel; scroll to it to see it run. Checked 375 @2× and 1440, normal + `REDUCED=1`: no console errors, no overflow; glyphs 22 px at 375.
  - **Limits:** traffic re-warms on panel resize. No placeholders in copy.

### J06 · Fraud Management section: mask scanned into pixels
- **Owner:** frontend · **Status:** in progress (frontend)
- **Goal:** a dedicated homepage section for Fraud Management whose visual is a generic anonymous mask that a detection scan breaks into pixels, leaving the mask's outline flagged (the fraud is exposed).
- **Prototype:** `/lab/j06` (`src/pages/lab/j06.astro`), **direction A "Scan & scatter" chosen**. Rejected: B "Evidence sort" (scroll-scrubbed into four stacks; the stacks read as invented data and the mid-state is messy), C "Mask to shield" (loses the mask, leaves gaps in the shield, and a pixel shield with a check is the generic security icon).
- **Why A:** it's on-brief in one beat (pixel mask → scan → scatter → exposed outline with a flag), the end frame is clean and calm, it runs ~2.4 s once, and the loop then stops.
- **Acceptance:**
  - Text column, verbatim from `content/source/voice.md` "Fraud Management & Revenue Assurance": eyebrow "Fraud Management", title "Fraud management &", highlight "revenue assurance", lede "Protect your network and revenue streams with advanced fraud detection technologies."; a two-column `CheckList` with the four features ("Real-time fraud detection", "Intelligent automation", "Test call generation", "Revenue leakage prevention"); an outline `Button` "Explore Fraud Management" → `/services/voice#fraud-management`.
  - The mask is the lab's plain domino eye-mask path (240 × 120 box, eye holes cut with `evenodd`): no Guy Fawkes or other recognisable design, and no face behind it. It's sampled into square cells (cell ≈ mask width / 58, min 5 px) and drawn in pale ink tones, lighter at the top.
  - On first view (≥50% visible): a teal scan line sweeps top to bottom over ~1.4 s. Cells it passes flash teal and scatter outward with slight gravity, fading over ~1.1 s. The glowing `teal-300` outline is revealed behind the line. A flag badge (navy disc, teal ring, flag glyph; add a `flag` icon to `Icon.astro` if you draw it as SVG) fades in at the mask's top-right. Then the loop stops. It replays on hover (fine pointer only).
  - Centre the mask vertically in its 4:3 box (the lab sits it at 42%, which leaves the bottom empty). Visual `aria-hidden`.
  - Reduced motion: the finished frame (outline + flag), nothing animated.
  - Tokens only (the lab's computed grey `rgb()` cell colours must come from `ink`/`ink-muted`/`teal-300` tokens). Code in `src/scripts/` (e.g. `maskscan.ts`), loaded with `onVisible`, `visibleLoop`, DPR ≤ 2.
  - At 375 and 1440: no overflow, no console errors, the mask fits with margin, and the cells scatter inside the canvas (clip, no spill over the text). Build passes.
- **Notes:** about 900 cells at desktop size, drawn as `fillRect`s for ~2.4 s, is well within budget. Tester deletes `src/pages/lab/j06.astro` and `_kit.ts` once built.

### J07 · Probe Testing: machine programming a microcontroller board
- **Owner:** qc · **Status:** QC passed (2026-10-14, minors open; see QC-LOG)
- **QC (minor, for frontend):** raw `rgb()` colours in `ProbeRig.astro` `<style>` (lines 55/65/67/68), swap them for tokens. Rename `probe_test.ino` (the Arduino sketch extension) to something neutral so the board reads as generic. Nits: the `Done ✓` glyph, and the Probe card being about 150 px taller than its siblings at md+ (tester's call alongside J05/J06).
- **Notes:** already built by another session: `src/components/home/ProbeRig.astro` (laptop flashing a test program over USB to a generic board, plays once in view, replays on hover), used in the Probe Testing card. QC to review against the brief; tester to decide whether it needs a dedicated section like J05/J06. Keep the board generic (no Arduino logo or trademark).
- **Open for later (tester, 2026-10-14):** the Probe card is ~150 px taller than its siblings at md+ (QC nit). It stays open: J05/J06 became dedicated sections, so they no longer even out the grid. Revisit when the grid is next touched (e.g. give the other two cards a matching visual slot, or cap the rig height).

## Network operations

### J08 · Interactive radar + infrared viewing mode
- **Owner:** frontend · **Status:** queued (ready to build once the uncommitted live-network edits land)
- **Decided (user, 2026-10-14):** infrared uses the **brand teal heat** ramp from existing tokens. No new colour tokens.
- **Already there (working tree, 2026-10-14):** drag to spin the map under the sweep (with momentum), left/right arrows turn it while a destination is focused, and destinations are `<button>`s that open network, plan and buy link. So the remaining scope is **network filter + infrared view**, not rotation or selection.
- **Goal:** (a) a network filter (All / 5G / 4G, the only values in `src/data/live.ts`) that dims non-matching blips and silences their pulse beats; (b) an "infrared" view toggle that re-maps the radar and map to a thermal look.
- **Acceptance:**
  - The filter is a labelled toggle-button group (`aria-pressed`) or radio group, keyboard-operable, with the state visible without colour alone.
  - Infrared is one toggle button with `aria-pressed`. The thermal ramp is built **from tokens** (`navy-950` → `green-800` → `teal-500` → `teal-300` → `ink`, a heat-by-luminance look). Blip contacts read as hot spots, and the pulse trace follows the palette.
  - Both controls work with reduced motion (the static frame re-renders in the new mode). The data stays marked simulated in code, and the sr-only description mentions the controls.
  - No layout shift when toggling; no console errors at 375/1440; build passes.
- **Notes:** `src/scripts/live/radar.ts`, `heartbeat.ts`, `ops.ts`, `src/data/live.ts` and `LiveNetwork.astro` currently have uncommitted edits from another session (about 260 lines). Don't start until they are committed, then re-read. Palette switching should be a set of colour uniforms/constants swapped in `radar.ts`/`heartbeat.ts` (they currently hard-code `TEAL` rgb strings, so move those to tokens read from CSS at the same time).

## "Powered" section

### J09 · "Powered by" band with a motherboard visualization
- **Owner:** designer → frontend · **Status:** prototyping (designer) (split into J09a/J09b; lab `/lab/j09`)
- **Decided (user, 2026-10-14):** a **new homepage "Powered by" band** about the technology underneath Acmetel's services, with a motherboard-inspired animation or interactive element as its centrepiece.
- **Placement (tester):** **after Live network, before Latest**, as a `raised` band. Today's sequence is Live network (glow) → Latest (base) → Contact (raised); inserting a raised band gives glow → raised → base → raised. Content-wise it reads well: operations you can watch, then the infrastructure underneath. Between Services and Products it would sit base → ? → raised and repeat the SIS card from the Services rail right above it.
- **Copy (all in `content/source/sovereign-intelligence-stack.md`):** the SIS intro ("Build your sovereign digital foundation with our end-to-end technology services. From connectivity and cloud to AI-powered automation and network intelligence, …") as heading/lede. The five SIS pages as the chips (labels and links from `sisPages` in `src/data/site.ts`, never hard-coded URLs). Optional proof points only verbatim from the Data Center overview (e.g. "Tier III/IV-certified facilities", "AI-ready architecture"). No new figures.

#### J09a · Band, copy and static board
- **Acceptance:** `Section tone="raised"` with `SectionHeading`. The board is inline SVG: a central core with traces running to five chips (one per SIS page). Chips are real links (focusable, visible focus) to the SIS pages; traces and decoration are `aria-hidden`. Hovering or focusing a chip lights its traces (CSS only). It re-lays out at 375 (chips stack or wrap around a smaller core, no horizontal scroll). Tokens only. No console errors; build passes.

#### J09b · Board motion
- **Acceptance:** packets travel along the traces (SVG `stroke-dashoffset` or GSAP along the path), starting when the band is on screen and paused off screen; the chip in focus or hover gets the brightest traffic. One orchestrated idle loop, low amplitude; if it runs longer than 5 s, `PauseButton`. Reduced motion: lit static board. No new libraries.

## Blog

### J10 · Blog rework + Featured Blogs
- **Owner:** frontend · **Status:** see J10a
- **Goal:** better layout for the blog area (homepage "Latest" section, `id="blog"`), a Featured Blogs area, and blog content.
- **Decided (user, 2026-10-14):** article drafts written **only from existing source copy** (services, ACMeSIM, Sovereign Intelligence Stack), each marked `<!-- PLACEHOLDER: draft from source copy, not client-approved -->`. No new facts, numbers, customers or claims.
- **Decided (user, 2026-10-14):** **homepage only, no `/blog` route** (J10b dropped). No live-site URLs are available. Cards must not link to `#blog` or to pages that don't exist: link to the relevant service page instead, or make them non-links.

#### J10a · Homepage Featured Blogs
- **Owner:** frontend · **Status:** ready to build
- **Goal:** rework the `#blog` half of the homepage "Latest" section into a Featured Blogs area built from placeholder drafts of source copy.
- **Drafts (each card: tag, title, 1–2 sentence excerpt, link to its service):** titles are new card headings; excerpts are verbatim or tightened source lines, never new facts.
  1. eSIM: title along the lines of "Travel without roaming charges". Excerpt from `acmesim.md`: "No roaming. No contracts. No hidden fees. Just instant connectivity." → `/products/acmesim`.
  2. Security: "Find grey routes and SIM boxes before fraudsters do". Excerpt from `messaging.md` Network Penetration Testing: "Identify vulnerabilities before fraudsters do through comprehensive telecom security testing." → `/services/messaging#penetration-testing`.
  3. Infrastructure: "What a sovereign intelligence stack is". Excerpt from `sovereign-intelligence-stack.md` intro: "Build your sovereign digital foundation with our end-to-end technology services." → `SIS_BASE`.
  4. (optional) Connectivity: "A terrestrial route from Pakistan to China". Excerpt from Terrestrial Transit: "…wholesale bandwidth through terrestrial fiber infrastructure connecting Pakistan with China and beyond." → the terrestrial-transit entry in `sisPages`.
- **Acceptance:**
  - One featured card (larger: tag, title, excerpt, link) plus two or three compact cards. Events keep their column at 1440; everything stacks at 375 with no overflow.
  - Every card link goes to an existing route/anchor (anchors from the CLAUDE.md routes table, URLs from `src/data/site.ts`); the link text names the destination (e.g. "Read about ACMeSIM"), not "Read article". No `href="#blog"` anywhere. `id="blog"` stays on the area so existing links still land.
  - Each draft carries `<!-- PLACEHOLDER: draft from source copy, not client-approved -->` and a comment naming its source file and section. The posts live in one data array in `index.astro` (or `src/data/`), not repeated markup.
  - The three live-site titles from `home-current-site.md` are replaced by the drafts (they have no bodies or URLs). If the user wants them kept, they can appear as plain non-link text.
  - Tokens and existing components only (`glass spotlight` cards, `Icon`, `data-stagger`); no stock images; cover art, if any, from existing motifs (e.g. `SignalPath`). Build passes, no console errors at 375/1440.
