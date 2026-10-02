// Geography for the hero globe. All coordinates are approximate city/landmark locations.
import { Vector3 } from 'three';

export interface GeoPoint { name: string; lat: number; lon: number }

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

/** Pakistan–China terrestrial route, in order. */
export const chinaRoute: GeoPoint[] = [
  { name: 'Karachi', lat: 24.86, lon: 67.01 },
  { name: 'Islamabad', lat: 33.68, lon: 73.05 },
  { name: 'Khunjerab Pass', lat: 36.85, lon: 75.42 },
  { name: 'Kashgar', lat: 39.47, lon: 75.99 },
  { name: 'Urumqi', lat: 43.83, lon: 87.62 },
];

/** Lat/lon in degrees to a point on a sphere of radius r, y up. Lon 0 faces +x, lon 90E faces -z. */
export function latLonToVec3(lat: number, lon: number, r = 1): Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}
