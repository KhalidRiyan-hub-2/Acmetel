// Generates public/data/land-dots.bin: unit-sphere xyz (y up) Float32 triples for points on a
// Fibonacci sphere that fall on land. Run with `npm run build:globe-data`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);
const geoms = land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry ?? land];

// polygons: [{ rings: [[ [lon,lat],... ], ...], bbox }]
const polys = [];
for (const g of geoms) {
  const list = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const rings of list) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    polys.push({ rings, bbox: [minX, minY, maxX, maxY] });
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
  for (const p of polys) {
    const [a, b, c, d] = p.bbox;
    if (lon < a || lon > c || lat < b || lat > d) continue;
    if (!inRing(lon, lat, p.rings[0])) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length; k++) if (inRing(lon, lat, p.rings[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

const N = Number(process.env.GLOBE_POINTS ?? 46000);
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const r = Math.sqrt(1 - y * y);
  const th = golden * i;
  const x = Math.cos(th) * r, z = Math.sin(th) * r;
  const lat = (Math.asin(y) * 180) / Math.PI;
  if (lat < -60) continue; // drop Antarctica
  const lon = (Math.atan2(-z, x) * 180) / Math.PI; // inverse of latLonToVec3 in src/data/globe.ts
  if (onLand(lon, lat)) out.push(x, y, z);
}
mkdirSync('public/data', { recursive: true });
const arr = new Float32Array(out);
writeFileSync('public/data/land-dots.bin', Buffer.from(arr.buffer));
console.log(`land-dots.bin: ${arr.length / 3} points, ${arr.byteLength} bytes`);
