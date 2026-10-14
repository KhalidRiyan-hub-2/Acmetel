# QC log

Kept by the **qc** agent (`.claude/agents/qc.md`). Newest entries first. Each entry: date, job ID (from [QUEUE.md](QUEUE.md)), what was built and where, files touched, findings with severity (blocker / major / minor / nit), reproduction steps, and anything that could not be verified.

---

## 2026-10-14 · J04 · Signal-name band: **QC passed** (nits only)

**What was built.** A new component, `src/components/SignalName.astro`. It replaces the homepage `Statement` after "Who we are" (`<SignalName text="Empowering seamless communication" highlight="in the digital age." bg="glow" />`).
- **Layout.** A `Section tone="glow"` band with an `aria-hidden` canvas (box reserved by `aspect-[3/1] sm:aspect-[33/10]`) above the `h2`: `<span class="sr-only">Acmetel. </span>Empowering seamless communication <span class="text-gradient">in the digital age.</span>`.
- **WebGL engine** (`src/scripts/silk/scene.ts`): one `LineSegments` draw (84×900 desktop, 44×420 under 768px), with noise, settle and letter oscillation all in the vertex shader. The ribbon → name hand-off is scrubbed by ScrollTrigger (`scrub: SCRUB`, canvas top at 75% → canvas centred). There is a ~5 s motion budget after the last scroll change or re-entry, then `loop.pause()` from inside the tick.
- **2D still** (`src/scripts/silk/still.ts`) for reduced motion, no WebGL and context loss. `src/scripts/silk/shared.ts` holds the common math and the token colours.
- **CLAUDE.md:** one component-list entry.

**Files.** `src/components/SignalName.astro`, `src/scripts/silk/{scene,still,shared}.ts` (new), `src/pages/index.astro` (import swap and the band line), and `CLAUDE.md`. The `CLAUDE.md` diff against HEAD also carries other sessions' edits (terminal tone, `data-scramble`, `data-code-rain`); only the `SignalName (…)` entry is J04's.

**Verified (headless Chrome; build passes; preview :4321).** My script is `qc/signal.mjs`; it wheel-scrolls so ScrollSmoother and ScrollTrigger scrub.
- **Lazy loading.** Nothing silk- or three-related is requested at load without interaction.
  - The silk `scene` chunk (5.2 KB) and `shared` load only when the band is near: +3.7–4.2 s, against +2.4–3.0 s for the globe's boot on first interaction.
  - `dist/_astro/scene.4DsBas_F.js` (silk) and `scene.CipUMiw0.js` (globe) both import the same `three.module.CiIHBDv4.js`, so it isn't duplicated.
- **Sequence** at 1440 and 375@2×: the ribbon flows in as the band enters and settles into "Acmetel" by the time the canvas is centred. Scrolling back up unsettles it and wakes the loop.
  - The name is clearly readable at 1440 and readable at 375@2×. The backing store is 514×171 for 343×114 CSS px, so the phone DPR cap of 1.5 holds.
- **Motion budget.** About 108 frames per 1.5 s right after settling. At 8.5 s after the last scroll: **0** `visibleLoop` frames in 2 s and pixel-identical frames. Scrolling back gives 73 frames in 1 s.
  - The in-tick `loop.pause()` works with main's `visibleLoop` fix.
