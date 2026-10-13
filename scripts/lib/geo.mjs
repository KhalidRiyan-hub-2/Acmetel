// Small geometry + binary helpers shared by the globe data build scripts.

// Douglas–Peucker in degrees (fine at the tolerances used here).
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      // Closed rings start and end on the same point: fall back to distance from that point.
      const d = len < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export const lineLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

// Regional files: [f32 lon0, lon1, lat0, lat1] then the same layout with Uint16 coordinates relative to that box.
export function encodeBoxed(layers, b) {
  const q = layers.map((lines) => lines.map((l) => l.map(([x, y]) => [
    // Clamped: a value outside the box would wrap around in a Uint16.
    Math.min(65535, Math.max(0, Math.round(((x - b.lon0) / (b.lon1 - b.lon0)) * 65535))),
    Math.min(65535, Math.max(0, Math.round(((y - b.lat0) / (b.lat1 - b.lat0)) * 65535))),
  ])));
  return Buffer.concat([Buffer.from(new Float32Array([b.lon0, b.lon1, b.lat0, b.lat1]).buffer), encode(q, Uint16Array, 1)]);
}

export function encode(layers, Type, scale) {
  const counts = [layers.length];
  let verts = 0;
  for (const lines of layers) { counts.push(lines.length); for (const l of lines) { counts.push(l.length); verts += l.length; } }
  const head = new Uint32Array(counts);
  const body = new Type(verts * 2);
  let k = 0;
  for (const lines of layers) for (const l of lines) for (const [x, y] of l) { body[k++] = Math.round(x * scale * 1e6) / 1e6; body[k++] = Math.round(y * scale * 1e6) / 1e6; }
  return Buffer.concat([Buffer.from(head.buffer), Buffer.from(body.buffer)]);
}

// Liang–Barsky: the part of segment p→q inside the box, as [t0, t1], or null.
function clipSeg(p, q, B) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  for (const [pp, qq] of [[-dx, p[0] - B.lon0], [dx, B.lon1 - p[0]], [-dy, p[1] - B.lat0], [dy, B.lat1 - p[1]]]) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
// Runs of an open (or box-crossing) chain that lie inside the box. Each run starts and ends on the box edge
// unless the chain itself starts/ends inside.
export function clipPolyline(pts, B) {
  const runs = [];
  let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const c = clipSeg(pts[i], pts[i + 1], B);
    if (!c) { if (cur) { runs.push(cur); cur = null; } continue; }
    const a = lerp(pts[i], pts[i + 1], c[0]), b = lerp(pts[i], pts[i + 1], c[1]);
    if (!cur) cur = [a];
    cur.push(b);
    if (c[1] < 1) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}
