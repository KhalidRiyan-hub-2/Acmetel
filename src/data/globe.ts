// Geography for the hero globe. All coordinates are approximate city/landmark locations.
import { Vector3 } from 'three';
import regionConfig from './globe-regions.json';

export interface GeoPoint { name: string; lat: number; lon: number }
export interface Box { lon0: number; lon1: number; lat0: number; lat1: number }

/** Focus point: the view the globe settles on, and where the pulsing marker + HTML label sit. */
export const focus = { lat: 30.4, lon: 69.3, label: 'Pakistan, core network' };

/**
 * Network arcs: animated links that start at Acmetel FZC headquarters (Ras Al Khaimah, same point as the `rak-office`
 * stop) and branch out to Lahore and to Acmetel USA LLC (Oakbrook Terrace, Illinois, same point as `us-office`).
 * Illustrative links between these locations, not specific network routes.
 */
export const arcOrigin: GeoPoint = { name: 'Acmetel FZC, Ras Al Khaimah', lat: 25.6747019, lon: 55.7782595 };
export const arcLinks: GeoPoint[] = [
  { name: 'Lahore, Pakistan', lat: 31.55, lon: 74.34 },
  { name: 'Acmetel USA LLC, Oakbrook Terrace, Illinois', lat: 41.849514, lon: -87.974663 },
];

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
 * Street-level city layers (OpenStreetMap, built by scripts/build-osm-cities.mjs). Drawn in a local frame around
 * `anchor` (metres, so they stay precise down to rooftop height). Dubai also has 3D buildings around the anchor.
 */
export interface CityLayer {
  id: string; file: string; buildingsFile?: string; anchor: { lat: number; lon: number }; box: Box; minorBox: Box; buildingsBox?: Box;
  landmarkWays?: number[]; skipWater?: number[]; lake?: { relation: number; waterAt: [number, number] };
}
export const cityLayers = regionConfig.cities as CityLayer[];

/**
 * Zoom destinations as a tree. Flights between any two stops go up to their common parent and back down.
 * `alt` is the camera's distance from the point it looks at, in globe radii; `tilt` (radians) leans the camera
 * south so the horizon comes into view at city level. `elev` (metres) raises that point above the ground (to
 * look at a tower rather than its base) and `head` (radians) turns the camera around it. `via` makes the flight
 * from the parent follow those points (the China leg follows the terrestrial route). `region` names the detail
 * layers and `city` the street-level layer to fetch on the way in. `office` marks an Acmetel office (light column
 * and pulse on the ground in the scene, office chip in the controls).
 * Captions use only client-copy facts (content/source/*.md); stops the copy doesn't mention get geography only.
 */