- **No WebGL** (`--disable-webgl --disable-webgl2 --disable-3d-apis`, 375@2× and 1440): the still is drawn (25k / 122k lit px). Only `still` + `shared` are requested, with no three or scene chunk. No errors; the globe falls back to its static image too.
- **Reduced motion:** the still is drawn on idle, with no three request and no loop frames.
- **Context loss** (`WEBGL_lose_context.loseContext()` on the band's canvas): it swaps to a fresh canvas with the 2D still (122k lit px, same look). `still.js` loads at that point; no errors.
- **Heading.** The accessible name of the `h2` is "Acmetel. Empowering seamless communication in the digital age." It uses the source Hero lines (`home-current-site.md` lines 4–5, "Empowering Seamless Communication / In The Digital Age"), in sentence case with a full stop as the acceptance specifies, and with no changed words.
- **Tones.** The band is a glow band between base sections (Who we are → band → Why choose Acmetel), so the alternation holds.
- No overflow at 375/1440. The `CLAUDE.md` entry is accurate (WebGL threads, settle on scroll, verbatim tagline as `h2`, currently Home, at most one per page) and is a single list item.

**Findings**
1. **nit: blank band without JS.** The canvas is only drawn by script, so with JS off the 3:1 box above the tagline is empty glow; the `h2` still shows. The `Statement` it replaced showed its text without JS. That's acceptable for a decorative band; optionally collapse the box under `html:not(.motion)` or draw the still at build time as an image.
2. **nit: thread count fixed at init** (known limit). Crossing 768px on resize keeps the original count.
3. **nit: raw hex fallback.** `shared.ts` `tokenRGB()` falls back to `'#000000'` when a token can't be parsed, a raw hex in fallback only.
4. **note: unexplained 404.** One 1440 run logged a single `404` I couldn't attribute. Four later runs, including one logging every ≥400 response, showed none. Possibly a stale request from another session's rebuild; not reproducible.

**Not verified.** Real phones and GPUs (iOS Safari WebGL line rendering in particular). Touch scrolling (native scroll, where ScrollTrigger still scrubs; not exercised). Screen-reader output. Lighthouse impact.

---

## 2026-10-14 · J03 · Hero stats "Rain lock": **changes requested** (1 major)

**What was built.** `StatStrip` has a new opt-in `matrix` prop, used only by the homepage hero (`<StatStrip stats={stats} matrix />`, `src/pages/index.astro`).
- **Markup.** Matrix mode renders one `bg-navy-900` box with an `aria-hidden` canvas behind a transparent `dl`; cell hairlines are box-shadows. Each character is a slot: an invisible `.slot-size` sizer plus an absolutely positioned `.slot-live`. Each `dd` has an sr-only plain figure. There is no `data-count` and no `data-stagger`.
- **Motion.** `src/scripts/statrain.ts` is lazy-loaded by a `data-stat-rain` block in `patterns.ts` (400px ahead, skipped with reduced motion). The root state runs `""` → `armed` → `ready` (dim scrambled glyphs) → `running` → `done`.
- **The run** starts once, at ≥50% visible. Dim teal rain (alpha ≤ 0.25) falls behind the strip, one bright drop per character lands left to right and locks it with a teal → ink flash, then the rain fades, the canvas is cleared and the loop pauses. Hovering a cell replays that cell (fine pointer only).
- **Shared code.** `coderain.ts` now exports `GLYPHS`, `pick`, `rainFont` and `rainColors`.
- **Main's change.** Outside the job, `visibleLoop` in `motion.ts` now clears `raf` at the start of each frame and reschedules only if still running and not already rescheduled.

**Files.** `src/components/StatStrip.astro`, `src/scripts/statrain.ts` (new), `src/scripts/coderain.ts`, `src/scripts/patterns.ts` (header line plus the `data-stat-rain` block), `src/pages/index.astro` (one attribute). Also `src/scripts/motion.ts` (main's change).

**Verified (headless Chrome; `npm run build` passes; preview :4321).** My scripts are in the qc scratch dir (`statrain.mjs`, `sampler.mjs`, `midrun.mjs`, `failsafe.mjs`, `about.mjs`, `loops.mjs`, `scrollreplay.mjs`).
- **No layout shift.** The strip box and all 12 slot widths are identical at load, during the run and after, in motion, reduced and no-JS: 1440 = 1168×126, 375 = 343×282.
- **Sequence** (1440, sampled every 30 ms): ready shows dim teal JetBrains Mono glyphs. Running locks left to right; the final state is ink Poppins with the texts `150+ 6B+ 2B+ 16`, then `done`.
  - In one sampled run the first lock came at +1.06 s, all locked at +1.93 s and done at +2.98 s. That is slower than the handoff's 0.57 / 1.47 / 2.51 s, because the first scroll also starts the globe (long tasks) and `visibleLoop` clamps dt to 0.1 s. Expected under load.
- **The loop really stops.** I tagged rAF callbacks:
  - After `done`: 0 canvas draws and 0 calls of the statrain frame over 2 s. The same holds after a hover replay (0 over 1.5 s).
  - The `queueMicrotask` pause works with the new `visibleLoop`.
- **Hover replay.** Moving the pointer onto cell 3 replays only that cell (clipped) and ends at `done`. At 375 in a desktop viewport it also works, since a mouse is still a fine pointer.
- **Fallbacks:**
  - Reduced motion (375 and 1440): the state stays `""`, the figures are plain (opacity 1, ink, Poppins), the canvas is never drawn, and no statrain chunk loads.
  - No JS: plain figures.
  - The statrain chunk blocked: `armed` → `done`, plain figures.
  - `patterns.js` blocked: the CSS failsafe hides the figures at 0.3 s and 1.5 s, then shows them by 3 s.
- **A11y.** The canvas is `aria-hidden`. The sr-only figures read `150+`, `6B+`, `2B+`, `16`, and the glyph layer is `aria-hidden` + `select-none`.
- **Readability.** Mid-run screenshots show labels readable at 1440 (4 across) and 375 (2×2); rain over the labels is capped and dim.
- **`/about` unchanged.** It has 4 `[data-count]` and `dl[data-stagger]`, no `[data-stat-rain]`. The count-up runs (26 distinct values, e.g. `126+|5B+|2B+|13` mid-way) and ends on `150+|6B+|2B+|16`. The non-matrix branch of `StatStrip` is byte-identical to before.
- `scripts/screenshot.mjs` on `/`: no errors, no overflow.

**`visibleLoop` change (main), spot-checked by counting `visibleLoop` frame callbacks per 1.5 s on `/` and the Network Intelligence page:**

| scenario | frames |
|---|---|
| globe live | about 112–118 |
| globe pause button | still running (`motionPaused` only freezes motion; unchanged behaviour) |
| live network (radar/heartbeat via `ops.ts`) on screen | 109 |
| pause button | **0** |
| play | 108 |
| footer, everything off screen | **0** |
| back to top | globe resumes |
| code rain (`terminal` band) on screen | 108 |
| code rain off screen | **0** |
| code rain back | 109 |

Statrain stops cleanly. No errors. Reading the code: a `pause()` inside a tick now sticks, a `play()` inside a tick can't double-schedule (because of the `!raf` guard), and an exception in `tick` leaves `raf=0`, so the next IO or visibility change restarts it. Silk (J04) is the other in-tick pauser; I'll check it under J04.

**Findings**
1. **major: scrolling replays a cell** ("Don't replay on scroll"). The replay listens to `pointerenter` on each cell (`statrain.ts`, the last block: `c.el.addEventListener('pointerenter', …)`). With ScrollSmoother the content glides under a stationary mouse, so Chrome fires `pointerenter` without the user pointing at anything.
   - Repro (1440): let the intro finish, put the pointer about 150 px above the strip, wheel down 6×60 px without moving the mouse. The state goes `done` → `running` (+7.15 s) → `done` (+9.00 s), so one cell replays.
   - The strip is full width at 1440, so most desktop users scrolling past with the cursor mid-screen will see a cell replay.
   - Fix: trigger on a real `pointermove` inside the cell (e.g. require `movementX || movementY`, or ignore enter events within ~200 ms of a scroll).
2. **minor: intro runs slower than spec on first interaction.** The intro shares its start with the globe's first-interaction boot. With the dt clamp at 0.1 s, the 1.6 s / 2.5 s timings stretched to about 1.9 s / 3.0 s in my run. Optional: start on the next idle frame, or use wall-clock `t` for the lock schedule.
3. **nit: out-of-order locks.** `JITTER` (0.25 s) is larger than `STEP` (about 0.083 s), so neighbours sometimes lock out of order. I saw slot 9 ("B") before slot 8 ("2") in a hover replay, and slot 12 before slot 11 in the intro. That's fine if intended ("a little random"); otherwise clamp the jitter to below `STEP`.
4. **nit: static pre-state.** At 1440×900 the strip is about 26% on screen at load, so the `ready` pre-state (static dim katakana in place of the figures) can sit there until the visitor scrolls. That is within the spec.
5. **nit:** `coderain.ts` `rainColors()` falls back to raw `rgb(...)` strings when a token is missing. Harmless, but not token-only.
6. **nit:** the `/lab/j0x` pages are built into `dist/` (17 pages), so they are reachable if deployed. The tester deletes `lab/j03.astro` after this job.

**Not verified.** Real touch devices (the hover replay is gated by `finePointer()`, so it shouldn't attach on phones; not tested on hardware). Safari. VoiceOver/NVDA output (only the DOM a11y attributes were checked).

---

## 2026-10-14 · J07 · Probe Testing animation: **QC passed** (minors open)

**What was built.** `src/components/home/ProbeRig.astro` is an inline SVG of a laptop flashing a test program over a USB cable to a generic green microcontroller board. The code lines type in, a progress bar fills, packets run along the cable, the TX/RX LEDs blink, then "Done" shows and the L LED lights up (about 4 s). It sits inside the Probe Testing `FeatureCard` in the homepage Products grid (`src/pages/index.astro`, section 6, passed through the card's `<slot />`). The script adds `.is-armed`, holding the animations on their first frame, then `.is-playing` when 60% of the rig is in view (IntersectionObserver, plays once). It replays on `pointerenter` / `focusin` on the card `<a>`. With reduced motion or no JS the finished state is shown (it is the CSS default).

**Files.** `src/components/home/ProbeRig.astro` (new), `src/pages/index.astro` (import, and the card now wraps `<ProbeRig />`).

**Verified (headless Chrome, preview on :4321 after `npm run build`):**
- Build passes. `scripts/screenshot.mjs /` at 375 and 1440, normal and `REDUCED=1`: no errors, no overflow.
- Before it is in view the class is `probe mt-5 is-armed`. Once scrolled into view it becomes `is-playing`. At t=1.6 s the card shows "Uploading", the bar part-filled and packets on the cable. At the end it shows "Done ✓", a full bar and the L LED lit (`rgb(127,220,213)` = teal-300).
- Hover replays it ("Done" opacity is 0 at 1.2 s after hover, 1 at the end). Keyboard focus on the card link also replays it, and the focus ring shows (2px solid outline).
- Reduced motion: no classes are added. The finished state shows ("Done" opacity 1, bar transform `none`).
- The wrapper is `aria-hidden="true"`, so the SVG text ("probe_test.ino", "Uploading", "Done") stays out of the link's accessible name. No infinite animations (the longest repeats are 8× and 16×), so there is nothing to pause off screen.
- The board has no logo or maker name. The silkscreen reads only TX / RX / L / ON / MCU.

**Findings**
1. **minor: raw colour values in a component** (token-only rule). `ProbeRig.astro` lines 55, 65, 67, 68: `rgb(255 255 255 / 0.08)`, `rgb(255 255 255 / 0.12)`, `rgb(255 255 255 / 0.15)` and `rgb(238 242 248 / 0.55)` (the last is `--color-ink` at 55%). Use `var(--color-line)` / `var(--color-line-strong)` or `color-mix(in oklab, var(--color-ink) 55%, transparent)`.
2. **minor: Arduino cues weaken "generic".** The laptop's file label is `probe_test.ino` (line 14). `.ino` is the Arduino sketch extension, and combined with the Uno-style TX / RX / L / ON LED row it reads as an Arduino Uno. There is no logo or trademark, so the brief is technically met. Rename it to something neutral (e.g. `probe_test.c` or `firmware.hex`) to keep it clearly generic.
3. **nit: `Done ✓`** (line 21) uses the U+2713 check glyph. It is not emoji-presentation and it renders fine. If the "no emoji, use `<Icon>`" rule should cover it, use the text "Done" or draw a check path.
4. **nit (for tester): card height imbalance.** At md+ the illustration makes the Probe Testing card about 150 px taller. The SMS Firewall and Fraud Management cards stretch to match, leaving large empty gaps above their "Learn more" links (see the 1440 grid). This may resolve itself if J05/J06 give those cards visuals.

**Not verified.** Real screen-reader output (only `aria-hidden` was checked). Touch devices (`pointerenter` on tap just replays before navigating, so it looks harmless). Safari rendering of `transform-box: fill-box` on the progress bar.

---

## 2026-10-14 · J02 · Globe granularity: **changes requested** (1 major)

**What was built.** Street-level detail on the hero globe (`src/scripts/globe/scene.ts`), in three parts:
- **City layers.** OpenStreetMap roads (4 classes), rail, waterways and water areas for Dubai and Lahore, drawn in a local east/north/up frame around an anchor so they stay precise in float32. They fade in by zoom level and fade out at the data-box edge and into distance fog.
- **Dubai 3D.** Crisp OSM land with a dot field. About 14.3k extruded building footprints for Downtown, which rise as the camera descends, with floor lines and landmark parts in glass teal. A pulsing beacon on the Burj Khalifa spire, and a horizon haze cylinder.
- **New stops.** `downtown` (Dubai → Downtown Dubai) and `burj` (rooftop), using new `elev` / `head` pose fields. At level > 3.5 dragging orbits the camera around the look-at point instead of panning, with a slow idle orbit when resting.

Also new:
- Labels: Dubai districts, a "Burj Khalifa · 828 m" landmark tag, Lahore districts, and 11 Western China city labels plus more faint region cities.
- Data: Natural Earth provinces, rivers, lakes, roads and rail added to the `gulf` and `route` layers, and a new `china` region (lon 91–112).
- Scene: the ocean body is scaled up to just under sea level when near the ground, and the readout shows metres below 10 km.
- Build: `scripts/build-osm-cities.mjs` (Overpass, cached in `.cache/osm-cities/`, gitignored) and `build-globe-data.mjs` (Natural Earth extras). `npm run build:osm-cities` is added to `package.json`.

**Files (J02 only).** `src/scripts/globe/scene.ts`, `src/scripts/globe/data.ts` (`decodeBuildings`), `src/data/globe.ts`, `src/data/globe-regions.json` (`china` region, `cities[]`), `src/components/home/GlobeHero.astro` (`district` / `landmark` tag kinds, `data-h`, metre readout), `scripts/build-osm-cities.mjs` (new), `scripts/build-globe-data.mjs`, `package.json`. Data files are below. J01 (office stops) was editing `globe.ts` / `scene.ts` during this review; I attributed only J02 code (snapshot diff taken at start of review).

**Data shipped** (all lazy: none requested before the first interaction; each loads when a flight or wheel step heads to a stop that needs it):

| file | raw | gzip -9 | loaded for |
|---|---|---|---|
| globe-dubai-city.bin (new) | 781 KB | 634 KB | dubai / downtown / burj |
| globe-dubai-buildings.bin (new) | 511 KB | 343 KB | same, after the city file |
| globe-lahore-city.bin (new) | 790 KB | 588 KB | lahore |
| globe-china.bin (new) | 110 KB | 83 KB | china, kashgar, urumqi |
| globe-route.bin (32 → 125 KB) | 125 KB | 101 KB | pakistan and children |
| globe-gulf.bin (20 → 35 KB) | 35 KB | 22 KB | uae and children |

Flying to the Burj costs about 1.37 MB raw / 1.0 MB gzip of new data. Buildings: 14,336 footprints + 37 landmark parts, about 99k ring points, roughly 600k wall vertices (about 19 MB of vertex attributes on the GPU). The `scene` chunk itself stays lazy (604 KB, after interaction).

**Verified (headless Chrome via Playwright; build passes; preview :4321).** My scripts are in the qc scratch dir (`flight.mjs`, `longtask.mjs`, `jitter.mjs`, `probe.mjs`).
- Flights at 1440: global → uae → dubai → downtown → burj, then Esc ×4 back to global. At 375: dubai → downtown → burj → (drag) → lahore. Cross-tree flights burj → lahore and urumqi → burj → lahore, with mid-flight frames. Breadcrumb clicks (pakistan, global). Wheel out from burj all the way to global, then wheel in to Pakistan → Lahore.
  - All arrive with the correct caption, breadcrumb and readout (Burj: "Alt 1,090 m", Downtown "2,060 m", Dubai "55 km", Lahore "30 km").
  - No console errors, no failed requests, no NaN/Infinity in any tag transform.
- OpenStreetMap attribution: `data-show=true`, opacity 1, at dubai, downtown and burj, at Lahore, and mid-wheel between Dubai and the UAE. It is hidden at uae, pakistan, china, urumqi and global. The link is focusable only while shown.
- Street-level orbit: dragging at the Burj or Downtown circles the tower (the 1440 drag moved the camera and alt read 1,450 m). At Lahore (level about 3.0) dragging pans and springs back, as designed.
- Precision: with the pause button pressed at the Burj and at Downtown, two frames 700 ms apart are pixel-identical, so there is no vertex jitter or depth shimmer. There is no z-fighting between roofs and walls in the screenshots. The beacon and idle orbit stop when paused.
- Memory: every new geometry and material goes through `track()` / `mat()` / `segGeo()` and is disposed in `destroy()`. `orbit` and the city fade tweens are killed there too. City layers are built once and reused on later visits. JS heap after the long runs was 49–65 MB.
- Reduced motion: the globe doesn't start at all (static image path, unchanged).

**Findings**
1. **major: Western China labels pile up at country zoom, worst at 375.**
   - Repro: open the China chip (`go:china`). At 375 the top-right is an unreadable cluster: Shihezi / URUMQI / Turpan / Hami / Kuqa / Korla, plus "Khunjerab Pass" over "Hotan". At 1440: Urumqi~Shihezi and Turpan~Hami (at the right edge).
   - The same labels also show, and collide, at the UAE stop (Urumqi~Shihezi, Korla~Turpan, Shihezi~Yining) and the Pakistan stop (Khunjerab Pass~Hotan, Aksu~Kuqa). That is because the new `city()` tags use the default `z: [0.75, 1.45]` with no `near` limit.
   - Where: `src/data/globe.ts`, the "Western China" tag block (`city('hotan' … 'lhasa')`).
   - Fix: give them a `near` limit and/or a later `z` start so they show only around the China stop, thin the set (drop Shihezi and Kuqa, which sit next to Urumqi and Aksu), and/or let the scene hide lower-priority tags that overlap.
2. **minor: main-thread hitch when the Dubai buildings are built.** `buildBuildings()` (`scene.ts`) runs about 600k-vertex extrusion and earcut synchronously. Long tasks while flying to the Burj: 317 ms unthrottled and 384 ms at 4× CPU throttle (Lahore: 51 ms). Locally it lands at the start of the flight; on a real network it will land mid-flight as a visible freeze. Consider chunking it over idle frames, or doing it in a worker or at build time.
3. **minor: Lahore lost its city marker and range rings.** `cityStops = stops.filter((s) => s.alt < 0.2 && s.alt > 0.01)` (`globe.ts` line 195). The `> 0.01` was added to exclude Downtown and Burj, but Lahore's alt is now 0.008, so it is excluded too. No pulsing marker, 10/25/50 km rings or sweep, unlike Karachi and Islamabad. Filter by id or by `!s.elev` instead.
4. **minor: `globe-dubai-osm.bin` is fetched twice** on every first Dubai flight (seen in all network logs). `ensureFor` → `ensureLayer('dubai')` loads it, and `ensureCity('dubai')` loads it again (`const land = id === osmRegion.id ? load(osmRegion.file) …`). Share one promise.
5. **minor: label collisions at street level.** At Lahore (1440 and 375), "Allama Iqbal Intl Airport" overlaps "Gulberg" (`globe.ts` `district('lhe'…)` / `district('gulberg'…)`). At Dubai on 375, the "Dubai" major tag's coordinate line runs into "Deira", and "Palm Jumeirah" / "Dubai Marina" sit on bright coastline. The district labels (`text-ink/70`) are hard to read over the dense teal road mass in Lahore.
6. **minor: the readout is unreadable at street level.** At Burj and Downtown the camera tilt puts bright city or coastline behind the top-left lat/lon/alt readout (`GlobeHero.astro`, `data-globe-readout`, `text-ink-faint`). At 375 "25.20°N 55.27°E / ALT 1,090 M" is illegible. Add a navy text-shadow or backdrop, as the district tags have.
7. **nit: hard data edges.**
   - Lahore's residential roads stop at a straight line at the `minorBox` edge: the line fade uses the city box, not `minorBox`.
   - At the Dubai stop the city layer ends visibly at lat 25.4 (the Sharjah side). The 7% fade softens it, but it still reads as a cut.
8. **nit: comments and placeholders.**
   - `globe.ts` / `scene.ts` comments give the Dubai street map as level ≈ 2.4; the Dubai stop is actually about 2.68 and Lahore about 3.0.
   - The Lahore district labels and the Western China labels are commented "geography only" but not `PLACEHOLDER:` (the Dubai ones are).
9. **nit: building footprint precision.** `decodeBoxed` returns lon/lat as Float32. For the 0.055° buildings box that quantises footprints to about 0.2–0.4 m instead of the file's 0.09 m. Nothing visible at current camera distances.
10. **nit: ODbL notice next to the data.** The build script says the derived `.bin` files "must stay available under the ODbL". They are publicly served, but `public/data/` has no licence or credit note (cf. `public/logos/CREDITS.md`). The on-screen attribution is in place.

Pre-existing, not J02: at the UAE stop "Abu Dhabi" overlaps the "UNITED ARAB EMIRATES" country label. The mouse wheel only zooms after the globe has been clicked or focused (by design).

**Not verified.**
- Real mobile GPU or touch: pinch and touch-drag orbit at street level weren't exercised (375 runs used a mouse in a desktop Chrome viewport).
- Safari / iOS WebGL. Headless Chrome on this Mac rendered correctly, but I didn't confirm it was hardware-accelerated.
- GPU memory figures are estimates from vertex counts, not measured.
- Behaviour on a slow network (layer pop-in timing).
