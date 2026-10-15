// Hero globe: Three.js scene. Loaded lazily by components/home/GlobeHero.astro, never in the initial bundle.
//
// Camera model: zoom destinations form a tree (src/data/globe.ts `stops`). The camera is always somewhere on
// one edge of that tree, `pos = { p: parent, c: child, t }` with t = 0 at the parent and 1 at the child. A
// flight is the chain of edges up to the common parent and back down; every visual (altitude, tilt, which
// layers and labels show) follows from the camera pose, so flights, wheel and pinch can all be reversed at
// any point.
import {
  AdditiveBlending, BackSide, DoubleSide, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, CylinderGeometry, Group, Line,
  LineSegments, LinearMipmapLinearFilter, Matrix4, Mesh, PerspectiveCamera, Points, Quaternion, Ray, Scene,
  ShaderMaterial, ShapeUtils, Sphere, SphereGeometry, TubeGeometry, Vector2, Vector3, Vector4, WebGLRenderer,
} from 'three';
import { gsap, visibleLoop, bindPauseButton, scrollKick } from '../motion';
import {
  type Box, type CityLayer, type Stop, arcLinks, arcOrigin, chinaRoute, childrenOf, cityLayers, cityStops, focus, latLonToVec3, markets, osmRegion, pathTo,
  regionCities, regions, stopById, stops, worldCities,
} from '../../data/globe';
import { decodeBoxed, decodeBuildings, decodeDots, decodeLines, linesToSegments, ringsToCoast, type Lines } from './data';

/** `h`: metres above the ground (rooftop labels). `rank`: lower wins when labels overlap (ties: earlier wins). */
export interface GlobeTag { el: HTMLElement; lat: number; lon: number; z: readonly [number, number]; near?: number; h?: number; rank?: number }
export interface GlobeState {
  /** Stop the camera is resting at, or null while between stops. */
  stop: string | null; lat: number; lon: number; altKm: number; focused: boolean;
  /** OpenStreetMap-derived data is on screen (attribution must show). */
  osm: boolean;
}

export interface GlobeOptions {
  /** Base URL of the files written by the globe data scripts (e.g. "/data"). */
  dataUrl: string;
  /** HTML tags that follow points on the globe (projected every frame, hidden on the far side). */
  tags?: GlobeTag[];
  /** Small chip that explains the controls. */
  hint?: HTMLElement | null;
  pauseButton?: HTMLButtonElement | null;
  /** Called when a flight starts, with its destination (drives the breadcrumb). */
  onTarget?: (id: string) => void;
  /** Called when the camera state changes (drives the HUD, caption and attribution). */
  onState?: (s: GlobeState) => void;
  /** Called after the first frame has been drawn (used to cross-fade the static image out). */
  onFirstFrame?: () => void;
  /** Called if the GL context is lost so the caller can restore the static image. */
  onContextLost?: () => void;
}

export interface GlobeApi { flyTo(id: string): void; destroy(): void }

const FOV = 30;
const IDLE_MS = 4000;
const TAU = Math.PI * 2;
const EARTH_KM = 6371;
const M = 1 / (EARTH_KM * 1000); // one metre in globe radii
const DEG = Math.PI / 180;
const CUTS = 5; // boxes a layer can be hidden inside (where a more detailed layer takes over)

// Brand tokens as raw sRGB triples (shaders output sRGB directly, so no colour-space conversion).
const hex = (h: string) => new Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TEAL_300 = hex('#7fdcd5');
const TEAL_400 = hex('#4cc6bd');
const TEAL_500 = hex('#22aaa1');
const TEAL_600 = hex('#1b8a83');
const NAVY_950 = hex('#0e1322');
const NAVY_800 = hex('#202943');
const NAVY_700 = hex('#2a3556');
const INK = hex('#eef2f8');

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const yawFor = (lon: number) => -Math.PI / 2 - lon * DEG;
const boxVec = (b: Box) => new Vector4(b.lon0, b.lon1, b.lat0, b.lat1);

// Zoom level from altitude: 0 = orbit, 1 = country (alt 0.62), 2 = city (alt 0.07), continuous on a log scale
// (Dubai street map ≈ 2.4, Downtown ≈ 4.1, Burj Khalifa rooftop ≈ 4.7, an office at street level ≈ 4.9).
const L_ORBIT = Math.log(3.8), L_COUNTRY = Math.log(0.62), L_CITY = Math.log(0.07);
const levelOf = (alt: number) => {
  const a = Math.log(alt);
  return a >= L_COUNTRY ? clamp((L_ORBIT - a) / (L_ORBIT - L_COUNTRY), 0, 1) : 1 + (L_COUNTRY - a) / (L_COUNTRY - L_CITY);
};

// Shared GLSL: soft mask that is 1 inside any of up to CUTS boxes (weighted), feathered over 12% of each box.
const CUT_GLSL = /* glsl */ `
  uniform vec4 uCut[${CUTS}]; uniform float uCutW[${CUTS}];
  float cutMask(vec3 p) {
    float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
    float lon = degrees(atan(-p.z, p.x));
    float m = 0.0;
    for (int i = 0; i < ${CUTS}; i++) {
      vec4 b = uCut[i];
      float fx = (b.y - b.x) * 0.12, fy = (b.w - b.z) * 0.12;
      float k = smoothstep(b.x, b.x + fx, lon) * (1.0 - smoothstep(b.y - fx, b.y, lon))
              * smoothstep(b.z, b.z + fy, lat) * (1.0 - smoothstep(b.w - fy, b.w, lat));
      m = max(m, k * uCutW[i]);
    }
    return m;
  }`;
const cutUniforms = () => ({
  uCut: { value: Array.from({ length: CUTS }, () => new Vector4(0, 0, 0, 0)) },
  uCutW: { value: new Array(CUTS).fill(0) },
});

const SPHERE_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

// Ocean body: key light from the upper left, a soft specular sheen and a teal rim that becomes the horizon line up close.
const BODY_FRAG = /* glsl */ `
  uniform vec3 uDark; uniform vec3 uLit; uniform vec3 uRim; uniform float uOpacity; uniform float uRimK;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    vec3 l = normalize(vec3(-0.45, 0.55, 0.7));
    float f = clamp(dot(n, v), 0.0, 1.0);
    float diff = max(dot(n, l), 0.0);
    vec3 col = mix(uDark, uLit, pow(diff, 1.25) * 0.8);
    col += uRim * pow(max(dot(reflect(-l, n), v), 0.0), 36.0) * 0.07 * uRimK;
    col += uRim * pow(1.0 - f, 3.0) * 0.55 * uRimK;
    gl_FragColor = vec4(col, 0.95 * uOpacity);
  }`;

// Outer halo (back faces of a larger shell).
const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float i = pow(clamp(f / 0.5, 0.0, 1.0), 3.0) * 0.5;
    // Premultiplied: alpha follows the glow, so the canvas stays transparent around the rim.
    gl_FragColor = vec4(uColor * i * uOpacity, i * uOpacity);
  }`;

// Thin inner atmosphere (front faces): only visible at grazing angles, so it reads as a horizon haze at any zoom.
const ATMOS_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uStrength;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    float i = pow(1.0 - f, 5.0) * uStrength;
    gl_FragColor = vec4(uColor * i, i);
  }`;

const POINTS_VERT = /* glsl */ `
  uniform float uSize; uniform float uScale; uniform float uMaxPx; uniform vec3 uFocus;
  varying float vFacing; varying float vFocus; varying float vCut;
  ${CUT_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * wp;
    vec3 n = normalize(wp.xyz - modelMatrix[3].xyz);
    vFacing = dot(n, normalize(cameraPosition - wp.xyz));
    vFocus = smoothstep(0.5, 0.0, distance(position, uFocus));
    vCut = 1.0 - cutMask(position);
    gl_PointSize = clamp(uSize * uScale / -mv.z * (1.0 + vFocus * 0.15), 1.2, uMaxPx);
    gl_Position = projectionMatrix * mv;
  }`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uA; uniform vec3 uB; uniform float uOpacity;
  varying float vFacing; varying float vFocus; varying float vCut;
  void main() {
    if (vFacing < 0.0 || vCut < 0.01) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.28, d);
    float f = smoothstep(0.0, 0.6, vFacing);
    vec3 col = mix(uA, uB, clamp(pow(f, 1.6) * 0.7 + vFocus * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, a * mix(0.15, 1.0, f) * uOpacity * vCut);
  }`;

// Small round points (cities) with a fixed pixel size.
const SPRITE_VERT = /* glsl */ `
  uniform float uPx;
  varying float vFacing;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(wp.xyz - modelMatrix[3].xyz), normalize(cameraPosition - wp.xyz));
    gl_PointSize = uPx;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SPRITE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vFacing;
  void main() {
    if (vFacing < 0.0) discard;
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d) * smoothstep(0.0, 0.25, vFacing) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }`;

// Coastlines and borders: 1px lines that fade toward the limb and give way to more detailed layers.
const LINE_VERT = /* glsl */ `
  varying float vFacing; varying float vCut;
  ${CUT_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(wp.xyz - modelMatrix[3].xyz), normalize(cameraPosition - wp.xyz));
    vCut = 1.0 - cutMask(position);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vFacing; varying float vCut;
  void main() {
    if (vFacing < 0.0) discard;
    gl_FragColor = vec4(uColor, uOpacity * vCut * smoothstep(0.0, 0.35, vFacing));
  }`;

// Regional land: fill + a dot field whose spacing follows the on-screen scale (fwidth), blended between powers of
// two so density stays constant from 4,000 km up down to street level with no popping. R = land, G = highlighted country.
const REGION_VERT = /* glsl */ `
  attribute vec2 aKm;
  varying vec2 vUv; varying vec2 vKm; varying float vFacing; varying float vCut;
  ${CUT_GLSL}
  void main() {
    vUv = uv; vKm = aKm;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(wp.xyz - modelMatrix[3].xyz), normalize(cameraPosition - wp.xyz));
    vCut = 1.0 - cutMask(normalize(position));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const REGION_FRAG = /* glsl */ `
  uniform sampler2D uMask; uniform float uOpacity; uniform vec2 uFocus; uniform float uFocusKm;
  uniform vec3 uFill; uniform vec3 uFillHi; uniform vec3 uDot; uniform vec3 uDotHi;
  varying vec2 vUv; varying vec2 vKm; varying float vFacing; varying float vCut;
  float grid(vec2 p, float s, float r, float aa) {
    vec2 g = (fract(p / s + 0.5) - 0.5) * s;
    return 1.0 - smoothstep(r - aa, r + aa, length(g));
  }
  void main() {
    vec4 m = texture2D(uMask, vUv);
    float land = m.r; float hi = m.g;
    if (land < 0.01 || vCut < 0.01) discard;
    float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x)) * smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
    float px = max(length(fwidth(vKm)) * 0.7071, 1e-5);
    float lvl = log2(px * 7.0);
    float s0 = exp2(floor(lvl));
    float t = fract(lvl);
    float r = px * 1.05;
    float g = mix(grid(vKm, s0, r, px * 0.6), grid(vKm, s0 * 2.0, r, px * 0.6), t);
    float near = exp(-length(vKm - uFocus) / uFocusKm);
    vec3 fill = mix(uFill, uFillHi, hi);
    vec3 dotCol = mix(uDot, uDotHi, clamp(hi * 0.6 + near, 0.0, 1.0));
    vec3 col = mix(fill, dotCol, g);
    float a = land * mix(0.55, 1.0, g) * edge * vCut * uOpacity * smoothstep(0.0, 0.2, vFacing);
    gl_FragColor = vec4(col, a);
  }`;