export interface Stop {
  id: string; label: string; parent: string | null; lat: number; lon: number; alt: number; tilt: number; caption: string;
  region?: string | string[]; osm?: boolean; city?: string; elev?: number; head?: number; via?: [number, number][]; pick?: number;
  office?: boolean;
}
export const stops: Stop[] = [
  { id: 'global', label: 'Global', parent: null, lat: focus.lat, lon: focus.lon, alt: 3.8, tilt: 0,
    caption: 'Core network in Pakistan, with markets across the GCC, Africa and the UK.' },

  { id: 'uae', label: 'UAE', parent: 'global', lat: 24.4, lon: 54.6, alt: 0.62, tilt: 0.2, region: 'gulf', pick: 7,
    caption: 'United Arab Emirates: part of the GCC footprint for Acmetel voice and messaging.' },
  // PLACEHOLDER: the client copy only places Acmetel in "GCC destinations"; confirm what Dubai is to Acmetel
  // (office, hub, partner base) before this caption says more than geography.
  { id: 'dubai', label: 'Dubai', parent: 'uae', lat: 25.2, lon: 55.27, alt: 0.016, tilt: 1.0, region: 'gulf', osm: true, city: 'dubai', pick: 0.9,
    caption: 'Dubai, United Arab Emirates (25.20°N, 55.27°E)' },
  // Street level, from OpenStreetMap: Downtown's 3D skyline, then up to the top of the Burj Khalifa.
  // PLACEHOLDER: geography only, like Dubai above; the client copy says nothing about these places.
  { id: 'downtown', label: 'Downtown Dubai', parent: 'dubai', lat: 25.2, lon: 55.276, alt: 0.0007, tilt: 1.12, elev: 120, head: 0.35,
    region: 'gulf', osm: true, city: 'dubai', pick: 0.08,
    caption: 'Downtown Dubai, United Arab Emirates (25.20°N, 55.28°E)' },
  { id: 'burj', label: 'Burj Khalifa', parent: 'downtown', lat: 25.19719, lon: 55.27437, alt: 0.000185, tilt: 1.22, elev: 680, head: 0.5,
    region: 'gulf', osm: true, city: 'dubai', pick: 0.02,
    caption: 'Burj Khalifa, Dubai: 828 m (25.20°N, 55.27°E)' },
  // Geography only: Ras Al Khaimah, framed to take in both the city and Al Hamra, where the headquarters is.
  { id: 'rak', label: 'Ras Al Khaimah', parent: 'uae', lat: 25.72, lon: 55.86, alt: 0.012, tilt: 1.0, region: 'gulf', city: 'rak', pick: 0.9,
    caption: 'Ras Al Khaimah, United Arab Emirates (25.72°N, 55.86°E)' },
  // Acmetel FZC headquarters (content/source/offices.md: RAKN-320, RAKEEN, Al Hamra Industrial Zone-FZ, Ras Al
  // Khaimah (Business Center – 4, RAK FTZ, P.O. Box 16337)). Geocoded from OpenStreetMap (Nominatim + Overpass,
  // 2026-10-15): the zone is mapped (Al Hamra Free Zone, boundary relation 18471816), but no "RAKEEN", "RAKN-320" or
  // "Business Center 4" exists in OSM, so this is an address-level point: the RAKEZ Service Center Al Hamra (node
  // 5501227922, 25.6747019°N 55.7782595°E), the free-zone authority's own office in the zone. Nothing says Business
  // Center 4 is that building, so no footprint is highlighted.
  // PLACEHOLDER: replace with the Business Center 4 building once its location is confirmed.
  { id: 'rak-office', label: 'Acmetel HQ', parent: 'rak', office: true, lat: 25.6747019, lon: 55.7782595, alt: 0.00013, tilt: 1.1,
    elev: 55, head: 0.5, region: 'gulf', city: 'rak', pick: 0.3,
    caption: 'Acmetel FZC: RAKN-320, RAKEEN, Al Hamra Industrial Zone-FZ, Ras Al Khaimah (Business Center – 4, RAK FTZ, P.O. Box 16337).' },

  { id: 'pakistan', label: 'Pakistan', parent: 'global', lat: 30.2, lon: 69.6, alt: 0.62, tilt: 0.2, region: 'route', pick: 8,
    caption: 'Pakistan: Acmetel’s core network, and the start of the Pakistan–China terrestrial fiber.' },
  // PLACEHOLDER: the client copy doesn't mention these cities; captions are geography only until confirmed.
  { id: 'lahore', label: 'Lahore', parent: 'pakistan', lat: 31.53, lon: 74.35, alt: 0.008, tilt: 1.0, region: 'route', city: 'lahore', pick: 1.2,
    caption: 'Lahore, Pakistan (31.55°N, 74.34°E)' },
  { id: 'islamabad', label: 'Islamabad', parent: 'pakistan', lat: 33.68, lon: 73.05, alt: 0.011, tilt: 1.0, region: 'route', city: 'islamabad', pick: 1.2,
    caption: 'Islamabad, Pakistan (33.68°N, 73.05°E), home of Acmetel’s office in I-8 Markaz.' },
  // Acmetel's Pakistan office (content/source/offices.md: Office 01, First Floor, VIP Square, I-8 Markaz, Islamabad).
  // Geocoded from OpenStreetMap (Overpass + Nominatim, 2026-10-14): no "VIP Square" exists in OSM (I-8 Markaz has a
  // "VIP Plaza", way 556437799, but nothing says it is the same building), so this is an address-level point: the
  // centre of the I-8 Markaz commercial block (way 568907931), 33.66786°N 73.07452°E. No footprint is highlighted.
  // PLACEHOLDER: replace with the VIP Square building once its location is confirmed.
  { id: 'islamabad-office', label: 'Acmetel office', parent: 'islamabad', office: true, lat: 33.66786, lon: 73.07452, alt: 0.00013, tilt: 1.1,
    elev: 55, head: 0.55, region: 'route', city: 'islamabad', pick: 0.3,
    caption: 'Acmetel office, Pakistan: Office 01, First Floor, VIP Square, I-8 Markaz, Islamabad.' },
  { id: 'karachi', label: 'Karachi', parent: 'pakistan', lat: 24.86, lon: 67.01, alt: 0.07, tilt: 1.05, region: 'route', pick: 1.2,
    caption: 'Karachi, Pakistan (24.86°N, 67.01°E)' },
  { id: 'china', label: 'China', parent: 'pakistan', lat: 38.4, lon: 79.2, alt: 0.6, tilt: 0.28, region: ['route', 'china'], pick: 4,
    via: [[33.68, 73.05], [36.85, 75.42], [39.47, 75.99]],
    caption: 'The Pakistan–China terrestrial fiber: high-capacity routes connecting regional networks through Pakistan and China.' },
  { id: 'kashgar', label: 'Kashgar', parent: 'china', lat: 39.47, lon: 75.99, alt: 0.07, tilt: 1.05, region: ['route', 'china'], pick: 1.5,
    caption: 'Kashgar, China (39.47°N, 75.99°E)' },
  { id: 'urumqi', label: 'Urumqi', parent: 'china', lat: 43.83, lon: 87.62, alt: 0.07, tilt: 1.05, region: ['route', 'china'], pick: 1.5,
    caption: 'Urumqi, China (43.83°N, 87.62°E)' },

  // Acmetel USA LLC (content/source/offices.md, user-supplied 2026-10-14).
  { id: 'us', label: 'United States', parent: 'global', lat: 39, lon: -97.5, alt: 1.25, tilt: 0.15, region: 'usa', pick: 14,
    caption: 'United States: Acmetel USA LLC, Oakbrook Terrace, Illinois.' },
  // Geography only: the Chicago area, framed to take in both the Loop and Oakbrook Terrace.
  { id: 'chicago', label: 'Chicago area', parent: 'us', lat: 41.865, lon: -87.82, alt: 0.013, tilt: 1.0, region: 'usa', city: 'chicago', pick: 1.5,
    caption: 'Chicago area, Illinois, United States (41.87°N, 87.82°W)' },
  // Acmetel USA LLC, 17W695C Butterfield Road, Oakbrook Terrace, IL 60181. Geocoded from OpenStreetMap (Overpass,
  // 2026-10-14): 17W695C itself isn't in OSM; the neighbouring unit 17W697 F Butterfield Road (node 13598789256) sits
  // inside office building way 1229730923, whose centroid is used here (41.849514°N, 87.974663°W). The US Census
  // geocoder places 17W695 on the Butterfield Road frontage 55 m north of it (41.85000°N, 87.97493°W).
  // PLACEHOLDER: the footprint is the best match from neighbouring addresses; confirm the exact building.
  { id: 'us-office', label: 'Acmetel office', parent: 'chicago', office: true, lat: 41.849514, lon: -87.974663, alt: 0.00012, tilt: 1.1,
    elev: 55, head: 0.4, region: 'usa', city: 'chicago', pick: 0.3,
    caption: 'Acmetel USA LLC: 17W695C Butterfield Road, Oakbrook Terrace, Chicago, IL 60181, USA.' },
];
export const stopById = Object.fromEntries(stops.map((s) => [s.id, s])) as Record<string, Stop>;
export const childrenOf = (id: string) => stops.filter((s) => s.parent === id);
export const pathTo = (id: string): Stop[] => { const out: Stop[] = []; for (let s: Stop | undefined = stopById[id]; s; s = s.parent ? stopById[s.parent] : undefined) out.unshift(s); return out; };

