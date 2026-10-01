// Live-network data for the homepage "Live network" band.
// IMPORTANT: every value here is SIMULATED (a random walk around the base values below).
// The UI labels both panels "Simulated preview". To wire a real API, replace the generator inside
// `subscribe()` (the setInterval body) with a fetch/WebSocket that calls the same callbacks with the
// same `LiveSample` shape. Nothing else in the components needs to change.

export type Network = '5G' | '4G';
export interface Destination { city: string; country: string; lat: number; lon: number; network: Network; plan: string }
export interface LatLon { lat: number; lon: number }
export interface LiveSample { uptime: number; latencyMs: number; msgsPerSec: number; activeTravelers: number }

export const live = {
  heartbeat: {
    status: 'Operational',
    uptime: { base: 99.99, jitter: 0.008 },
    latencyMs: { base: 42, jitter: 6 },
    msgsPerSec: { base: 3200, jitter: 420 },
    bpm: 52,
  },
  radar: {
    origin: { city: 'Karachi', lat: 24.8607, lon: 67.0011 },
    initialTravelers: 1240,
    destinations: [
      { city: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278, network: '5G', plan: '10 GB · 30 days' },
      { city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708, network: '5G', plan: '5 GB · 15 days' },
      { city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, network: '4G', plan: '5 GB · 15 days' },
      { city: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.531, network: '5G', plan: '3 GB · 7 days' },
      { city: 'Istanbul', country: 'Türkiye', lat: 41.0082, lon: 28.9784, network: '4G', plan: '10 GB · 30 days' },
      { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, network: '5G', plan: '20 GB · 30 days' },
      { city: 'New York', country: 'United States', lat: 40.7128, lon: -74.006, network: '5G', plan: '20 GB · 30 days' },
      { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, network: '5G', plan: '10 GB · 15 days' },
      { city: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, network: '5G', plan: '5 GB · 15 days' },
      { city: 'Bangkok', country: 'Thailand', lat: 13.7563, lon: 100.5018, network: '4G', plan: '10 GB · 30 days' },
      { city: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lon: 101.6869, network: '4G', plan: '5 GB · 15 days' },
      { city: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219, network: '4G', plan: '3 GB · 7 days' },
      { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357, network: '4G', plan: '5 GB · 15 days' },
      { city: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473, network: '4G', plan: '10 GB · 30 days' },
      { city: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832, network: '5G', plan: '10 GB · 30 days' },
      { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093, network: '5G', plan: '20 GB · 30 days' },
    ] as Destination[],
  },
};

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle initial bearing (degrees clockwise from north, 0-360) and distance (km) from origin to dest. */
export function bearingDistance(origin: LatLon, dest: LatLon): { bearing: number; distanceKm: number } {
  const φ1 = rad(origin.lat), φ2 = rad(dest.lat), Δλ = rad(dest.lon - origin.lon), Δφ = φ2 - φ1;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distanceKm = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  return { bearing, distanceKm };
}

export interface BlipPos { x: number; y: number; angle: number }

/**
 * Radar layout: angle = bearing, radius = log-scaled distance. Positions are normalised (0-1 across the square
 * radar, centre 0.5/0.5). A small relaxation pass nudges blips that would overlap (e.g. London/Paris,
 * Singapore/Kuala Lumpur) so each stays clickable. `angle` is radians clockwise from north of the FINAL
 * position, which is what the sweep uses to light the blip.
 */
export function radarLayout(): BlipPos[] {
  const { origin, destinations } = live.radar;
  const maxR = 0.42, minR = 0.12;
  const pts = destinations.map((d) => {
    const { bearing, distanceKm } = bearingDistance(origin, d);
    const t = Math.min(1, Math.max(0, Math.log(distanceKm / 900) / Math.log(13000 / 900)));
    const r = minR + (maxR - minR) * t;
    const a = rad(bearing);
    return { x: r * Math.sin(a), y: -r * Math.cos(a) }; // screen coords relative to centre (north = up)
  });
  const minDist = 0.085;
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      const d = Math.hypot(dx, dy) || 1e-6;
      if (d < minDist) {
        const push = (minDist - d) / 2, ux = dx / d, uy = dy / d;
        pts[i].x -= ux * push; pts[i].y -= uy * push; pts[j].x += ux * push; pts[j].y += uy * push;
      }
    }
  }
  return pts.map((p) => ({
    x: 0.5 + p.x,
    y: 0.5 + p.y,
    angle: (Math.atan2(p.x, -p.y) + Math.PI * 2) % (Math.PI * 2),
  }));
}

// ---- Simulated feed ----------------------------------------------------------------------------
const subscribers = new Set<(s: LiveSample) => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let travelers = live.radar.initialTravelers;
let dev = { uptime: 0, latency: 0, msgs: 0 }; // normalised deviation in [-1, 1]

const walk = (v: number, pull = 0.12, step = 0.35) => Math.max(-1, Math.min(1, v * (1 - pull) + (Math.random() * 2 - 1) * step));

function sample(): LiveSample {
  const h = live.heartbeat;
  dev = { uptime: walk(dev.uptime), latency: walk(dev.latency), msgs: walk(dev.msgs) };
  if (Math.random() < 0.55) travelers += 1 + (Math.random() < 0.2 ? 1 : 0);
  return {
    uptime: Math.min(100, h.uptime.base + dev.uptime * h.uptime.jitter),
    latencyMs: h.latencyMs.base + dev.latency * h.latencyMs.jitter,
    msgsPerSec: h.msgsPerSec.base + dev.msgs * h.msgsPerSec.jitter,
    activeTravelers: travelers,
  };
}

/** Emits a sample immediately (async) and then every ~1.5s. Returns an unsubscribe function. */
export function subscribe(cb: (s: LiveSample) => void): () => void {
  subscribers.add(cb);
  setTimeout(() => { if (subscribers.has(cb)) cb(sample()); }, 0);
  if (!timer) {
    // === Replace this generator with a real API call to go live. ===
    timer = setInterval(() => { const s = sample(); subscribers.forEach((fn) => fn(s)); }, 1500);
  }
  return () => {
    subscribers.delete(cb);
    if (!subscribers.size && timer) { clearInterval(timer); timer = undefined; }
  };
}