const MARKER_VERT = /* glsl */ `
  varying vec2 vUv; varying float vFacing;
  void main() {
    vUv = uv;
    vec3 c = modelMatrix[3].xyz;
    vFacing = dot(normalize(c), normalize(cameraPosition - c));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }`;

const MARKER_FRAG = /* glsl */ `
  uniform float uTime; uniform float uPeriod; uniform float uPhase; uniform float uIntensity; uniform float uCore; uniform float uRings;
  uniform float uHalo; uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vUv; varying float vFacing;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    if (d > 1.0 || vFacing < 0.0) discard;
    float core = smoothstep(uCore, uCore * 0.55, d);
    float halo = exp(-d * d * 14.0) * 0.5 * uHalo;
    float t1 = fract(uTime / uPeriod + uPhase);
    float t2 = fract(t1 + 0.5);
    float r1 = smoothstep(0.07, 0.0, abs(d - t1 * 0.95)) * (1.0 - t1);
    float r2 = smoothstep(0.07, 0.0, abs(d - t2 * 0.95)) * (1.0 - t2);
    float a = clamp(core + halo + (r1 + r2) * uRings, 0.0, 1.0) * uIntensity * smoothstep(0.0, 0.2, vFacing) * uOpacity;
    vec3 col = mix(uColor, vec3(0.93, 1.0, 0.99), core);
    gl_FragColor = vec4(col, a);
  }`;

