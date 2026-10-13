// Geography for the hero globe. All coordinates are approximate city/landmark locations.
import { Vector3 } from 'three';
import regionConfig from './globe-regions.json';

export interface GeoPoint { name: string; lat: number; lon: number }
export interface Box { lon0: number; lon1: number; lat0: number; lat1: number }

/** Focus point: the view the globe settles on, and where the pulsing marker + HTML label sit. */
export const focus = { lat: 30.4, lon: 69.3, label: 'Pakistan · Core network' };

export const markets: GeoPoint[] = [
  { name: 'UAE (Dubai)', lat: 25.2, lon: 55.27 },
  { name: 'Saudi Arabia (Riyadh)', lat: 24.71, lon: 46.68 },
  { name: 'Oman (Muscat)', lat: 23.59, lon: 58.41 },
  { name: 'Kenya (Nairobi)', lat: -1.29, lon: 36.82 },
  { name: 'Nigeria (Lagos)', lat: 6.52, lon: 3.38 },
  { name: 'South Africa (Johannesburg)', lat: -26.2, lon: 28.05 },
  { name: 'United Kingdom (London)', lat: 51.51, lon: -0.13 },
];

/**
 * Pakistan–China terrestrial route, in order.
 * PLACEHOLDER: the client copy says the fiber "connects Pakistan and China" but does not name the waypoints;
 * confirm this routing (Karachi → Islamabad → Khunjerab Pass → Kashgar → Urumqi) with the client.
 */
export const chinaRoute: GeoPoint[] = [
  { name: 'Karachi', lat: 24.86, lon: 67.01 },
  { name: 'Islamabad', lat: 33.68, lon: 73.05 },
  { name: 'Khunjerab Pass', lat: 36.85, lon: 75.42 },
  { name: 'Kashgar', lat: 39.47, lon: 75.99 },
  { name: 'Urumqi', lat: 43.83, lon: 87.62 },
];

/** High-detail layers (see globe-regions.json; built by scripts/build-globe-data.mjs and build-osm-dubai.mjs). */
export const regions = regionConfig.regions as { id: string; file: string; box: Box }[];
export const osmRegion = regionConfig.osm as { id: string; file: string; box: Box };

/**
 * Zoom destinations as a tree. Flights between any two stops go up to their common parent and back down.
 * `alt` is camera height above the surface in globe radii; `tilt` (radians) leans the camera south so the
 * horizon comes into view at city level. `via` makes the flight from the parent follow those points
 * (the China leg follows the terrestrial route). `region` names the detail layer to fetch on the way in.
 * Captions use only client-copy facts (content/source/*.md); stops the copy doesn't mention get geography only.
 */
export interface Stop {
  id: string; label: string; parent: string | null; lat: number; lon: number; alt: number; tilt: number; caption: string;
  region?: string; osm?: boolean; via?: [number, number][]; pick?: number;
}
export const stops: Stop[] = [
  { id: 'global', label: 'Global', parent: null, lat: focus.lat, lon: focus.lon, alt: 3.8, tilt: 0,
    caption: 'Core network in Pakistan, with markets across the GCC, Africa and the UK.' },

  { id: 'uae', label: 'UAE', parent: 'global', lat: 24.4, lon: 54.6, alt: 0.62, tilt: 0.2, region: 'gulf', pick: 7,
    caption: 'United Arab Emirates: part of the GCC footprint for Acmetel voice and messaging.' },
  // PLACEHOLDER: the client copy only places Acmetel in "GCC destinations"; confirm what Dubai is to Acmetel
  // (office, hub, partner base) before this caption says more than geography.
  { id: 'dubai', label: 'Dubai', parent: 'uae', lat: 25.2, lon: 55.27, alt: 0.032, tilt: 1.0, region: 'gulf', osm: true, pick: 0.9,
    caption: 'Dubai, United Arab Emirates. 25.20°N, 55.27°E.' },

  { id: 'pakistan', label: 'Pakistan', parent: 'global', lat: 30.2, lon: 69.6, alt: 0.62, tilt: 0.2, region: 'route', pick: 8,
    caption: 'Pakistan: Acmetel’s core network, and the start of the Pakistan–China terrestrial fiber.' },
  // PLACEHOLDER: the client copy doesn't mention these cities; captions are geography only until confirmed.
  { id: 'lahore', label: 'Lahore', parent: 'pakistan', lat: 31.55, lon: 74.34, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.2,
    caption: 'Lahore, Pakistan. 31.55°N, 74.34°E.' },
  { id: 'islamabad', label: 'Islamabad', parent: 'pakistan', lat: 33.68, lon: 73.05, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.2,
    caption: 'Islamabad, Pakistan. 33.68°N, 73.05°E.' },
  { id: 'karachi', label: 'Karachi', parent: 'pakistan', lat: 24.86, lon: 67.01, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.2,
    caption: 'Karachi, Pakistan. 24.86°N, 67.01°E.' },
  { id: 'china', label: 'China', parent: 'pakistan', lat: 38.4, lon: 79.2, alt: 0.6, tilt: 0.28, region: 'route', pick: 4,
    via: [[33.68, 73.05], [36.85, 75.42], [39.47, 75.99]],
    caption: 'The Pakistan–China terrestrial fiber: high-capacity routes connecting regional networks through Pakistan and China.' },
  { id: 'kashgar', label: 'Kashgar', parent: 'china', lat: 39.47, lon: 75.99, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.5,
    caption: 'Kashgar, China. 39.47°N, 75.99°E.' },
  { id: 'urumqi', label: 'Urumqi', parent: 'china', lat: 43.83, lon: 87.62, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.5,
    caption: 'Urumqi, China. 43.83°N, 87.62°E.' },

  // PLACEHOLDER: confirm Acmetel's US presence with the client. The client copy says nothing about the US.
  { id: 'us', label: 'United States', parent: 'global', lat: 39, lon: -97.5, alt: 1.25, tilt: 0.15, region: 'usa', pick: 14,
    caption: 'United States. 39.0°N, 97.5°W.' },
];
export const stopById = Object.fromEntries(stops.map((s) => [s.id, s])) as Record<string, Stop>;
export const childrenOf = (id: string) => stops.filter((s) => s.parent === id);
export const pathTo = (id: string): Stop[] => { const out: Stop[] = []; for (let s: Stop | undefined = stopById[id]; s; s = s.parent ? stopById[s.parent] : undefined) out.unshift(s); return out; };

