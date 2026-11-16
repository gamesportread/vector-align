import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Line, useGLTF, useTexture } from '@react-three/drei';
import { TaskCameraControls } from '../scene/TaskCameraControls';
import { TASK_CAMERA_HINT_TEXT } from '../scene/taskCameraConfig';
import {
  applyAntiMoireToMaterial,
  configureMipmappedTexture,
  type RenderQuality
} from '../scene/textureQuality';
import {
  createSupersonicPlumeGeometry,
  createTurbulentFireballMaterial,
  createVolumetricPlumeMaterial
} from '../scene/volumetricFire';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  Vector4
} from 'three';
import { useSession } from '../../store';
import {
  computeReferencePitchDeg,
  type LiftoffState,
  type RocketVehicleConfig
} from '../../sim/liftoff';
import type { Language } from '../../sim/types';

const terrainTextureCache = new Map<string, CanvasTexture>();
let cachedConcretePadTex: CanvasTexture | null = null;
let cachedGroundDetailTex: CanvasTexture | null = null;
let cachedSoftCloudTex: CanvasTexture | null = null;
const nozzleBellGeoCache = new Map<string, BufferGeometry>();
let cachedPlumeGeos: { outerGeo: BufferGeometry; midGeo: BufferGeometry; innerGeo: BufferGeometry } | null = null;
let cachedCrashFlameGeo: BufferGeometry | null = null;
let cachedOceanRingGeo: TorusGeometry | null = null;

function getSharedPlumeGeos() {
  if (!cachedPlumeGeos) {
    cachedPlumeGeos = {
      outerGeo: createSupersonicPlumeGeometry(0.72, 2.35, 13.0, 36, 24),
      midGeo: createSupersonicPlumeGeometry(0.52, 1.55, 10.6, 32, 20),
      innerGeo: createSupersonicPlumeGeometry(0.38, 0.98, 8.2, 28, 18)
    };
  }
  return cachedPlumeGeos;
}

function getSharedNozzleBellGeo(rTop: number, rBottom: number, height: number): BufferGeometry {
  const key = `${rTop}-${rBottom}-${height}`;
  let geo = nozzleBellGeoCache.get(key);
  if (!geo) {
    geo = createNozzleBellGeometry(rTop, rBottom, height, 36, 12);
    nozzleBellGeoCache.set(key, geo);
  }
  return geo;
}

/**
 * Generate 2048x2048 Kennedy Space Center LC-39A coastal launchpad ground texture
 * Features: Coastal scrub vegetation, Atlantic shoreline foam, octagonal pad apron,
 * Dual-lane Crawlerway, perimeter service roads, flame trench scorch marks, and radial edge falloff
 */
/**
 * Camera-relative ground mapping.
 * The real distance from the rocket down to the hardstand (6.65 + 0.11·h units) is log-compressed
 * to D, and everything on the ground is scaled about the rocket by k = D / real. Scaling about the
 * viewpoint is equivalent to perspective, so the pad shrinks and the planet only ever recedes.
 */
const PX_PER_M = 0.11;
const HARDSTAND_DEPTH = 6.65;
const GROUND_COMPRESSION = 20;
const EARTH_RADIUS_UNITS = 6371000 * PX_PER_M;
const EARTH_MAX_RENDER_RADIUS = 30000;

function groundView(altitudeM: number): { depth: number; k: number } {
  const h = Math.max(0, altitudeM) * PX_PER_M;
  const real = HARDSTAND_DEPTH + h;
  const depth = HARDSTAND_DEPTH + GROUND_COMPRESSION * Math.log(1 + h / GROUND_COMPRESSION);
  return { depth, k: depth / real };
}

/** World y of a point at `localY` units above the hardstand (local scene scale). */
function groundToWorldY(altitudeM: number, localY: number): number {
  const { depth, k } = groundView(altitudeM);
  return -depth + localY * k;
}

/** World x offset for Cape terrain & pad so downrange travel shifts land/shoreline/ocean accurately under the craft. */
function groundOffsetX(downrangeM: number, k: number): number {
  const shiftM = Math.sign(downrangeM) * Math.max(0, Math.abs(downrangeM) - 20);
  const clampedM = Math.max(-12000, Math.min(12000, shiftM));
  return -clampedM * PX_PER_M * k;
}

/**
 * Cape Canaveral terrain painter (world units, x = east, z = south).
 * The same painter feeds a wide low-res disc and a high-res inner disc so both line up.
 */
