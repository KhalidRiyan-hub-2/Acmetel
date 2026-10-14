// Live-ops panel: one clock drives the radar and the pulse, and the map under the radar spins like a wheel.
// Every time the sweep line crosses a destination (because the sweep moved on, or because the map was spun under
// it), the radar pings that blip and the pulse draws one clean beat. Contacts that arrive while a beat is still
// being drawn join that beat rather than stacking on it, so the trace stays a clean beat-and-flatline.
import { visibleLoop, type Loop } from '../motion';
import { createPulse, type Signal } from './heartbeat';
import { createRadar, detector, readBlips, sweepAt, SWEEP_PERIOD } from './radar';

const TAU = Math.PI * 2;
const BEAT_S = 0.42;    // length of one beat; contacts closer than this share it
const GAIN: Record<string, number> = { '5G': 1, '4G': 0.78 };
const FRICTION = 2;     // spin momentum decay (1/s)
const MAX_SPIN = TAU;   // rad/s: a hard flick coasts about half a turn
const KEY_STEP = Math.PI / 12;
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

/** Drag-to-spin (pointer angle around the centre), momentum on release, arrow keys while focus is inside. */
function spinner(stage: HTMLElement, onChange: () => void, momentum: boolean) {
  let rot = 0, vel = 0, swallowClick = false;
  let drag: { id: number; a: number; x: number; y: number; t: number; moved: boolean } | null = null;
  const angle = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))); // clockwise from up
  };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    swallowClick = false;
    vel = 0;
    drag = { id: e.pointerId, a: angle(e), x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return; // still a tap
      drag.moved = true;
      stage.setPointerCapture(e.pointerId);
      stage.setAttribute('data-spinning', '');
    }
    const a = angle(e);
    const d = ((a - drag.a + Math.PI * 3) % TAU) - Math.PI;
    const dt = Math.max(0.001, (e.timeStamp - drag.t) / 1000);
    rot += d;
    vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, 0.6 * (d / dt) + 0.4 * vel));
    drag.a = a; drag.t = e.timeStamp;
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
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    vel = 0;
    rot += e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP;
    onChange();
  });
  return {
    get rot() { return rot; },
    /** Advances momentum by `dt` seconds. */
    tick(dt: number) {
      if (drag || !vel) return;
      rot += vel * dt;
      vel *= Math.exp(-FRICTION * dt);
      if (Math.abs(vel) < 0.02) vel = 0;
    },
  };
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
  const detect = detector(blips);
  const gain = (i: number) => GAIN[blips[i].net] ?? 0.85;

  if (reduced) {
    // No loop and no momentum. Replay the first turn and a third of the next so the pulse shows real contacts.
    for (let t = 0; t <= STATIC_T; t += 1 / 60) detect(sweepAt(t), 0).forEach((i) => b.add(t, gain(i)));
    p?.frame(STATIC_T);
    const spin = spinner(stage, () => r?.still(spin.rot), false);
    r?.still(0);
    return null;
  }

  const lastHit = blips.map(() => -Infinity);
  let now = 0;
  const step = (t: number, live: boolean) => {
    detect(sweepAt(t), spin.rot).forEach((i) => {
      if (!live) return; // paused: the beam is frozen, so spinning under it doesn't count
      lastHit[i] = t;
      b.add(t, gain(i));
      onContact?.(i);
    });
    r?.frame(t, spin.rot, lastHit);
  };
  const spin = spinner(stage, () => { if (loop.paused) step(now, false); }, true);
  const loop = visibleLoop(panel, (t, dt) => {
    now = t;
    spin.tick(dt);
    step(t, true);
    p?.frame(t);
  });
  step(0, true);
  p?.frame(0);
  return loop;
}
