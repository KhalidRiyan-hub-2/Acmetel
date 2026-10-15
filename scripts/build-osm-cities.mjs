// Builds the street-level city layers for the hero globe from OpenStreetMap: roads, rail, waterways, water and
// (Dubai) 3D buildings. Run with `npm run build:osm-cities` (needs network the first time; every Overpass
// response is cached in .cache/osm-cities/, so later runs work offline; REFRESH=1 refetches; ONLY=<id,...> limits
// the run to those cities).
//
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0):
// https://www.openstreetmap.org/copyright. The globe shows that attribution whenever these layers are on screen,
// and the derived files must stay available under the ODbL.
//
// public/data/<city.file> (encodeBoxed over city.box, see scripts/lib/geo.mjs), one layer per kind:
//   0 motorway/trunk  1 primary/secondary  2 tertiary  3 residential (minorBox only)  4 rail + metro
//   5 rivers/canals   6 water areas (closed rings)
// public/data/<city.buildingsFile>: [u32 byteLength of the boxed block][encodeBoxed over buildingsBox:
//   layer 0 = building footprints, layer 1 = landmark parts (building:part within 150 m of the anchor)]
//   then Uint16 height × 10 (m) per ring, then Uint16 min height × 10 per ring, both in ring order.
//
// Optional per city (globe-regions.json):
//   landmarkWays: OSM way ids drawn as the landmark (layer 1) instead of building:parts near the anchor. Used for
//                 the Acmetel office footprint, which is an ordinary building with no parts.
//   skipWater:    water relation ids left out of the water query (too big to fetch whole, e.g. Lake Michigan).
//   lake:         { relation, waterAt: [lon, lat] }: a large lake built from its shoreline ways inside the box,
//                 closed along the box edge on the side of `waterAt` (a point known to be in the lake).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { simplify, encodeBoxed, clipPolyline } from './lib/geo.mjs';