// Flowing dash along a curve (u = 0 at the origin, 1 at the end). Used for the China route and the market arcs.
const FLOW_VERT = /* glsl */ `
  attribute float aU;
  varying float vU; varying float vFacing;
  void main() {
    vU = aU;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(wp.xyz - modelMatrix[3].xyz);
    vFacing = dot(n, normalize(cameraPosition - wp.xyz));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FLOW_FRAG = /* glsl */ `
  uniform float uTime; uniform float uOpacity; uniform vec3 uA; uniform vec3 uB; uniform float uReps; uniform float uSpeed; uniform float uBase;
  varying float vU; varying float vFacing;
  void main() {
    if (vFacing < -0.15) discard;
    float flow = fract(vU * uReps - uTime * uSpeed);
    float dash = smoothstep(0.0, 0.1, flow) * smoothstep(0.42, 0.18, flow);
    float ends = smoothstep(0.0, 0.02, vU) * smoothstep(1.0, 0.98, vU);
    float a = (uBase + dash * 0.9) * ends * smoothstep(-0.15, 0.25, vFacing) * uOpacity;
    gl_FragColor = vec4(mix(uA, uB, dash), a);
  }`;

// City layers live in a local east/north/up frame (globe radii) around an anchor, so they use modelViewMatrix
// directly: the camera-relative transform is small and stays precise in float32 down to rooftop height.
// Shared: fade toward the edges of the data box (uBox, local x/y) and into distance fog (uFog, near/far).
const CITY_FADE_GLSL = /* glsl */ `
  uniform vec4 uBox; uniform vec2 uFog;
  varying float vDist; varying vec2 vXY;
  float cityFade() {
    float fx = (uBox.y - uBox.x) * 0.07, fy = (uBox.w - uBox.z) * 0.07;
    float e = smoothstep(uBox.x, uBox.x + fx, vXY.x) * (1.0 - smoothstep(uBox.y - fx, uBox.y, vXY.x))
            * smoothstep(uBox.z, uBox.z + fy, vXY.y) * (1.0 - smoothstep(uBox.w - fy, uBox.w, vXY.y));
    return e * (1.0 - smoothstep(uFog.x, uFog.y, vDist));
  }`;
const CITY_VERT = /* glsl */ `
  uniform float uLift;
  varying float vDist; varying vec2 vXY; varying vec2 vKm;
  void main() {
    vXY = position.xy; vKm = position.xy * ${EARTH_KM.toFixed(1)};
    vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.0, uLift), 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const CITY_LINE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  ${CITY_FADE_GLSL}
  void main() {
    float a = uOpacity * cityFade();
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
// Land: the same scale-aware dot field as the regional layers, so the hand-off from them is seamless.
const CITY_GROUND_FRAG = /* glsl */ `
  uniform vec3 uFill; uniform vec3 uDot; uniform float uOpacity;
  varying vec2 vKm;
  ${CITY_FADE_GLSL}
  float grid(vec2 p, float s, float r, float aa) {
    vec2 g = (fract(p / s + 0.5) - 0.5) * s;
    return 1.0 - smoothstep(r - aa, r + aa, length(g));
  }
  void main() {
    float px = max(length(fwidth(vKm)) * 0.7071, 1e-6);
    float lvl = log2(px * 7.0);
    float s0 = exp2(floor(lvl));
    float g = mix(grid(vKm, s0, px * 1.05, px * 0.6), grid(vKm, s0 * 2.0, px * 1.05, px * 0.6), fract(lvl));
    float a = uOpacity * cityFade() * mix(0.6, 1.0, g);
    if (a < 0.003) discard;
    gl_FragColor = vec4(mix(uFill, uDot, g), a);
  }`;
// Buildings: extruded footprints that rise out of the ground as the camera comes down (uRise). Flat-shaded from a
// fixed sun, floor lines every 4 m on the walls (faded out when they'd crowd), landmark parts in glass teal.
const BUILDING_VERT = /* glsl */ `
  attribute float aH; attribute vec3 aN; attribute float aLm;
  uniform float uRise;
  varying vec3 vN; varying float vH; varying float vLm; varying float vDist; varying vec2 vXY;
  void main() {
    vN = aN; vH = aH * uRise; vLm = aLm; vXY = position.xy;
    vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.0, aH * uRise * ${M.toExponential(6)}), 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BUILDING_FRAG = /* glsl */ `
  uniform vec3 uWall; uniform vec3 uRoof; uniform vec3 uGlass; uniform vec3 uLine; uniform vec3 uSun; uniform float uOpacity;
  varying vec3 vN; varying float vH; varying float vLm;
  ${CITY_FADE_GLSL}
  void main() {
    float roof = step(0.9, vN.z);
    float diff = max(dot(normalize(vN), uSun), 0.0);
    vec3 col = mix(mix(uWall, uRoof, roof), uGlass, vLm * 0.6) * (0.5 + 0.7 * diff);
    float f = vH / 4.0, w = fwidth(f);
    float floorLine = (1.0 - smoothstep(0.0, w * 1.2, abs(fract(f + 0.5) - 0.5))) * (1.0 - smoothstep(0.12, 0.35, w));
    col += uLine * floorLine * (1.0 - roof) * mix(0.12, 0.3, vLm);
    float a = uOpacity * cityFade();
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }`;
const BUILDING_EDGE_VERT = /* glsl */ `
  attribute float aH; attribute float aLm;
  uniform float uRise;
  varying float vLm; varying float vDist; varying vec2 vXY;
  void main() {
    vLm = aLm; vXY = position.xy;
    vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.0, aH * uRise * ${M.toExponential(6)}), 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BUILDING_EDGE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vLm;
  ${CITY_FADE_GLSL}
  void main() {
    float a = uOpacity * mix(0.22, 0.75, vLm) * cityFade();
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
// Horizon haze at street level: the inside of a tall open cylinder around the city, brightest at its foot.
const HAZE_VERT = /* glsl */ `
  varying float vY;
  void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HAZE_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vY;
  void main() { float a = pow(1.0 - vY, 5.0) * uOpacity; gl_FragColor = vec4(uColor * a, a); }`;

// Aviation-style beacon on the landmark's spire.
const BEACON_VERT = /* glsl */ `
  uniform float uPx; uniform float uLift;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, 0.0, uLift), 1.0);
    gl_PointSize = uPx;
    gl_Position = projectionMatrix * mv;
  }`;
const BEACON_FRAG = /* glsl */ `
  uniform float uTime; uniform float uOpacity; uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float pulse = 0.5 + 0.5 * sin(uTime * 2.6);
    float a = (smoothstep(0.16, 0.06, d) + exp(-d * d * 26.0) * (0.25 + 0.55 * pulse)) * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), smoothstep(0.12, 0.0, d)), a);
  }`;

// Acmetel offices: a column of light standing on the office, with a signal pulse running up it, and rings pulsing
// out across the ground. Local city frame (modelViewMatrix, precise at street level); uv.y runs 0 → 1 up the column.
const OFFICE_BEAM_M = 90;
const OFFICE_BEAM_VERT = /* glsl */ `
  varying float vY;
  void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const OFFICE_BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying float vY;
  void main() {
    float pulse = smoothstep(0.12, 0.0, abs(vY - fract(uTime * 0.38)));
    float a = (mix(0.6, 0.14, vY) + pulse * 0.7) * smoothstep(1.0, 0.92, vY) * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), pulse * 0.6) * a, a);
  }`;
const OFFICE_RING_VERT = /* glsl */ `
  varying vec2 vUv; varying float vFacing;
  void main() { vUv = uv; vFacing = 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

interface Pos { p: string; c: string; t: number }
interface Pose { yaw: number; pitch: number; alt: number; tilt: number; elev: number; head: number }
interface Leg { p: string; c: string; from: number; to: number }

export function initGlobe(container: HTMLElement, opts: GlobeOptions): GlobeApi {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const coarse = matchMedia('(pointer: coarse)').matches;

  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab;opacity:0;';
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  const globe = new Group();
  scene.add(globe);

  const mat = (o: ConstructorParameters<typeof ShaderMaterial>[0]) => track(new ShaderMaterial({ transparent: true, depthWrite: false, ...o }));
  const lineMat = (color: Vector3, opacity: number) => mat({ vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: { uColor: { value: color }, uOpacity: { value: opacity }, ...cutUniforms() } });
  const segGeo = (pos: Float32Array) => { const g = track(new BufferGeometry()); g.setAttribute('position', new BufferAttribute(pos, 3)); return g; };
  const lineObj = (lines: Lines, m: ShaderMaterial, r: number, order: number) => {
    const o = new LineSegments(segGeo(linesToSegments(lines, r)), m);
    o.renderOrder = order;
    o.frustumCulled = false;
    return o;
  };

  // --- Body, halo, atmosphere, graticule ----------------------------------------------------
  const bodyMat = track(new ShaderMaterial({
    vertexShader: SPHERE_VERT, fragmentShader: BODY_FRAG, transparent: true,
    uniforms: { uDark: { value: NAVY_950 }, uLit: { value: NAVY_700 }, uRim: { value: TEAL_500 }, uOpacity: { value: 1 }, uRimK: { value: 1 } },
  }));
  const body = new Mesh(track(new SphereGeometry(0.995, coarse ? 160 : 256, coarse ? 100 : 160)), bodyMat);
  body.renderOrder = 0;
  globe.add(body);

  const haloMat = mat({ vertexShader: SPHERE_VERT, fragmentShader: HALO_FRAG, side: BackSide, blending: AdditiveBlending, uniforms: { uColor: { value: TEAL_500 }, uOpacity: { value: 1 } } });
  const halo = new Mesh(track(new SphereGeometry(1.14, 64, 40)), haloMat);
  halo.renderOrder = 1;
  globe.add(halo);

  const atmosMat = mat({ vertexShader: SPHERE_VERT, fragmentShader: ATMOS_FRAG, blending: AdditiveBlending, uniforms: { uColor: { value: TEAL_400 }, uStrength: { value: 0.6 } } });
  const atmos = new Mesh(track(new SphereGeometry(1.012, 128, 80)), atmosMat);
  atmos.renderOrder = 9;
  globe.add(atmos);

  const gratPos: number[] = [];
  const seg = (a: Vector3, b: Vector3) => gratPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = 0; lon < 360; lon += 3) seg(latLonToVec3(lat, lon, 1.001), latLonToVec3(lat, lon + 3, 1.001));
  for (let lon = 0; lon < 360; lon += 15) for (let lat = -84; lat < 84; lat += 3) seg(latLonToVec3(lat, lon, 1.001), latLonToVec3(lat + 3, lon, 1.001));
  const gratMat = lineMat(TEAL_400, 0.05);
  const graticule = new LineSegments(segGeo(new Float32Array(gratPos)), gratMat);
  graticule.renderOrder = 2;
  globe.add(graticule);

  // --- World layer: land dots, coastlines, borders ------------------------------------------
  let destroyed = false;
  const focusDir = latLonToVec3(focus.lat, focus.lon, 1);
  const pointsMat = mat({
    vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG,
    uniforms: {
      uSize: { value: 0.0068 }, uScale: { value: 500 }, uMaxPx: { value: 4 }, uFocus: { value: focusDir },
      uA: { value: TEAL_600 }, uB: { value: TEAL_300 }, uOpacity: { value: 1 }, ...cutUniforms(),
    },
  });
  const coastMat = lineMat(TEAL_300, 0.32);
  const borderMat = lineMat(TEAL_400, 0.12);
  const worldCut = [pointsMat, coastMat, borderMat];

  // One request per file, shared by every layer that needs it (the Dubai OSM land feeds two); a failure is forgotten
  // so a later flight can retry.
  const loads = new Map<string, Promise<ArrayBuffer>>();
  const load = (name: string) => {
    let p = loads.get(name);
    if (!p) {
      p = fetch(`${opts.dataUrl}/${name}`).then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); });
      p.catch(() => loads.delete(name));
      loads.set(name, p);
    }
    return p;
  };
  // Yields to the next frame, so long builds (Dubai's ~14k buildings) are spread out instead of freezing a flight.
  const nextFrame = () => new Promise<void>((r) => { requestAnimationFrame(() => r()); setTimeout(r, 100); });

  load('globe-dots.bin').then((buf) => {
    if (destroyed) return;
    const p = new Points(segGeo(decodeDots(buf, 1.0)), pointsMat);
    p.frustumCulled = false;
    p.renderOrder = 4;
    globe.add(p);
  }).catch(() => { /* optional layer */ });

  load('globe-lines.bin').then((buf) => {
    if (destroyed) return;
    const [coast, borders] = decodeLines(buf, false);
    globe.add(lineObj(coast, coastMat, 1.0006, 5), lineObj(borders, borderMat, 1.0006, 5));
  }).catch(() => { /* optional layer */ });

  // --- Regional layers: filled land + scale-aware dot field + detailed coastlines ------------
  // Each is fetched only when a flight (or the wheel) first heads into it, then fades in.
  interface Layer {
    id: string; box: Box; file: string; osm: boolean; ready: boolean; fade: { v: number }; loading: boolean;
    patch: ShaderMaterial; coast: ShaderMaterial; border: ShaderMaterial; hi: ShaderMaterial;
    prov: ShaderMaterial; river: ShaderMaterial; road: ShaderMaterial; rail: ShaderMaterial;
  }
  const regionMat = (box: Box) => {
    const kmLon = 111.32 * Math.cos(((box.lat0 + box.lat1) / 2) * DEG);
    return mat({
      vertexShader: REGION_VERT, fragmentShader: REGION_FRAG,
      uniforms: {
        uMask: { value: null }, uOpacity: { value: 0 }, uFocus: { value: new Vector2(-1e5, -1e5) }, uFocusKm: { value: 40 },
        uFill: { value: NAVY_800 }, uFillHi: { value: NAVY_700 }, uDot: { value: TEAL_600 }, uDotHi: { value: TEAL_300 },
        uKmLon: { value: kmLon }, ...cutUniforms(),
      },
    });
  };
  const makeLayer = (id: string, box: Box, file: string, osm: boolean): Layer => ({
    id, box, file, osm, ready: false, loading: false, fade: { v: 0 },
    patch: regionMat(box), coast: lineMat(osm ? TEAL_300 : TEAL_400, 0), border: lineMat(TEAL_500, 0), hi: lineMat(TEAL_300, 0),
    prov: lineMat(TEAL_400, 0), river: lineMat(TEAL_500, 0), road: lineMat(TEAL_300, 0), rail: lineMat(INK, 0),
  });
  const layerMats = (L: Layer) => [L.patch, L.coast, L.border, L.hi, L.prov, L.river, L.road, L.rail];
  const layers: Layer[] = [...regions.map((r) => makeLayer(r.id, r.box, r.file, false)), makeLayer(osmRegion.id, osmRegion.box, osmRegion.file, true)];
  const layerById = Object.fromEntries(layers.map((l) => [l.id, l])) as Record<string, Layer>;
  const osmLayer = layerById[osmRegion.id];
  // The world layer is cut inside every regional box; the Gulf layer is cut inside the Dubai OSM box.
  layers.forEach((l, i) => worldCut.forEach((m) => { (m.uniforms.uCut.value as Vector4[])[i] = boxVec(l.box); }));
  const gulf = layerById.gulf;
  layerMats(gulf).forEach((m) => { (m.uniforms.uCut.value as Vector4[])[0] = boxVec(osmLayer.box); });

  const buildLayer = (L: Layer, buf: ArrayBuffer) => {
    const B = L.box;
    let coast: Lines, borders: Lines = [], hiLine: Lines = [], land: Lines, hiLand: Lines = [];
    let prov: Lines = [], rivers: Lines = [], lakes: Lines = [], roads: Lines = [], rail: Lines = [];
    if (L.osm) {
      const [rings, loose] = decodeBoxed(buf);
      land = rings;
      coast = [...ringsToCoast(rings, B), ...loose];
    } else {
      [coast, borders, hiLine, land, hiLand, prov = [], rivers = [], lakes = [], roads = [], rail = []] = decodeBoxed(buf);
    }
    const W = L.osm ? (coarse ? 1536 : 2048) : (coarse ? 1024 : 2048);
    const kmLon = 111.32 * Math.cos(((B.lat0 + B.lat1) / 2) * DEG);
    const kmLat = 110.57;
    const H = Math.round((W * (B.lat1 - B.lat0) * kmLat) / ((B.lon1 - B.lon0) * kmLon));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.min(H, 2048);
    const ctx = cv.getContext('2d')!;
    const fill = (rings: Lines, style: string) => {
      ctx.fillStyle = style;
      ctx.beginPath();
      for (const r of rings) {
        for (let i = 0; i < r.length; i += 2) {
          const x = ((r[i] - B.lon0) / (B.lon1 - B.lon0)) * cv.width;
          const y = ((B.lat1 - r[i + 1]) / (B.lat1 - B.lat0)) * cv.height;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fill('nonzero');
    };
    fill(land, '#ff0000');
    if (hiLand.length) fill(hiLand, '#ffff00');
    if (lakes.length) fill(lakes, '#000000'); // lakes read as water
    const tex = track(new CanvasTexture(cv));
    tex.minFilter = LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    L.patch.uniforms.uMask.value = tex;

    // Patch geometry over the box, with per-vertex km coordinates for the dot grid.
    const span = Math.max(B.lon1 - B.lon0, B.lat1 - B.lat0);
    const NX = clamp(Math.round(((B.lon1 - B.lon0) / span) * 128), 16, 128);
    const NY = clamp(Math.round(((B.lat1 - B.lat0) / span) * 128), 16, 128);
    // Close to true ground height (a few metres up), so street-level layers drawn at the ground line up with it.
    // Layers that don't write depth only need to stay above the ocean body (r = 0.995), so chord sag is harmless.
    const rr = L.osm ? 1 + 3 * M : 1 + 2 * M;
    const pos = new Float32Array((NX + 1) * (NY + 1) * 3);
    const uv = new Float32Array((NX + 1) * (NY + 1) * 2);
    const km = new Float32Array((NX + 1) * (NY + 1) * 2);
    let k = 0;
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++, k++) {
        const u = i / NX, v = j / NY;
        const lon = mix(B.lon0, B.lon1, u), lat = mix(B.lat0, B.lat1, v);
        const p = latLonToVec3(lat, lon, rr);
        pos.set([p.x, p.y, p.z], k * 3);
        uv.set([u, v], k * 2);
        km.set([(lon - B.lon0) * kmLon, (lat - B.lat0) * kmLat], k * 2);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    const geo = track(new BufferGeometry());
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setAttribute('aKm', new BufferAttribute(km, 2));
    geo.setIndex(idx);
    const patch = new Mesh(geo, L.patch);
    patch.renderOrder = L.osm ? 3.5 : 3;
    patch.frustumCulled = false;
    globe.add(patch, lineObj(coast, L.coast, 1 + 5 * M, 6));
    const extra: [Lines, ShaderMaterial][] = [[borders, L.border], [hiLine, L.hi], [prov, L.prov], [rivers, L.river], [roads, L.road], [rail, L.rail]];
    for (const [ls, m] of extra) if (ls.length) globe.add(lineObj(ls, m, 1 + 4 * M, 6));
    L.ready = true;
    gsap.to(L.fade, { v: 1, duration: 0.6, ease: 'power2.out' });
  };
  const ensureLayer = (id?: string) => {
    const L = id ? layerById[id] : undefined;
    if (!L || L.ready || L.loading) return;
    L.loading = true;
    load(L.file).then((b) => { if (!destroyed) buildLayer(L, b); }).catch(() => { L.loading = false; });
  };
  const ensureFor = (s: Stop) => {
    [s.region ?? []].flat().forEach(ensureLayer);
    if (s.osm) ensureLayer(osmRegion.id);
    if (s.city) ensureCity(s.city);
  };

  // --- City layers: street-level OpenStreetMap detail ---------------------------------------
  // Roads, rail, waterways and water (plus, for Dubai, land and 3D buildings) in a local east/north/up frame at
  // the city's anchor, in globe radii. The group rides on the globe; its geometry stays small and precise.
  interface City {
    cfg: CityLayer; dir: Vector3; east: Vector3; north: Vector3; group: Group; box: Vector4;
    ready: boolean; loading: boolean; fade: { v: number }; w: number; ground: number;
    lines: { mat: ShaderMaterial; base: number; z: [number, number] }[];
    groundMat: ShaderMaterial | null; bldMat: ShaderMaterial | null; edgeMat: ShaderMaterial | null; beaconMat: ShaderMaterial | null; beaconH: number;
    hazeMat: ShaderMaterial | null;
    offices: ShaderMaterial[];
    all: ShaderMaterial[];
  }
  const cityMat = (o: { frag: string; vert?: string; uniforms?: Record<string, { value: unknown }>; depthWrite?: boolean; blending?: typeof AdditiveBlending }) => mat({
    vertexShader: o.vert ?? CITY_VERT, fragmentShader: o.frag, depthWrite: o.depthWrite ?? false, ...(o.blending ? { blending: o.blending } : {}),
    uniforms: { uOpacity: { value: 0 }, uLift: { value: 0 }, uBox: { value: new Vector4() }, uFog: { value: new Vector2(1, 2) }, ...o.uniforms },
  });
  const citiesL: City[] = cityLayers.map((cfg) => {
    const dir = latLonToVec3(cfg.anchor.lat, cfg.anchor.lon, 1);
    const east = new Vector3(0, 1, 0).cross(dir).normalize();
    const north = dir.clone().cross(east).normalize();
    const group = new Group();
    group.position.copy(dir);
    group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(east, north, dir));
    group.visible = false;
    globe.add(group);
    return { cfg, dir, east, north, group, box: new Vector4(), ready: false, loading: false, fade: { v: 0 }, w: 0, ground: 0, lines: [], groundMat: null, bldMat: null, edgeMat: null, beaconMat: null, beaconH: 0, hazeMat: null, offices: [], all: [] };
  });
  const cityById = Object.fromEntries(citiesL.map((c) => [c.cfg.id, c])) as Record<string, City>;
  const lv = new Vector3();
  // Lat/lon (+ metres up) → local frame. Done in doubles before the Float32 copy, which is what keeps it precise.
  const toLocal = (C: City, lat: number, lon: number, h = 0): [number, number, number] => {
    lv.copy(latLonToVec3(lat, lon, 1 + h * M)).sub(C.dir);
    return [lv.dot(C.east), lv.dot(C.north), lv.dot(C.dir)];
  };
  // Straight into a preallocated buffer, with the same maths as toLocal inlined: the street layers run to a few
  // hundred thousand points, and per-point arrays made this the slowest step of a city build.
  const localSegs = (C: City, lines: Lines) => {
    let n = 0;
    for (const l of lines) n += Math.max(0, l.length / 2 - 1);
    const out = new Float32Array(n * 6);
    const { dir: d, east: e, north: no } = C;
    let k = 0, px = 0, py = 0, pz = 0;
    for (const l of lines) {
      for (let i = 0; i < l.length; i += 2) {
        const phi = l[i + 1] * DEG, lam = l[i] * DEG, cp = Math.cos(phi);
        const x = cp * Math.cos(lam) - d.x, y = Math.sin(phi) - d.y, z = -cp * Math.sin(lam) - d.z;
        const lx = x * e.x + y * e.y + z * e.z, ly = x * no.x + y * no.y + z * no.z, lz = x * d.x + y * d.y + z * d.z;
        if (i) { out[k++] = px; out[k++] = py; out[k++] = pz; out[k++] = lx; out[k++] = ly; out[k++] = lz; }
        px = lx; py = ly; pz = lz;
      }
    }
    return out;
  };
  // Closed rings → triangles (earcut via ShapeUtils), z on the curved ground.
  const localFill = (C: City, rings: Lines) => {
    const pos: number[] = [];
    for (const r of rings) {
      const pts = [];
      for (let i = 0; i < r.length; i += 2) pts.push(toLocal(C, r[i + 1], r[i]));
      if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (pts.length < 3) continue;
      for (const [a, b, c] of ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), [])) pos.push(...pts[a], ...pts[b], ...pts[c]);
    }
    return new Float32Array(pos);
  };
  const cityObj = <T extends Mesh | LineSegments | Points>(C: City, o: T, order: number) => { o.renderOrder = order; o.frustumCulled = false; C.group.add(o); return o; };

  const buildCity = (C: City, buf: ArrayBuffer, land: ArrayBuffer | null) => {
    const B = C.cfg.box;
    const corners = [toLocal(C, B.lat0, B.lon0), toLocal(C, B.lat0, B.lon1), toLocal(C, B.lat1, B.lon0), toLocal(C, B.lat1, B.lon1)];
    C.box.set(Math.max(corners[0][0], corners[2][0]), Math.min(corners[1][0], corners[3][0]), Math.max(corners[0][1], corners[1][1]), Math.min(corners[2][1], corners[3][1]));
    const [motorway, primary, tertiary, minor, rail, waterways, water] = decodeBoxed(buf);
    const share = (m: ShaderMaterial) => { m.uniforms.uBox.value = C.box; C.all.push(m); return m; };

    if (land) {
      // Dubai: land from the OpenStreetMap coastline, so the coast stays crisp all the way down.
      const [rings, loose] = decodeBoxed(land);
      const g = segGeo(localFill(C, rings));
      C.groundMat = share(cityMat({ frag: CITY_GROUND_FRAG, uniforms: { uFill: { value: NAVY_800 }, uDot: { value: TEAL_600 } } }));
      cityObj(C, new Mesh(g, C.groundMat), 3.6);
      const coastMat = share(cityMat({ frag: CITY_LINE_FRAG, uniforms: { uColor: { value: TEAL_300 } } }));
      C.lines.push({ mat: coastMat, base: 0.8, z: [-1, -1] }); // follows the ground weight
      cityObj(C, new LineSegments(segGeo(localSegs(C, [...ringsToCoast(rings, osmLayer.box), ...loose])), coastMat), 6.4);
      const hz = track(new CylinderGeometry(32 / EARTH_KM, 32 / EARTH_KM, 14 / EARTH_KM, 128, 1, true));
      hz.rotateX(Math.PI / 2);
      hz.translate(0, 0, 6.6 / EARTH_KM); // foot just below the horizon from rooftop height
      C.hazeMat = mat({ vertexShader: HAZE_VERT, fragmentShader: HAZE_FRAG, side: BackSide, blending: AdditiveBlending, uniforms: { uColor: { value: TEAL_500 }, uOpacity: { value: 0 } } });
      cityObj(C, new Mesh(hz, C.hazeMat), 9.2);
    }
    const waterMat = share(cityMat({ frag: CITY_LINE_FRAG, uniforms: { uColor: { value: NAVY_950 }, uLift: { value: 0.3 * M } } }));
    C.lines.push({ mat: waterMat, base: 0.85, z: [1.95, 2.3] });
    cityObj(C, new Mesh(segGeo(localFill(C, water)), waterMat), 3.7);
    // [lines, colour, opacity, level range it fades in over]
    const classes: [Lines, Vector3, number, [number, number]][] = [
      [water, TEAL_500, 0.45, [1.95, 2.3]],
      [waterways, TEAL_500, 0.7, [1.95, 2.3]],
      [minor, TEAL_500, 0.24, [2.5, 3.1]],
      [tertiary, TEAL_400, 0.3, [2.15, 2.6]],
      [primary, TEAL_400, 0.5, [1.95, 2.35]],
      [rail, INK, 0.38, [1.95, 2.35]],
      [motorway, TEAL_300, 0.78, [1.9, 2.25]],
    ];
    for (const [ls, color, base, z] of classes) {
      if (!ls.length) continue;
      const m = share(cityMat({ frag: CITY_LINE_FRAG, uniforms: { uColor: { value: color } } }));
      C.lines.push({ mat: m, base, z });
      cityObj(C, new LineSegments(segGeo(localSegs(C, ls)), m), 6.5);
    }
    for (const s of officeStops) if (s.city === C.cfg.id) addOffice(C, s);
    C.ready = true;
    gsap.to(C.fade, { v: 1, duration: 0.6, ease: 'power2.out' });
  };

  const officeStops = stops.filter((s) => s.office);
  const addOffice = (C: City, s: Stop) => {
    const [x, y, z] = toLocal(C, s.lat, s.lon);
    const beamGeo = track(new CylinderGeometry(4 * M, 4 * M, OFFICE_BEAM_M * M, 20, 1, true));
    beamGeo.rotateX(Math.PI / 2); // axis along local up, uv.y = 1 at the top
    beamGeo.translate(x, y, z + (OFFICE_BEAM_M / 2) * M);
    const beam = mat({
      vertexShader: OFFICE_BEAM_VERT, fragmentShader: OFFICE_BEAM_FRAG, side: DoubleSide, blending: AdditiveBlending,
      uniforms: { uColor: { value: TEAL_300 }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    });
    cityObj(C, new Mesh(beamGeo, beam), 9.8);
    const padGeo = track(new CircleGeometry(70 * M, 64));
    padGeo.translate(x, y, z + 1 * M);
    const ring = mat({
      vertexShader: OFFICE_RING_VERT, fragmentShader: MARKER_FRAG, blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uPeriod: { value: 2.6 }, uPhase: { value: 0 }, uIntensity: { value: 0.9 }, uCore: { value: 0.08 }, uRings: { value: 1 },
        uHalo: { value: 0.6 }, uColor: { value: TEAL_300 }, uOpacity: { value: 0 },
      },
    });
    cityObj(C, new Mesh(padGeo, ring), 9.4);
    C.offices.push(beam, ring);
  };

  const buildBuildings = async (C: City, buf: ArrayBuffer) => {
    const d = decodeBuildings(buf);
    const pos: number[] = [], nrm: number[] = [], hgt: number[] = [], lmk: number[] = [];
    const epos: number[] = [], ehgt: number[] = [], elmk: number[] = [];
    let beacon: { x: number; y: number; z: number; h: number } | null = null;
    const rings: [Float32Array, number][] = [...d.footprints.map((r) => [r, 0] as [Float32Array, number]), ...d.landmark.map((r) => [r, 1] as [Float32Array, number])];
    let budget = performance.now();
    for (let i = 0; i < rings.length; i++) {
      // About 6 ms of extrusion per frame.
      if ((i & 63) === 0 && performance.now() - budget > 6) {
        await nextFrame();
        if (destroyed) return;
        budget = performance.now();
      }
      const [r, lm] = rings[i];
      const h = d.height[i], h0 = d.min[i];
      const pts: [number, number, number][] = [];
      for (let k = 0; k < r.length; k += 2) pts.push(toLocal(C, r[k + 1], r[k]));
      if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      if (pts.length < 3) continue;
      let area = 0;
      for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area < 0) pts.reverse(); // counter-clockwise, so walls face out
      const vert = (p: [number, number, number], n: [number, number, number], hh: number) => { pos.push(...p); nrm.push(...n); hgt.push(hh); lmk.push(lm); };
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const n: [number, number, number] = [dy / len, -dx / len, 0];
        vert(a, n, h0); vert(b, n, h0); vert(b, n, h);
        vert(a, n, h0); vert(b, n, h); vert(a, n, h);
        epos.push(...a, ...b); ehgt.push(h, h); elmk.push(lm, lm); // roof outline
        if (lm || h > 60) { epos.push(...a, ...a); ehgt.push(h0, h); elmk.push(lm, lm); } // corner edge on towers
      }
      for (const [a, b, c] of ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), [])) {
        const [p, q, t] = [pts[a], pts[b], pts[c]];
        const ccw = (q[0] - p[0]) * (t[1] - p[1]) - (q[1] - p[1]) * (t[0] - p[0]) > 0;
        for (const v of ccw ? [p, q, t] : [p, t, q]) vert(v, [0, 0, 1], h);
      }
      if (lm && (!beacon || h > beacon.h)) {
        const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
        beacon = { x: c[0], y: c[1], z: c[2], h };
      }
    }
    const g = track(new BufferGeometry());
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aN', new BufferAttribute(new Float32Array(nrm), 3));
    g.setAttribute('aH', new BufferAttribute(new Float32Array(hgt), 1));
    g.setAttribute('aLm', new BufferAttribute(new Float32Array(lmk), 1));
    const share = (m: ShaderMaterial) => { m.uniforms.uBox.value = C.box; C.all.push(m); return m; };
    const sun = new Vector3(-0.45, -0.55, 0.7).normalize(); // from the south-west, high
    C.bldMat = share(cityMat({
      vert: BUILDING_VERT, frag: BUILDING_FRAG, depthWrite: true,
      uniforms: { uRise: { value: 0 }, uWall: { value: NAVY_700 }, uRoof: { value: TEAL_600 }, uGlass: { value: TEAL_400 }, uLine: { value: TEAL_300 }, uSun: { value: sun } },
    }));
    cityObj(C, new Mesh(g, C.bldMat), 9.5);
    const eg = track(new BufferGeometry());
    eg.setAttribute('position', new BufferAttribute(new Float32Array(epos), 3));
    eg.setAttribute('aH', new BufferAttribute(new Float32Array(ehgt), 1));
    eg.setAttribute('aLm', new BufferAttribute(new Float32Array(elmk), 1));
    C.edgeMat = share(cityMat({ vert: BUILDING_EDGE_VERT, frag: BUILDING_EDGE_FRAG, uniforms: { uRise: { value: 0 }, uColor: { value: TEAL_300 } } }));
    cityObj(C, new LineSegments(eg, C.edgeMat), 9.6);
    // Office cities mark the office with its light column instead of a beacon.
    if (beacon && !officeStops.some((s) => s.city === C.cfg.id)) {
      const b = beacon as { x: number; y: number; z: number; h: number };
      C.beaconH = b.h;
      C.beaconMat = mat({
        vertexShader: BEACON_VERT, fragmentShader: BEACON_FRAG, blending: AdditiveBlending, depthTest: false,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: TEAL_300 }, uPx: { value: 22 * dpr0 }, uLift: { value: 0 } },
      });
      cityObj(C, new Points(segGeo(new Float32Array([b.x, b.y, b.z])), C.beaconMat), 9.7);
    }
  };

  const ensureCity = (id: string) => {
    const C = cityById[id];
    if (!C || C.ready || C.loading) return;
    C.loading = true;
    const land = id === osmRegion.id ? load(osmRegion.file) : Promise.resolve(null);
    Promise.all([load(C.cfg.file), land]).then(([b, l]) => {
      if (destroyed) return;
      buildCity(C, b, l);
      if (C.cfg.buildingsFile) load(C.cfg.buildingsFile).then((bb) => { if (!destroyed) buildBuildings(C, bb); }).catch(() => { /* optional layer */ });
    }).catch(() => { C.loading = false; });
  };

  // --- Cities --------------------------------------------------------------------------------
  const spriteLayer = (pts: { lat: number; lon: number }[], color: Vector3, px: number, r: number) => {
    const m = mat({ vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG, uniforms: { uColor: { value: color }, uOpacity: { value: 0 }, uPx: { value: px } } });
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { const v = latLonToVec3(p.lat, p.lon, r); pos.set([v.x, v.y, v.z], i * 3); });
    const o = new Points(segGeo(pos), m);
    o.renderOrder = 7;
    o.frustumCulled = false;
    globe.add(o);
    return m;
  };
  const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
  const worldCityMat = spriteLayer(worldCities, TEAL_300, 2.6 * dpr0, 1.0012);
  const regionCityMat = spriteLayer(regionCities, INK, 3.5 * dpr0, 1 + 8 * M);

  // --- Routes and arcs -----------------------------------------------------------------------
  const flowMat = (o: { reps: number; speed: number; base: number }) => mat({
    vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uA: { value: TEAL_500 }, uB: { value: TEAL_300 }, uReps: { value: o.reps }, uSpeed: { value: o.speed }, uBase: { value: o.base } },
  });
  const flowMats: ShaderMaterial[] = [];

  // Pakistan–China terrestrial route. From orbit: a lifted tube. Up close: a line on the ground that follows the
  // waypoints, with a flowing dash, so it stays the focal element over Pakistan and China.
  const routeCurve = new CatmullRomCurve3(chinaRoute.map((p) => latLonToVec3(p.lat, p.lon, 1)), false, 'centripetal');
  const samples = routeCurve.getPoints(160);
  const lifted = samples.map((p, i) => p.clone().normalize().multiplyScalar(1.004 + 0.024 * Math.sin((Math.PI * i) / (samples.length - 1))));
  const routeGeo = track(new TubeGeometry(new CatmullRomCurve3(lifted), 240, 0.0032, 5, false));
  const routeU = new Float32Array(routeGeo.attributes.uv.count);
  for (let i = 0; i < routeU.length; i++) routeU[i] = routeGeo.attributes.uv.getX(i);
  routeGeo.setAttribute('aU', new BufferAttribute(routeU, 1));
  const routeMat = flowMat({ reps: 9, speed: 0.35, base: 0.42 });
  flowMats.push(routeMat);
  const route = new Mesh(routeGeo, routeMat);
  route.renderOrder = 8;
  globe.add(route);

  const ground = routeCurve.getPoints(900).map((p) => p.normalize().multiplyScalar(1 + 6 * M));
  const groundPos = new Float32Array(ground.length * 3), groundU = new Float32Array(ground.length);
  ground.forEach((p, i) => { groundPos.set([p.x, p.y, p.z], i * 3); groundU[i] = i / (ground.length - 1); });
  const groundGeo = segGeo(groundPos);
  groundGeo.setAttribute('aU', new BufferAttribute(groundU, 1));
  const groundMat = flowMat({ reps: 26, speed: 0.6, base: 0.5 });
  flowMats.push(groundMat);
  const groundLine = new Line(groundGeo, groundMat);
  groundLine.renderOrder = 8;
  groundLine.frustumCulled = false;
  globe.add(groundLine);

  // Network arcs from the Ras Al Khaimah HQ out to Lahore and Illinois (arcOrigin/arcLinks in data/globe.ts):
  // 1px great-circle lines with a dash flowing away from the HQ, so they stay crisp at every zoom level.
  const arcMat = flowMat({ reps: 3, speed: 0.22, base: 0.16 });
  flowMats.push(arcMat);
  for (const m of arcLinks) {
    const a = latLonToVec3(arcOrigin.lat, arcOrigin.lon, 1), b = latLonToVec3(m.lat, m.lon, 1);
    const ang = a.angleTo(b);
    const N = 96;
    const pos = new Float32Array((N + 1) * 3), u = new Float32Array(N + 1);
    const q = new Quaternion().setFromUnitVectors(a, b);
    const qi = new Quaternion();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      qi.identity().slerp(q, t);
      // Height grows with distance but is capped, so the long Illinois arc hugs the globe instead of leaving the disc.
      const p = a.clone().applyQuaternion(qi).multiplyScalar(1.001 + Math.sin(Math.PI * t) * Math.min(0.02 + ang * 0.13, 0.09));
      pos.set([p.x, p.y, p.z], i * 3);
      u[i] = t;
    }
    const g = segGeo(pos);
    g.setAttribute('aU', new BufferAttribute(u, 1));
    const line = new Line(g, arcMat);
    line.renderOrder = 8;
    line.frustumCulled = false;
    globe.add(line);
  }

  // --- Markers (screen-size kept roughly constant as the camera descends) ---------------------
  const markerGeo = track(new CircleGeometry(1, 48));
  const markerMats: ShaderMaterial[] = [];
  const markerList: { mesh: Mesh; size: number }[] = [];
  const zAxis = new Vector3(0, 0, 1);
  const addMarker = (lat: number, lon: number, size: number, intensity: number, o: { phase?: number; period?: number; rings?: number; core?: number; halo?: number; color?: Vector3; fixed?: boolean; r?: number } = {}) => {
    const m = mat({
      vertexShader: MARKER_VERT, fragmentShader: MARKER_FRAG, blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uPeriod: { value: o.period ?? 2.6 }, uPhase: { value: o.phase ?? 0 }, uIntensity: { value: intensity },
        uCore: { value: o.core ?? 0.16 }, uRings: { value: o.rings ?? 1 }, uHalo: { value: o.halo ?? 1 }, uColor: { value: o.color ?? TEAL_300 }, uOpacity: { value: 1 },
      },
    });
    markerMats.push(m);
    const mesh = new Mesh(markerGeo, m);
    const dir = latLonToVec3(lat, lon, 1);
    mesh.position.copy(dir).multiplyScalar(o.r ?? 1.0015);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(zAxis, dir));
    mesh.scale.setScalar(size);
    mesh.renderOrder = 8;
    globe.add(mesh);
    markerList.push({ mesh, size: o.fixed ? -1 : size });
    return m;
  };
  // The big pulsing marker sits on the HQ the arcs start from; each arc end gets a market-style marker.
  const coreMarker = addMarker(arcOrigin.lat, arcOrigin.lon, 0.105, 0.9, { period: 2.4, core: 0.15 });
  const marketMats = [...markets.slice(1), ...arcLinks].map((m, i) => addMarker(m.lat, m.lon, 0.048, 0.62, { phase: i * 0.19, period: 3.4, rings: 0.55, core: 0.26 }));
  // Route waypoints between the cities (the cities themselves get city markers below).
  const waypointMats = chinaRoute.filter((p) => !cityStops.some((s) => s.lat === p.lat && s.lon === p.lon))
    .map((p) => addMarker(p.lat, p.lon, 0.03, 0, { rings: 0, core: 0.3 }));

  // City stops: marker, 10/25/50 km range rings with cardinal ticks, and a slow sweep ring. Shown when the
  // camera is low over that city.
  const ringGeo = (lat: number, lon: number) => {
    const ringPos: number[] = [];
    const c = latLonToVec3(lat, lon, 1);
    const east = new Vector3(0, 1, 0).cross(c).normalize();
    const north = c.clone().cross(east).normalize();
    const pt = (km: number, a: number) => c.clone().multiplyScalar(Math.cos(km / EARTH_KM))
      .add(east.clone().multiplyScalar(Math.sin(km / EARTH_KM) * Math.cos(a))).add(north.clone().multiplyScalar(Math.sin(km / EARTH_KM) * Math.sin(a))).multiplyScalar(1 + 6 * M);
    for (const km of [10, 25, 50]) {
      for (let i = 0; i < 120; i++) {
        if (km === 50 && i % 4 === 3) continue; // dashed outer ring
        const p = pt(km, (i / 120) * TAU), q = pt(km, ((i + 1) / 120) * TAU);
        ringPos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    for (let i = 0; i < 4; i++) { const p = pt(46, (i / 4) * TAU), q = pt(56, (i / 4) * TAU); ringPos.push(p.x, p.y, p.z, q.x, q.y, q.z); }
    return segGeo(new Float32Array(ringPos));
  };
  const cities = cityStops.map((s) => {
    const ring = lineMat(TEAL_300, 0);
    const rings = new LineSegments(ringGeo(s.lat, s.lon), ring);
    rings.renderOrder = 7;
    rings.frustumCulled = false;
    globe.add(rings);
    const isMarket = s.id === 'dubai';
    return {
      stop: s, dir: latLonToVec3(s.lat, s.lon, 1), ring, isMarket,
      marker: addMarker(s.lat, s.lon, isMarket ? 0.06 : 0.04, 0, { period: 3, rings: 0.7, core: 0.22, r: 1 + 8 * M }),
      sweep: addMarker(s.lat, s.lon, 50 / EARTH_KM, 0, { period: 4.5, rings: 1, core: 0, halo: 0, fixed: true, r: 1 + 7 * M }),
    };
  });

  // --- Camera graph --------------------------------------------------------------------------
  const home = { yaw: yawFor(focus.lon), pitch: focus.lat * DEG };
  const view = { yaw: home.yaw - 2.4, pitch: home.pitch * 0.35 }; // the free (draggable) global view
  let pos: Pos = { p: 'global', c: 'global', t: 0 };
  let target = 'global';
  const pan = { yaw: 0, pitch: 0 };
  const intro = { o: 0, s: 0.88, label: 0, alt: stopById.global.alt + 1.8 };
  let introDone = false;
  let motionPaused = false;
  let animT = 0;
  let velYaw = 0;
  let velPitch = 0;
  let focused = false;
  let hovering = false;
  let returning = false;
  let lastInteract = performance.now();
  let lastWheel = 0;
  let wheelPending = 0;
  let returnTween: gsap.core.Tween | null = null;
  let flight: gsap.core.Tween | null = null;
  let panTween: gsap.core.Tween | null = null;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  // Street level: dragging circles the camera around the point it looks at instead of panning the globe.
  const orbit = { h: 0, t: 0 };
  const ORBIT_L = 3.5;
  const cur = { yaw: 0, pitch: 0, alt: stopById.global.alt, tilt: 0, elev: 0, head: 0, lat: 0, lon: 0, level: 0 };
  let freeYaw = 0, freePitch = 0;
  let width = 1;
  let height = 1;
  let firstFrame = false;

  const isAncestorOrSelf = (a: string, b: string) => pathTo(b).some((s) => s.id === a);
  const restingAt = (): string | null => (pos.p === pos.c ? pos.p : pos.t >= 0.999 ? pos.c : pos.t <= 0.001 ? pos.p : null);
  const atGlobal = () => pos.p === pos.c || (pos.p === 'global' && pos.t < 0.05);

  const poseOf = (s: Stop): Pose => s.id === 'global'
    ? { yaw: freeYaw, pitch: freePitch, alt: s.alt, tilt: s.tilt, elev: 0, head: 0 }
    : { yaw: yawFor(s.lon), pitch: s.lat * DEG, alt: s.alt, tilt: s.tilt, elev: (s.elev ?? 0) * M, head: s.head ?? 0 };
  const logMix = (a: number, b: number, t: number) => Math.exp(mix(Math.log(a), Math.log(b), t));

  // Pose along one edge. Normal edges turn toward the child first, then descend. Edges with `via` follow those
  // points at a lower, forward-leaning altitude (the China leg tracks the terrestrial route).
  const solveEdge = (p: Stop, c: Stop, t: number): Pose => {
    const P = poseOf(p), C = poseOf(c);
    if (c.via) {
      const pts: [number, number][] = [[p.lat, p.lon], ...c.via, [c.lat, c.lon]];
      const lens = pts.slice(1).map(([la, lo], i) => Math.hypot(la - pts[i][0], (lo - pts[i][1]) * Math.cos(la * DEG)));
      const total = lens.reduce((a, b) => a + b, 0);
      let d = smooth(0, 1, t) * total, i = 0;
      while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
      const f = lens[i] ? d / lens[i] : 0;
      const lat = mix(pts[i][0], pts[i + 1][0], f), lon = mix(pts[i][1], pts[i + 1][1], f);
      const dip = Math.sin(Math.PI * t);
      return { yaw: yawFor(lon), pitch: lat * DEG, alt: logMix(P.alt, C.alt, smooth(0, 1, t)) * (1 - 0.45 * dip), tilt: mix(P.tilt, C.tilt, t) + 0.3 * dip, elev: mix(P.elev, C.elev, t), head: P.head + wrap(C.head - P.head) * t };
    }
    const oa = smooth(0, 0.7, t);
    return {
      yaw: P.yaw + wrap(C.yaw - P.yaw) * oa,
      pitch: mix(P.pitch, C.pitch, oa),
      alt: logMix(P.alt, C.alt, smooth(0.12, 1, t)),
      tilt: mix(P.tilt, C.tilt, smooth(0.3, 1, t)),
      elev: mix(P.elev, C.elev, smooth(0.3, 1, t)),
      head: P.head + wrap(C.head - P.head) * smooth(0.3, 1, t),
    };
  };
  const solve = (): Pose => (pos.p === pos.c ? poseOf(stopById.global) : solveEdge(stopById[pos.p], stopById[pos.c], pos.t));

  // Edges from where the camera is now to `id`: finish (or back out of) the current edge, up to the common
  // parent, then down.
  const legsTo = (id: string): Leg[] => {
    const legs: Leg[] = [];
    let from = restingAt();
    if (!from) {
      if (isAncestorOrSelf(pos.c, id)) { legs.push({ p: pos.p, c: pos.c, from: pos.t, to: 1 }); from = pos.c; }
      else { legs.push({ p: pos.p, c: pos.c, from: pos.t, to: 0 }); from = pos.p; }
    }
    const a = pathTo(from).map((s) => s.id), b = pathTo(id).map((s) => s.id);
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    for (let i = a.length - 1; i >= k; i--) legs.push({ p: a[i - 1], c: a[i], from: 1, to: 0 });
    for (let i = k; i < b.length; i++) legs.push({ p: b[i - 1], c: b[i], from: 0, to: 1 });
    return legs;
  };

  const setHint = () => {
    const el = opts.hint;
    if (!el) return;
    const deep = target !== 'global' || !atGlobal();
    el.textContent = focused || deep
      ? (coarse ? 'Pinch to zoom, tap outside to exit' : 'Scroll to zoom, Esc to step back')
      : (coarse ? 'Tap to focus, then pinch to zoom' : 'Click to focus, then scroll to zoom');
    el.dataset.show = String(introDone && (focused || hovering));
  };
  const touch = () => { lastInteract = performance.now(); returnTween?.kill(); returnTween = null; returning = false; };
  const setFocused = (v: boolean) => { focused = v; canvas.style.cursor = v ? 'zoom-in' : 'grab'; setHint(); };
  const setTarget = (id: string) => { if (id !== target) { target = id; opts.onTarget?.(id); } };

  let pendingStop: string | null = null;
  const flyTo = (id: string) => {
    if (!stopById[id]) return;
    if (!introDone) { pendingStop = id; return; }
    touch();
    flight?.kill(); flight = null;
    wheelPending = 0;
    const legs = legsTo(id);
    pathTo(id).forEach(ensureFor);
    setTarget(id);
    const lens = legs.map((l) => Math.abs(l.to - l.from));
    const total = lens.reduce((a, b) => a + b, 0);
    if (total < 0.002) { pos = id === 'global' ? { p: 'global', c: 'global', t: 0 } : { p: stopById[id].parent!, c: id, t: 1 }; return; }
    velYaw = velPitch = 0;
    panTween?.kill();
    gsap.to(pan, { yaw: 0, pitch: 0, duration: 0.9, ease: 'power3.out' });
    const prog = { s: 0 };
    flight = gsap.to(prog, {
      s: total, duration: 0.75 + total * 0.85, ease: 'power2.inOut',
      onUpdate: () => {
        let d = prog.s, i = 0;
        while (i < legs.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        const L = legs[i];
        pos = { p: L.p, c: L.c, t: mix(L.from, L.to, lens[i] ? clamp(d / lens[i], 0, 1) : 1) };
      },
      onComplete: () => {
        flight = null;
        pos = id === 'global' ? { p: 'global', c: 'global', t: 0 } : { p: stopById[id].parent!, c: id, t: 1 };
        setHint();
      },
    });
    setHint();
  };

  // Wheel / pinch: move along the current edge. Zooming in from a stop picks the child nearest the view centre;
  // zooming out goes to the parent. When input stops, settle on the nearer end.
  const centreDir = new Vector3();
  const zoomStep = (d: number) => {
    const here = restingAt();
    if (d > 0 && here) {
      const kids = childrenOf(here);
      if (!kids.length) { wheelPending = 0; return; }
      centreDir.copy(latLonToVec3(cur.lat, cur.lon, 1));
      const next = kids.reduce((a, b) => (centreDir.angleTo(latLonToVec3(a.lat, a.lon, 1)) <= centreDir.angleTo(latLonToVec3(b.lat, b.lon, 1)) ? a : b));
      ensureFor(next);
      pos = { p: here, c: next.id, t: 0 };
      setTarget(next.id);
    } else if (d < 0 && here) {
      const s = stopById[here];
      if (!s.parent) { wheelPending = 0; return; }
      pos = { p: s.parent, c: here, t: 1 };
      setTarget(s.parent);
    }
    if (pos.p === pos.c) return;
    pos = { ...pos, t: clamp(pos.t + d, 0, 1) };
  };

  const startIntro = () => {
    gsap.to(intro, { o: 1, duration: 1.1, ease: 'power2.out' });
    gsap.to(intro, { s: 1, duration: 1.8, ease: 'expo.out' });
    gsap.to(intro, { alt: stopById.global.alt, duration: 3, ease: 'power3.out' });
    gsap.to(view, {
      yaw: home.yaw, pitch: home.pitch, duration: 3, ease: 'power3.out',
      onComplete: () => {
        introDone = true; lastInteract = performance.now(); gsap.to(intro, { label: 1, duration: 0.8 }); setHint();
        if (pendingStop) flyTo(pendingStop);
      },
    });
  };

  // --- Sizing --------------------------------------------------------------------------------
  let dpr = 1;
  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    pointsMat.uniforms.uScale.value = (height * dpr) / (2 * Math.tan((FOV * Math.PI) / 360));
    pointsMat.uniforms.uMaxPx.value = 3.4 * dpr;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // --- Picking: screen point → lat/lon on the globe ------------------------------------------
  const ray = new Ray();
  const hit = new Vector3();
  const inv = new Matrix4();
  const sphere = new Sphere(new Vector3(), 1);
  const pick = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    const ndc = new Vector3(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    ray.origin.copy(camera.position);
    ray.direction.copy(ndc.unproject(camera).sub(camera.position).normalize());
    sphere.radius = globe.scale.x;
    if (!ray.intersectSphere(sphere, hit)) return null;
    return hit.applyMatrix4(inv.copy(globe.matrixWorld).invert()).normalize().clone();
  };

  // --- Interaction ---------------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let moved = 0;
  let downAt = 0;
  let pinchLast = 0;

  const radPerPx = () => (2 * Math.tan((FOV * Math.PI) / 360) * cur.alt) / height;

  const onDown = (e: PointerEvent) => {
    if (!introDone || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    touch();
    velYaw = velPitch = 0;
    panTween?.kill();
    if (pointers.size === 1) { dragging = true; moved = 0; downAt = performance.now(); canvas.style.cursor = 'grabbing'; }
    if (pointers.size === 2 && focused) {
      const [a, b] = [...pointers.values()];
      pinchLast = Math.hypot(a.x - b.x, a.y - b.y);
      flight?.kill(); flight = null;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const r = canvas.getBoundingClientRect();
      parallax.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      parallax.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    touch();
    if (pointers.size >= 2 && focused) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchLast > 0) { wheelPending += Math.log(d / pinchLast) * 1.6; lastWheel = performance.now(); }
      pinchLast = d;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    const k = radPerPx();
    if (atGlobal() && !flight) {
      view.yaw += dx * k;
      view.pitch = clamp(view.pitch + dy * k, -1.3, 1.3);
      velYaw = dx * k * 60 * 0.35 + velYaw * 0.5;
      velPitch = dy * k * 60 * 0.35 + velPitch * 0.5;
    } else {
      // Zoomed in: drag pans around the stop, within a limit, and springs back after a moment. At street level
      // it circles the camera around the point it's looking at instead (and that stays where you leave it).
      if (cur.level > ORBIT_L) {
        orbit.h = wrap(orbit.h - dx * 0.006);
        orbit.t = clamp(orbit.t - dy * 0.003, -0.55, 0.22);
      } else {
        const lim = 0.32 * cur.alt + 0.004 * Math.min(1, cur.alt / 0.03);
        pan.yaw = clamp(pan.yaw + dx * k, -lim, lim);
        pan.pitch = clamp(pan.pitch + dy * k, -lim * 0.7, lim * 0.7);
      }
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (pointers.size === 0) {
      dragging = false;
      canvas.style.cursor = focused ? 'zoom-in' : 'grab';
      if (!atGlobal()) panTween = gsap.to(pan, { yaw: 0, pitch: 0, duration: 1.4, delay: 2.2, ease: 'power3.inOut' });
      if (e.type === 'pointerup' && moved < 6 && performance.now() - downAt < 500) onTap(e.clientX, e.clientY);
    }
    pinchLast = 0;
    touch();
  };
  // A tap near one of the places you can go next flies there; anything else focuses the globe.
  const onTap = (x: number, y: number) => {
    const dir = pick(x, y);
    velYaw = velPitch = 0;
    setFocused(true);
    if (!dir) return;
    const here = stopById[restingAt() ?? target];
    const kids = childrenOf(here.id);
    const options = kids.length ? kids : here.parent ? childrenOf(here.parent).filter((s) => s.id !== here.id) : [];
    let best: Stop | null = null, bestD = Infinity;
    for (const s of options) {
      const d = dir.angleTo(latLonToVec3(s.lat, s.lon, 1)) / DEG;
      if (d < (s.pick ?? 2) && d < bestD) { best = s; bestD = d; }
    }
    if (best) flyTo(best.id);
  };
  const onWheel = (e: WheelEvent) => {
    if (!focused) return;
    e.preventDefault();
    touch();
    if (flight) { flight.kill(); flight = null; }
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    wheelPending = clamp(wheelPending - delta * 0.0022, -1, 1);
    lastWheel = performance.now();
    setHint();
  };
  const stepBack = () => {
    const s = stopById[target];
    if (s.parent) flyTo(s.parent);
    else setFocused(false);
  };
  const onEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') { hovering = true; setHint(); } };
  const onLeave = () => { hovering = false; parallax.tx = parallax.ty = 0; setHint(); };
  const root = container.closest('[data-globe-hero]') ?? container;
  const onDocDown = (e: PointerEvent) => { if (focused && !root.contains(e.target as Node)) setFocused(false); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || (!focused && target === 'global')) return;
    // Let Escape inside other widgets (menus) do their own thing.
    if ((e.target as HTMLElement | null)?.closest?.('[role="menu"], dialog')) return;
    stepBack();
  };
  const onLost = (e: Event) => { e.preventDefault(); opts.onContextLost?.(); };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerenter', onEnter);
  container.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('webglcontextlost', onLost);
  document.addEventListener('pointerdown', onDocDown);
  document.addEventListener('keydown', onKey);

  // --- Frame ---------------------------------------------------------------------------------
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const camLocal = new Vector3();
  const pivot = new Vector3();
  const camDir = new Vector3();
  let lastState = '';
  // Anchored just above the ground (or `h` metres up), so labels stay on their spot down to street level.
  // `ext`: the label's box relative to its point (measured once shown, and again after a flip); `k`: eased
  // 1/0 for "not covered by a higher-priority label". Sorted by priority so the collision pass is one sweep.
  const tagState = (opts.tags ?? [])
    .map((t, i) => ({ ...t, i, pos: latLonToVec3(t.lat, t.lon, 1 + (t.h ?? 30) * M), dir: latLonToVec3(t.lat, t.lon, 1), w: undefined as number | undefined, ext: null as number[] | null, k: 1, dx: 0 }))
    .sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9) || a.i - b.i);
  const placed: number[][] = [];
  const measure = (el: HTMLElement) => {
    const o = el.getBoundingClientRect();
    const rs = [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 2 && r.height > 2);
    return rs.length ? [Math.min(...rs.map((r) => r.left)) - o.left, Math.min(...rs.map((r) => r.top)) - o.top, Math.max(...rs.map((r) => r.right)) - o.left, Math.max(...rs.map((r) => r.bottom)) - o.top] : null;
  };
  const nearness = (dir: Vector3, deg: number) => 1 - smooth(deg * 0.6, deg, camDir.angleTo(dir) / DEG);

  const frame = (_t: number, dt: number) => {
    if (!motionPaused) animT += dt;
    const now = performance.now();

    if (introDone) {
      if (!flight) {
        // Wheel / pinch input, eased in over a few frames.
        if (Math.abs(wheelPending) > 1e-5) {
          const step = wheelPending * (1 - Math.exp(-dt * 7));
          wheelPending -= step;
          zoomStep(step);
        }
        const here = restingAt();
        if (!here && now - lastWheel > 420 && pointers.size < 2) {
          wheelPending = 0;
          flyTo(pos.t > 0.5 ? pos.c : pos.p);
        } else if (here && Math.abs(wheelPending) < 1e-4 && target !== here && now - lastWheel > 420) {
          setTarget(here);
        }
      }
      if (atGlobal()) {
        // Inertia after a drag (global view only).
        if (!dragging && (Math.abs(velYaw) > 1e-4 || Math.abs(velPitch) > 1e-4)) {
          view.yaw += velYaw * dt;
          view.pitch = clamp(view.pitch + velPitch * dt, -1.3, 1.3);
          const damp = Math.exp(-3.2 * dt);
          velYaw *= damp; velPitch *= damp;
        }
        // Idle: ease back to the Pakistan view (and release focus so page scroll is never held).
        if (!dragging && !returning && !flight && target === 'global' && pos.p === pos.c && now - lastInteract > IDLE_MS) {
          const dy = wrap(view.yaw - home.yaw);
          const far = Math.abs(dy) > 0.01 || Math.abs(view.pitch - home.pitch) > 0.01;
          if (far || focused) {
            returning = true;
            velYaw = velPitch = 0;
            if (focused) setFocused(false);
            view.yaw = home.yaw + dy;
            returnTween = gsap.to(view, { yaw: home.yaw, pitch: home.pitch, duration: 1.6, ease: 'power3.inOut', onComplete: () => { returning = false; } });
          }
        }
      } else if (!(pos.p === 'global' && pos.t < 0.995)) {
        // Out of sight of the global view: reset it so stepping back out lands on the home view.
        view.yaw = home.yaw; view.pitch = home.pitch; velYaw = velPitch = 0;
      }
      parallax.x += (parallax.tx - parallax.x) * Math.min(1, dt * 3);
      parallax.y += (parallax.ty - parallax.y) * Math.min(1, dt * 3);
    }

    // Free global view, with drift, cursor parallax and a slight tilt with page scroll speed (scroll kick,
    // mouse/trackpad only) while the camera is near orbit.
    const g = pos.p === pos.c ? 1 : pos.p === 'global' ? 1 - smooth(0, 0.35, pos.t) : 0;
    const drift = introDone ? Math.sin(animT * 0.22) * 0.045 * g : 0;
    const par = dragging || focused ? 0 : g;
    freeYaw = view.yaw + drift + parallax.x * 0.07 * par;
    freePitch = view.pitch + (parallax.y * 0.04 + scrollKick() * 0.12) * par;
    const pose = solve();
    const alt = introDone ? pose.alt : intro.alt;
    const yaw = pose.yaw + pan.yaw;
    const pitch = clamp(pose.pitch + pan.pitch, -1.4, 1.4);
    const L = levelOf(alt);
    // Street-level orbit: idle slowly circles the tower; climbing back out unwinds it.
    const ow = smooth(ORBIT_L - 0.4, ORBIT_L + 0.3, L);
    if (ow > 0.5 && !dragging && !flight && !motionPaused && now - lastInteract > 2500 && restingAt()) orbit.h = wrap(orbit.h + dt * 0.045);
    if (ow === 0) { orbit.h = 0; orbit.t = 0; }
    cur.yaw = yaw; cur.pitch = pitch; cur.alt = alt;
    cur.tilt = clamp(pose.tilt + orbit.t * ow, 0, 1.5); cur.elev = pose.elev; cur.head = pose.head + orbit.h * ow;
    cur.lat = pitch / DEG;
    cur.lon = ((-Math.PI / 2 - yaw) / DEG + 540) % 360 - 180;
    cur.level = L;
    camDir.copy(latLonToVec3(cur.lat, cur.lon, 1));

    globe.rotation.set(pitch, yaw, 0);
    globe.scale.setScalar(intro.s);
    const s = intro.s;
    // The camera looks at a point `elev` above the ground, from `alt` away, leaning `tilt` from straight down
    // and turned `head` around that point's vertical (0 = from the south, north up).
    pivot.set(0, 0, s * (1 + cur.elev));
    const st = Math.sin(cur.tilt), ct = Math.cos(cur.tilt), sh = Math.sin(cur.head), ch = Math.cos(cur.head);
    camera.position.set(st * sh * alt, -st * ch * alt, pivot.z + ct * alt);
    camera.up.set(-ct * sh, ct * ch, st);
    camera.lookAt(pivot);
    const surf = camera.position.length() - s;
    // Near plane tracks the altitude (precision up close, down to rooftop height); far plane always covers the whole globe.
    const near = clamp(surf * 0.25, 5e-7, 0.1);
    const far = camera.position.length() + 2;
    if (Math.abs(camera.near - near) / near > 0.05 || Math.abs(camera.far - far) > 0.05) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
    globe.updateMatrixWorld(true);

    // Layer weights from the zoom level.
    const detail = smooth(0.25, 0.85, L); // regional layers in, world layer out (inside their boxes)
    const deep = smooth(1.3, 1.9, L);     // city focal elements
    haloMat.uniforms.uOpacity.value = 1 - smooth(0.1, 0.6, L);
    // Near the ground the ocean rises from 32 km down (where it never touches the land layers from orbit) to just
    // under sea level, so the horizon sits where it should, and drops the rim light that's meant for the limb.
    const sea = smooth(2.5, 3.2, L);
    body.scale.setScalar(mix(1, 0.99996 / 0.995, sea));
    bodyMat.uniforms.uRimK.value = 1 - 0.9 * sea;
    atmosMat.uniforms.uStrength.value = mix(0.55, 0.38, smooth(0.6, 1.8, L));
    gratMat.uniforms.uOpacity.value = 0.05 * (1 - smooth(0.2, 0.7, L));
    pointsMat.uniforms.uOpacity.value = mix(1, 0.4, smooth(0.3, 1, L));
    coastMat.uniforms.uOpacity.value = mix(0.32, 0.22, smooth(0.3, 1, L));
    // Street-level city layers: lines from city zoom, then (Dubai) crisp land and 3D buildings below ~25 km.
    const hKm = surf * EARTH_KM;
    let cityOnScreen = false;
    for (const C of citiesL) {
      const lw = C.ready ? smooth(1.9, 2.25, L) * nearness(C.dir, 1.4) * C.fade.v : 0;
      C.w = lw;
      C.ground = C.groundMat ? smooth(2.9, 3.3, L) * lw : 0;
      C.group.visible = lw > 0.002;
      if (!C.group.visible) continue;
      cityOnScreen ||= lw > 0.05;
      const fog = C.all[0].uniforms.uFog.value as Vector2;
      fog.set((4 + 5 * hKm) / EARTH_KM, (10 + 12 * hKm) / EARTH_KM);
      C.all.forEach((m) => { m.uniforms.uFog.value = fog; });
      for (const l of C.lines) l.mat.uniforms.uOpacity.value = l.base * (l.z[0] < 0 ? C.ground : lw * smooth(l.z[0], l.z[1], L));
      if (C.groundMat) C.groundMat.uniforms.uOpacity.value = C.ground;
      if (C.hazeMat) C.hazeMat.uniforms.uOpacity.value = 0.32 * smooth(3.3, 3.9, L) * lw;
      if (C.bldMat && C.edgeMat) {
        const rise = smooth(3.0, 3.85, L);
        C.bldMat.uniforms.uRise.value = C.edgeMat.uniforms.uRise.value = rise;
        C.bldMat.uniforms.uOpacity.value = smooth(2.9, 3.3, L) * lw;
        C.edgeMat.uniforms.uOpacity.value = smooth(2.9, 3.3, L) * lw;
      }
      if (C.beaconMat) {
        C.beaconMat.uniforms.uOpacity.value = smooth(3.4, 3.9, L) * lw;
        C.beaconMat.uniforms.uTime.value = animT;
        C.beaconMat.uniforms.uLift.value = C.beaconH * M * smooth(3.0, 3.85, L); // rides up with the tower
      }
      const offW = smooth(2.9, 3.4, L) * lw;
      for (const m of C.offices) { m.uniforms.uOpacity.value = offW; m.uniforms.uTime.value = animT; }
    }
    const dubaiGround = cityById[osmRegion.id]?.ground ?? 0;
    // The OpenStreetMap patch hands over to the city layer's crisp land; it keeps cutting the coarser layers.
    const osmW = osmLayer.ready ? smooth(1.25, 1.75, L) * osmLayer.fade.v * (1 - dubaiGround) : 0;
    const osmCut = Math.max(osmW, dubaiGround);
    layers.forEach((Ly, i) => {
      const w = Ly.ready ? (Ly.osm ? osmW : detail * Ly.fade.v) : 0;
      worldCut.forEach((m) => { (m.uniforms.uCutW.value as number[])[i] = Ly.osm ? osmCut : w; });
      Ly.patch.uniforms.uOpacity.value = w;
      Ly.coast.uniforms.uOpacity.value = (Ly.osm ? 0.85 : 0.7) * w;
      Ly.border.uniforms.uOpacity.value = 0.35 * w;
      Ly.hi.uniforms.uOpacity.value = 0.95 * w;
      Ly.prov.uniforms.uOpacity.value = 0.4 * w;
      Ly.river.uniforms.uOpacity.value = 0.6 * w;
      Ly.road.uniforms.uOpacity.value = 0.2 * w * smooth(0.7, 1.0, L);
      Ly.rail.uniforms.uOpacity.value = 0.16 * w * smooth(0.7, 1.0, L);
      // Brighten the dot field around the view centre.
      const B = Ly.box;
      const kmLon = Ly.patch.uniforms.uKmLon.value as number;
      (Ly.patch.uniforms.uFocus.value as Vector2).set((cur.lon - B.lon0) * kmLon, (cur.lat - B.lat0) * 110.57);
      Ly.patch.uniforms.uFocusKm.value = Math.max(8, alt * EARTH_KM * 0.12);
    });
    layerMats(gulf).forEach((m) => { (m.uniforms.uCutW.value as number[])[0] = osmCut; });
    worldCityMat.uniforms.uOpacity.value = 0.5 * (1 - smooth(0.3, 0.9, L)) * intro.label;
    regionCityMat.uniforms.uOpacity.value = 0.8 * smooth(1.1, 1.7, L);
    routeMat.uniforms.uOpacity.value = 1 - smooth(0.2, 0.6, L);
    groundMat.uniforms.uOpacity.value = smooth(0.3, 0.7, L);
    waypointMats.forEach((m) => { m.uniforms.uIntensity.value = 0.7 * smooth(0.4, 0.9, L); });
    arcMat.uniforms.uOpacity.value = mix(1, 0.3, smooth(0.4, 1.1, L)) * (1 - smooth(2.4, 2.9, L)); // illustrative links recede below orbit
    coreMarker.uniforms.uOpacity.value = 1 - smooth(0.3, 0.9, L);
    marketMats.forEach((m) => { m.uniforms.uOpacity.value = 1 - smooth(0.6, 1.3, L); });
    // City markers and range rings step aside once the street-level layers are down at the ground.
    const street = 1 - smooth(3.05, 3.45, L); // after Lahore (level ≈ 3.0), before Downtown Dubai (≈ 4.1) and the office stops (≈ 4.9)
    for (const c of cities) {
      const n = nearness(c.dir, 1.5);
      c.ring.uniforms.uOpacity.value = 0.38 * deep * n * street;
      c.sweep.uniforms.uIntensity.value = 0.28 * deep * n * street;
      c.marker.uniforms.uIntensity.value = (c.isMarket ? mix(0.62, 0.95, smooth(0.4, 1.2, L)) : 0.85 * smooth(0.4, 0.9, L)) * street;
    }
    regionCityMat.uniforms.uOpacity.value *= street;
    const osmOnScreen = cityOnScreen || (osmW > 0.05 && nearness(latLonToVec3((osmLayer.box.lat0 + osmLayer.box.lat1) / 2, (osmLayer.box.lon0 + osmLayer.box.lon1) / 2, 1), 2) > 0.01);

    for (const m of [...flowMats, ...markerMats]) m.uniforms.uTime.value = animT;
    // Markers: scale with camera distance so they keep a similar on-screen size from orbit to street level.
    camLocal.copy(camera.position).applyMatrix4(inv.copy(globe.matrixWorld).invert());
    for (const mk of markerList) {
      if (mk.size < 0) continue;
      const d = camLocal.distanceTo(mk.mesh.position);
      mk.mesh.scale.setScalar(mk.size * clamp(d / 4.8, 0.0025, 1.3));
    }
    canvas.style.opacity = String(intro.o);

    // HTML tags. A label that would overlap one already placed (higher priority) fades out until it's clear.
    placed.length = 0;
    for (const t of tagState) {
      tmp.copy(t.pos).applyMatrix4(globe.matrixWorld);
      const facing = tmp2.copy(tmp).normalize().dot(camera.position.clone().sub(tmp).normalize());
      const [z0, z1] = t.z;
      let w = (z0 < 0 ? 1 : smooth(z0 - 0.12, z0 + 0.1, L)) * (1 - smooth(z1 - 0.1, z1 + 0.12, L));
      if (t.near) w *= nearness(t.dir, t.near);
      tmp.project(camera);
      const x = (tmp.x * 0.5 + 0.5) * width;
      const y = (-tmp.y * 0.5 + 0.5) * height;
      // Far side of the globe hides a tag; at street level the camera looks across, so only the true horizon does.
      const vis = clamp((facing - mix(0.05, -0.3, smooth(2.8, 3.4, L))) / 0.2, 0, 1) * w * intro.label * (tmp.z < 1 ? 1 : 0);
      t.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // Labels that read rightwards flip to the left when they'd run past the right edge. Centred labels
      // (`data-clamp`, the office cards) slide sideways instead (--dx), so they stay inside the box.
      const clampX = t.el.dataset.clamp !== undefined;
      if (!clampX) {
        if (t.w === undefined && vis > 0) t.w = Math.max(0, ...[...t.el.children].map((c) => (c as HTMLElement).offsetWidth));
        const flip = x + (t.w ?? 0) + 16 > width;
        if ((t.el.dataset.flip === 'true') !== flip) { t.el.dataset.flip = String(flip); t.ext = null; }
      }
      let clear = 1;
      if (vis > 0.05) {
        if (!t.ext) t.ext = measure(t.el);
        const e = t.ext;
        if (e && clampX) {
          const dx = Math.round(x + e[0] < 6 ? 6 - (x + e[0]) : x + e[2] > width - 6 ? width - 6 - (x + e[2]) : 0);
          if (dx !== t.dx) { t.dx = dx; t.el.style.setProperty('--dx', `${dx}px`); }
        }
        if (e) {
          const r = [x + e[0] - 12, y + e[1] - 3, x + e[2] + 12, y + e[3] + 3]; // keep a clear gap, not just no overlap
          if (placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) clear = 0;
          else placed.push(r);
        }
      }
      t.k += (clear - t.k) * Math.min(1, dt * 8);
      const v = vis * t.k;
      t.el.style.opacity = v.toFixed(3);
      t.el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
    }

    if (opts.onState) {
      const stop = flight || Math.abs(wheelPending) > 1e-3 ? null : restingAt();
      const step = surf < 0.002 ? 0.01 : alt < 0.2 ? 5 : 50;
      const altKm = Math.round((surf * EARTH_KM) / step) * step;
      const key = `${stop}|${cur.lat.toFixed(2)}|${cur.lon.toFixed(2)}|${altKm}|${focused}|${osmOnScreen}`;
      if (key !== lastState) { lastState = key; opts.onState({ stop, lat: cur.lat, lon: cur.lon, altKm, focused, osm: osmOnScreen }); }
    }

    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      opts.onFirstFrame?.();
      startIntro();
    }
  };

  const loop = visibleLoop(container, frame);
  const pauseApi = { pause() { motionPaused = true; }, play() { motionPaused = false; } };
  bindPauseButton(opts.pauseButton ?? null, pauseApi);
  setHint();

  return {
    flyTo,
    destroy() {
      destroyed = true;
      loop.destroy();
      gsap.killTweensOf([view, intro, pan, orbit, ...layers.map((l) => l.fade), ...citiesL.map((c) => c.fade)]);
      flight?.kill();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      container.removeEventListener('pointerenter', onEnter);
      container.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