/**
 * HTML tags that follow points on the globe. `z` is the range of zoom level where each shows
 * (0 = orbit, 1 = country, 2 = city; derived from camera altitude). `near` limits a tag to when the camera
 * is within that many degrees of the point.
 */
export interface Tag { id: string; kind: 'pill' | 'country' | 'city' | 'city-major' | 'waypoint'; text: string; lat: number; lon: number; z: readonly [number, number]; near?: number }
const city = (id: string, text: string, lat: number, lon: number, z: readonly [number, number] = [0.75, 1.45]): Tag => ({ id, kind: 'city', text, lat, lon, z });
const major = (id: string, text: string, lat: number, lon: number): Tag => ({ id: `${id}-major`, kind: 'city-major', text, lat, lon, z: [1.4, 2.4], near: 1.2 });
export const tags: Tag[] = [
  { id: 'core', kind: 'pill', text: focus.label, lat: focus.lat, lon: focus.lon, z: [-1, 0.3] },
  { id: 'uae', kind: 'country', text: 'United Arab Emirates', lat: 23.55, lon: 53.9, z: [0.55, 1.4] },
  { id: 'pakistan', kind: 'country', text: 'Pakistan', lat: 28.6, lon: 66.2, z: [0.55, 1.35] },
  { id: 'china', kind: 'country', text: 'China', lat: 41.3, lon: 82.6, z: [0.6, 1.35] },
  { id: 'us', kind: 'country', text: 'United States', lat: 40.5, lon: -100, z: [0.4, 1.4] },
  major('dubai', 'Dubai', 25.2, 55.27),
  city('abu-dhabi', 'Abu Dhabi', 24.45, 54.38, [0.75, 2.4]),
  city('sharjah', 'Sharjah', 25.35, 55.42, [1.45, 2.4]),
  city('muscat', 'Muscat', 23.59, 58.41),
  city('doha', 'Doha', 25.29, 51.53),
  city('dubai', 'Dubai', 25.2, 55.27, [0.6, 1.4]),
  city('karachi', 'Karachi', 24.86, 67.01, [0.6, 1.4]), major('karachi', 'Karachi', 24.86, 67.01),
  city('islamabad', 'Islamabad', 33.68, 73.05, [0.6, 1.4]), major('islamabad', 'Islamabad', 33.68, 73.05),
  city('lahore', 'Lahore', 31.55, 74.34, [0.6, 1.4]), major('lahore', 'Lahore', 31.55, 74.34),
  { id: 'khunjerab', kind: 'waypoint', text: 'Khunjerab Pass', lat: 36.85, lon: 75.42, z: [0.6, 2.4] },
  { id: 'kashgar', kind: 'waypoint', text: 'Kashgar', lat: 39.47, lon: 75.99, z: [0.6, 1.4] }, major('kashgar', 'Kashgar', 39.47, 75.99),
  { id: 'urumqi', kind: 'waypoint', text: 'Urumqi', lat: 43.83, lon: 87.62, z: [0.6, 1.4] }, major('urumqi', 'Urumqi', 43.83, 87.62),
];

