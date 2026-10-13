// Builds public/data/globe-dubai-osm.bin: Dubai-area coastline and land from OpenStreetMap, for the globe's
// closest Dubai view. Run with `npm run build:osm-dubai` (needs network the first time; the raw Overpass
// response is cached in .cache/ so later runs work offline).
//
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0):
// https://www.openstreetmap.org/copyright. The globe shows that attribution whenever this layer is on screen,
// and the derived file must stay available under the ODbL.
//
// Output (see encodeBoxed in scripts/lib/geo.mjs), Uint16 relative to the box:
//   layer 0 = closed land rings (the land mask; their sides that run along the box edge are not coastline,
//             so the globe skips segments lying on the box edge when it draws the coast)
//   layer 1 = coastline pieces that could not be closed into a ring (drawn only)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { simplify, encodeBoxed, clipPolyline } from './lib/geo.mjs';

const { osm } = JSON.parse(readFileSync(new URL('../src/data/globe-regions.json', import.meta.url), 'utf8'));
const B = osm.box;
const CACHE = '.cache/osm-dubai-coastline.json';
const TOL = 0.00006; // ≈ 6 m

// --- fetch (cached) -------------------------------------------------------------------------------
let raw;
if (existsSync(CACHE) && !process.env.REFRESH) {
  raw = JSON.parse(readFileSync(CACHE, 'utf8'));
} else {
  const query = `[out:json][timeout:90];way["natural"="coastline"](${B.lat0},${B.lon0},${B.lat1},${B.lon1});out geom;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'acmetel-website-prototype/0.1 (globe build script)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  raw = await res.json();
  mkdirSync('.cache', { recursive: true });
  writeFileSync(CACHE, JSON.stringify(raw));
}

// --- stitch ways into chains (OSM coastline: land on the left of the way direction) ---------------
const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry?.length > 1)
  .map((w) => ({ nodes: [...w.nodes], pts: w.geometry.map((g) => [g.lon, g.lat]) }));
const byStart = new Map(ways.map((w) => [w.nodes[0], w]));
const used = new Set();
const chains = [];
for (const w of ways) {
  if (used.has(w)) continue;
  // Walk back to the start of this chain, then forward to its end.
  let head = w;
  const seen = new Set([head]);
  for (;;) {
    const prev = ways.find((o) => !used.has(o) && !seen.has(o) && o.nodes[o.nodes.length - 1] === head.nodes[0]);
    if (!prev) break;
    head = prev; seen.add(prev);
  }
  const nodes = [...head.nodes], pts = [...head.pts];
  used.add(head);
  for (;;) {
    const next = byStart.get(nodes[nodes.length - 1]);
    if (!next || used.has(next)) break;
    used.add(next);
    nodes.push(...next.nodes.slice(1)); pts.push(...next.pts.slice(1));
  }
  chains.push({ pts, closed: nodes[0] === nodes[nodes.length - 1] });
}

// --- clip to the box with exact crossing points -----------------------------------------------------
const inside = ([x, y]) => x >= B.lon0 && x <= B.lon1 && y >= B.lat0 && y <= B.lat1;
// Position along the box perimeter, counter-clockwise from the south-west corner (0..4).
function perim([x, y]) {
  const e = 1e-9, w = B.lon1 - B.lon0, h = B.lat1 - B.lat0;
  if (Math.abs(y - B.lat0) < e) return (x - B.lon0) / w;
  if (Math.abs(x - B.lon1) < e) return 1 + (y - B.lat0) / h;
  if (Math.abs(y - B.lat1) < e) return 2 + (B.lon1 - x) / w;
  return 3 + (B.lat1 - y) / h;
}
const corners = [[B.lon1, B.lat0, 1], [B.lon1, B.lat1, 2], [B.lon0, B.lat1, 3], [B.lon0, B.lat0, 4]];

const landRings = [];
const runs = [];
for (const c of chains) {
  if (c.closed && c.pts.every(inside)) { landRings.push(c.pts); continue; }
  runs.push(...clipPolyline(c.pts, B));
}

// Close the edge-to-edge runs into land polygons: from each run's exit, walk the box edge counter-clockwise
// (keeping land on the left) to the next run's entry, and continue until back at the first run.
const onEdge = (p) => {
  const e = 1e-9;
  return Math.abs(p[0] - B.lon0) < e || Math.abs(p[0] - B.lon1) < e || Math.abs(p[1] - B.lat0) < e || Math.abs(p[1] - B.lat1) < e;
};
const edgeRuns = runs.filter((r) => onEdge(r[0]) && onEdge(r[r.length - 1]))
  .map((r) => ({ pts: r, tIn: perim(r[0]), tOut: perim(r[r.length - 1]), done: false }));
const ccw = (from, to) => ((to - from) % 4 + 4) % 4 || 4; // distance going counter-clockwise, never 0
for (const start of edgeRuns) {
  if (start.done) continue;
  const ring = [];
  let run = start;
  for (let guard = 0; guard <= edgeRuns.length; guard++) {
    run.done = true;
    ring.push(...run.pts);
    const next = edgeRuns.filter((o) => !o.done || o === start).sort((a, b) => ccw(run.tOut, a.tIn) - ccw(run.tOut, b.tIn))[0];
    const dist = ccw(run.tOut, next.tIn);
    corners.map(([x, y, t]) => ({ x, y, d: ccw(run.tOut, t) })).filter((c) => c.d < dist).sort((a, b) => a.d - b.d)
      .forEach((c) => ring.push([c.x, c.y]));
    if (next === start) break;
    run = next;
  }
  landRings.push(ring);
}

const simple = (ls) => ls.map((l) => simplify(l, TOL)).filter((l) => l.length > 1);
const landS = simple(landRings).filter((r) => r.length > 2);
const looseS = simple(runs.filter((r) => !(onEdge(r[0]) && onEdge(r[r.length - 1]))));
const buf = encodeBoxed([landS, looseS], B);
mkdirSync('public/data', { recursive: true });
writeFileSync(`public/data/${osm.file}`, buf);
const verts = (ls) => ls.reduce((s, l) => s + l.length, 0);
console.log(`${osm.file}: ${chains.length} chains → ${landS.length} land rings (${verts(landS)} pts), ${looseS.length} loose lines, ${(buf.byteLength / 1024).toFixed(0)} KB`);
