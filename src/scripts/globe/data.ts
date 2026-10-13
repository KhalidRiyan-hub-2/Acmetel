// Decoders for the binary geography written by scripts/build-globe-data.mjs.

/** [lon, lat] pairs per line, in degrees. */
export type Lines = Float32Array[];

/** Land dots: Int16 [lon, lat] × 100 → unit-sphere xyz (same convention as latLonToVec3). */
export function decodeDots(buf: ArrayBuffer, r = 1): Float32Array {
  const src = new Int16Array(buf);
  const out = new Float32Array((src.length / 2) * 3);
  for (let i = 0, j = 0; i < src.length; i += 2, j += 3) {
    const lam = (src[i] / 100) * (Math.PI / 180);
    const phi = (src[i + 1] / 100) * (Math.PI / 180);
    out[j] = r * Math.cos(phi) * Math.cos(lam);
    out[j + 1] = r * Math.sin(phi);
    out[j + 2] = -r * Math.cos(phi) * Math.sin(lam);
  }
  return out;
}

/** Line layers. `float` selects the Float32 (regional) encoding instead of Int16 × 100 (world). */
export function decodeLines(buf: ArrayBuffer, float: boolean): Lines[] {
  const head = new Uint32Array(buf);
  let h = 0;
  const layerCount = head[h++];
  const shapes: number[][] = [];
  for (let l = 0; l < layerCount; l++) {
    const n = head[h++];
    const lens: number[] = [];
    for (let i = 0; i < n; i++) lens.push(head[h++]);
    shapes.push(lens);
  }
  const offset = h * 4;
  const body = float ? new Float32Array(buf, offset) : new Int16Array(buf, offset);
  const scale = float ? 1 : 1 / 100;
  let k = 0;
  return shapes.map((lens) => lens.map((len) => {
    const line = new Float32Array(len * 2);
    for (let i = 0; i < len * 2; i++) line[i] = body[k++] * scale;
    return line;
  }));
}

/** Polylines → LineSegments positions on a sphere of radius r. */
export function linesToSegments(lines: Lines, r: number): Float32Array {
  let n = 0;
  for (const l of lines) n += Math.max(0, l.length / 2 - 1);
  const out = new Float32Array(n * 6);
  let j = 0;
  const put = (lon: number, lat: number) => {
    const lam = (lon * Math.PI) / 180, phi = (lat * Math.PI) / 180;
    out[j++] = r * Math.cos(phi) * Math.cos(lam);
    out[j++] = r * Math.sin(phi);
    out[j++] = -r * Math.cos(phi) * Math.sin(lam);
  };
  for (const l of lines) {
    for (let i = 0; i + 3 < l.length; i += 2) { put(l[i], l[i + 1]); put(l[i + 2], l[i + 3]); }
  }
  return out;
}

/**
 * Regional files: [f32 lon0, lon1, lat0, lat1] then the line layout with Uint16 coordinates relative to that
 * box (scripts/lib/geo.mjs encodeBoxed). Returns degrees.
 */
export function decodeBoxed(buf: ArrayBuffer): Lines[] {
  const [lon0, lon1, lat0, lat1] = new Float32Array(buf, 0, 4);
  const head = new Uint32Array(buf, 16);
  let h = 0;
  const layerCount = head[h++];
  const shapes: number[][] = [];
  for (let l = 0; l < layerCount; l++) {
    const n = head[h++];
    const lens: number[] = [];
    for (let i = 0; i < n; i++) lens.push(head[h++]);
    shapes.push(lens);
  }
  const body = new Uint16Array(buf, 16 + h * 4);
  const sx = (lon1 - lon0) / 65535, sy = (lat1 - lat0) / 65535;
  let k = 0;
  return shapes.map((lens) => lens.map((len) => {
    const line = new Float32Array(len * 2);
    for (let i = 0; i < len; i++) { line[i * 2] = lon0 + body[k++] * sx; line[i * 2 + 1] = lat0 + body[k++] * sy; }
    return line;
  }));
}

/** Drop the segments of closed rings that run along a box edge (they close land polygons; they aren't coast). */
export function ringsToCoast(rings: Lines, box: { lon0: number; lon1: number; lat0: number; lat1: number }): Lines {
  const e = 1e-4;
  const edge = (x0: number, y0: number, x1: number, y1: number) =>
    (Math.abs(x0 - box.lon0) < e && Math.abs(x1 - box.lon0) < e) || (Math.abs(x0 - box.lon1) < e && Math.abs(x1 - box.lon1) < e) ||
    (Math.abs(y0 - box.lat0) < e && Math.abs(y1 - box.lat0) < e) || (Math.abs(y0 - box.lat1) < e && Math.abs(y1 - box.lat1) < e);
  const out: Lines = [];
  for (const r of rings) {
    let cur: number[] = [];
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (edge(r[i * 2], r[i * 2 + 1], r[j * 2], r[j * 2 + 1])) { if (cur.length > 2) out.push(new Float32Array(cur)); cur = []; continue; }
      if (!cur.length) cur.push(r[i * 2], r[i * 2 + 1]);
      cur.push(r[j * 2], r[j * 2 + 1]);
    }
    if (cur.length > 2) out.push(new Float32Array(cur));
  }
  return out;
}