/** City-level stops: drawn as markers with range rings once the camera is low over them. */
export const cityStops = stops.filter((s) => s.alt < 0.2);

/** Smaller cities, drawn as faint points once the camera is low enough to need them. */
export const regionCities: GeoPoint[] = [
  { name: 'Abu Dhabi', lat: 24.45, lon: 54.38 }, { name: 'Sharjah', lat: 25.35, lon: 55.42 }, { name: 'Ajman', lat: 25.41, lon: 55.51 },
  { name: 'Ras Al Khaimah', lat: 25.8, lon: 55.98 }, { name: 'Fujairah', lat: 25.13, lon: 56.33 }, { name: 'Al Ain', lat: 24.21, lon: 55.74 },
  { name: 'Umm Al Quwain', lat: 25.56, lon: 55.55 },
  { name: 'Rawalpindi', lat: 33.6, lon: 73.04 }, { name: 'Faisalabad', lat: 31.42, lon: 73.08 }, { name: 'Multan', lat: 30.2, lon: 71.47 },
  { name: 'Hyderabad', lat: 25.4, lon: 68.37 }, { name: 'Peshawar', lat: 34.01, lon: 71.58 }, { name: 'Quetta', lat: 30.18, lon: 66.98 },
  { name: 'Gujranwala', lat: 32.19, lon: 74.19 }, { name: 'Gilgit', lat: 35.92, lon: 74.31 },
  { name: 'Hotan', lat: 37.11, lon: 79.92 }, { name: 'Aksu', lat: 41.17, lon: 80.26 }, { name: 'Turpan', lat: 42.95, lon: 89.19 },
];

/** Major world cities as faint context points (geography only, not Acmetel locations). */
export const worldCities: GeoPoint[] = [
  { name: 'Cairo', lat: 30.04, lon: 31.24 }, { name: 'Istanbul', lat: 41.01, lon: 28.98 }, { name: 'Tehran', lat: 35.69, lon: 51.39 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 }, { name: 'Mumbai', lat: 19.08, lon: 72.88 }, { name: 'Dhaka', lat: 23.81, lon: 90.41 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 }, { name: 'Hong Kong', lat: 22.32, lon: 114.17 }, { name: 'Shanghai', lat: 31.23, lon: 121.47 },
  { name: 'Beijing', lat: 39.9, lon: 116.41 }, { name: 'Tokyo', lat: 35.68, lon: 139.69 }, { name: 'Jakarta', lat: -6.2, lon: 106.85 },
  { name: 'Paris', lat: 48.86, lon: 2.35 }, { name: 'Frankfurt', lat: 50.11, lon: 8.68 }, { name: 'Madrid', lat: 40.42, lon: -3.7 },
  { name: 'Moscow', lat: 55.76, lon: 37.62 }, { name: 'Addis Ababa', lat: 9.03, lon: 38.74 }, { name: 'Kinshasa', lat: -4.44, lon: 15.27 },
  { name: 'Casablanca', lat: 33.57, lon: -7.59 }, { name: 'Accra', lat: 5.6, lon: -0.19 }, { name: 'Dar es Salaam', lat: -6.79, lon: 39.21 },
  { name: 'Lahore', lat: 31.55, lon: 74.34 }, { name: 'Kuwait City', lat: 29.38, lon: 47.98 }, { name: 'Doha', lat: 25.29, lon: 51.53 },
  { name: 'Manama', lat: 26.23, lon: 50.59 }, { name: 'Jeddah', lat: 21.49, lon: 39.19 }, { name: 'Baghdad', lat: 33.31, lon: 44.36 },
  { name: 'Tashkent', lat: 41.3, lon: 69.24 }, { name: 'Almaty', lat: 43.24, lon: 76.89 }, { name: 'Colombo', lat: 6.93, lon: 79.86 },
  { name: 'New York', lat: 40.71, lon: -74.01 }, { name: 'Chicago', lat: 41.88, lon: -87.63 }, { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Houston', lat: 29.76, lon: -95.37 }, { name: 'Atlanta', lat: 33.75, lon: -84.39 }, { name: 'Seattle', lat: 47.61, lon: -122.33 },
  { name: 'Dallas', lat: 32.78, lon: -96.8 }, { name: 'Miami', lat: 25.76, lon: -80.19 }, { name: 'Washington', lat: 38.91, lon: -77.04 },
];

/** Lat/lon in degrees to a point on a sphere of radius r, y up. Lon 0 faces +x, lon 90E faces -z. */
export function latLonToVec3(lat: number, lon: number, r = 1): Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}