const { cities } = JSON.parse(readFileSync(new URL('../src/data/globe-regions.json', import.meta.url), 'utf8'));
const CACHE = '.cache/osm-cities';
const SERVERS = ['https://z.overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const TOL = 0.000025; // ≈ 2.5 m
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Busy servers answer 504 (retry elsewhere); a query that is genuinely too big comes back as a timeout remark
// (thrown as TooBig so the caller can split the tile).
class TooBig extends Error {}
async function overpass(name, body) {
  const file = `${CACHE}/${name}.json`;
  if (existsSync(file) && !process.env.REFRESH) return JSON.parse(readFileSync(file, 'utf8'));
  const query = `[out:json][timeout:180];${body}`;
  for (let attempt = 0; attempt < 16; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'acmetel-website-prototype/0.1 (globe build script)', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) throw new Error(`${res.status} ${text.slice(0, 80)}`);
      const json = JSON.parse(text);
      if (json.remark && /timed out|out of memory/i.test(json.remark)) throw new TooBig(json.remark);
      if (json.remark && /error/i.test(json.remark)) throw new Error(json.remark);
      writeFileSync(file, text);
      return json;
    } catch (e) {
      if (e instanceof TooBig) throw e;
      console.warn(`  ${name}: ${url.split('/')[2]} failed (${e.message.replace(/\s+/g, ' ').slice(0, 60)}), retrying`);
      await sleep(Math.min(20000, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`Overpass failed for ${name}`);
}

// Split a box into tiles of at most `step` degrees so each query stays small.
function tiles(b, step) {
  const out = [];
  for (let x = b.lon0; x < b.lon1 - 1e-9; x += step) for (let y = b.lat0; y < b.lat1 - 1e-9; y += step) {
    out.push({ lon0: x, lon1: Math.min(b.lon1, x + step), lat0: y, lat1: Math.min(b.lat1, y + step) });
  }
  return out;
}
const bbox = (b) => `(${b.lat0},${b.lon0},${b.lat1},${b.lon1})`;
async function ways(city, kind, box, step, filter) {
  const seen = new Map();
  // A tile that is too big for the server is split into quarters (cached separately).
  const fetchTile = async (name, t, depth) => {
    let json;
    try {
      json = await overpass(name, `(${filter.map((f) => `${f}${bbox(t)};`).join('')});out geom;`);
    } catch (e) {
      if (!(e instanceof TooBig) || depth >= 3) throw e;
      const half = Math.max(t.lon1 - t.lon0, t.lat1 - t.lat0) / 2;
      const subs = tiles(t, half);
      for (let j = 0; j < subs.length; j++) await fetchTile(`${name}.${j}`, subs[j], depth + 1);
      return;
    }
    for (const e of json.elements) if (!seen.has(`${e.type}${e.id}`)) seen.set(`${e.type}${e.id}`, e);
  };
  const ts = tiles(box, step);
  for (let i = 0; i < ts.length; i++) await fetchTile(`${city}-${kind}-${i}`, ts[i], 0);
  return [...seen.values()];
}

const geomOf = (w) => w.geometry.map((g) => [g.lon, g.lat]);
const closed = (pts) => pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
// Outer rings of a multipolygon relation: stitch its outer member ways end to end.
function outerRings(rel) {
  const parts = rel.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry?.length > 1).map((m) => m.geometry.map((g) => [g.lon, g.lat]));
  const rings = [];
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  while (parts.length) {
    let ring = parts.shift();
    for (let guard = 0; guard < 500 && !closed(ring); guard++) {
      const end = key(ring[ring.length - 1]);
      const i = parts.findIndex((p) => key(p[0]) === end || key(p[p.length - 1]) === end);
      if (i < 0) break;
      const p = parts.splice(i, 1)[0];
      ring = ring.concat((key(p[0]) === end ? p : [...p].reverse()).slice(1));
    }
    if (closed(ring)) rings.push(ring);
  }
  return rings;
}
const polysOf = (els) => els.flatMap((e) => (e.type === 'way' ? (e.geometry && closed(geomOf(e)) ? [geomOf(e)] : []) : e.members ? outerRings(e) : []));

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const centroid = (r) => r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
const metres = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
function heights(tags) {
  const lv = metres(tags['building:levels']), mlv = metres(tags['building:min_level']);
  // PLACEHOLDER: footprints with no height or level tag get an assumed 3.5 m per level / 10 m overall.
  const h = metres(tags.height) ?? (lv !== null ? lv * 3.5 : 10);
  const min = metres(tags.min_height) ?? (mlv !== null ? mlv * 3.5 : 0);
  return [Math.max(h, min + 1), min];
}

// OSM splits roads into many short ways; joining the ones that meet end to end keeps the files small.
function stitch(lines) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const ends = new Map();
  lines.forEach((l, i) => [l[0], l[l.length - 1]].forEach((p) => { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); }));
  const used = new Uint8Array(lines.length);
  const extend = (chain) => {
    for (;;) {
      const k = key(chain[chain.length - 1]);
      const j = (ends.get(k) ?? []).find((n) => !used[n]);
      if (j === undefined) return chain;
      used[j] = 1;
      const l = lines[j];
      chain.push(...(key(l[0]) === k ? l : [...l].reverse()).slice(1));
    }
  };
  const out = [];
  lines.forEach((l, i) => {
    if (used[i]) return;
    used[i] = 1;
    out.push(extend(extend([...l]).reverse()));
  });
  return out;
}
// Shoreline of a lake too big to fetch whole: its outer member ways inside the box, stitched, each chain turned so
// the water is on its right (judged at the chain's segment nearest `waterAt`), clipped to the box, then closed
// clockwise along the box edge. Islands and piers mapped as inner rings are left out.
async function lakeWater(c) {
  const B = c.box;
  const json = await overpass(`${c.id}-lake-outer`, `relation(${c.lake.relation});way(r:"outer")${bbox(B)};out geom;`);
  const [wx, wy] = c.lake.waterAt;
  const chains = stitch(json.elements.filter((e) => e.geometry?.length > 1).map(geomOf)).map((ch) => {
    let best = Infinity, side = 0;
    for (let i = 0; i < ch.length - 1; i++) {
      const [ax, ay] = ch[i], [bx, by] = ch[i + 1];
      const t = Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      const d = Math.hypot(ax + (bx - ax) * t - wx, ay + (by - ay) * t - wy);
      if (d < best) { best = d; side = (bx - ax) * (wy - ay) - (by - ay) * (wx - ax); }
    }
    return side > 0 ? [...ch].reverse() : ch;
  });
  const W = B.lon1 - B.lon0, H = B.lat1 - B.lat0, P = 2 * (W + H), eps = 1e-7;
  // Position along the box edge, clockwise from the top-left corner (null if the point is inside the box).
  const along = ([x, y]) => {
    if (Math.abs(y - B.lat1) < eps) return x - B.lon0;
    if (Math.abs(x - B.lon1) < eps) return W + (B.lat1 - y);
    if (Math.abs(y - B.lat0) < eps) return W + H + (B.lon1 - x);
    if (Math.abs(x - B.lon0) < eps) return 2 * W + H + (y - B.lat0);
    return null;
  };
  const corners = [[0, [B.lon0, B.lat1]], [W, [B.lon1, B.lat1]], [W + H, [B.lon1, B.lat0]], [2 * W + H, [B.lon0, B.lat0]]];
  const runs = chains.flatMap((ch) => clipPolyline(ch, B)).filter((r) => along(r[0]) !== null && along(r[r.length - 1]) !== null);
  const used = new Uint8Array(runs.length), rings = [];
  for (let start = 0; start < runs.length; start++) {
    if (used[start]) continue;
    const ring = [];
    for (let i = start, guard = 0; guard <= runs.length; guard++) {
      used[i] = 1;
      ring.push(...runs[i]);
      const out = along(runs[i][runs[i].length - 1]);
      const gap = (j) => (along(runs[j][0]) - out + P) % P;
      const next = runs.map((_, j) => j).filter((j) => !used[j] || j === start).reduce((a, j) => (a < 0 || gap(j) < gap(a) ? j : a), -1);
      for (const [cs, p] of [...corners, ...corners.map(([cs, p]) => [cs + P, p])]) if (cs > out && cs < out + gap(next)) ring.push(p);
      if (next === start) break;
      i = next;
    }
    ring.push(ring[0]);
    rings.push(simplify(ring, TOL));
  }
  return rings;
}

