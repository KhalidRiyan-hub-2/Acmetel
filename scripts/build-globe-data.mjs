// Generates the hero globe's geography from Natural Earth (world-atlas). Run with `npm run build:globe-data`.
//
//   public/data/globe-dots.bin    land dots on a Fibonacci sphere, Int16 [lon, lat] × 100
//   public/data/globe-lines.bin   world coastlines + country borders (50m, simplified), Int16 × 100
//   public/data/globe-<region>.bin  one per region in src/data/globe-regions.json, at 10m: coastlines, borders,
//                                   highlighted-country outline, land rings, highlighted-country rings,
//                                   Uint16 relative to the region box (see encodeBoxed)
// The Dubai OpenStreetMap layer is built separately by scripts/build-osm-dubai.mjs.
//
// Line files: [u32 layerCount] then per layer [u32 lineCount][u32 vertexCount × lineCount] followed by the
// coordinate block for every layer ([lon, lat] pairs). Layout is read by src/scripts/globe/data.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature, mesh } from 'topojson-client';
import { simplify, lineLength, encode, encodeBoxed, clipPolyline } from './lib/geo.mjs';

const require = createRequire(import.meta.url);
const atlas = (name) => JSON.parse(readFileSync(require.resolve(`world-atlas/${name}.json`), 'utf8'));

const { regions } = JSON.parse(readFileSync(new URL('../src/data/globe-regions.json', import.meta.url), 'utf8'));

// --- helpers -------------------------------------------------------------------------------------
const polysOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []);
const geomsOf = (fc) => (fc.type === 'FeatureCollection' ? fc.features.map((f) => f.geometry) : [fc.geometry ?? fc]);

// Break lines at the antimeridian so no segment wraps across the globe.
function splitDateline(pts) {
  const out = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > 180) out.push([]);
    out[out.length - 1].push(pts[i]);
  }
  return out.filter((l) => l.length > 1);
}

// Sutherland–Hodgman ring clip against the box, for filled land.
function clipRing(ring, b) {
  const edges = [
    (p) => p[0] >= b.lon0, (p) => p[0] <= b.lon1, (p) => p[1] >= b.lat0, (p) => p[1] <= b.lat1,
  ];
  const cut = [
    (p, q) => { const t = (b.lon0 - p[0]) / (q[0] - p[0]); return [b.lon0, p[1] + t * (q[1] - p[1])]; },
    (p, q) => { const t = (b.lon1 - p[0]) / (q[0] - p[0]); return [b.lon1, p[1] + t * (q[1] - p[1])]; },
    (p, q) => { const t = (b.lat0 - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), b.lat0]; },
    (p, q) => { const t = (b.lat1 - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), b.lat1]; },
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length; e++) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i], q = input[(i + 1) % input.length];
      const pin = edges[e](p), qin = edges[e](q);
      if (pin) out.push(p);
      if (pin !== qin) out.push(cut[e](p, q));
    }
  }
  return out.length > 2 ? out : null;
}

// --- land test for dots (50m) --------------------------------------------------------------------
const land50 = atlas('land-50m');
const landPolys = [];
for (const g of geomsOf(feature(land50, land50.objects.land))) {
  for (const rings of polysOf(g)) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    landPolys.push({ rings, bbox: [minX, minY, maxX, maxY] });
  }
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function onLand(lon, lat) {
  for (const p of landPolys) {
    const [a, b, c, d] = p.bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (!inRing(lon, lat, p.rings[0])) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length; k++) if (inRing(lon, lat, p.rings[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

const N = Number(process.env.GLOBE_POINTS ?? 130000);
const golden = Math.PI * (3 - Math.sqrt(5));
const dots = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const lat = (Math.asin(y) * 180) / Math.PI;
  if (lat < -60) continue; // drop Antarctica
  const th = golden * i;
  const lon = (Math.atan2(-Math.sin(th), Math.cos(th)) * 180) / Math.PI; // inverse of latLonToVec3
  if (onLand(lon, lat)) dots.push(Math.round(lon * 100), Math.round(lat * 100));
}

// --- world lines (50m) ---------------------------------------------------------------------------
const countries50 = atlas('countries-50m');
const prep = (lines, tol, minLen) => lines.flatMap(splitDateline).map((l) => simplify(l, tol)).filter((l) => l.length > 1 && lineLength(l) >= minLen);
const coast = prep(mesh(land50, land50.objects.land).coordinates, 0.06, 0.6);
const borders = prep(mesh(countries50, countries50.objects.countries, (a, b) => a !== b).coordinates, 0.08, 0.3);

// --- Regional layers (10m) ----------------------------------------------------------------------
const land10 = atlas('land-10m');
const countries10 = atlas('countries-10m');
const landRings10 = geomsOf(feature(land10, land10.objects.land));
const coastMesh10 = mesh(land10, land10.objects.land);
const borderMesh10 = mesh(countries10, countries10.objects.countries, (a, b) => a !== b);
const regionBufs = regions.map((reg) => {
  const B = reg.box;
  const pad = { lon0: B.lon0 - 0.5, lon1: B.lon1 + 0.5, lat0: B.lat0 - 0.5, lat1: B.lat1 + 0.5 };
  const lines = (ml) => ml.coordinates.flatMap((l) => clipPolyline(l, pad)).map((l) => simplify(l, reg.tol)).filter((l) => l.length > 1 && lineLength(l) >= reg.minLen);
  const polys = (geoms) => geoms.flatMap(polysOf).flat().map((ring) => clipRing(ring, pad)).filter(Boolean).map((r) => simplify(r, reg.tol)).filter((r) => r.length > 2 && lineLength(r) >= reg.minLen);
  const hi = countries10.objects.countries.geometries.filter((g) => reg.highlight.includes(g.id));
  const layers = [
    lines(coastMesh10),
    lines(borderMesh10),
    hi.flatMap((g) => lines(mesh(countries10, g))),
    polys(landRings10),
    polys(hi.map((g) => feature(countries10, g).geometry)),
  ];
  return { reg, layers, buf: encodeBoxed(layers, pad) };
});

mkdirSync('public/data', { recursive: true });
const dotsBuf = Buffer.from(new Int16Array(dots).buffer);
const linesBuf = encode([coast, borders], Int16Array, 100);
writeFileSync('public/data/globe-dots.bin', dotsBuf);
writeFileSync('public/data/globe-lines.bin', linesBuf);
for (const r of regionBufs) writeFileSync(`public/data/${r.reg.file}`, r.buf);
const kb = (b) => `${(b.byteLength / 1024).toFixed(0)} KB`;
console.log(`globe-dots.bin: ${dots.length / 2} dots, ${kb(dotsBuf)}`);
console.log(`globe-lines.bin: ${coast.length} coast + ${borders.length} border lines, ${kb(linesBuf)}`);
for (const { reg, layers, buf } of regionBufs) console.log(`${reg.file}: ${layers.map((l) => l.length).join(' / ')} lines, ${kb(buf)}`);
