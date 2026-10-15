// Live-ops panel: one clock drives the radar and the pulse, and the map under the radar can be spun and tilted in 3D.
// Every time the sweep line crosses an Acmetel office (because the sweep moved on, or because the map was spun under
// it), the radar pings that office and the pulse draws one clean beat. eSIM destinations are never pinged. Contacts that arrive while a beat is still
// being drawn join that beat rather than stacking on it, so the trace stays a clean beat-and-flatline.
import { visibleLoop, type Loop } from '../motion';
import { createPulse, type Signal } from './heartbeat';
import { createRadar, detector, readBlips, sweepAt, SWEEP_PERIOD, MAX_TILT } from './radar';

const TAU = Math.PI * 2;
const BEAT_S = 0.42;    // length of one beat; contacts closer than this share it
const GAIN: Record<string, number> = { '5G': 1, '4G': 0.78 };
const FRICTION = 2;     // spin momentum decay (1/s)
const MAX_SPIN = TAU;   // rad/s: a hard flick coasts about half a turn
const KEY_STEP = Math.PI / 12;
const KEY_TILT = Math.PI / 18;              // 10° per arrow press
const VIEW_TILT = (52 * Math.PI) / 180;     // "3D view" toggle angle
const START_TILT = (24 * Math.PI) / 180;    // opening angle: a hint of depth, still easy to read
const TILTED = (36 * Math.PI) / 180;        // past this, the toggle shows as pressed (the opening tilt doesn't count)
const STATIC_T = SWEEP_PERIOD + SWEEP_PERIOD * 0.31; // reduced-motion frame; the radar parks its sweep at the same angle

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
/** One beat, `dt` seconds after the contact: small Q dip, sharp R spike, S dip, soft T wave, back to flat. */
const beatShape = (dt: number) =>
  -0.1 * gauss(dt, 0.03, 0.01) + gauss(dt, 0.06, 0.0105) - 0.24 * gauss(dt, 0.085, 0.011) + 0.2 * gauss(dt, 0.24, 0.045);

function beats() {
  const list: { t: number; gain: number }[] = [];
  const signal: Signal = (tau) => {
    let s = 0;
    for (const b of list) { const dt = tau - b.t; if (dt >= 0 && dt < BEAT_S) s += b.gain * beatShape(dt); }
    return s;
  };
  return {
    signal,
    add(t: number, gain: number) {
      const last = list[list.length - 1];
      if (last && t - last.t < BEAT_S) last.gain = Math.max(last.gain, gain);
      else list.push({ t, gain });
      while (list.length && list[0].t < t - 12) list.shift(); // older than any visible window
    },
  };
}

/**
 * 3D handling of the disc: drag sideways to spin it (momentum on release), drag up/down to tilt it (mouse and pen;
 * on touch a vertical swipe scrolls the page, so the "3D view" toggle tilts instead). Arrow keys while focus is
 * inside: left/right spin, up/down tilt. Tilt eases toward its target so the toggle and keys animate.
 */
function controller(stage: HTMLElement, onChange: () => void, momentum: boolean, initialTilt: number) {
  let rot = 0, vel = 0, swallowClick = false;
  let tilt = initialTilt, tiltTo = initialTilt;
  const listeners = new Set<(tilted: boolean) => void>();
  const setTiltTo = (v: number, snap = false) => {
    tiltTo = Math.max(0, Math.min(MAX_TILT, v));
    if (snap || !momentum) tilt = tiltTo;
    listeners.forEach((fn) => fn(tiltTo > TILTED));
    onChange();
  };
  let drag: { id: number; x: number; y: number; px: number; py: number; t: number; sign: number; moved: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    swallowClick = false;
    vel = 0;
    const r = stage.getBoundingClientRect();
    // Grabbing the near (lower) half and pulling right turns the disc the other way from grabbing the far half.
    const sign = e.clientY < r.top + r.height / 2 ? 1 : -1;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, t: e.timeStamp, sign, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return; // still a tap
      drag.moved = true;
      stage.setPointerCapture(e.pointerId);
      stage.setAttribute('data-spinning', '');
    }
    const half = stage.clientWidth / 2 || 1;
    const d = (drag.sign * (e.clientX - drag.px)) / half;   // radians: a drag across the radius ≈ 1 rad
    const dt = Math.max(0.001, (e.timeStamp - drag.t) / 1000);
    rot += d;
    vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, 0.6 * (d / dt) + 0.4 * vel));
    if (e.pointerType !== 'touch') { tilt = tiltTo = Math.max(0, Math.min(MAX_TILT, tilt + ((e.clientY - drag.py) / half) * 0.9)); listeners.forEach((fn) => fn(tiltTo > TILTED)); }
    drag.px = e.clientX; drag.py = e.clientY; drag.t = e.timeStamp;
    onChange();
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      swallowClick = true; // the drag shouldn't also open a blip's tooltip
      stage.removeAttribute('data-spinning');
      if (!momentum || e.timeStamp - drag.t > 80) vel = 0; // pointer had come to rest
    } else vel = 0;
    drag = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      vel = 0;
      rot += e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP;
      onChange();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setTiltTo(tiltTo + (e.key === 'ArrowDown' ? KEY_TILT : -KEY_TILT));
    }
  });
  return {
    get rot() { return rot; },
    get tilt() { return tilt; },
    /** Tilted past the "3D view" threshold (drives the toggle's pressed state). */
    get tilted() { return tiltTo > TILTED; },
    /** Tilt has reached its target (no ease in progress). */
    get settled() { return tilt === tiltTo; },
    setTiltTo,
    onTilt(fn: (tilted: boolean) => void) { listeners.add(fn); },
    /** Advances momentum and the tilt ease by `dt` seconds. */
    tick(dt: number) {
      if (tilt !== tiltTo) {
        tilt += (tiltTo - tilt) * Math.min(1, dt * 6);
        if (Math.abs(tiltTo - tilt) < 0.002) tilt = tiltTo;
      }
      if (drag || !vel) return;
      rot += vel * dt;
      vel *= Math.exp(-FRICTION * dt);
      if (Math.abs(vel) < 0.02) vel = 0;
    },
  };
}

