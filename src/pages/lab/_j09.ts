// LAB J09 (docs/agents/QUEUE.md): board geometry for the three "Powered by" directions. Pure data, used at build
// time by src/pages/lab/j09.astro. Every layout is in its own viewBox units; the HTML chips sit on top at the same
// coordinates expressed as percentages, so the SVG and the links line up at any width.
// Lab only. Delete with j09.astro once J09 ships.

export type P = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
/** One trace: `d` for drawing, `k` = chip index (0..4, -1 = shared), `pk` = carries packets, `rev` = inbound. */
export type Trace = { d: string; k: number; pk?: boolean; rev?: boolean; depth?: number };
export type Layout = {
  W: number; H: number; core: Box; chips: Box[]; traces: Trace[];
  vias: (P & { k?: number })[] | P[]; deco: string[]; pads?: Box[]; regions?: Box[]; ticks?: Trace[]; fingers?: string[];
  labels?: { x: number; y: number; t: string; anchor?: 'start' | 'middle' | 'end' }[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
export const path = (pts: P[]) => 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');
const T22 = Math.tan(Math.PI / 8); // 0.414: keeps a parallel bus evenly spaced through a 45° bend

/** Horizontal → 45° → horizontal, from (x0,y0) to (x1,y1). `i` = bus lane, `s` = lane spacing. */
function hdh(x0: number, y0: number, x1: number, y1: number, i: number, s: number, at = 0.5): P[] {
  const sx = Math.sign(x1 - x0) || 1, sy = Math.sign(y1 - y0) || 1, dy = Math.abs(y1 - y0);
  const m = x0 + (x1 - x0) * at, off = -T22 * i * s * sx * sy;
  return [[x0, y0 + i * s], [m - (sx * dy) / 2 + off, y0 + i * s], [m + (sx * dy) / 2 + off, y1 + i * s], [x1, y1 + i * s]];
}

/** Package pins: short ticks along each side of a box, returned as one path string. */
function pins(b: Box, pitch: number, len: number, inset = 14): string {
  let d = '';
  for (let x = b.x + inset; x <= b.x + b.w - inset; x += pitch) d += `M${r1(x)} ${b.y - len}V${b.y}M${r1(x)} ${b.y + b.h}V${b.y + b.h + len}`;
  for (let y = b.y + inset; y <= b.y + b.h - inset; y += pitch) d += `M${b.x - len} ${r1(y)}H${b.x}M${b.x + b.w} ${r1(y)}H${b.x + b.w + len}`;
  return d;
}

const holes = (W: number, H: number, m: number) => [[m, m], [W - m, m], [m, H - m], [W - m, H - m]] as P[];

// ---------------------------------------------------------------------------------------------------------------
// A · Mainboard: plan view of a board. A CPU-style package in the middle, five chips around it, each on a routed
// three-lane bus with 45° bends and vias. Silkscreen designators (U1–U5) are decoration.
// ---------------------------------------------------------------------------------------------------------------
export function mainboard(mobile: boolean): Layout {
  if (!mobile) {
    const W = 1200, H = 600;
    const core = { x: 470, y: 160, w: 260, h: 210 };
    const cw = 280, ch = 100;
    const chips: Box[] = [
      { x: 40, y: 50, w: cw, h: ch },       // 0 Connectivity   TL
      { x: 880, y: 50, w: cw, h: ch },      // 1 Data Center    TR
      { x: 880, y: 330, w: cw, h: ch },     // 2 Cloud          BR
      { x: 460, y: 470, w: cw, h: ch },     // 3 Automation     bottom
      { x: 40, y: 330, w: cw, h: ch },      // 4 Network Intel  BL
    ];
    const s = 13, traces: Trace[] = [], vias: P[] = [];
    const bus = (k: number, pts: (i: number) => P[]) => {
      [-1, 0, 1].forEach((i) => {
        const p = pts(i);
        traces.push({ d: path(p), k, pk: true, rev: i === 1 });
        if (i === 0 && p.length > 2) vias.push(p[1], p[2]);
      });
    };
    bus(0, (i) => hdh(core.x, 215, chips[0].x + cw, 100, i, s, 0.55));
    bus(1, (i) => hdh(core.x + core.w, 215, chips[1].x, 100, i, s, 0.55));
    bus(2, (i) => hdh(core.x + core.w, 320, chips[2].x, 380, i, s, 0.5));
    bus(4, (i) => hdh(core.x, 320, chips[4].x + cw, 380, i, s, 0.5));
    bus(3, (i) => [[600 + i * s, core.y + core.h], [600 + i * s, chips[3].y]]);
    // Passives around the core (decoupling caps) and a crystal: small pads, decoration only.
    const deco = [
      ...[[440, 140], [440, 380], [752, 140], [752, 380]].map(([x, y]) => `M${x} ${y}h10v6h-10zM${x} ${y + 10}h10v6h-10z`),
      'M660 400h34a7 7 0 0 1 0 14h-34a7 7 0 0 1 0-14z',
    ];
    const labels = [
      { x: 40, y: 38, t: 'U1' }, { x: 1160, y: 38, t: 'U2', anchor: 'end' as const }, { x: 1160, y: 452, t: 'U3', anchor: 'end' as const },
      { x: 460, y: 588, t: 'U4' }, { x: 40, y: 452, t: 'U5' }, { x: 470, y: 148, t: 'SIS' },
    ];
    return { W, H, core, chips, traces, vias, deco: [pins(core, 13, 7), ...deco, ...chips.map((c) => pins({ ...c, h: c.h }, 12, 5, 18))], labels };
  }
  const W = 360, H = 700;
  const core = { x: 14, y: 14, w: 332, h: 128 };
  const chips: Box[] = [0, 1, 2, 3, 4].map((k) => ({ x: 70, y: 186 + k * 100, w: 276, h: 84 }));
  const traces: Trace[] = [], vias: P[] = [];
  chips.forEach((c, k) => {
    const lx = 50 - k * 8, sx = lx + 26, ya = core.y + core.h + 8, yc = c.y + c.h / 2;
    const p: P[] = [[sx, core.y + core.h], [sx, ya], [lx, ya + 26], [lx, yc - 9], [lx + 9, yc], [c.x, yc]];
    traces.push({ d: path(p), k, pk: true });
    vias.push([lx, ya + 26]);
  });
  return { W, H, core, chips, traces, vias, deco: [pins(core, 13, 6), ...chips.map((c) => pins(c, 12, 4, 16))], labels: chips.map((c, k) => ({ x: 346, y: c.y - 6, t: `U${k + 1}`, anchor: 'end' as const })) };
}

// ---------------------------------------------------------------------------------------------------------------
// B · Die: the stack as one piece of silicon. A floorplan of five blocks around the core block, a bond-pad ring,
// and a clock tree that leaves the core through the routing channels and fans out inside each block (H-trees).
// ---------------------------------------------------------------------------------------------------------------
function htree(cx: number, cy: number, w: number, h: number, depth: number, k: number, out: Trace[], level = 1) {
  if (depth === 0) return;
  const hw = w / 4, hh = h / 4;
  out.push({ d: `M${r1(cx - hw)} ${r1(cy)}H${r1(cx + hw)}M${r1(cx - hw)} ${r1(cy - hh)}V${r1(cy + hh)}M${r1(cx + hw)} ${r1(cy - hh)}V${r1(cy + hh)}`, k, depth: level });
  for (const [dx, dy] of [[-hw, -hh], [-hw, hh], [hw, -hh], [hw, hh]]) htree(cx + dx, cy + dy, w / 2, h / 2, depth - 1, k, out, level + 1);
}

export function die(mobile: boolean): Layout {
  const traces: Trace[] = [], ticks: Trace[] = [], pads: Box[] = [];
  if (!mobile) {
    const W = 1200, H = 600;
    const core = { x: 470, y: 220, w: 260, h: 200 };
    const chips: Box[] = [
      { x: 60, y: 60, w: 390, h: 230 },   // 0 Connectivity
      { x: 750, y: 60, w: 390, h: 230 },  // 1 Data Center
      { x: 750, y: 310, w: 390, h: 230 }, // 2 Cloud
      { x: 470, y: 440, w: 260, h: 100 }, // 3 Automation (bottom centre)
      { x: 60, y: 310, w: 390, h: 230 },  // 4 Network Intelligence
    ];
    const regions = [{ x: 470, y: 60, w: 260, h: 140 }]; // spare block (memory texture), decoration
    // Clock routes from the core edge through the channels to each block's entry point.
    const g = (k: number, p: P[]) => traces.push({ d: path(p), k, pk: true });
    g(0, [[core.x, 270], [460, 270], [460, 175], [450, 175]]);
    g(4, [[core.x, 370], [460, 370], [460, 425], [450, 425]]);
    g(1, [[core.x + core.w, 270], [740, 270], [740, 175], [750, 175]]);
    g(2, [[core.x + core.w, 370], [740, 370], [740, 425], [750, 425]]);
    g(3, [[600, core.y + core.h], [600, 440]]);
    // H-trees inside each block, right/lower part so the label (top-left) stays clear, fed from the entry point.
    const entry: P[] = [[450, 175], [750, 175], [750, 425], [600, 440], [450, 425]];
    chips.forEach((c, k) => {
      const [ex, ey] = entry[k];
      if (k === 3) {
        const cx = c.x + c.w * 0.66, cy = c.y + c.h * 0.6;
        ticks.push({ d: path([[ex, ey], [ex, cy], [cx, cy]]), k, depth: 0 });
        htree(cx, cy, c.w * 0.5, c.h * 0.7, 2, k, ticks);
      } else {
        const cx = c.x + c.w * 0.6, cy = c.y + c.h * 0.64;
        ticks.push({ d: path([[ex, ey], [cx, ey], [cx, cy]]), k, depth: 0 });
        htree(cx, cy, c.w * 0.72, c.h * 0.6, 3, k, ticks);
      }
    });
    for (let x = 40; x <= W - 40; x += 28) pads.push({ x: x - 5, y: 22, w: 10, h: 12 }, { x: x - 5, y: H - 34, w: 10, h: 12 });
    for (let y = 68; y <= H - 68; y += 28) pads.push({ x: 22, y: y - 5, w: 12, h: 10 }, { x: W - 34, y: y - 5, w: 12, h: 10 });
    return { W, H, core, chips, traces, ticks, pads, regions, vias: [], deco: [] };
  }
  const W = 360, H = 770;
  const core = { x: 52, y: 52, w: 268, h: 112 };
  const chips: Box[] = [0, 1, 2, 3, 4].map((k) => ({ x: 52, y: 184 + k * 108, w: 268, h: 96 }));
  chips.forEach((c, k) => {
    const yb = c.y + c.h - 10, cx = c.x + c.w * 0.82, cy = c.y + c.h * 0.42;
    traces.push({ d: path([[core.x + 20, core.y + core.h], [core.x + 20, core.y + core.h + 8], [36, core.y + core.h + 8], [36, yb], [c.x, yb]]), k, pk: true });
    ticks.push({ d: path([[c.x, yb], [cx, yb], [cx, cy]]), k, depth: 0 });
    htree(cx, cy, c.w * 0.3, c.h * 0.6, 2, k, ticks);
  });
  for (let x = 40; x <= W - 40; x += 24) pads.push({ x: x - 4, y: 18, w: 8, h: 10 }, { x: x - 4, y: H - 28, w: 8, h: 10 });
  for (let y = 52; y <= H - 52; y += 24) pads.push({ x: 14, y: y - 4, w: 10, h: 8 }, { x: W - 24, y: y - 4, w: 10, h: 8 });
  return { W, H, core, chips, traces, ticks, pads, regions: [], vias: [], deco: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// C · Backplane: one wide shared bus leaving the core, five cards slotted along it (alternating above and below on
// desktop, a column on phones). Each card taps the bus with a three-lane stub and edge-connector fingers.
// ---------------------------------------------------------------------------------------------------------------
export function backplane(mobile: boolean): Layout {
  const traces: Trace[] = [], vias: P[] = [], deco: string[] = [], fingers: string[] = [];
  if (!mobile) {
    const W = 1200, H = 560;
    const core = { x: 30, y: 190, w: 250, h: 180 };
    const top = 254, n = 5, s = 13, bot = top + (n - 1) * s; // bus lanes
    const cw = 230, ch = 110;
    const xs = [330, 480, 630, 780, 930];
    const chips: Box[] = xs.map((x, k) => ({ x, y: k % 2 ? 420 : 30, w: cw, h: ch }));
    for (let j = 0; j < n; j++) traces.push({ d: `M${core.x + core.w} ${top + j * s}H1170`, k: -1 });
    deco.push(`M1170 ${top - 8}h14v${bot - top + 16}h-14z`); // bus terminator
    chips.forEach((c, k) => {
      const up = k % 2 === 0, cx = c.x + c.w / 2, edge = up ? c.y + c.h : c.y, lane = up ? top : bot;
      [-1, 0, 1].forEach((i) => {
        const x = cx + i * 14;
        traces.push({ d: `M${x} ${lane}V${edge}`, k });
        vias.push([x, lane]);
      });
      // Packet route: core → along the edge lane → 45° → up/down the middle stub.
      const c45 = 10;
      traces.push({ d: path([[core.x + core.w, lane], [cx - c45, lane], [cx, lane + (up ? -c45 : c45)], [cx, edge]]), k, pk: true });
      // Edge-connector fingers along the card edge (gold-finger contacts, drawn filled).
      fingers.push(Array.from({ length: 13 }, (_, f) => `M${cx - 74 + f * 12} ${up ? edge - 9 : edge + 1}h6v8h-6z`).join(''));
    });
    return { W, H, core, chips, traces, vias, fingers, deco: [pins(core, 13, 6), ...deco] };
  }
  const W = 360, H = 690;
  const core = { x: 14, y: 14, w: 332, h: 120 };
  const lanes = [22, 32, 42, 52], r = lanes[3];
  const chips: Box[] = [0, 1, 2, 3, 4].map((k) => ({ x: 84, y: 172 + k * 100, w: 262, h: 84 }));
  lanes.forEach((x) => traces.push({ d: `M${x} ${core.y + core.h}V${H - 10}`, k: -1 }));
  deco.push(`M${lanes[0] - 6} ${H - 12}h${r - lanes[0] + 12}v8h-${r - lanes[0] + 12}z`);
  chips.forEach((c, k) => {
    const yc = c.y + c.h / 2;
    [-1, 0, 1].forEach((i) => { traces.push({ d: `M${r} ${yc + i * 12}H${c.x}`, k }); vias.push([r, yc + i * 12]); });
    traces.push({ d: path([[r, core.y + core.h], [r, yc - 8], [r + 8, yc], [c.x, yc]]), k, pk: true });
  });
  return { W, H, core, chips, traces, vias, deco: [pins(core, 13, 5), ...deco] };
}

/** Box → CSS custom properties (percent of the layout) for the HTML overlay. */
export const pct = (b: Box, L: Layout, pre = '') =>
  `--${pre}x:${r1((b.x / L.W) * 100)}%;--${pre}y:${r1((b.y / L.H) * 100)}%;--${pre}w:${r1((b.w / L.W) * 100)}%;--${pre}h:${r1((b.h / L.H) * 100)}%`;