const lines = (els, box) => stitch(els.filter((e) => e.geometry?.length > 1).flatMap((e) => clipPolyline(geomOf(e), box))).map((l) => simplify(l, TOL)).filter((l) => l.length > 1);

// ONLY=rak,lahore rebuilds just those cities (the others' files are left as they are).
const only = process.env.ONLY?.split(',');
for (const c of cities) {
  if (only && !only.includes(c.id)) continue;
  console.log(`${c.id}:`);
  const B = c.box;
  const hw = (re) => [`way["highway"~"^(${re})$"]`];
  const roads = await ways(c.id, 'roads', B, 0.25, hw('motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link'));
  const minor = await ways(c.id, 'minor', c.minorBox, 0.08, hw('residential|unclassified|living_street'));
  const rail = await ways(c.id, 'rail', B, 0.35, ['way["railway"~"^(rail|subway|light_rail|monorail)$"]']);
  const waterways = await ways(c.id, 'waterways', B, 0.35, ['way["waterway"~"^(river|canal)$"]']);
  const skip = (c.skipWater ?? []).map((id) => `(if:id()!=${id})`).join('');
  const water = await ways(c.id, 'water', B, 0.35, ['way["natural"="water"]', `relation["natural"="water"]${skip}`, 'way["water"="river"]', `relation["water"="river"]${skip}`]);

  const cls = (re) => roads.filter((w) => re.test(w.tags.highway));
  const layers = [
    lines(cls(/^(motorway|trunk)/), B),
    lines(cls(/^(primary|secondary)/), B),
    lines(cls(/^tertiary/), B),
    lines(minor, c.minorBox),
    lines(rail, B),
    lines(waterways, B),
    polysOf(water).filter((r) => r.every(([x, y]) => x >= B.lon0 && x <= B.lon1 && y >= B.lat0 && y <= B.lat1)).map((r) => simplify(r, TOL)).filter((r) => r.length > 3),
  ];
  if (c.lake) layers[6].push(...(await lakeWater(c)));
  const buf = encodeBoxed(layers, B);
  writeFileSync(`public/data/${c.file}`, buf);
  console.log(`  ${c.file}: ${layers.map((l) => l.length).join(' / ')} lines, ${(buf.byteLength / 1024).toFixed(0)} KB`);

  if (!c.buildingsFile) continue;
  const BB = c.buildingsBox;
  const els = await ways(c.id, 'buildings', BB, 0.03, ['way["building"]', 'relation["building"]["type"="multipolygon"]', 'way["building:part"]']);
  const parts = [], footprints = [];
  for (const e of els) {
    const rings = polysOf([e]).filter((r) => r.every(([x, y]) => x >= BB.lon0 && x <= BB.lon1 && y >= BB.lat0 && y <= BB.lat1));
    for (const r of rings) (e.tags['building:part'] && !e.tags.building ? parts : footprints).push({ ring: r, tags: e.tags, id: e.id });
  }
  // A footprint with parts inside it is drawn as its parts (OSM simple 3D buildings convention).
  const partCentres = parts.map((p) => centroid(p.ring));
  const shown = footprints.filter((f) => !partCentres.some((pc) => inRing(pc, f.ring)));
  const near = (r) => { const [x, y] = centroid(r); return Math.hypot((x - c.anchor.lon) * 101_000, (y - c.anchor.lat) * 110_600) < 150; };
  let landmark = parts.filter((p) => near(p.ring));
  let other = [...shown, ...parts.filter((p) => !near(p.ring))];
  if (c.landmarkWays) {
    const isLm = (b) => c.landmarkWays.includes(b.id);
    landmark = shown.filter(isLm);
    other = [...shown.filter((b) => !isLm(b)), ...parts];
    if (landmark.length !== c.landmarkWays.length) throw new Error(`${c.id}: landmark ways not all found in buildingsBox`);
  }
  const ringsOut = [other, landmark].map((set) => set.map((b) => simplify(b.ring, 0.000003)));
  const hs = [...other, ...landmark].map((b) => heights(b.tags));
  const boxed = encodeBoxed(ringsOut, BB);
  const hBuf = Buffer.from(new Uint16Array([...hs.map(([h]) => Math.round(h * 10)), ...hs.map(([, m]) => Math.round(m * 10))]).buffer);
  const bbuf = Buffer.concat([Buffer.from(new Uint32Array([boxed.byteLength]).buffer), boxed, hBuf]);
  writeFileSync(`public/data/${c.buildingsFile}`, bbuf);
  const tallest = Math.max(...landmark.map((b) => heights(b.tags)[0]), 0);
  console.log(`  ${c.buildingsFile}: ${other.length} buildings + ${landmark.length} landmark ${c.landmarkWays ? 'footprints' : 'parts'} (tallest ${tallest} m), ${(bbuf.byteLength / 1024).toFixed(0)} KB`);
}
