// Build-time land map for the traveller radar, in the spirit of the UN emblem: a flat azimuthal world disc.
// Natural Earth 110m land (world-atlas) projected with `radarProject`, so continents line up with the blips.
// Imported only from component frontmatter: never ships to the client.
import land from 'world-atlas/land-110m.json';
import { radarProject } from './live';

interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: { land: { geometries: { arcs: number[][][] }[] } };
}

const SIZE = 1000; // viewBox edge; centre at SIZE / 2

/** SVG path data (viewBox 0 0 1000 1000) for every land polygon except Antarctica, which the UN map omits too. */
export function radarLandPath(): string {
  const topo = land as unknown as Topology;
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  // Decode delta-quantised arcs to [lon, lat].
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] as [number, number]; });
  });
  const ring = (ids: number[]) => ids.flatMap((id, i) => {
    const pts = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
    return i ? pts.slice(1) : pts;
  });

  let d = '';
  for (const geom of topo.objects.land.geometries) {
    for (const polygon of geom.arcs) {
      const rings = polygon.map(ring);
      if (Math.max(...rings[0].map(([, lat]) => lat)) < -60) continue;
      for (const r of rings) {
        let last = '';
        r.forEach(([lon, lat], i) => {
          const { x, y } = radarProject({ lat, lon });
          const pt = `${Math.round((0.5 + x) * SIZE)} ${Math.round((0.5 + y) * SIZE)}`; // 1 unit ≈ 0.5px at the radar's max width
          if (pt === last) return;
          d += (i ? 'L' : 'M') + pt;
          last = pt;
        });
        d += 'Z';
      }
    }
  }
  return d;
}