/**
 * HTML tags that follow points on the globe. `z` is the range of zoom level where each shows
 * (0 = orbit, 1 = country, 2 = city, ~2.4 = Dubai/Lahore street maps, ~4.9 = an office at street level; derived from
 * camera altitude). `near` limits a tag to when the camera is within that many degrees of the point. `h` lifts
 * the anchor that many metres above the ground (a rooftop label). `sub` is a second, smaller line; `kicker` a
 * small line above the text (office tags).
 */
export interface Tag {
  id: string; kind: 'pill' | 'country' | 'city' | 'city-major' | 'waypoint' | 'district' | 'landmark' | 'office'; text: string; lat: number; lon: number;
  z: readonly [number, number]; near?: number; h?: number; sub?: string; kicker?: string;
}
const city = (id: string, text: string, lat: number, lon: number, z: readonly [number, number] = [0.75, 1.45]): Tag => ({ id, kind: 'city', text, lat, lon, z });
const major = (id: string, text: string, lat: number, lon: number, z: readonly [number, number] = [1.4, 2.4]): Tag => ({ id: `${id}-major`, kind: 'city-major', text, lat, lon, z, near: 1.2 });
const westChina = (id: string, text: string, lat: number, lon: number): Tag => ({ id, kind: 'city', text, lat, lon, z: [0.85, 1.45], near: 10 });
const district = (id: string, text: string, lat: number, lon: number, z: readonly [number, number], near = 0.6): Tag => ({ id, kind: 'district', text, lat, lon, z, near });
export const tags: Tag[] = [
  { id: 'core', kind: 'pill', text: focus.label, lat: focus.lat, lon: focus.lon, z: [-1, 0.3] },
  { id: 'uae', kind: 'country', text: 'United Arab Emirates', lat: 23.55, lon: 53.9, z: [0.55, 1.4] },
  { id: 'pakistan', kind: 'country', text: 'Pakistan', lat: 28.6, lon: 66.2, z: [0.55, 1.35] },
  { id: 'china', kind: 'country', text: 'China', lat: 39.4, lon: 83.6, z: [0.6, 1.35] },
  { id: 'us', kind: 'country', text: 'United States', lat: 40.5, lon: -100, z: [0.4, 1.4] },
  major('dubai', 'Dubai', 25.2, 55.27, [1.4, 2.95]),
  city('abu-dhabi', 'Abu Dhabi', 24.45, 54.38, [0.75, 2.4]),
  city('sharjah', 'Sharjah', 25.35, 55.42, [1.45, 2.4]),
  city('muscat', 'Muscat', 23.59, 58.41),
  city('doha', 'Doha', 25.29, 51.53),
  city('dubai', 'Dubai', 25.2, 55.27, [0.6, 1.4]),
  // Dubai street map (geography only).
  district('palm', 'Palm Jumeirah', 25.112, 55.139, [2.4, 3.2]),
  district('marina', 'Dubai Marina', 25.08, 55.14, [2.4, 3.2]),
  district('deira', 'Deira', 25.271, 55.318, [2.4, 3.2]),
  district('downtown', 'Downtown Dubai', 25.195, 55.279, [2.9, 3.6], 0.4),
  district('business-bay', 'Business Bay', 25.186, 55.262, [3.0, 4.4], 0.12),
  district('difc', 'DIFC', 25.211, 55.281, [3.0, 4.4], 0.12),
  { id: 'burj', kind: 'landmark', text: 'Burj Khalifa', sub: '828 m', lat: 25.197219, lon: 55.274155, h: 828, z: [3.3, 9], near: 0.1 },
  city('rak', 'Ras Al Khaimah', 25.79, 55.94, [0.75, 1.45]), major('rak', 'Ras Al Khaimah', 25.79, 55.94, [1.45, 2.95]),
  // Ras Al Khaimah street map (geography only; OSM boundary relation 18471816).
  district('al-hamra-fz', 'Al Hamra Free Zone', 25.676, 55.8, [2.25, 3.0], 0.4),
  city('karachi', 'Karachi', 24.86, 67.01, [0.6, 1.4]), major('karachi', 'Karachi', 24.86, 67.01),
  city('islamabad', 'Islamabad', 33.68, 73.05, [0.6, 1.4]), major('islamabad', 'Islamabad', 33.68, 73.05),
  city('lahore', 'Lahore', 31.55, 74.34, [0.6, 1.4]), major('lahore', 'Lahore', 31.55, 74.34, [1.4, 2.6]),
  // Lahore street map (geography only).
  district('walled-city', 'Walled City', 31.582, 74.316, [2.25, 3.4], 0.5),
  district('ravi', 'River Ravi', 31.62, 74.27, [2.25, 3.4], 0.5),
  district('lhe', 'Allama Iqbal Intl Airport', 31.52, 74.405, [2.25, 3.4], 0.5),
  district('gulberg', 'Gulberg', 31.515, 74.345, [2.25, 3.4], 0.5),
  district('johar', 'Johar Town', 31.47, 74.27, [2.25, 3.4], 0.5),
  // Islamabad street map (geography only, approximate).
  district('rawalpindi', 'Rawalpindi', 33.6, 73.05, [2.25, 3.4], 0.5),
  district('margalla', 'Margalla Hills', 33.77, 73.08, [2.25, 3.4], 0.5),
  district('faisal-mosque', 'Faisal Mosque', 33.7297, 73.0372, [2.25, 3.4], 0.5),
  district('rawal-lake', 'Rawal Lake', 33.705, 73.125, [2.25, 3.4], 0.5),
  district('i8-markaz', 'I-8 Markaz', 33.6705, 73.0715, [3.3, 4.6], 0.1),
  // Acmetel offices (content/source/offices.md). Shown from city level down to the street; `h` sits the tag at the
  // top of the office's light column (scene.ts OFFICE_BEAM_M).
  { id: 'office-islamabad', kind: 'office', kicker: 'Acmetel office', text: 'Islamabad', sub: 'VIP Square, I-8 Markaz', lat: 33.66786, lon: 73.07452, h: 90, z: [1.95, 9], near: 0.6 },
  { id: 'office-rak', kind: 'office', kicker: 'Acmetel FZC', text: 'Ras Al Khaimah', sub: 'RAKEEN, Al Hamra Industrial Zone-FZ', lat: 25.6747019, lon: 55.7782595, h: 90, z: [1.95, 9], near: 0.6 },
  { id: 'office-us', kind: 'office', kicker: 'Acmetel USA LLC', text: 'Oakbrook Terrace, IL', sub: '17W695C Butterfield Road', lat: 41.849514, lon: -87.974663, h: 90, z: [1.95, 9], near: 0.6 },
  { id: 'khunjerab', kind: 'waypoint', text: 'Khunjerab Pass', lat: 36.85, lon: 75.42, z: [0.6, 2.4] },
  { id: 'kashgar', kind: 'waypoint', text: 'Kashgar', lat: 39.47, lon: 75.99, z: [0.6, 1.4] }, major('kashgar', 'Kashgar', 39.47, 75.99),
  { id: 'urumqi', kind: 'waypoint', text: 'Urumqi', lat: 43.83, lon: 87.62, z: [0.6, 1.4] }, major('urumqi', 'Urumqi', 43.83, 87.62),
  // Western China (Natural Earth populated places). PLACEHOLDER: geography only, not Acmetel locations.
  // Only around the China stop (`near`, from its centre), from country zoom in; Shihezi, Kuqa and Hami are left
  // out (they sit on Urumqi, Aksu and Turpan at this scale). The scene also hides any tag that overlaps a
  // higher-priority one.
  westChina('hotan', 'Hotan', 37.1, 79.93), westChina('shache', 'Shache', 38.43, 77.25), westChina('aksu', 'Aksu', 41.15, 80.25),
  westChina('korla', 'Korla', 41.73, 86.15), westChina('turpan', 'Turpan', 42.94, 89.17),
  westChina('karamay', 'Karamay', 45.59, 84.86), westChina('yining', 'Yining', 43.9, 81.35), westChina('lhasa', 'Lhasa', 29.65, 91.1),
  // Chicago area (geography only).
  city('chicago', 'Chicago', 41.88, -87.63, [0.45, 1.45]), major('chicago', 'Chicago', 41.88, -87.63, [1.4, 2.4]),
  district('loop', 'The Loop', 41.8837, -87.6325, [2.25, 3.4], 0.5),
  district('lake-michigan', 'Lake Michigan', 41.9, -87.59, [2.25, 3.4], 0.6),
  district('ohare', 'O’Hare Airport', 41.978, -87.905, [2.25, 3.4], 0.5),
];