/** Wires the "3D view" toggle in the panel header: flat top-down view ↔ tilted view. */
function bindTiltToggle(panel: HTMLElement, ctl: ReturnType<typeof controller>) {
  const btn = panel.querySelector<HTMLButtonElement>('[data-tilt-toggle]');
  if (!btn) return;
  btn.hidden = false;
  const sync = (tilted: boolean) => btn.setAttribute('aria-pressed', String(tilted));
  sync(ctl.tilted);
  ctl.onTilt(sync);
  btn.addEventListener('click', () => ctl.setTiltTo(ctl.tilted ? 0 : VIEW_TILT));
}

interface Els { pulse: HTMLCanvasElement | null; radar: HTMLCanvasElement | null; stage: HTMLElement | null }
interface Opts { reduced: boolean; onContact?: (i: number) => void }

/** Starts the panel. Returns the loop (for the pause button), or null under reduced motion. */
export function initOps(panel: HTMLElement, { pulse, radar, stage }: Els, { reduced, onContact }: Opts): Loop | null {
  if (!stage) return null;
  const blips = readBlips(stage);
  const b = beats();
  const p = pulse ? createPulse(pulse, b.signal) : undefined;
  const r = radar ? createRadar(radar, stage, blips) : undefined;
  const all = detector(blips);
  // Only the Acmetel offices are radar targets: the sweep crossing a destination does nothing.
  const detect = (sweep: number, rot: number) => all(sweep, rot).filter((i) => blips[i].office);
  const gain = (i: number) => GAIN[blips[i].net] ?? 1;

  if (reduced) {
    // No loop and no momentum. Replay the first turn and a third of the next so the pulse shows real contacts.
    for (let t = 0; t <= STATIC_T; t += 1 / 60) detect(sweepAt(t), 0).forEach((i) => b.add(t, gain(i)));
    p?.frame(STATIC_T);
    const ctl = controller(stage, () => r?.still(ctl.rot, ctl.tilt), false, 0);
    bindTiltToggle(panel, ctl);
    r?.still(0, 0);
    return null;
  }

  const lastHit = blips.map(() => -Infinity);
  let now = 0;
  const step = (t: number, live: boolean) => {
    detect(sweepAt(t), ctl.rot).forEach((i) => {
      if (!live) return; // paused: the beam is frozen, so spinning under it doesn't count
      lastHit[i] = t;
      b.add(t, gain(i));
      onContact?.(i);
    });
    r?.frame(t, ctl.rot, ctl.tilt, lastHit);
  };
  // While paused, a drag or key still moves the map; the tilt ease then runs in its own short rAF chain.
  let easing = 0;
  const ease = () => { ctl.tick(1 / 60); step(now, false); easing = ctl.settled ? 0 : requestAnimationFrame(ease); };
  const ctl = controller(stage, () => { if (loop.paused && !easing) easing = requestAnimationFrame(ease); }, true, START_TILT);
  bindTiltToggle(panel, ctl);
  const loop = visibleLoop(panel, (t, dt) => {
    now = t;
    ctl.tick(dt);
    step(t, true);
    p?.frame(t);
  });
  step(0, true);
  p?.frame(0);
  return loop;
}