function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function periodicNoise(x: number, z: number, period: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash2(w(ix), w(iz));
  const b = hash2(w(ix + 1), w(iz));
  const c = hash2(w(ix), w(iz + 1));
  const d = hash2(w(ix + 1), w(iz + 1));
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Crawlerway centreline from the pad ramp toward the VAB (west-north-west). */
const CRAWLERWAY: Array<[number, number]> = [
  [0, -24],
  [0, -70],
  [-22, -108],
  [-70, -150],
  [-280, -232]
];

function createTerrainTexture(extent: number, size: number, edgeFade: boolean): CanvasTexture {
  const cacheKey = `${extent}-${size}-${edgeFade}`;
  const cached = terrainTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const scale = extent / size;
  const octaves = scale < 0.1 ? 6 : 5;

  // 1. Vegetation field: palmetto scrub, dry grass, sand, wet marsh — per pixel fbm
  for (let py = 0; py < size; py++) {
    const z = (py + 0.5) * scale - extent / 2;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) * scale - extent / 2;
      const broad = fbm(x * 0.012 + 11.3, z * 0.012 - 4.1, 4);
      const mid = fbm(x * 0.09, z * 0.09, octaves);
      const fine = valueNoise(x * 1.7, z * 1.7);
      const r2 = Math.hypot(x, z);

      // palette blend
      let r = 74, g = 88, b = 48; // scrub green
      const dry = Math.min(1, Math.max(0, (broad - 0.42) * 3.2));
      r += (122 - r) * dry; g += (120 - g) * dry; b += (78 - b) * dry;
      const dark = Math.min(1, Math.max(0, (mid - 0.55) * 4));
      r += (44 - r) * dark; g += (60 - g) * dark; b += (34 - b) * dark;
      const sand = Math.min(1, Math.max(0, (0.32 - mid) * 5)) * 0.8;
      r += (176 - r) * sand; g += (164 - g) * sand; b += (124 - b) * sand;
      const marsh = Math.min(1, Math.max(0, (0.36 - broad) * 4)) * 0.7;
      r += (58 - r) * marsh; g += (78 - g) * marsh; b += (66 - b) * marsh;

      // cleared and mowed apron around the hardstand
      const apron = Math.min(1, Math.max(0, (30 - r2) / 6));
      r += (138 - r) * apron * 0.75; g += (136 - g) * apron * 0.75; b += (98 - b) * apron * 0.75;
      // pale sandy fill right at the mound foot
      const foot = Math.min(1, Math.max(0, (21 - r2) / 3));
      r += (170 - r) * foot * 0.7; g += (160 - g) * foot * 0.7; b += (128 - b) * foot * 0.7;

      const n = 0.86 + fine * 0.28;
      const i = (py * size + px) * 4;
      data[i] = Math.min(255, r * n);
      data[i + 1] = Math.min(255, g * n);
      data[i + 2] = Math.min(255, b * n);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Vector features in world units
  ctx.save();
  ctx.setTransform(size / extent, 0, 0, size / extent, size / 2, size / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 2. Banana River and Indian River lagoons (west) and inland ponds
  const half = extent / 2 + 20;
  const step = Math.max(10, extent / 300);
  const fillBand = (west: (z: number) => number, east: (z: number) => number) => {
    ctx.beginPath();
    ctx.moveTo(west(-half), -half);
    for (let z = -half; z <= half; z += step) ctx.lineTo(west(z), z);
    for (let z = half; z >= -half; z -= step) ctx.lineTo(east(z), z);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#35565a';
  fillBand(
    (z) => -470 + Math.sin(z * 0.004) * 60 + Math.cos(z * 0.013) * 18,
    (z) => -150 + Math.sin(z * 0.021) * 18 + Math.cos(z * 0.057) * 7
  );
  ctx.fillStyle = '#33545a';
  fillBand(
    (z) => -1720 + Math.sin(z * 0.003 + 1.2) * 90 + Math.cos(z * 0.011) * 25,
    (z) => -1380 + Math.sin(z * 0.0035) * 70 + Math.cos(z * 0.017) * 20
  );
  ctx.fillStyle = '#3a5b5c';
  for (const [px, pz, rx, rz, rot] of [
    [-70, 40, 14, 6, 0.4],
    [55, 70, 10, 4, -0.3],
    [-35, 105, 18, 7, 0.1],
    [95, -95, 12, 5, 0.8],
    [-820, -600, 60, 22, 0.5],
    [-950, 900, 80, 30, -0.2],
    [-640, 1500, 45, 18, 0.9]
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(px, pz, rx, rz, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Atlantic beach + surf (east); the coast bulges out to Cape Canaveral ~20 km south
  const shore = (z: number) =>
    158 + Math.sin(z * 0.012) * 6 + Math.cos(z * 0.031) * 2.5 + 430 * Math.exp(-(((z - 2100) / 750) ** 2));
  const eastEdge = half + 400;
  const coastPath = (offset: number) => {
    ctx.beginPath();
    ctx.moveTo(shore(-half) + offset, -half);
    for (let z = -half; z <= half; z += step) ctx.lineTo(shore(z) + offset, z);
  };
  ctx.fillStyle = '#d6cba6';
  coastPath(-9);
  ctx.lineTo(eastEdge, half);
  ctx.lineTo(eastEdge, -half);
  ctx.closePath();
  ctx.fill();
  coastPath(0);
  ctx.lineTo(eastEdge, half);
  ctx.lineTo(eastEdge, -half);
  ctx.closePath();
  ctx.fillStyle = '#173f5c';
  ctx.fill();
  // Shallow shelf and surf foam fade out from the shoreline (stacked translucent strokes)
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(60, 138, 152, 0.07)';
  for (let i = 0; i < 24; i++) {
    ctx.lineWidth = 220 * (1 - i / 24);
    coastPath(0);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(233, 238, 232, 0.2)';
  for (let i = 0; i < 6; i++) {
    ctx.lineWidth = 6 * (1 - i / 6);
    coastPath(0);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Perimeter road (octagon) and service roads to the propellant spheres
  ctx.strokeStyle = '#3d3f3b';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const x = Math.cos(a) * 52;
    const z = Math.sin(a) * 52;
    if (i === 0) ctx.moveTo(x, z);
    else ctx.lineTo(x, z);
  }
  ctx.stroke();
  ctx.lineWidth = 0.6;
  for (const [sx, sz] of [
    [-40, -34],
    [42, -30]
  ]) {
    ctx.beginPath();
    ctx.moveTo(sx * 0.42, sz * 0.42);
    ctx.lineTo(sx, sz);
    ctx.stroke();
  }
  // access road to the beach side
  ctx.beginPath();
  ctx.moveTo(48, 20);
  ctx.quadraticCurveTo(100, 40, 150, 30);
  ctx.stroke();

  // 5. Crawlerway: two crushed-river-rock lanes with grass median
  const path = () => {
    ctx.beginPath();
    CRAWLERWAY.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(x, z) : ctx.lineTo(x, z)));
  };
  ctx.strokeStyle = '#a69c84';
  ctx.lineWidth = 4.6;
  path();
  ctx.stroke();
  ctx.strokeStyle = '#8f8670';
  ctx.lineWidth = 3.6;
  path();
  ctx.stroke();
  ctx.strokeStyle = '#5d6a3e';
  ctx.lineWidth = 1.5;
  path();
  ctx.stroke();

  // 6. Exhaust scorch along the flame trench exits (east & west of the mound)
  for (const side of [-1, 1]) {
    const grad = ctx.createRadialGradient(side * 19, 0, 0, side * 19, 0, 9);
    grad.addColorStop(0, 'rgba(48, 44, 38, 0.75)');
    grad.addColorStop(1, 'rgba(48, 44, 38, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(side * 19, 0, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 7. Fade the rim so the disc melts into the horizon haze / inner detail disc
  if (edgeFade) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.38, size / 2, size / 2, size * 0.5);
    mask.addColorStop(0, 'rgba(255,255,255,1)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  configureMipmappedTexture(tex, 'high');
  terrainTextureCache.set(cacheKey, tex);
  return tex;
}

/** Tileable grayscale noise (mean 0.5) layered over the terrain so close ground stays crisp. */
function createGroundDetailTexture(): CanvasTexture {
  if (cachedGroundDetailTex) return cachedGroundDetailTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      // Cap octave frequency cleanly below canvas Nyquist so terrain tiling never aliases into Moiré
      const n =
        0.55 * periodicNoise(u * 8, v * 8, 8) +
        0.30 * periodicNoise(u * 16, v * 16, 16) +
        0.15 * periodicNoise(u * 32, v * 32, 32);
      const g = Math.max(0, Math.min(255, 128 + (n - 0.5) * 240));
      const i = (py * size + px) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  configureMipmappedTexture(tex, 'high');
  cachedGroundDetailTex = tex;
  return tex;
}

/** Terrain material patch: two scales of detail noise in disc-local units (shared by every terrain disc). */
function applyGroundDetail(shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) {
  shader.uniforms.uGroundDetail = { value: createGroundDetailTexture() };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXY;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXY = position.xy;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uGroundDetail;\nvarying vec2 vGroundXY;')
    .replace(
      '#include <map_fragment>',
      /* glsl */ `#include <map_fragment>
      float groundUvSpan = length(fwidth(vGroundXY));
      float fadeNear = smoothstep(0.60, 0.12, groundUvSpan * 0.23 * 16.0);
      float fadeFar = smoothstep(0.60, 0.12, groundUvSpan * 0.027 * 16.0);
      float detailNear = mix(0.5, texture2D(uGroundDetail, vGroundXY * 0.23).r, fadeNear);
      float detailFar = mix(0.5, texture2D(uGroundDetail, vGroundXY * 0.027).r, fadeFar);
      float groundDetail = detailNear * 0.55 + detailFar * 0.45;
      float landMask = smoothstep(-0.04, 0.04, diffuseColor.r - diffuseColor.b);
      diffuseColor.rgb *= 1.0 + (groundDetail - 0.5) * mix(0.18, 0.58, landMask);`
    );
}

/**
 * Weathered hardstand concrete (tiles every 4 scene units ≈ 36 m)
 */
function createConcretePadTexture(): CanvasTexture {
  if (cachedConcretePadTex) return cachedConcretePadTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable coherent noise (avoids per-pixel white noise that causes mipmap Moiré)
      const u = x / size;
      const v = y / size;
      const n =
        0.52 * periodicNoise(u * 6, v * 6, 6) +
        0.32 * periodicNoise(u * 20, v * 20, 20) +
        0.16 * periodicNoise(u * 48, v * 48, 48);
      const base = 158 + (n - 0.5) * 42;
      const i = (y * size + x) * 4;
      img.data[i] = base;
      img.data[i + 1] = base - 3;
      img.data[i + 2] = base - 10;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // slab joints (every 1/8 tile ≈ 4.5 m, softly anti-aliased width)
  ctx.strokeStyle = 'rgba(60, 58, 52, 0.28)';
  ctx.lineWidth = 2.4;
  for (let p = 0; p <= size; p += size / 8) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  // rain streaks and rust stains
  for (let i = 0; i < 40; i++) {
    const x = hash2(i, 7) * size;
    const y = hash2(i, 13) * size;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(120, 84, 52, 0.10)' : 'rgba(40, 40, 36, 0.10)';
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + hash2(i, 3) * 30, 4 + hash2(i, 5) * 14, hash2(i, 9) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  configureMipmappedTexture(tex, 'high');
  cachedConcretePadTex = tex;
  return tex;
}

/**
 * Generate parabolic rocket engine bell nozzle geometry
 */
function createNozzleBellGeometry(
  rTop: number,
  rBottom: number,
  height: number,
  radialSegments = 28,
  heightSegments = 10
): BufferGeometry {
  const geom = new CylinderGeometry(rTop, rBottom, height, radialSegments, heightSegments, true);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // t = 0 throat, t = 1 nozzle exit lip
    const t = (height * 0.5 - y) / height;
    const r = rTop + (rBottom - rTop) * Math.pow(Math.max(0, Math.min(1, t)), 0.62);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const curR = Math.hypot(x, z);
    if (curR > 1e-5) {
      pos.setX(i, (x / curR) * r);
      pos.setZ(i, (z / curR) * r);
    }
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Generate supersonic expanding exhaust plume geometry
 */
/**
 * 3D Rocket engine bell nozzle + glowing throat core
 */
function EngineBell({
  position,
  rTop,
  rBottom,
  height,
  active,
  throttle,
  isKerolox,
  variant
}: {
  position: [number, number, number];
  rTop: number;
  rBottom: number;
  height: number;
  active: boolean;
  throttle: number;
  isKerolox: boolean;
  variant?: 'f1' | 'j2' | 'rs25' | 'rl10';
}) {
  const kind = variant ?? (isKerolox ? 'f1' : 'j2');
  const bellGeo = useMemo(
    () => getSharedNozzleBellGeo(rTop, rBottom, height),
    [rTop, rBottom, height]
  );
  const rAt = (yFrac: number) =>
    rTop + (rBottom - rTop) * Math.pow(Math.max(0, Math.min(1, 0.5 - yFrac)), 0.62);
  const bandFracList = kind === 'f1' ? [0.22, 0.04, -0.14, -0.32, -0.47] : [0.20, 0.0, -0.22, -0.45];

  return (
    <group position={position}>
      {/* Upper Powerhead / Gimbal Flange & Thermal Blanket Collar */}
      <mesh position={[0, height * 0.43, 0]}>
        <cylinderGeometry args={[rTop * 1.12, rTop * 1.24, height * 0.24, 24]} />
        <meshStandardMaterial
          color={kind === 'f1' ? '#3d4349' : '#c09036'}
          metalness={kind === 'f1' ? 0.72 : 0.80}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, height * 0.30, 0]}>
        <cylinderGeometry args={[rTop * 1.26, rAt(0.24) * 1.03, height * 0.08, 24]} />
        <meshStandardMaterial color="#707880" metalness={0.82} roughness={0.28} />
      </mesh>

      {/* F-1 Spiral Turbopump Exhaust Manifold & Downcomer Duct */}
      {kind === 'f1' && (
        <group>
          <mesh position={[0, height * 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[rAt(0.02) * 1.04, rBottom * 0.14, 12, 32]} />
            <meshStandardMaterial color="#25292e" metalness={0.78} roughness={0.38} />
          </mesh>
          <mesh position={[rAt(0.26) * 1.08, height * 0.24, 0]} rotation={[0, 0, -0.22]}>
            <cylinderGeometry args={[rBottom * 0.11, rBottom * 0.13, height * 0.38, 12]} />
            <meshStandardMaterial color="#4a5058" metalness={0.82} roughness={0.32} />
          </mesh>
        </group>
      )}

      {/* Twin Hydraulic TVC Gimbal Actuator Struts */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, height * 0.36, s * rAt(0.25) * 1.08]} rotation={[s * 0.32, 0, 0]}>
          <cylinderGeometry args={[rTop * 0.14, rTop * 0.11, height * 0.28, 8]} />
          <meshStandardMaterial color="#9aa2aa" metalness={0.86} roughness={0.25} />
        </mesh>
      ))}

      {/* Regeneratively Cooled Inconel Nozzle Bell */}
      <mesh geometry={bellGeo} castShadow>
        <meshStandardMaterial
          color={kind === 'f1' ? '#24292d' : '#30363b'}
          metalness={0.84}
          roughness={0.34}
          side={DoubleSide}
        />
      </mesh>

      {/* Flush Machined Nozzle Stiffener Hatbands */}
      {bandFracList.map((yFrac, i) => (
        <mesh key={i} position={[0, height * yFrac, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[rAt(yFrac), Math.max(0.005, rBottom * 0.032), 8, 32]} />
          <meshStandardMaterial
            color={i === bandFracList.length - 1 ? '#7d858e' : '#565e66'}
            metalness={0.86}
            roughness={0.28}
          />
        </mesh>
      ))}

      {/* Incandescent Throat Core During Firing */}
      {active && throttle > 0.01 && (
        <mesh position={[0, -height * 0.35, 0]}>
          <sphereGeometry args={[rBottom * 0.78, 16, 16]} />
          <meshBasicMaterial
            color={isKerolox ? '#fff7d6' : '#d6f5ff'}
            transparent
            opacity={Math.min(0.95, throttle)}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function nozzleGimbalAngle(pitchRateDegS: number): number {
  return Math.max(-0.075, Math.min(0.075, -pitchRateDegS * 0.012));
}

/** 3D supersonic exhaust plume, with its origin at the nozzle exit. */
function RocketPlume3D({
  yOffset,
  throttle,
  altitudeM,
  isStage1,
  pitchRateDegS,
  radiusScale = 1
}: {
  yOffset: number;
  throttle: number;
  altitudeM: number;
  isStage1: boolean;
  pitchRateDegS: number;
  radiusScale?: number;
}) {
  const sparksRef = useRef<InstancedMesh>(null);
  const wakeBendRef = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);

  const vacFactor = Math.min(1, Math.max(0, altitudeM / 75000));
  const { outerGeo, midGeo, innerGeo } = useMemo(() => getSharedPlumeGeos(), []);

  const outerMat = useMemo(
    () =>
      createVolumetricPlumeMaterial({
        coreColor: '#fff5bf',
        midColor: '#ff7a1a',
        outerColor: '#dc2626',
        speed: 13.5,
        dispAmp: 0.24,
        machStrength: 0.7,
        opacity: 0.88
      }),
    []
  );

  const midMat = useMemo(
    () =>
      createVolumetricPlumeMaterial({
        coreColor: '#ffffff',
        midColor: '#ffaa32',
        outerColor: '#f94616',
        speed: 16.5,
        dispAmp: 0.16,
        machStrength: 1.15,
        opacity: 0.96
      }),
    []
  );

  const innerMat = useMemo(
    () =>
      createVolumetricPlumeMaterial({
        coreColor: '#ffffff',
        midColor: '#fff4b8',
        outerColor: '#ff8f1f',
        speed: 20.0,
        dispAmp: 0.08,
        machStrength: 1.55,
        opacity: 1.05
      }),
    []
  );

  const plumeMats = useMemo(() => [outerMat, midMat, innerMat], [outerMat, midMat, innerMat]);

  useEffect(() => {
    return () => {
      outerMat.dispose();
      midMat.dispose();
      innerMat.dispose();
    };
  }, [outerMat, midMat, innerMat]);

  useEffect(() => {
    if (isStage1) {
      outerMat.uniforms.uCoreColor.value.set('#ffefb0');
      outerMat.uniforms.uMidColor.value.set('#ff6b14');
      outerMat.uniforms.uOuterColor.value.set('#c8230a');
      midMat.uniforms.uCoreColor.value.set('#fffcf0');
      midMat.uniforms.uMidColor.value.set('#ffa62b');
      midMat.uniforms.uOuterColor.value.set('#ff4514');
      innerMat.uniforms.uCoreColor.value.set('#ffffff');
      innerMat.uniforms.uMidColor.value.set('#ffefaa');
      innerMat.uniforms.uOuterColor.value.set('#ff8814');
    } else {
      outerMat.uniforms.uCoreColor.value.set('#e0f7ff');
      outerMat.uniforms.uMidColor.value.set('#38bdf8');
      outerMat.uniforms.uOuterColor.value.set('#1d4ed8');
      midMat.uniforms.uCoreColor.value.set('#ffffff');
      midMat.uniforms.uMidColor.value.set('#6ee7ff');
      midMat.uniforms.uOuterColor.value.set('#2563eb');
      innerMat.uniforms.uCoreColor.value.set('#ffffff');
      innerMat.uniforms.uMidColor.value.set('#ccf5ff');
      innerMat.uniforms.uOuterColor.value.set('#60a5fa');
    }
  }, [isStage1, outerMat, midMat, innerMat]);

  const sparks = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        ang: ((i * 137.5) % 360) * (Math.PI / 180),
        phase: (i * 0.13) % 1,
        speed: 2.1 + (i % 7) * 0.35,
        radialSpread: 0.35 + ((i * 19) % 100) / 70,
        len: 0.45 + (i % 5) * 0.14
      })),
    []
  );

  const scaleRadial = (0.76 + throttle * 0.36) * (1 + vacFactor * 1.45) * radiusScale;
  const scaleLength = (0.68 + throttle * 0.56) * (1 + vacFactor * 0.65);
  const targetBend = MathUtils.clamp(-pitchRateDegS * 0.0011, -0.012, 0.012);

  useFrame(({ clock }, delta) => {
    if (throttle <= 0.01) {
      wakeBendRef.current = 0;
      return;
    }
    const dt = Math.min(0.05, delta);
    wakeBendRef.current = MathUtils.damp(wakeBendRef.current, targetBend, 10, dt);
    const bend = wakeBendRef.current * scaleLength / scaleRadial;
    for (let i = 0; i < plumeMats.length; i++) {
      const mat = plumeMats[i];
      mat.uniforms.uTime.value += dt;
      mat.uniforms.uThrottle.value = throttle;
      mat.uniforms.uVacFactor.value = vacFactor;
      mat.uniforms.uBend.value = bend;
    }

    if (sparksRef.current) {
      if (!isStage1 || throttle <= 0.05) {
        sparksRef.current.visible = false;
      } else {
        sparksRef.current.visible = true;
        const t = clock.getElapsedTime();
        for (let i = 0; i < sparks.length; i++) {
          const sp = sparks[i];
          const prog = (t * sp.speed + sp.phase) % 1;
          const r = 0.35 + Math.pow(prog, 0.8) * sp.radialSpread * 2.2;
          const y = -0.3 - prog * 12.2;
          dummy.position.set(Math.cos(sp.ang) * r + bend * y * y, y, Math.sin(sp.ang) * r);
          dummy.rotation.set(0, -sp.ang, -0.14 * sp.radialSpread);
          const sc = (1 - prog) * 0.048 * Math.min(1, throttle * 1.2);
          dummy.scale.set(sc, sp.len * (1 - prog * 0.35), sc);
          dummy.updateMatrix();
          sparksRef.current.setMatrixAt(i, dummy.matrix);
        }
        sparksRef.current.instanceMatrix.needsUpdate = true;
      }
    }
  });

  if (throttle <= 0.01) return null;

  return (
    <group position={[0, yOffset, 0]} scale={[scaleRadial, scaleLength, scaleRadial]}>
      <mesh geometry={innerGeo} material={innerMat} />
      <mesh geometry={midGeo} material={midMat} />
      <mesh geometry={outerGeo} material={outerMat} />
      <instancedMesh ref={sparksRef} args={[undefined, undefined, sparks.length]}>
        <cylinderGeometry args={[0.25, 1.0, 1.0, 5]} />
        <meshBasicMaterial color="#ffe299" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

/**
 * Generate soft volumetric billboard cloud texture
 * Eliminates harsh polygonal edges with smooth Gaussian falloff
 */
function createSoftCloudParticleTexture(): CanvasTexture {
  if (cachedSoftCloudTex) return cachedSoftCloudTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  // Multi-layer Gaussian splats for billowy volumetric cloud edges
  const puffs = [
    { x: 128, y: 128, r: 108, a: 0.55 },
    { x: 96, y: 118, r: 76, a: 0.42 },
    { x: 158, y: 122, r: 74, a: 0.42 },
    { x: 124, y: 92, r: 68, a: 0.38 },
    { x: 132, y: 156, r: 72, a: 0.36 }
  ];

  for (const p of puffs) {
    const grad = ctx.createRadialGradient(p.x, p.y, p.r * 0.08, p.x, p.y, p.r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${p.a})`);
    grad.addColorStop(0.45, `rgba(242, 247, 252, ${p.a * 0.65})`);
    grad.addColorStop(0.78, `rgba(220, 230, 238, ${p.a * 0.22})`);
    grad.addColorStop(1, 'rgba(210, 222, 232, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cachedSoftCloudTex = tex;
  return tex;
}

/**
 * 3D Volumetric flame trench smoke and sound suppression water steam clouds
 */
function VolumetricLaunchSmoke({
  active,
  altitudeM,
  pxPerMeter
}: {
  active: boolean;
  altitudeM: number;
  pxPerMeter: number;
}) {
  const count = 72;
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const cloudTex = useMemo(() => createSoftCloudParticleTexture(), []);
  const wasActiveRef = useRef(false);

  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        const t = i / count;
        return {
          side,
          phase: t,
          speed: 0.52 + (i % 9) * 0.09,
          spreadZ: (((i * 29) % 100) / 100 - 0.5) * 6.5,
          spreadY: (((i * 17) % 100) / 100) * 3.4,
          baseScale: 2.2 + ((i * 13) % 10) * 0.42
        };
      }),
    []
  );

  useFrame(({ clock, camera }) => {
    if (!meshRef.current) return;
    if (!active || altitudeM > 220) {
      if (wasActiveRef.current) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        for (let i = 0; i < count; i++) {
          meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        wasActiveRef.current = false;
      }
      return;
    }

    wasActiveRef.current = true;
    const t = clock.getElapsedTime();
    const { k: groundK } = groundView(altitudeM);
    const groundOffsetY = groundToWorldY(altitudeM, 0.25);

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const cycle = (t * p.speed + p.phase) % 1;
      // High-speed billowing along east-west flame trench ducts
      const x = p.side * (0.6 + Math.pow(cycle, 0.72) * 18.5) * groundK;
      const y = groundOffsetY + (0.5 + Math.pow(cycle, 1.35) * 5.6 + p.spreadY * cycle) * groundK;
      const z = p.spreadZ * (0.25 + cycle * 0.9) * groundK;
      const s = p.baseScale * (0.55 + Math.sin(cycle * Math.PI) * 1.65) * groundK;

      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(t * 0.35 * p.side + i);
      dummy.scale.set(s * 1.35, s, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (altitudeM > 230) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshLambertMaterial
        map={cloudTex}
        color="#f2f6f9"
        emissive="#ff9240"
        emissiveIntensity={active ? 0.32 : 0}
        transparent
        opacity={Math.max(0, Math.min(0.82, 1 - altitudeM / 200))}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * Kennedy Space Center LC-39A (Apollo era) launch complex
 * Swing arm retraction and hold-down release animations
 */
type LaunchComplexVariant = 'apollo' | 'artemis';
const LAUNCH_COMPLEX_MODELS: Record<LaunchComplexVariant, { url: string; arms: number; holdDowns: number }> = {
  // LC-39A with the Apollo Launch Umbilical Tower (scripts/build_lc39a.py)
  apollo: { url: '/models/lc39a_apollo.glb', arms: 9, holdDowns: 4 },
  // LC-39B with Mobile Launcher 1, lightning towers and water tower (scripts/build_lc39b.py)
  artemis: { url: '/models/lc39b_sls.glb', arms: 5, holdDowns: 0 }
};

/** Give concrete surfaces world-planar UVs so the slab texture keeps a constant scale. */
function applyPlanarUVs(mesh: Mesh, tileSize: number) {
  const geo = mesh.geometry as BufferGeometry;
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x / tileSize;
      uv[i * 2 + 1] = z / tileSize;
    } else if (nx >= nz) {
      uv[i * 2] = z / tileSize;
      uv[i * 2 + 1] = y / tileSize;
    } else {
      uv[i * 2] = x / tileSize;
      uv[i * 2 + 1] = y / tileSize;
    }
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
}

/** Apollo-era LC-39A built in Blender (scripts/build_lc39a.py). */
function useLaunchComplexModel(variant: LaunchComplexVariant) {
  const cfg = LAUNCH_COMPLEX_MODELS[variant];
  const { scene } = useGLTF(cfg.url);
  const quality = useSession((s) => s.quality);
  const concreteTex = useMemo(() => createConcretePadTexture(), []);
  return useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      capMetalness(mesh, quality);
      // Only tall structures cast; ground-hugging hardstand and far spheres just receive
      const ground = o.name === 'PAD' || o.name === 'SPHERES' || o.parent?.name === 'PAD';
      mesh.castShadow = !ground;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => m.name.startsWith('PAD_Concrete'))) {
        mesh.geometry = mesh.geometry.clone();
        applyPlanarUVs(mesh, 4);
        mesh.material = mats.map((m) => {
          if (!m.name.startsWith('PAD_Concrete')) return m;
          return new MeshLambertMaterial({ name: m.name, map: concreteTex });
        });
        if (mesh.material.length === 1) mesh.material = mesh.material[0];
      }
    });
    if (variant === 'artemis') {
      // Mobile Launcher, tower and arms turn with the SLS stack (tower faces the core between the boosters)
      const yaw = new Group();
      yaw.rotation.y = SLS_STACK_YAW;
      const moving = root.children.filter((c) => c.name === 'ML' || c.name === 'TOWER' || c.name.startsWith('ARM_'));
      moving.forEach((c) => yaw.add(c));
      root.add(yaw);
    }
    const arms = Array.from({ length: cfg.arms }, (_, i) => root.getObjectByName(`ARM_${i}`) ?? null);
    const holdDowns = Array.from({ length: cfg.holdDowns }, (_, i) => {
      const node = root.getObjectByName(`HDA_${i}`) ?? null;
      const ang = Math.PI / 4 + (i * Math.PI) / 2;
      // tilt axis = up x radial, so the clamp head swings up and away from the vehicle
      const axis = new Vector3(Math.sin(ang), 0, -Math.cos(ang)).normalize();
      return { node, axis };
    });
    return { root, arms, holdDowns };
  }, [scene, concreteTex, variant, cfg.arms, cfg.holdDowns, quality]);
}

/**
 * Cape Canaveral ground: three nested painted discs (pad 1 km, complex 5 km, region 45 km) under the
 * same camera-relative mapping as the pad. Discs are layered by render order with depth writes off so
 * they never z-fight each other, and sit just above the Earth sphere they dissolve into.
 */
const TERRAIN_LAYERS = [
  { extent: 5000, size: 1536, y: -1.6, order: -4, fadeFromM: 15000, fadeToM: 40000 },
  { extent: 560, size: 1024, y: -1.6, order: -3, fadeFromM: 2500, fadeToM: 9000 },
  { extent: 110, size: 1024, y: -1.6, order: -2, fadeFromM: 2500, fadeToM: 9000 }
] as const;

function CapeTerrain({ altitudeM, downrangeM = 0 }: { altitudeM: number; downrangeM?: number }) {
  const textures = useMemo(
    () => TERRAIN_LAYERS.map((l) => createTerrainTexture(l.extent, l.size, true)),
    []
  );
  if (altitudeM > TERRAIN_LAYERS[0].fadeToM) return null;
  const { depth, k } = groundView(altitudeM);

  return (
    <group position={[groundOffsetX(downrangeM, k), -depth, 0]} scale={k}>
      {TERRAIN_LAYERS.map((layer, i) => {
        const fade = 1 - Math.min(1, Math.max(0, (altitudeM - layer.fadeFromM) / (layer.fadeToM - layer.fadeFromM)));
        if (fade <= 0) return null;
        return (
          <mesh
            key={layer.extent}
            position={[0, layer.y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            renderOrder={layer.order}
          >
            <circleGeometry args={[layer.extent / 2, 128]} />
            <meshLambertMaterial
              map={textures[i]}
              transparent
              opacity={fade}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-(i + 1)}
              polygonOffsetUnits={-(i + 1)}
              onBeforeCompile={applyGroundDetail}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function LaunchComplex39A({
  altitudeM,
  downrangeM = 0,
  clampsReleased,
  variant
}: {
  altitudeM: number;
  downrangeM?: number;
  clampsReleased: boolean;
  variant: LaunchComplexVariant;
}) {
  const model = useLaunchComplexModel(variant);
  const swingProgressRef = useRef(clampsReleased ? 1 : 0);

  useFrame((_, delta) => {
    const target = clampsReleased ? 1 : 0;
    swingProgressRef.current += (target - swingProgressRef.current) * Math.min(1, delta * 2.4);
    const prog = swingProgressRef.current;
    // Service swing arms retract ~60° toward the tower face
    for (const arm of model.arms) {
      if (arm) arm.rotation.y = prog * 1.05;
    }
    // Hold-down arms release and tilt back
    for (const { node, axis } of model.holdDowns) {
      if (node) node.quaternion.setFromAxisAngle(axis, prog * 0.6);
    }
  });

  if (altitudeM > 9000) return null;

  const { depth, k } = groundView(altitudeM);

  return (
    <group position={[groundOffsetX(downrangeM, k), -depth, 0]} scale={k}>
      {/* Hardstand, flame trench, Mobile Launcher, LUT, swing arms, hold-downs, propellant spheres */}
      <primitive object={model.root} />
    </group>
  );
}

/**
 * 3D Multi-stage rocket model (Saturn V Apollo Stack)
 * Features:
 * 1. Launch Escape System (LES) jettison animation
 * 2. SLA adapter petal separation & Apollo CSM / LM reveal
 * 3. Stage 1 separation with ullage / retro rocket firings and vapor shock ring
 * 4. Engine nozzle TVC gimbaling and LOX boil-off vapor venting
 */
/** Without an environment map, highly metallic PBR surfaces render near-black; keep them readable. */
function capMetalness(mesh: Mesh, quality: RenderQuality = 'high') {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    applyAntiMoireToMaterial(m, quality, { maxMetalness: 0.85, minRoughness: 0.22 });
  }
}

const SATURN_V_MODEL_URL = '/models/saturn_v.glb';
const SATURN_V_PARTS = ['SIC', 'SII', 'SIVB', 'CSM', 'SLA_POS', 'SLA_NEG', 'LES'] as const;
type SaturnVPart = (typeof SATURN_V_PARTS)[number];

/** Saturn V parts built in Blender (scripts/build_saturn_v.py), one node per separable stage. */
function useSaturnVParts(): Record<SaturnVPart, Object3D> {
  const { nodes } = useGLTF(SATURN_V_MODEL_URL);
  const quality = useSession((s) => s.quality);
  return useMemo(() => {
    const parts = {} as Record<SaturnVPart, Object3D>;
    for (const name of SATURN_V_PARTS) {
      const part = nodes[name].clone(true);
      part.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          capMetalness(mesh, quality);
        }
      });
      parts[name] = part;
    }
    return parts;
  }, [nodes, quality]);
}

/**
 * Pad fallback: the stack settles back onto the Mobile Launcher with too little thrust, slumps onto
 * its east skirt, then topples away from the tower and lies burning across the hardstand.
 */
const PAD_TOPPLE_MAX_RAD = 1.66;

function padCrashPose(state: LiftoffState): { angle: number; sink: number } | null {
  if (state.status !== 'failed' || state.consequence !== 'crashed_pad' || state.reason !== 'pad_fallback') {
    return null;
  }
  const t = Math.max(0, state.time - (state.failureTime ?? state.time));
  const slump = Math.min(1, t / 0.4);
  const fall = Math.max(0, t - 0.4);
  return {
    angle: Math.min(PAD_TOPPLE_MAX_RAD, 0.05 * slump + 0.8 * fall * fall),
    sink: 0.3 * slump
  };
}

/** True when the intact rocket model should give way to the consequence visuals. */
function rocketHiddenByFailure(state: LiftoffState, crashPose: ReturnType<typeof padCrashPose>): boolean {
  if (state.status !== 'failed') return false;
  const c = state.consequence ?? 'none';
  return c === 'exploding' || c === 'crashed_land' || c === 'crashed_ocean' || (c === 'crashed_pad' && !crashPose);
}

/** Rotates its children about a base pivot (rocket frame) for the pad topple. */
function PadTopple({
  pivot,
  pose,
  children
}: {
  pivot: [number, number];
  pose: ReturnType<typeof padCrashPose>;
  children: ReactNode;
}) {
  const angle = pose?.angle ?? 0;
  const sink = pose?.sink ?? 0;
  return (
    <group position={[pivot[0], pivot[1] - sink, 0]} rotation={[0, 0, -angle]}>
      <group position={[-pivot[0], -pivot[1], 0]}>{children}</group>
    </group>
  );
}

function DetailedRocket3D({
  state,
  vehicle,
  sepElapsed
}: {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
  sepElapsed: number;
}) {
  const model = useSaturnVParts();

  // Track elapsed time since LES / fairing jettison (all hooks run before any early return)
  const prevTowerJetRef = useRef<boolean>(state.towerJettisoned);
  const towerJetTimeRef = useRef<number>(-999);
  if (state.towerJettisoned !== prevTowerJetRef.current) {
    prevTowerJetRef.current = state.towerJettisoned;
    towerJetTimeRef.current = state.towerJettisoned ? state.time : -999;
  }

  // Rocket body replaced by consequence visualizer during explosion or high-speed impact
  const crashPose = padCrashPose(state);
  if (rocketHiddenByFailure(state, crashPose)) {
    return null;
  }
  const lesElapsed =
    state.towerJettisoned && towerJetTimeRef.current >= 0
      ? Math.max(0, state.time - towerJetTimeRef.current)
      : state.towerJettisoned
        ? 99
        : 0;

  const activeIdx = state.activeStageIndex;
  const pitchRad = ((state.pitchDeg - 90) * Math.PI) / 180;

  // Nozzle coordinates and active engine ignition state
  const isFiring = state.thrustN > 0 && state.throttle > 0.01;
  const gimbalRad = nozzleGimbalAngle(state.pitchRateDegS);
  const plumeProps = {
    throttle: isFiring ? state.throttle : 0,
    altitudeM: state.orbit.altitudeM,
    pitchRateDegS: state.pitchRateDegS
  };

  // Stage 1 separation falling body visibility (12s duration)
  const showSeparatingStage1 = activeIdx === 1 && sepElapsed < 12;
  const stage1DropY = activeIdx === 0 ? -2.415 : -2.415 - sepElapsed * 1.65 - sepElapsed * sepElapsed * 0.38;
  const stage1RotZ = activeIdx === 0 ? 0 : -sepElapsed * 0.04;

  return (
    <PadTopple pivot={[0.62, -5.05]} pose={crashPose}>
    <group rotation={[0, 0, pitchRad]}>
      {/* ================= Launch Escape System (LES) ================= */}
      {(!state.towerJettisoned || lesElapsed < 8) && (
        <group
          position={[
            lesElapsed * 0.25,
            5.96 + (state.towerJettisoned ? lesElapsed * 3.8 + lesElapsed * lesElapsed * 1.9 : 0),
            0
          ]}
          rotation={[0, 0, state.towerJettisoned ? -lesElapsed * 0.08 : 0]}
        >
          {/* Escape tower truss, abort motor and boost protective cover (Blender model) */}
          <primitive object={model.LES} />
          {/* LES tractor motor exhaust plumes */}
          {state.towerJettisoned && lesElapsed < 4.5 && (
            <>
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  position={[side * 0.14, 0.44, 0]}
                  rotation={[0, 0, side * 0.42]}
                >
                  <coneGeometry args={[0.075, 0.72, 14, 1, true]} />
                  <meshBasicMaterial
                    color="#ffbb55"
                    transparent
                    opacity={Math.max(0, 0.88 - lesElapsed * 0.18)}
                    blending={AdditiveBlending}
                    depthWrite={false}
                  />
                </mesh>
              ))}
            </>
          )}
        </group>
      )}

      {/* ================= Spacecraft Payload: Apollo CSM & SLA ================= */}
      <group position={[0, 4.15, 0]}>
        {/* 1. Apollo CSM & Lunar Module (Blender model) */}
        <primitive object={model.CSM} />

        {/* 2. Jettisonable Saturn V SLA adapter panels */}
        {(!state.towerJettisoned || lesElapsed < 9) &&
          [-1, 1].map((side) => {
            const sepProgress = state.towerJettisoned ? lesElapsed : 0;
            const offsetX = side * sepProgress * 1.35;
            const offsetY = -sepProgress * sepProgress * 0.42;
            const rotZ = -side * Math.min(1.4, sepProgress * 0.38);

            return (
              <group
                key={side}
                position={[offsetX, offsetY, 0]}
                rotation={[0, 0, rotZ]}
              >
                {/* SLA adapter petal (Blender model) */}
                <primitive object={side > 0 ? model.SLA_POS : model.SLA_NEG} />
              </group>
            );
          })}
      </group>

      {/* ================= Stage 3: S-IVB (Orbital Stage) ================= */}
      <group position={[0, 3.425, 0]}>
        <primitive object={model.SIVB} />
        {/* Single restartable J-2 engine nozzle with TVC gimbal */}
        {activeIdx === 2 && (
          <group position={[0, -0.76, 0]} rotation={[0, 0, gimbalRad]}>
            <EngineBell
              position={[0, 0, 0]}
              rTop={0.048}
              rBottom={0.112}
              height={0.35}
              active={isFiring}
              throttle={state.throttle}
              isKerolox={false}
              variant="j2"
            />
            <RocketPlume3D {...plumeProps} yOffset={-0.16} isStage1={false} radiusScale={0.30} />
          </group>
        )}
      </group>

      {/* ================= Stage 2: S-II (Upper Stage) ================= */}
      {(activeIdx <= 1 || (activeIdx === 2 && sepElapsed < 10)) && (
        <group
          position={[
            0,
            activeIdx <= 1 ? 1.335 : 1.335 - sepElapsed * 1.4 - sepElapsed * sepElapsed * 0.3,
            0
          ]}
          rotation={[0, 0, activeIdx === 2 ? -sepElapsed * 0.03 : 0]}
        >
          {/* S-II hull, aft skirt and S-II/S-IVB adapter (Blender model) */}
          <primitive object={model.SII} />

          {/* S-II solid ullage motors firing at separation */}
          {activeIdx === 1 && sepElapsed < 3.8 && (
            <group position={[0, -1.35, 0]}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((u) => {
                const ang = (u * Math.PI) / 4;
                return (
                  <mesh
                    key={u}
                    position={[Math.cos(ang) * 0.60, -0.25, Math.sin(ang) * 0.60]}
                  >
                    <coneGeometry args={[0.045, 0.45, 10, 1, true]} />
                    <meshBasicMaterial
                      color="#ffaa44"
                      transparent
                      opacity={Math.max(0, 0.85 - sepElapsed * 0.22)}
                      blending={AdditiveBlending}
                      depthWrite={false}
                    />
                  </mesh>
                );
              })}
            </group>
          )}

          {/* S-II cluster of 5 J-2 hydrolox engines */}
          {activeIdx >= 1 && (
            <group position={[0, -1.39, 0]} rotation={[0, 0, activeIdx === 1 ? gimbalRad : 0]}>
              {[
                [0, 0],
                [0.28, 0],
                [-0.28, 0],
                [0, 0.28],
                [0, -0.28]
              ].map(([nx, nz], idx) => (
                <EngineBell
                  key={idx}
                  position={[nx, 0, nz]}
                  rTop={0.048}
                  rBottom={0.112}
                  height={0.35}
                  active={activeIdx === 1 && isFiring}
                  throttle={activeIdx === 1 ? state.throttle : 0}
                  isKerolox={false}
                  variant="j2"
                />
              ))}
              {activeIdx === 1 && (
                <RocketPlume3D {...plumeProps} yOffset={-0.16} isStage1={false} radiusScale={0.54} />
              )}
            </group>
          )}
        </group>
      )}

      {/* ================= Stage 1: S-IC Main Booster ================= */}
      {/* Renders Stage 1 core booster and retro-rockets during separation */}
      {(activeIdx === 0 || showSeparatingStage1) && (
        <group position={[0, stage1DropY, 0]} rotation={[0, 0, stage1RotZ]}>
          {/* S-IC hull, roll pattern, engine fairings, fins and tunnels (Blender model) */}
          <primitive object={model.SIC} />

          {/* S-IC 8 solid retro-rockets firing & condensation shock ring */}
          {showSeparatingStage1 && sepElapsed < 3.2 && (
            <group position={[0, 1.95, 0]}>
              {/* Expanding separation condensation shock ring */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.64 + sepElapsed * 0.65, 0.08, 12, 36]} />
                <meshBasicMaterial
                  color="#e8f4ff"
                  transparent
                  opacity={Math.max(0, 0.65 - sepElapsed * 0.2)}
                  blending={AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
              {/* Solid retro-rocket braking exhaust plumes */}
              {[0, 1, 2, 3].map((rIdx) => {
                const ang = (rIdx * Math.PI) / 2 + Math.PI / 4;
                return (
                  <mesh
                    key={rIdx}
                    position={[Math.cos(ang) * 0.60, 0.35, Math.sin(ang) * 0.60]}
                    rotation={[0, 0, Math.PI]}
                  >
                    <coneGeometry args={[0.075, 0.65, 12, 1, true]} />
                    <meshBasicMaterial
                      color="#ff7722"
                      transparent
                      opacity={Math.max(0, 0.9 - sepElapsed * 0.28)}
                      blending={AdditiveBlending}
                      depthWrite={false}
                    />
                  </mesh>
                );
              })}
            </group>
          )}

          {/* S-IC cluster of 5 giant F-1 engines */}
          <group position={[0, -2.36, 0]} rotation={[0, 0, activeIdx === 0 ? gimbalRad : 0]}>
            {[
              [0, 0],
              [0.28, 0.28],
              [-0.28, 0.28],
              [0.28, -0.28],
              [-0.28, -0.28]
            ].map(([nx, nz], idx) => (
              <EngineBell
                key={idx}
                position={[nx, 0, nz]}
                rTop={0.088}
                rBottom={0.204}
                height={0.56}
                active={activeIdx === 0 && isFiring}
                throttle={activeIdx === 0 ? state.throttle : 0}
                isKerolox={true}
                variant="f1"
              />
            ))}
            {activeIdx === 0 && (
              <RocketPlume3D {...plumeProps} yOffset={-0.25} isStage1 radiusScale={0.68} />
            )}
          </group>
        </group>
      )}

      {/* ================= Cryogenic LOX Boil-Off Vapor ================= */}
      {state.orbit.altitudeM < 18000 && activeIdx === 0 && (
        <mesh position={[0.62, -1.25, 0.14]} rotation={[0, 0, -0.08]}>
          <coneGeometry args={[0.13, 1.4, 12, 1, true]} />
          <meshBasicMaterial
            color="#f0f8ff"
            transparent
            opacity={0.22 * (1 - state.orbit.altitudeM / 18000)}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ================= Transonic Prandtl-Glauert Condensation Shock Cone ================= */}
      {state.mach >= 0.92 && state.mach <= 1.25 && state.orbit.altitudeM < 25000 && (
        <mesh position={[0, 2.1, 0]}>
          <coneGeometry args={[1.55, 2.0, 36, 1, true]} />
          <meshBasicMaterial
            color="#eef8ff"
            transparent
            opacity={0.28 * Math.sin(((state.mach - 0.92) / 0.33) * Math.PI)}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      )}

    </group>
    </PadTopple>
  );
}

// ======================================================================
// SLS Block 1 (Artemis I) — Blender model (scripts/build_sls.py)
// ======================================================================
const SLS_MODEL_URL = '/models/sls_block1.glb';
const SLS_PARTS = ['CORE', 'SRB_L', 'SRB_R', 'ICPS', 'ORION', 'FAIRING_0', 'FAIRING_1', 'FAIRING_2', 'LAS'] as const;
type SlsPartName = (typeof SLS_PARTS)[number];
interface ModelPart {
  node: Object3D;
  base: [number, number, number];
}
/** Stack and Mobile Launcher are turned so the tower faces the core between the boosters. */
const SLS_STACK_YAW = Math.PI / 4;
const SLS_Y = {
  deck: -4.8,
  core0: -4.48,
  srbTop: 1.14,
  icps0: 2.25,
  lasTop: 6.36
};
const SLS_X_SRB = 0.705;

/** Each part re-centred on its Blender origin so separations rotate about the part itself. */
function useSlsParts(): Record<SlsPartName, ModelPart> {
  const { nodes } = useGLTF(SLS_MODEL_URL);
  const quality = useSession((s) => s.quality);
  return useMemo(() => {
    const parts = {} as Record<SlsPartName, ModelPart>;
    for (const name of SLS_PARTS) {
      const node = nodes[name].clone(true);
      const base: [number, number, number] = [node.position.x, node.position.y, node.position.z];
      node.position.set(0, 0, 0);
      node.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          capMetalness(mesh, quality);
        }
      });
      parts[name] = { node, base };
    }
    return parts;
  }, [nodes, quality]);
}

/** Places a model part at its origin + offset with a pivot rotation; children use rocket-frame coords. */
function PartAt({
  part,
  offset = [0, 0, 0],
  rotation = [0, 0, 0],
  quaternion,
  children
}: {
  part: ModelPart;
  offset?: [number, number, number];
  rotation?: [number, number, number];
  quaternion?: Quaternion;
  children?: ReactNode;
}) {
  const [bx, by, bz] = part.base;
  return (
    <group
      position={[bx + offset[0], by + offset[1], bz + offset[2]]}
      rotation={quaternion ? undefined : rotation}
      quaternion={quaternion}
    >
      <primitive object={part.node} />
      {children && <group position={[-bx, -by, -bz]}>{children}</group>}
    </group>
  );
}

/** Rocket-local (x, z) → pitch-frame (x, z) after the stack yaw. */
function slsYaw(x: number, z: number): [number, number] {
  const c = Math.cos(SLS_STACK_YAW);
  const s = Math.sin(SLS_STACK_YAW);
  return [x * c + z * s, -x * s + z * c];
}

function SlsRocket3D({
  state, sepElapsed
}: {
  state: LiftoffState;
  sepElapsed: number;
}) {
  const parts = useSlsParts();

  // Track elapsed time since LAS / fairing jettison
  const prevTowerJetRef = useRef<boolean>(state.towerJettisoned);
  const towerJetTimeRef = useRef<number>(-999);
  if (state.towerJettisoned !== prevTowerJetRef.current) {
    prevTowerJetRef.current = state.towerJettisoned;
    towerJetTimeRef.current = state.towerJettisoned ? state.time : -999;
  }

  const crashPose = padCrashPose(state);
  if (rocketHiddenByFailure(state, crashPose)) {
    return null;
  }

  const lesElapsed =
    state.towerJettisoned && towerJetTimeRef.current >= 0
      ? Math.max(0, state.time - towerJetTimeRef.current)
      : state.towerJettisoned
        ? 99
        : 0;

  const activeIdx = state.activeStageIndex;
  const pitchRad = ((state.pitchDeg - 90) * Math.PI) / 180;
  const isFiring = state.thrustN > 0 && state.throttle > 0.01;
  const throttle = state.thrustN > 0 ? state.throttle : 0;
  const gimbalRad = nozzleGimbalAngle(state.pitchRateDegS);
  const plumeProps = {
    throttle,
    altitudeM: state.orbit.altitudeM,
    pitchRateDegS: state.pitchRateDegS
  };

  // Booster separation (stage 0 -> 1): boosters tip outward and fall away for 12 s
  const boostersAttached = activeIdx === 0;
  const boostersFalling = activeIdx === 1 && sepElapsed < 12;
  const bt = boostersFalling ? sepElapsed : 0;
  // Core separation (stage 1 -> 2)
  const coreVisible = activeIdx <= 1 || (activeIdx === 2 && sepElapsed < 12);
  const ct = activeIdx === 2 ? sepElapsed : 0;
  // LAS + service module fairings
  const lasVisible = !state.towerJettisoned || lesElapsed < 8;

  const boosterPose = (side: -1 | 1) => ({
    offset: [side * (0.22 * bt + 0.05 * bt * bt), -(1.1 * bt + 0.38 * bt * bt), 0] as [number, number, number],
    rotation: [0, 0, -side * 0.075 * bt] as [number, number, number]
  });

  const fairingPose = (part: ModelPart) => {
    const t = state.towerJettisoned ? lesElapsed : 0;
    const r = new Vector3(part.base[0], 0, part.base[2]).normalize();
    const axis = new Vector3(r.z, 0, -r.x);
    return {
      offset: [r.x * 0.5 * t, -0.35 * t * t, r.z * 0.5 * t] as [number, number, number],
      quaternion: new Quaternion().setFromAxisAngle(axis, Math.min(1.9, t * 1.2))
    };
  };

  return (
    <PadTopple pivot={[0.95, -4.8]} pose={crashPose}>
    <group rotation={[0, 0, pitchRad]}>
      <group rotation={[0, SLS_STACK_YAW, 0]}>
        {/* ===== Launch Abort System ===== */}
        {lasVisible && (
          <PartAt
            part={parts.LAS}
            offset={[
              lesElapsed * 0.25,
              state.towerJettisoned ? lesElapsed * 3.8 + lesElapsed * lesElapsed * 1.9 : 0,
              0
            ]}
            rotation={[0, 0, state.towerJettisoned ? -lesElapsed * 0.08 : 0]}
          >
            {state.towerJettisoned && lesElapsed < 4 &&
              [-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.16, SLS_Y.lasTop - 0.45, 0]} rotation={[0, 0, side * 0.5]}>
                  <coneGeometry args={[0.07, 0.75, 14, 1, true]} />
                  <meshBasicMaterial
                    color="#ffbb55"
                    transparent
                    opacity={Math.max(0, 0.9 - lesElapsed * 0.22)}
                    blending={AdditiveBlending}
                    depthWrite={false}
                  />
                </mesh>
              ))}
          </PartAt>
        )}

        {/* ===== Orion + service module fairings ===== */}
        <PartAt part={parts.ORION} />
        {(['FAIRING_0', 'FAIRING_1', 'FAIRING_2'] as const).map((name) =>
          !state.towerJettisoned || lesElapsed < 8 ? (
            <PartAt key={name} part={parts[name]} {...fairingPose(parts[name])} />
          ) : null
        )}

        {/* ===== ICPS + RL10B-2 ===== */}
        <PartAt part={parts.ICPS} />

        {/* ===== Core stage + LVSA + 4 × RS-25 ===== */}
        {coreVisible && (
          <PartAt part={parts.CORE} offset={[0, -(1.0 * ct + 0.3 * ct * ct), 0]} rotation={[0, 0, -0.03 * ct]}>
            {/* Undo the stack yaw at the engine pivot so it gimbals in the pitch plane. */}
            <group position={[0, SLS_Y.core0 - 0.24, 0]} rotation={[0, -SLS_STACK_YAW, 0]}>
              <group rotation={[0, 0, activeIdx <= 1 ? gimbalRad : 0]}>
                {[
                  [0.19, 0.19],
                  [-0.19, 0.19],
                  [0.19, -0.19],
                  [-0.19, -0.19]
                ].map(([x, z], i) => {
                  const [pitchX, pitchZ] = slsYaw(x, z);
                  return (
                    <EngineBell
                      key={i}
                      position={[pitchX, 0, pitchZ]}
                      rTop={0.065}
                      rBottom={0.125}
                      height={0.47}
                      active={activeIdx <= 1 && isFiring}
                      throttle={activeIdx <= 1 ? throttle : 0}
                      isKerolox={false}
                      variant="rs25"
                    />
                  );
                })}
                {activeIdx <= 1 && (
                  <group position={[0, -0.22, 0]} scale={[0.46, 0.85, 0.46]}>
                    <RocketPlume3D {...plumeProps} yOffset={0} isStage1={false} />
                  </group>
                )}
              </group>
            </group>
          </PartAt>
        )}

        {/* ===== Solid rocket boosters ===== */}
        {(boostersAttached || boostersFalling) &&
          ([-1, 1] as const).map((side) => (
            <PartAt key={side} part={side < 0 ? parts.SRB_L : parts.SRB_R} {...boosterPose(side)}>
              {boostersAttached && isFiring && (
                <mesh position={[side * SLS_X_SRB, SLS_Y.deck - 0.22, 0]}>
                  <sphereGeometry args={[0.13, 16, 16]} />
                  <meshBasicMaterial color="#fff6d8" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} />
                </mesh>
              )}
              {/* booster separation motor puffs (nose + aft) */}
              {boostersFalling && bt < 1.4 &&
                [SLS_Y.srbTop - 0.7, SLS_Y.deck + 0.3].map((y) => (
                  <mesh key={y} position={[side * (SLS_X_SRB + 0.2), y, 0]}>
                    <sphereGeometry args={[0.12 + bt * 0.35, 12, 12]} />
                    <meshBasicMaterial
                      color="#ffd9a0"
                      transparent
                      opacity={Math.max(0, 0.75 - bt * 0.5)}
                      blending={AdditiveBlending}
                      depthWrite={false}
                    />
                  </mesh>
                ))}
            </PartAt>
          ))}
      </group>

      {boostersAttached && ([-1, 1] as const).map((side) => {
        const [x, z] = slsYaw(side * SLS_X_SRB, 0);
        return (
          <group key={side} position={[x, SLS_Y.deck - 0.24, z]} scale={[0.42, 1.05, 0.42]}>
            <RocketPlume3D {...plumeProps} yOffset={0} throttle={isFiring ? Math.max(throttle, 0.85) : 0} isStage1 />
          </group>
        );
      })}
      {activeIdx === 2 && (
        <group position={[0, SLS_Y.icps0 - 0.12, 0]} rotation={[0, 0, gimbalRad]}>
          <EngineBell
            position={[0, 0, 0]}
            rTop={0.045}
            rBottom={0.11}
            height={0.25}
            active={isFiring}
            throttle={throttle}
            isKerolox={false}
            variant="rl10"
          />
          <group position={[0, -0.12, 0]} scale={[0.24, 0.55, 0.24]}>
            <RocketPlume3D {...plumeProps} yOffset={0} isStage1={false} />
          </group>
        </group>
      )}

      {/* Transonic Prandtl-Glauert condensation collar */}
      {state.mach >= 0.92 && state.mach <= 1.25 && state.orbit.altitudeM < 25000 && (
        <mesh position={[0, 1.6, 0]}>
          <coneGeometry args={[1.9, 2.6, 36, 1, true]} />
          <meshBasicMaterial
            color="#eef8ff"
            transparent
            opacity={0.28 * Math.sin(((state.mach - 0.92) / 0.33) * Math.PI)}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      )}
    </group>
    </PadTopple>
  );
}

let cachedFireballMat: ShaderMaterial | null = null;
let cachedCrashFlameMat: ShaderMaterial | null = null;

/**
 * Crash shaders are shared, never disposed and pre-compiled at scene start, so a crash (and the
 * retry after it) never stalls on shader compilation.
 */
function getCrashMaterials() {
  if (!cachedFireballMat) cachedFireballMat = createTurbulentFireballMaterial(0.32);
  if (!cachedCrashFlameMat) {
    cachedCrashFlameMat = createVolumetricPlumeMaterial({
      coreColor: '#fff5bf',
      midColor: '#ff7018',
      outerColor: '#991b1b',
      speed: 6.5,
      dispAmp: 0.38,
      machStrength: 0.15,
      opacity: 0.95
    });
  }
  return { fireballMat: cachedFireballMat, crashFlameMat: cachedCrashFlameMat };
}

function getCrashFlameGeo(): BufferGeometry {
  if (!cachedCrashFlameGeo) {
    cachedCrashFlameGeo = createSupersonicPlumeGeometry(1.1, 3.2, 6.2, 28, 16);
  }
  return cachedCrashFlameGeo;
}

function CrashShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const { fireballMat, crashFlameMat } = getCrashMaterials();
      const geo = new SphereGeometry(0.01, 4, 2);
      const group = new Group();
      group.add(new Mesh(geo, fireballMat), new Mesh(geo, crashFlameMat));
      try {
        gl.compile(group, camera, scene);
      } catch {
        // Warm-up is best effort; materials still compile on first use.
      }
      geo.dispose();
    }, 300);
    return () => window.clearTimeout(id);
  }, [gl, camera, scene]);
  return null;
}

/** Soft grey smoke rising from the burning pad and wreck (billboards, wind drift to the east). */
function PadCrashSmoke({ failElapsed, spanX }: { failElapsed: number; spanX: number }) {
  const count = 40;
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const cloudTex = useMemo(() => createSoftCloudParticleTexture(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        source: ((i * 37) % 100) / 100,
        phase: (i * 0.618) % 1,
        speed: 0.09 + (i % 7) * 0.018,
        z: (((i * 53) % 100) / 100 - 0.5) * 2.4,
        size: 2.2 + (i % 5) * 0.55,
        spin: (i % 2 ? 1 : -1) * (0.08 + (i % 3) * 0.05)
      })),
    []
  );

  useFrame(({ clock, camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const grow = Math.min(1, failElapsed / 2.5);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const cycle = (t * p.speed + p.phase) % 1;
      const x = p.source * spanX + cycle * 6.5;
      const y = 0.8 + cycle * 18 * (0.4 + 0.6 * grow);
      const s = p.size * (0.5 + cycle * 2.4) * Math.sin(Math.min(1, cycle * 1.15) * Math.PI) * (0.25 + 0.75 * grow);
      dummy.position.set(x, y, p.z * (1 + cycle * 2));
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(t * p.spin + i);
      dummy.scale.set(Math.max(0.001, s * 1.2), Math.max(0.001, s), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshLambertMaterial
        map={cloudTex}
        color="#6b7178"
        emissive="#ff8a3d"
        emissiveIntensity={0.08}
        transparent
        opacity={0.62}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * Every dynamic point light in the scene lives here and stays mounted for the whole session.
 * Mounting or unmounting a light changes three.js' light count, which recompiles every lit
 * material — the stall that used to hit at ignition, at a crash and again on retry.
 */
function DynamicLightRig({ state, vehicle }: { state: LiftoffState; vehicle: RocketVehicleConfig }) {
  const plumeRef = useRef<PointLight>(null);
  const padRef = useRef<PointLight>(null);
  const fireRef = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const alt = state.orbit.altitudeM;
    const failed = state.status === 'failed';
    const firing = !failed && state.thrustN > 0 && state.throttle > 0.01;
    const idx = state.activeStageIndex;
    const stage1 = idx === 0;

    const plume = plumeRef.current;
    if (plume) {
      const nozzleY =
        vehicle.id === 'sls' ? (idx <= 1 ? -4.95 : 2.0) : idx === 0 ? -5.33 : idx === 1 ? -0.39 : 2.31;
      const ly = nozzleY - 2.8;
      const a = ((state.pitchDeg - 90) * Math.PI) / 180;
      plume.position.set(-Math.sin(a) * ly, Math.cos(a) * ly, 0);
      plume.color.setHex(stage1 ? 0xff9e3b : 0x66d9ff);
      const flicker = 0.88 + Math.sin(t * 55) * 0.12;
      const base = stage1 ? (vehicle.id === 'sls' ? 30 : 22) : 11;
      plume.intensity = firing ? state.throttle * base * flicker : 0;
    }

    const pad = padRef.current;
    if (pad) {
      const { depth, k } = groundView(alt);
      pad.position.set(2.5 * k, -depth - 0.6 * k, 0);
      pad.intensity = firing && alt < 9000 ? 18 : 0;
    }

    const fire = fireRef.current;
    if (fire) {
      const c = state.consequence ?? 'none';
      const since = Math.max(0, state.time - (state.failureTime ?? state.time));
      const flicker = 0.85 + Math.sin(t * 45) * 0.15;
      if (failed && c === 'crashed_pad') {
        const toppled = state.reason === 'pad_fallback';
        fire.position.set(toppled ? 4 : 0, -HARDSTAND_DEPTH + 2.5, 0);
        fire.intensity = flicker * Math.max(20, 42 - since * 4);
      } else if (failed && c === 'exploding' && since < 3.2) {
        fire.position.set(0, 0, 0);
        fire.intensity = 48 * Math.exp(-since * 0.9);
      } else {
        fire.intensity = 0;
      }
    }
  });

  return (
    <>
      <pointLight ref={plumeRef} intensity={0} distance={48} decay={1.6} />
      <pointLight ref={padRef} intensity={0} color="#ff7b24" distance={30} decay={1.7} />
      <pointLight ref={fireRef} intensity={0} color="#ff7722" distance={70} decay={1.5} />
    </>
  );
}

/**
 * Failure Consequence 3D Visualization System:
 * 1. exploding: Aerodynamic breakup / explosion, debris scatter and fireball expansion
 * 2. falling: Flameout stall, uncontrolled gravity tumble with trailing smoke ribbon
 * 3. crashed_pad: Launchpad impact, burning wreck and billowing smoke plume
 * 4. crashed_ocean: Ocean water impact with expanding wave ripples and spray geyser
 * 5. drifting_space: Fuel exhausted in vacuum, silent tumbling adrift in deep space
 */
function LiftoffConsequenceVisuals3D({
  state,
  vehicle
}: {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
}) {
  const consequence = state.consequence ?? 'none';
  if (state.status !== 'failed' || consequence === 'none') {
    return null;
  }
  return <ActiveLiftoffConsequenceVisuals3D state={state} vehicle={vehicle} />;
}

function ActiveLiftoffConsequenceVisuals3D({
  state,
  vehicle
}: {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
}) {
  const consequence = state.consequence ?? 'none';
  const failElapsed = state.failureTime ? Math.max(0, state.time - state.failureTime) : 0;

  // Generate debris dispersion velocities and spin vectors
  const fragments = useMemo(
    () => [
      { dir: [1.8, 0.9, 0.7], rot: [2.5, 4.1, 1.8], size: [0.65, 1.4, 0.45], color: '#dce4e8' },
      { dir: [-1.6, 1.4, -0.8], rot: [-3.2, 2.8, -2.1], size: [0.8, 1.8, 0.7], color: '#334155' },
      { dir: [0.5, -1.9, 1.4], rot: [1.9, -3.5, 3.2], size: [0.5, 1.1, 0.5], color: '#e2e8f0' },
      { dir: [-0.9, -1.6, -1.5], rot: [-2.1, 1.7, -4.2], size: [0.7, 0.9, 0.6], color: '#1e293b' },
      { dir: [2.2, -0.5, -0.6], rot: [4.2, -2.1, 1.5], size: [0.9, 1.6, 0.8], color: '#f8fafc' },
      { dir: [-2.0, 0.4, 1.3], rot: [-1.8, 3.4, -2.8], size: [0.6, 1.2, 0.5], color: '#475569' },
      { dir: [0.3, 2.4, 0.5], rot: [3.1, -1.9, 2.4], size: [0.4, 1.5, 0.4], color: '#cbd5e1' },
      { dir: [-0.4, -2.2, -0.9], rot: [-2.7, 3.8, -1.9], size: [0.75, 1.3, 0.75], color: '#0f172a' }
    ],
    []
  );

  const { fireballMat, crashFlameMat } = getCrashMaterials();
  const oceanRingGeo = useMemo(() => {
    if (!cachedOceanRingGeo) {
      cachedOceanRingGeo = new TorusGeometry(1, 0.05, 10, 40);
    }
    return cachedOceanRingGeo;
  }, []);
  const crashFlameGeo = getCrashFlameGeo();
  const toppled = state.reason === 'pad_fallback' && consequence === 'crashed_pad';
  const toppleLength = vehicle.id === 'sls' ? 11.2 : 11.4;
  // Body hits the hardstand once the topple completes (see padCrashPose)
  const bodyImpactT = 0.4 + Math.sqrt((PAD_TOPPLE_MAX_RAD - 0.05) / 0.8);
  const sinceBodyImpact = failElapsed - bodyImpactT;

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    fireballMat.uniforms.uTime.value += dt;
    crashFlameMat.uniforms.uTime.value += dt;
    crashFlameMat.uniforms.uThrottle.value = 1;
    if (consequence === 'crashed_pad' || consequence === 'crashed_land') {
      // Impact flash, then a second flare when the toppled stack slams into the hardstand
      const flare = toppled && sinceBodyImpact >= 0 ? Math.max(0, 0.7 - sinceBodyImpact * 0.25) : 0;
      fireballMat.uniforms.uOpacity.value = Math.max(0.3, 0.95 - failElapsed * 0.3) + flare;
      fireballMat.uniforms.uHeat.value = Math.max(0.55, 1.2 - failElapsed * 0.12) + flare * 0.4;
    } else {
      fireballMat.uniforms.uOpacity.value = Math.max(0, 0.96 - failElapsed * 0.22);
      fireballMat.uniforms.uHeat.value = Math.max(0.4, 1.25 - failElapsed * 0.15);
    }
  });

  return (
    <group>
      {/* ================= 1. Aerial Breakup (exploding) ================= */}
      {consequence === 'exploding' && (
        <group>
          {/* Volumetric domain-warped FBM expanding fireball */}
          {failElapsed < 4.5 && (
            <group scale={Math.min(9.5, 0.9 + failElapsed * 4.2)}>
              <mesh material={fireballMat}>
                <sphereGeometry args={[1, 28, 28]} />
              </mesh>
              <mesh scale={0.68} material={fireballMat}>
                <sphereGeometry args={[1, 22, 22]} />
              </mesh>
            </group>
          )}

          {/* Dispersing tumbling debris chunks */}
          {fragments.map((frag, idx) => {
            const spreadDist = Math.min(22, failElapsed * 3.8);
            const posX = frag.dir[0] * spreadDist;
            const posY = frag.dir[1] * spreadDist - failElapsed * failElapsed * 0.35;
            const posZ = frag.dir[2] * spreadDist;
            const rotX = frag.rot[0] * failElapsed * 2.2;
            const rotY = frag.rot[1] * failElapsed * 2.2;
            const rotZ = frag.rot[2] * failElapsed * 2.2;

            return (
              <group key={idx} position={[posX, posY, posZ]} rotation={[rotX, rotY, rotZ]}>
                <mesh castShadow>
                  <boxGeometry args={[frag.size[0], frag.size[1], frag.size[2]]} />
                  <meshStandardMaterial color={frag.color} metalness={0.65} roughness={0.35} />
                </mesh>
                {/* Debris smoke trails */}
                {failElapsed < 5.5 && (
                  <mesh position={[0, -frag.size[1] * 0.8, 0]}>
                    <coneGeometry args={[0.35, 1.8, 12, 1, true]} />
                    <meshBasicMaterial
                      color="#2b3137"
                      transparent
                      opacity={Math.max(0, 0.7 - failElapsed * 0.12)}
                      depthWrite={false}
                    />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>
      )}

      {/* ================= 2. Flameout Gravity Fall (falling) ================= */}
      {consequence === 'falling' && (
        <group>
          {/* Smoke column trailing tumbling rocket */}
          {[1, 2, 3, 4, 5, 6].map((idx) => {
            const trailY = -idx * 2.1;
            const scale = 0.8 + idx * 0.45;
            return (
              <mesh key={idx} position={[0, trailY, 0]} scale={[scale, scale * 1.5, scale]}>
                <sphereGeometry args={[0.6, 16, 16]} />
                <meshBasicMaterial
                  color={idx <= 2 ? '#ff6622' : '#1e242b'}
                  transparent
                  opacity={Math.max(0, 0.75 - idx * 0.1)}
                  blending={idx <= 2 ? AdditiveBlending : undefined}
                  depthWrite={false}
                />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ================= 3. Pad or Land Impact (crashed_pad / crashed_land) ================= */}
      {(consequence === 'crashed_pad' || consequence === 'crashed_land') && (
        <group position={[0, -HARDSTAND_DEPTH, 0]}>
          {/* Scorched hardstand or impact crater */}
          <mesh position={[toppled ? toppleLength * 0.4 : 0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
            <circleGeometry args={[toppled ? toppleLength * 0.62 : consequence === 'crashed_land' ? 6.5 : 4.5, 40]} />
            <meshBasicMaterial
              color="#14110e"
              transparent
              opacity={Math.min(0.6, failElapsed * 0.8)}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>

          {/* Impact fireball at the base of the stack */}
          <mesh
            position={[0.4, 1.4, 0]}
            scale={[2.8 * Math.min(1, 0.35 + failElapsed * 2), 2 * Math.min(1, 0.35 + failElapsed * 2), 2.8 * Math.min(1, 0.35 + failElapsed * 2)]}
            material={fireballMat}
          >
            <sphereGeometry args={[1, 24, 20]} />
          </mesh>

          {/* Propellant fire on the Mobile Launcher deck */}
          <group position={[0.3, 0.2, 0]} rotation={[Math.PI, 0, 0]} scale={[0.85, 0.75, 0.85]}>
            <mesh geometry={crashFlameGeo} material={crashFlameMat} />
          </group>

          {/* Toppled stack: secondary fireball and fires along the broken hull */}
          {toppled && sinceBodyImpact >= 0 && (
            <>
              {sinceBodyImpact < 3.5 && (
                <mesh
                  position={[toppleLength * 0.55, 1.2, 0]}
                  scale={[3.6 * Math.min(1, 0.3 + sinceBodyImpact * 2.4), 2.2 * Math.min(1, 0.3 + sinceBodyImpact * 2.4), 2.4]}
                  material={fireballMat}
                >
                  <sphereGeometry args={[1, 24, 20]} />
                </mesh>
              )}
              {[0.32, 0.58, 0.86].map((f, i) => (
                <group
                  key={i}
                  position={[toppleLength * f, 0.1, (i - 1) * 0.35]}
                  rotation={[Math.PI, 0, 0]}
                  scale={0.42 * Math.min(1, sinceBodyImpact * 1.6 + 0.2) * (1 - i * 0.12)}
                >
                  <mesh geometry={crashFlameGeo} material={crashFlameMat} />
                </group>
              ))}
            </>
          )}

          {/* Billowing grey smoke (soft, semi-transparent so the pad stays visible) */}
          <PadCrashSmoke failElapsed={failElapsed} spanX={toppled ? toppleLength * 0.9 : 1.5} />

          {/* Charred wreckage when the stack came down too fast to topple intact */}
          {!toppled &&
            [-1.8, 0, 1.8].map((ox, i) => (
              <mesh
                key={i}
                position={[ox, 0.45, (i % 2) * 1.2]}
                rotation={[0.3, i * 1.1, -0.4]}
                castShadow
              >
                <cylinderGeometry args={[0.85, 0.95, 1.6, 16]} />
                <meshStandardMaterial color="#1f262b" roughness={0.9} metalness={0.4} />
              </mesh>
            ))}

          {/* Scattered hull debris */}
          {toppled &&
            [
              [-1.6, 0.18, 2.1, 0.5],
              [2.4, 0.15, -2.3, 1.7],
              [5.8, 0.14, 2.6, 2.6],
              [9.6, 0.12, -1.9, 0.9]
            ].map(([x, y, z, r], i) => (
              <mesh key={i} position={[x, y, z]} rotation={[0.2, r, 0.5]} castShadow>
                <boxGeometry args={[0.55, 0.22, 0.38]} />
                <meshStandardMaterial color={i % 2 ? '#2a2f33' : '#cfd5da'} roughness={0.8} metalness={0.3} />
              </mesh>
            ))}
        </group>
      )}

      {/* ================= 4. Ocean Crash (crashed_ocean) ================= */}
      {consequence === 'crashed_ocean' && (
        <group position={[0, -6.65, 0]}>
          {/* Expanding concentric ocean shockwaves */}
          {[0, 1, 2].map((ringIdx) => {
            const ringPhase = (failElapsed * 1.2 + ringIdx * 1.4) % 4.2;
            const ringRadius = 2.5 + ringPhase * 5.5;
            const ringOpacity = Math.max(0, 0.85 - ringPhase * 0.2);
            return (
              <mesh
                key={ringIdx}
                position={[0, 0.08, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={[ringRadius, ringRadius, 1]}
                geometry={oceanRingGeo}
              >
                <meshBasicMaterial
                  color="#e0f4ff"
                  transparent
                  opacity={ringOpacity}
                  blending={AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            );
          })}

          {/* Ocean water geyser spray */}
          <group position={[0, 3.8, 0]}>
            <mesh>
              <cylinderGeometry args={[0.65, 3.6, 8.5, 24, 1, true]} />
              <meshBasicMaterial
                color="#d0efff"
                transparent
                opacity={0.82}
                blending={AdditiveBlending}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
            <mesh position={[0, 4.2, 0]}>
              <coneGeometry args={[2.2, 4.5, 20, 1, true]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.75}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>

          {/* Rising steam and water vapor clouds */}
          {[1, 2, 3, 4].map((vIdx) => {
            const vY = vIdx * 2.2;
            const vR = 2.2 + vIdx * 0.8;
            return (
              <mesh key={vIdx} position={[0, vY, 0]} scale={[vR, vR * 0.8, vR]}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshBasicMaterial
                  color="#e8f4fc"
                  transparent
                  opacity={Math.max(0.1, 0.55 - vIdx * 0.1)}
                  depthWrite={false}
                />
              </mesh>
            );
          })}

          {/* Sinking charred booster wreckage */}
          <mesh position={[0, 0.35, 0]} rotation={[0.4, 0.2, 1.2]} castShadow>
            <cylinderGeometry args={[0.9, 0.9, 3.2, 20]} />
            <meshStandardMaterial color="#2d3748" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      )}

      {/* ================= 5. Space Drift (drifting_space) ================= */}
      {consequence === 'drifting_space' && (
        <group>
          {/* Cryogenic ice crystal venting particles */}
          {[0, 1, 2, 3, 4, 5].map((pIdx) => {
            const ang = (pIdx * Math.PI) / 3;
            const rV = 1.4 + (pIdx % 3) * 0.6;
            return (
              <mesh
                key={pIdx}
                position={[Math.cos(ang) * rV, -1.2 - pIdx * 0.4, Math.sin(ang) * rV]}
              >
                <sphereGeometry args={[0.07, 8, 8]} />
                <meshBasicMaterial
                  color="#e0f2fe"
                  transparent
                  opacity={0.7}
                  blending={AdditiveBlending}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
}

/**
 * 3D Troposphere Soft Volumetric Cloud Deck
 * Smooth feathered billboard cloud deck facing camera
 */
function TroposphereCloudDeck({
  altitudeM,
  pxPerMeter
}: {
  altitudeM: number;
  pxPerMeter: number;
}) {
  const count = 48;
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const cloudTex = useMemo(() => createSoftCloudParticleTexture(), []);
  const wasVisibleRef = useRef(false);

  const clouds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const ang = ((i * 137.5) % 360) * (Math.PI / 180);
        const dist = 24 + ((i * 29) % 120);
        const altLayerM = 580 + ((i * 53) % 760);
        return {
          x: Math.cos(ang) * dist,
          z: Math.sin(ang) * dist - 10,
          altLayerM,
          sx: 11 + (i % 6) * 3.8,
          sy: 5.5 + (i % 4) * 1.8,
          rotZ: ((i * 0.4) % 0.6) - 0.3
        };
      }),
    []
  );

  useFrame(({ clock, camera }) => {
    if (!meshRef.current) return;
    if (altitudeM > 9500) {
      if (wasVisibleRef.current) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        for (let i = 0; i < count; i++) {
          meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        wasVisibleRef.current = false;
      }
      return;
    }

    wasVisibleRef.current = true;
    const t = clock.getElapsedTime();
    const { k } = groundView(altitudeM);
    for (let i = 0; i < count; i++) {
      const c = clouds[i];
      const cy = groundToWorldY(altitudeM, c.altLayerM * pxPerMeter);
      dummy.position.set((c.x + Math.sin(t * 0.04 + i) * 0.8) * k, cy, c.z * k);
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(c.rotZ);
      dummy.scale.set(c.sx * k, c.sy * k, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (altitudeM > 10000) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshLambertMaterial
        map={cloudTex}
        color="#f5f9fc"
        emissive="#9ec5e6"
        emissiveIntensity={0.22}
        transparent
        opacity={Math.max(0, Math.min(0.68, 1 - altitudeM / 8800))}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * 3D Curved Earth with Rayleigh atmospheric limb scattering (NASA 4K textures)
 * Smoothed below horizon at low altitudes, emerging gracefully as altitude climbs
 */
/** UV box of earth_patch_4096.jpg (Florida / Caribbean upscale) inside the equirectangular day map. */
const EARTH_PATCH_BOUNDS = new Vector4(1420 / 8192, (4096 - 1923) / 4096, 3104 / 8192, (4096 - 876) / 4096);
const LC39A_LAT_DEG = 28.6084;
const LC39A_LON_DEG = -80.6041;

/**
 * Sphere orientation that puts LC-39A at the top of the globe with local east on +x and north on -z,
 * matching the painted Cape terrain (three.js SphereGeometry + equirectangular map conventions).
 */
const EARTH_PAD_ORIENTATION = (() => {
  const lat = (LC39A_LAT_DEG * Math.PI) / 180;
  const lon = (LC39A_LON_DEG * Math.PI) / 180;
  const up = new Vector3(Math.cos(lon) * Math.cos(lat), Math.sin(lat), -Math.sin(lon) * Math.cos(lat));
  const east = new Vector3(-Math.sin(lon), 0, -Math.cos(lon));
  const south = new Vector3(Math.cos(lon) * Math.sin(lat), -Math.cos(lat), -Math.sin(lon) * Math.sin(lat));
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(east, up, south)).invert();
})();

function CurvedEarthHorizon({ altitudeM }: { altitudeM: number }) {
  const quality = useSession((s) => s.quality);
  const [dayMap, cloudsMap, patchMap] = useTexture([
    '/textures/earth_day_4096.jpg',
    '/textures/earth_clouds_4096.jpg',
    '/textures/earth_patch_4096.jpg'
  ]);

  useEffect(() => {
    for (const tex of [dayMap, cloudsMap, patchMap]) {
      tex.colorSpace = SRGBColorSpace;
      configureMipmappedTexture(tex, quality);
    }
  }, [dayMap, cloudsMap, patchMap, quality]);

  // Swap in the sharper Florida patch inside its UV box, feathered at the edges
  const applyPatch = useMemo(
    () => (shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }) => {
      shader.uniforms.uPatchMap = { value: patchMap };
      shader.uniforms.uPatchBounds = { value: EARTH_PATCH_BOUNDS };
      shader.uniforms.uGroundDetail = { value: createGroundDetailTexture() };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uPatchMap;\nuniform vec4 uPatchBounds;\nuniform sampler2D uGroundDetail;'
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          vec2 patchUv = (vMapUv - uPatchBounds.xy) / (uPatchBounds.zw - uPatchBounds.xy);
          float patchMask = smoothstep(0.0, 0.06, patchUv.x) * smoothstep(1.0, 0.94, patchUv.x)
                          * smoothstep(0.0, 0.06, patchUv.y) * smoothstep(1.0, 0.94, patchUv.y);
          vec4 patchColor = texture2D(uPatchMap, clamp(patchUv, 0.0, 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, patchColor.rgb, patchMask);
          // ~100 m and ~17 m procedural breakup with Nyquist attenuation near limb & poles
          vec2 earthUvSpan = fwidth(vMapUv);
          float medSpan = length(earthUvSpan * vec2(1600.0, 800.0));
          float highSpan = length(earthUvSpan * vec2(9000.0, 4500.0));
          float medFade = smoothstep(0.60, 0.12, medSpan * 16.0);
          float highFade = smoothstep(0.55, 0.10, highSpan * 16.0);
          float detailMed = mix(0.5, texture2D(uGroundDetail, vMapUv * vec2(1600.0, 800.0)).r, medFade);
          float detailHigh = mix(0.5, texture2D(uGroundDetail, vMapUv * vec2(9000.0, 4500.0)).r, highFade);
          float earthDetail = detailMed * 0.6 + detailHigh * 0.4;
          float earthLand = smoothstep(-0.04, 0.04, diffuseColor.r - diffuseColor.b);
          diffuseColor.rgb *= 1.0 + (earthDetail - 0.5) * mix(0.12, 0.46, earthLand);`
        );
    },
    [patchMap]
  );

  // Same camera-relative mapping as the pad: surface sits just under the terrain (hardstand - 1.6),
  // and the rendered radius follows the scale factor so the horizon dip matches the real altitude.
  const earthRadius = 240;
  const { depth, k } = groundView(altitudeM);
  const renderRadius = Math.min(EARTH_RADIUS_UNITS * k, EARTH_MAX_RENDER_RADIUS);
  const surfaceDepth = depth + 1.6 * k + 0.05;
  const centerY = -surfaceDepth - renderRadius;
  // Keep the cloud shell and limb glow below the camera; fade them in only once they fit
  const cloudShell = 0.004 * renderRadius;
  const cloudOpacity = 0.68 * Math.min(1, Math.max(0, (0.5 * surfaceDepth - cloudShell) / 12));
  const glowShell = 0.022 * renderRadius;
  const glowOpacity = 0.24 * Math.min(1, Math.max(0, (surfaceDepth - glowShell * 1.05) / 25));

  return (
    <group position={[0, centerY, 0]} quaternion={EARTH_PAD_ORIENTATION} scale={renderRadius / earthRadius}>
      {/* Earth surface sphere */}
      <mesh receiveShadow>
        <sphereGeometry args={[earthRadius, 256, 128]} />
        <meshLambertMaterial map={dayMap} onBeforeCompile={applyPatch} />
      </mesh>
      {/* 4K atmospheric cloud layer */}
      {cloudOpacity > 0.01 && (
        <mesh>
          <sphereGeometry args={[earthRadius * 1.004, 96, 48]} />
          <meshLambertMaterial map={cloudsMap} transparent opacity={cloudOpacity} depthWrite={false} />
        </mesh>
      )}
      {/* Rayleigh scattering blue atmospheric limb glow */}
      {glowOpacity > 0.01 && (
        <mesh>
          <sphereGeometry args={[earthRadius * 1.022, 64, 32]} />
          <meshBasicMaterial
            color="#3898ff"
            transparent
            opacity={glowOpacity}
            side={BackSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

const skyDomeVertexShader = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyDomeFragmentShader = /* glsl */ `
  varying vec3 vWorldDir;
  uniform float uSpaceRatio;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;

  void main() {
    // Elevation factor: 0 at horizon, 1 at zenith
    float elev = clamp(vWorldDir.y, -0.15, 1.0);
    float horizonFactor = pow(1.0 - clamp(abs(vWorldDir.y), 0.0, 1.0), 3.2);

    // Sea-level Rayleigh scattering gradient (deep cobalt zenith -> azure mid -> soft haze horizon)
    vec3 seaZenith = uZenith;
    vec3 seaMid = uMid;
    vec3 seaHorizon = uHorizon;

    vec3 daySky = mix(seaMid, seaZenith, smoothstep(0.08, 0.85, max(0.0, elev)));
    daySky = mix(daySky, seaHorizon, pow(1.0 - clamp(max(0.0, vWorldDir.y), 0.0, 1.0), 7.0));

    // Sub-horizon depth fog fallback
    if (vWorldDir.y < 0.0) {
      daySky = seaHorizon;
    }

    // Deep space black + Earth atmospheric limb arc
    vec3 spaceBlack = vec3(0.012, 0.022, 0.045);
    vec3 limbGlow = vec3(0.18, 0.56, 0.96) * pow(horizonFactor, 2.2) * (1.0 - uSpaceRatio * 0.45);
    vec3 spaceSky = spaceBlack + limbGlow;

    // Mie solar forward scattering glare
    float sunAmt = max(0.0, dot(normalize(vWorldDir), uSunDir));
    vec3 sunHalo = vec3(1.0, 0.9, 0.72) * (pow(sunAmt, 12.0) * 0.35 + pow(sunAmt, 900.0) * 6.0) * (1.0 - uSpaceRatio * 0.6);

    vec3 finalCol = mix(daySky, spaceSky, pow(uSpaceRatio, 0.65)) + sunHalo;
    gl_FragColor = vec4(finalCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Dynamic Rayleigh atmospheric skydome and starry skybox
 */
const SUN_POSITION: [number, number, number] = [24, 32, 22];
const SKY_ZENITH = '#1d5aa8';
const SKY_MID = '#5f95d0';
const HAZE_COLOR = '#c2d2e2';

/** Distance haze over the Cape that thins out as the vehicle climbs. */
function AtmosphericHaze({ altitudeM }: { altitudeM: number }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new Fog(HAZE_COLOR, 45, 330);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  useEffect(() => {
    if (scene.fog instanceof Fog) {
      // Ground scales by k about the rocket, so a real slant range R maps to k·R world units.
      // Blend from the pad-level haze to ~10–70 km visibility that opens up as the air thins.
      const { k } = groundView(altitudeM);
      const h = Math.max(0, altitudeM);
      const t = Math.min(1, h / 1000);
      const clear = 1 + Math.max(0, (h - 10000) / 4000) ** 2;
      const near = k * PX_PER_M * (10000 + 2 * h) * clear;
      const far = k * PX_PER_M * (70000 + 8 * h) * clear;
      scene.fog.near = 45 + (near - 45) * t;
      scene.fog.far = 330 + (far - 330) * t;
    }
  }, [altitudeM, scene]);
  return null;
}

function SkyAndStars3D({ altitudeM }: { altitudeM: number }) {
  const starGeo = useMemo(() => {
    const count = 600;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 160 + (i % 40);
      const theta = ((i * 73) % 360) * (Math.PI / 180);
      const phi = (((i * 41) % 180) - 90) * (Math.PI / 180);
      positions[i * 3] = r * Math.cos(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.sin(phi)) + 5;
      positions[i * 3 + 2] = -Math.abs(r * Math.cos(phi) * Math.sin(theta)) - 15;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, []);

  const skyMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyDomeVertexShader,
        fragmentShader: skyDomeFragmentShader,
        uniforms: {
          uSpaceRatio: { value: 0 },
          uZenith: { value: new Color(SKY_ZENITH) },
          uMid: { value: new Color(SKY_MID) },
          uHorizon: { value: new Color(HAZE_COLOR) },
          uSunDir: { value: new Vector3(...SUN_POSITION).normalize() }
        },
        side: BackSide,
        depthWrite: false
      }),
    []
  );

  const spaceRatio = Math.min(1, Math.max(0, altitudeM / 55000));
  useFrame(() => {
    skyMat.uniforms.uSpaceRatio.value = spaceRatio;
  });

  return (
    <>
      <mesh material={skyMat} renderOrder={-10}>
        <sphereGeometry args={[440, 36, 24]} />
      </mesh>
      {altitudeM > 10000 && (
        <points geometry={starGeo}>
          <pointsMaterial
            color="#e8f4ff"
            size={0.55}
            transparent
            opacity={Math.min(0.95, (altitudeM - 10000) / 35000)}
          />
        </points>
      )}
    </>
  );
}

/**
 * 3D Velocity direction vector (Prograde) and pitch guidance line
 */
function GuidanceVectors3D({
  state,
  showGuidance
}: {
  state: LiftoffState;
  showGuidance: boolean;
}) {
  if (!showGuidance || !state.clampsReleased) return null;

  const alt = state.orbit.altitudeM;
  const progradeDeg =
    alt < 70000 ? state.orbit.surfaceProgradeDeg : state.orbit.orbitalProgradeDeg;
  const refPitchDeg = computeReferencePitchDeg(
    alt,
    state.orbit.apoapsisM,
    state.orbit.verticalSpeedMs
  );

  // 90° straight up [0, L, 0], 0° horizontal right [L, 0, 0]
  const len = 7.8;
  const progRad = (progradeDeg * Math.PI) / 180;
  const refRad = (refPitchDeg * Math.PI) / 180;

  const progEnd: [number, number, number] = [
    Math.cos(progRad) * len,
    Math.sin(progRad) * len,
    0
  ];
  const refEnd: [number, number, number] = [
    Math.cos(refRad) * len,
    Math.sin(refRad) * len,
    0
  ];

  return (
    <group>
      {/* Yellow Prograde vector line */}
      <Line points={[[0, 0, 0], progEnd]} color="#ffe14d" lineWidth={2.5} />
      <mesh position={progEnd}>
        <torusGeometry args={[0.32, 0.055, 10, 24]} />
        <meshBasicMaterial color="#ffe14d" />
      </mesh>

      {/* Cyan dashed line: NASA recommended gravity turn pitch angle */}
      <Line
        points={[[0, 0, 0], refEnd]}
        color="#4de2d1"
        lineWidth={1.6}
        dashed
        dashSize={0.35}
        gapSize={0.25}
      />
    </group>
  );
}

/** Recovers on the next flight (resetKey change) instead of leaving the viewport dead until a page reload. */
class Scene3DErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function LiftoffVisualClock({ paused }: { paused: boolean }) {
  const clock = useThree((state) => state.clock);
  useLayoutEffect(() => {
    const elapsedTime = clock.elapsedTime;
    if (paused) clock.stop();
    else if (!clock.running) clock.start();
    // Starting the renderer clock resets its elapsed time. Resume from the same animation frame.
    clock.elapsedTime = elapsedTime;
  }, [clock, paused]);
  return null;
}

function AscentWindStreaks({ windEastMs }: { windEastMs: number }) {
  const positions = useMemo(() => new Float32Array(14 * 6), []);
  const attribute = useRef<BufferAttribute>(null);
  const travel = useRef(0);
  useFrame((_, delta) => {
    if (!attribute.current) return;
    travel.current = MathUtils.euclideanModulo(travel.current + windEastMs * delta * 0.052, 1);
    const streakLength = Math.sign(windEastMs) * (0.4 + Math.abs(windEastMs) * 0.06);
    for (let i = 0; i < positions.length / 6; i++) {
      const phase = (i * 0.618 + travel.current) % 1;
      const x = -11 + 22 * phase;
      const y = -4.6 + ((i * 37) % 113) / 10;
      const z = -3.1 + ((i * 19) % 63) / 10;
      const j = i * 6;
      positions[j] = x;
      positions[j + 1] = y;
      positions[j + 2] = z;
      positions[j + 3] = x + streakLength;
      positions[j + 4] = y - 0.07;
      positions[j + 5] = z;
    }
    attribute.current.needsUpdate = true;
  });
  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={attribute} attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#c6e5ff" transparent opacity={Math.min(0.27, Math.abs(windEastMs) * 0.028)} depthWrite={false} />
    </lineSegments>
  );
}

export function LiftoffScene3D({
  state,
  vehicle,
  paused,
  showGuidance,
  sepElapsed,
  language
}: {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
  paused: boolean;
  showGuidance: boolean;
  sepElapsed: number;
  language: Language;
}) {
  const quality = useSession((s) => s.quality);
  const pxPerMeter = PX_PER_M;
  const isFiring = state.thrustN > 0 && state.throttle > 0.01;
  const boundaryResetKey = `${vehicle.id}:${state.status === 'failed' ? `failed@${state.failureTime ?? 0}` : state.status}`;
  const shadowMapSize: [number, number] = quality === 'low' ? [512, 512] : [1024, 1024];

  useEffect(() => {
    if (vehicle.id === 'sls') {
      useGLTF.preload(SLS_MODEL_URL);
      useGLTF.preload(LAUNCH_COMPLEX_MODELS.artemis.url);
    } else {
      useGLTF.preload(SATURN_V_MODEL_URL);
      useGLTF.preload(LAUNCH_COMPLEX_MODELS.apollo.url);
    }
  }, [vehicle.id]);

  return (
    <Scene3DErrorBoundary
      resetKey={boundaryResetKey}
      fallback={
        <div className="scene-fallback">
          3D Liftoff Viewport Ready
        </div>
      }
    >
      <Canvas
        aria-label={TASK_CAMERA_HINT_TEXT[language === 'zh' ? 'zh' : 'en']}
        shadows
        dpr={quality === 'low' ? 1 : [1, 1.75]}
        gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
        camera={{ position: [3.1, 1.85, 18.4], fov: 42, near: 0.1, far: 3000 }}
        style={{ width: '100%', height: '100%' }}
      >
        <LiftoffVisualClock paused={paused} />
        <SkyAndStars3D altitudeM={state.orbit.altitudeM} />

        {/* High contrast solar directional light + ambient sky fill + offline procedural IBL */}
        <Environment resolution={64} frames={1} environmentIntensity={0.72}>
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#fff7ea"
            position={[18, 16, 18]}
            scale={[18, 18, 1]}
            target={[0, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#b6d8ff"
            position={[-16, 12, 12]}
            scale={[24, 16, 1]}
            target={[0, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.55}
            color="#d8cbb8"
            position={[0, -14, 4]}
            scale={[30, 30, 1]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={0.95}
            color="#6ea8e8"
            position={[0, 22, -14]}
            scale={[36, 18, 1]}
            target={[0, 0, 0]}
          />
        </Environment>
        <AtmosphericHaze altitudeM={state.orbit.altitudeM} />
        <ambientLight intensity={0.3} color="#c8dcff" />
        <hemisphereLight args={['#a9cdf2', '#6b6448', 0.85]} />
        <directionalLight
          position={SUN_POSITION}
          intensity={2.8}
          color="#fff4e2"
          castShadow
          shadow-mapSize={shadowMapSize}
          shadow-camera-left={-26}
          shadow-camera-right={26}
          shadow-camera-top={26}
          shadow-camera-bottom={-26}
          shadow-camera-near={1}
          shadow-camera-far={140}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <directionalLight position={[-18, -10, 12]} intensity={0.45} color="#4ea8de" />
        <DynamicLightRig state={state} vehicle={vehicle} />
        <CrashShaderWarmup />

        {/* Unified task camera controls: Left-drag rotate, Right-drag pan, Wheel zoom */}
        <TaskCameraControls
          enabled={!paused}
          initialTarget={[0, 1.05, 0]}
          minDistance={4.5}
          maxDistance={46}
        />

        {/* LC-39A complex: terrain, crawlerway, hardstand, flame trench, Mobile Launcher, LUT & propellant spheres */}
        <CapeTerrain altitudeM={state.orbit.altitudeM} downrangeM={state.orbit.downrangeM} />
        <Suspense fallback={null}>
          <LaunchComplex39A
            altitudeM={state.orbit.altitudeM}
            downrangeM={state.orbit.downrangeM}
            clampsReleased={state.clampsReleased}
            variant={vehicle.id === 'sls' ? 'artemis' : 'apollo'}
          />
        </Suspense>

        {/* Troposphere volumetric cloud deck (600m-1300m altitude) */}
        <TroposphereCloudDeck
          altitudeM={state.orbit.altitudeM}
          pxPerMeter={pxPerMeter}
        />

        {/* Volumetric flame trench steam and smoke */}
        <VolumetricLaunchSmoke
          active={isFiring}
          altitudeM={state.orbit.altitudeM}
          pxPerMeter={pxPerMeter}
        />
        {state.status === 'flying' && Math.abs(state.windEastMs) > 1 && (
          <AscentWindStreaks windEastMs={state.windEastMs} />
        )}

        {/* High precision multi-stage rocket and supersonic plume */}
        <Suspense fallback={null}>
          {vehicle.id === 'sls' ? (
            <SlsRocket3D state={state} sepElapsed={sepElapsed} />
          ) : (
            <DetailedRocket3D state={state} vehicle={vehicle} sepElapsed={sepElapsed} />
          )}
        </Suspense>

        {/* Consequence visual effects (debris breakup, gravity tumble, pad fire, ocean crash, space drift) */}
        <LiftoffConsequenceVisuals3D state={state} vehicle={vehicle} />

        {/* Prograde vector and recommended pitch 3D guidance lines */}
        <GuidanceVectors3D state={state} showGuidance={showGuidance} />

        {/* Curved Earth with NASA 4K texture */}
        <Suspense fallback={null}>
          <CurvedEarthHorizon altitudeM={state.orbit.altitudeM} />
        </Suspense>
      </Canvas>
    </Scene3DErrorBoundary>
  );
}