/**
 * City-level stops: drawn as markers with range rings once the camera is low over them. Street-level stops (the
 * ones that look at a point above the ground: the Acmetel offices) have their own markers.
 */
export const cityStops = stops.filter((s) => s.alt < 0.2 && s.elev === undefined);

/** Smaller cities, drawn as faint points once the camera is low enough to need them. */
export const regionCities: GeoPoint[] = [
  { name: 'Abu Dhabi', lat: 24.45, lon: 54.38 }, { name: 'Sharjah', lat: 25.35, lon: 55.42 }, { name: 'Ajman', lat: 25.41, lon: 55.51 },
  { name: 'Ras Al Khaimah', lat: 25.79, lon: 55.94 }, { name: 'Fujairah', lat: 25.13, lon: 56.33 }, { name: 'Al Ain', lat: 24.21, lon: 55.74 },
  { name: 'Umm Al Quwain', lat: 25.56, lon: 55.55 },
  { name: 'Rawalpindi', lat: 33.6, lon: 73.04 }, { name: 'Faisalabad', lat: 31.42, lon: 73.08 }, { name: 'Multan', lat: 30.2, lon: 71.47 },
  { name: 'Hyderabad', lat: 25.4, lon: 68.37 }, { name: 'Peshawar', lat: 34.01, lon: 71.58 }, { name: 'Quetta', lat: 30.18, lon: 66.98 },
  { name: 'Gujranwala', lat: 32.19, lon: 74.19 }, { name: 'Gilgit', lat: 35.92, lon: 74.31 },
  { name: 'Hotan', lat: 37.1, lon: 79.93 }, { name: 'Aksu', lat: 41.15, lon: 80.25 }, { name: 'Turpan', lat: 42.94, lon: 89.17 },
  { name: 'Shache', lat: 38.43, lon: 77.25 }, { name: 'Kuqa', lat: 41.73, lon: 82.94 }, { name: 'Korla', lat: 41.73, lon: 86.15 },
  { name: 'Shihezi', lat: 44.3, lon: 86.03 }, { name: 'Karamay', lat: 45.59, lon: 84.86 }, { name: 'Yining', lat: 43.9, lon: 81.35 },
  { name: 'Hami', lat: 42.83, lon: 93.52 }, { name: 'Lhasa', lat: 29.65, lon: 91.1 }, { name: 'Golmud', lat: 36.4, lon: 94.9 },
  { name: 'Xining', lat: 36.62, lon: 101.77 }, { name: 'Lanzhou', lat: 36.06, lon: 103.83 },
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
