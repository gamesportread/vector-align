import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  Data3DTexture,
  DoubleSide,
  FrontSide,
  GLSL3,
  LatheGeometry,
  LinearFilter,
  Matrix4,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4
} from 'three';

/**
 * Exact nozzle geometry extracted from scripts/build_apollo_cm.py:
 * 4 canted solid retro-rocket motor bells mounted on the aft bulkhead.
 * Nozzle throat is at (+-0.5488, -0.77, +-0.5488), exit lip at (+-0.5992, -0.93, +-0.5992).
 * Each nozzle flares outward at ~23.8 deg along normalize(+-0.0504, -0.16, +-0.0504).
 */
export interface RetroNozzleSpec {
  throat: [number, number, number];
  exit: [number, number, number];
  dir: [number, number, number];
}

const RETRO_OUTWARD_XZ = 0.0504;
const RETRO_DOWN_Y = -0.16;
const RETRO_DIR_LEN = Math.hypot(RETRO_OUTWARD_XZ, RETRO_DOWN_Y, RETRO_OUTWARD_XZ);
const RETRO_DX = RETRO_OUTWARD_XZ / RETRO_DIR_LEN;
const RETRO_DY = RETRO_DOWN_Y / RETRO_DIR_LEN;

export const APOLLO_RETRO_NOZZLES: readonly RetroNozzleSpec[] = ([-1, 1] as const).flatMap((sx) =>
  ([-1, 1] as const).map((sz) => ({
    throat: [sx * 0.555, -0.80, sz * 0.555] as [number, number, number],
    exit: [sx * 0.5992, -0.93, sz * 0.5992] as [number, number, number],
    dir: [sx * RETRO_DX, RETRO_DY, sz * RETRO_DX] as [number, number, number]
  }))
);

/**
 * Shared GLSL 2D value noise + 4-octave domain-warped FBM helpers used by all
 * volumetric combustion, hypersonic plasma, and supersonic plume shaders.
 */
const GLSL_NOISE_LIB = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm4(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += amp * vnoise(p);
      p = rot * p * 2.04 + vec2(17.1, 31.7);
      amp *= 0.5;
    }
    return v;
  }

  float warpedFbm(vec2 p) {
    vec2 q = vec2(fbm4(p), fbm4(p + vec2(5.2, 1.3)));
    return fbm4(p + 2.25 * q);
  }

  // Physically inspired blackbody-style fire ramp (dark crimson -> orange -> gold -> white-hot)
  vec3 blackbodyFireColor(float temp, vec3 coreCol, vec3 midCol, vec3 outerCol) {
    vec3 col = mix(outerCol * 0.45, outerCol, smoothstep(0.04, 0.28, temp));
    col = mix(col, midCol, smoothstep(0.24, 0.62, temp));
    col = mix(col, coreCol, smoothstep(0.58, 0.96, temp));
    return col;
  }
`;

/**
 * Contoured supersonic rocket exhaust envelope (wider parabolic expansion followed
 * by gentle aerodynamic pinch at the trailing flame tip).
 */
export function createSupersonicPlumeGeometry(
  rThroat: number,
  rMax: number,
  length: number,
  radialSegments = 36,
  heightSegments = 24
): BufferGeometry {
  const geom = new CylinderGeometry(1, 1, length, radialSegments, heightSegments, true);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // t = 0 at nozzle throat (y = 0), t = 1 at plume tail (y = -length)
    const t = Math.max(0, Math.min(1, (length * 0.5 - y) / length));
    const expansion = Math.pow(t, 0.52);
    const tailPinch = 1.0 - 0.18 * Math.pow(Math.max(0, t - 0.58) / 0.42, 1.6);
    const r = (rThroat + (rMax - rThroat) * expansion) * tailPinch;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const curR = Math.hypot(x, z);
    if (curR > 1e-5) {
      pos.setX(i, (x / curR) * r);
      pos.setZ(i, (z / curR) * r);
    }
    pos.setY(i, y - length * 0.5);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Curved paraboloid bow-shock wake geometry that wraps organically around the capsule
 * heat shield and tapers upward into turbulent plasma shear ribbons.
 */
export function createPlasmaWakeGeometry(
  baseRadius: number,
  shoulderRadius: number,
  wakeHeight: number,
  flareTipRadius: number,
  radialSegments = 56
): LatheGeometry {
  const profile: Vector2[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let r: number;
    let y: number;
    if (t < 0.26) {
      // Curved wrap from blunt bottom face out around the compression shoulder
      const st = t / 0.26;
      const ang = st * (Math.PI * 0.52);
      r = baseRadius * 0.35 + (shoulderRadius - baseRadius * 0.35) * Math.sin(ang);
      y = -1.16 + 0.62 * (1.0 - Math.cos(ang));
    } else {
      // Swept supersonic shear cone rising upward around and behind capsule
      const wt = (t - 0.26) / 0.74;
      r = shoulderRadius + (flareTipRadius - shoulderRadius) * Math.pow(wt, 0.85);
      y = -0.54 + wakeHeight * wt;
    }
    profile.push(new Vector2(Math.max(0.05, r), y));
  }
  return new LatheGeometry(profile, radialSegments);
}

const volumetricPlumeVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying float vNoiseDisp;

  uniform float uTime;
  uniform float uThrottle;
  uniform float uSpeed;
  uniform float uDispAmp;
  uniform float uBend;

  ${GLSL_NOISE_LIB}

  void main() {
    vUv = uv;
    float dist = 1.0 - uv.y; // 0 at nozzle throat, 1 at plume tip
    // Organic lateral & radial flame whip increasing toward the downstream tail
    float wavePhase = dist * 8.5 - uTime * uSpeed;
    float radialFlutter = (vnoise(vec2(uv.x * 6.0, wavePhase)) - 0.5) * 2.0;
    float gust = sin(dist * 11.0 - uTime * (uSpeed * 0.62) + uv.x * 6.2831) * 0.55;
    float amp = uDispAmp * pow(dist, 1.15) * (0.45 + 0.55 * uThrottle);
    vec3 displaced = position + normal * (radialFlutter * 0.65 + gust * 0.35) * amp;
    // Keep the centerline and tangent at the nozzle fixed as the wake bends downstream.
    displaced.x += uBend * position.y * position.y;
    vec3 bentNormal = vec3(normal.x, normal.y - 2.0 * uBend * position.y * normal.x, normal.z);
    vNoiseDisp = radialFlutter;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormalView = normalize(normalMatrix * bentNormal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const volumetricPlumeFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying float vNoiseDisp;

  uniform float uTime;
  uniform float uThrottle;
  uniform float uVacFactor;
  uniform float uSpeed;
  uniform float uMachStrength;
  uniform vec3 uCoreColor;
  uniform vec3 uMidColor;
  uniform vec3 uOuterColor;
  uniform float uOpacity;

  ${GLSL_NOISE_LIB}

  void main() {
    float dist = 1.0 - vUv.y; // 0 at nozzle exit, 1 at trailing flame tip
    if (uThrottle <= 0.01) discard;

    // Seamless azimuthal coordinate wrapping for cylinder shells
    float ang = vUv.x * 6.2831853;
    vec2 flowUv = vec2(cos(ang) * 1.65 + sin(ang) * 0.65, dist * 4.8 - uTime * uSpeed * 0.24);
    float fbmMain = warpedFbm(flowUv);
    float fineStreak = fbm4(vec2(sin(ang) * 3.8 + dist * 1.4, dist * 9.5 - uTime * uSpeed * 0.42));

    // View-dependent Fresnel soft volumetric falloff (eliminates hard geometric tube/cone edges)
    float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
    float fresnel = pow(ndotv, 1.45);

    // Ragged noise-eroded flame length so tongues flicker irregularly past tail
    float axialBase = pow(max(0.0, 1.0 - dist), 1.28);
    float flameEdge = smoothstep(0.06, 0.58, axialBase + (fbmMain - 0.48) * 0.52 * smoothstep(0.18, 0.95, dist));
    if (flameEdge <= 0.002) discard;

    // Supersonic Mach shock diamonds concentrated near hot centerline
    float shockWave = cos(dist * 32.0 - uTime * (uSpeed * 0.85) + (fineStreak - 0.5) * 1.4);
    float machDiamonds = exp(-dist * 3.2) * pow(max(0.0, shockWave), 6.0)
      * pow(ndotv, 2.2) * (1.0 - uVacFactor * 0.65) * uMachStrength;

    // Physical blackbody heat distribution
    float heat = clamp(
      (1.0 - dist * 0.88) * 0.65
      + fbmMain * 0.42
      + fineStreak * 0.24
      + machDiamonds * 0.95
      + vNoiseDisp * 0.06,
      0.0,
      1.35
    );

    vec3 col = blackbodyFireColor(heat, uCoreColor, uMidColor, uOuterColor);
    col += uCoreColor * (machDiamonds * 1.35 + pow(max(0.0, 1.0 - dist * 4.2), 2.0) * 0.45);

    // Ragged incandescent sparks / soot tongues near outer boundary
    float edgeBreakup = smoothstep(0.08, 0.72, fresnel + (fineStreak - 0.45) * 0.28);
    float alpha = flameEdge * edgeBreakup * (0.68 + 0.52 * fineStreak + machDiamonds * 0.4)
      * min(1.0, uThrottle * 1.18) * uOpacity;

    gl_FragColor = vec4(col * clamp(0.85 + 0.55 * heat, 0.7, 1.85), clamp(alpha, 0.0, 1.0));
  }
`;

export function createVolumetricPlumeMaterial(options: {
  coreColor: string;
  midColor: string;
  outerColor: string;
  speed?: number;
  dispAmp?: number;
  machStrength?: number;
  opacity?: number;
}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: volumetricPlumeVertexShader,
    fragmentShader: volumetricPlumeFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uThrottle: { value: 1 },
      uVacFactor: { value: 0 },
      uSpeed: { value: options.speed ?? 12.0 },
      uDispAmp: { value: options.dispAmp ?? 0.14 },
      uBend: { value: 0 },
      uMachStrength: { value: options.machStrength ?? 1.0 },
      uOpacity: { value: options.opacity ?? 1.0 },
      uCoreColor: { value: new Color(options.coreColor) },
      uMidColor: { value: new Color(options.midColor) },
      uOuterColor: { value: new Color(options.outerColor) }
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide
  });
}

const plasmaVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uWarpAmp;

  ${GLSL_NOISE_LIB}

  void main() {
    vUv = uv;
    vLocalPos = position;
    float h = clamp((position.y + 1.2) / 5.4, 0.0, 1.0);
    float ang = uv.x * 6.2831853;
    float flutter = warpedFbm(vec2(cos(ang) * 2.2 + sin(ang) * 0.8, h * 4.5 - uTime * 7.5)) - 0.5;
    vec3 displaced = position + normal * flutter * uWarpAmp * (0.35 + 1.15 * h) * uIntensity;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const plasmaFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uLayer; // 0.0 = stagnation bow shock, 1.0 = inner boundary wake, 2.0 = outer ionized trail

  ${GLSL_NOISE_LIB}

  void main() {
    if (uIntensity <= 0.02) discard;

    float ang = vUv.x * 6.2831853;
    float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));

    if (uLayer < 0.5) {
      // Stagnation Bow-Shock Layer hugging the curved 2000°C heat shield face
      float distFromAxis = clamp(length(vLocalPos.xz) / 1.56, 0.0, 1.0);
      vec2 pUv = vec2(vLocalPos.x * 2.1 + vLocalPos.z * 0.7, vLocalPos.z * 2.1 - uTime * 3.8);
      float boil = warpedFbm(pUv + vec2(0.0, uTime * 4.5));
      float shockEdge = pow(max(0.0, 1.0 - distFromAxis * 0.72), 1.35);
      float fresnel = pow(ndotv, 0.78);
      float heat = clamp(shockEdge * 0.85 + boil * 0.45, 0.0, 1.35) * uIntensity;

      vec3 col = blackbodyFireColor(
        heat,
        vec3(1.55, 1.45, 1.18),
        vec3(1.35, 0.62, 0.14),
        vec3(0.95, 0.22, 0.04)
      );
      float alpha = clamp((fresnel * 0.72 + (1.0 - ndotv) * 0.24) * (0.45 + 0.55 * boil) * uIntensity * 0.92, 0.0, 0.95);
      gl_FragColor = vec4(col, alpha);
      return;
    }

    // Trailing turbulent plasma wake & supersonic ionized shear tendrils
    float h = clamp((vLocalPos.y + 1.15) / 4.8, 0.0, 1.0);
    float speed = mix(8.5, 11.5, uLayer - 1.0);
    vec2 streakUv = vec2(cos(ang) * 2.3 + sin(ang) * 0.9, h * 3.8 - uTime * speed * 0.28);
    float shear = warpedFbm(streakUv);
    float fineFilaments = fbm4(vec2(sin(ang) * 5.2 + cos(ang) * 2.1, h * 9.0 - uTime * speed * 0.48));

    // Envelope tapers upward above capsule and dissolves into ragged fire tongues
    float bottomWrap = smoothstep(0.0, 0.14, h);
    float axialFade = pow(max(0.0, 1.0 - h), uLayer < 1.5 ? 1.08 : 1.35);
    float tongue = smoothstep(0.24, 0.78, axialFade * 0.95 + (shear - 0.45) * 0.65 + (fineFilaments - 0.5) * 0.35);
    float fresnel = pow(ndotv, uLayer < 1.5 ? 1.15 : 1.38);

    float heat = clamp((1.0 - h * 0.85) * 0.7 + shear * 0.45 + fineFilaments * 0.25, 0.0, 1.3) * uIntensity;
    vec3 col = blackbodyFireColor(
      heat,
      vec3(1.5, 1.32, 0.92),
      vec3(1.25, 0.52, 0.10),
      vec3(0.88, 0.18, 0.03)
    );

    // Subtle thin nitrogen/oxygen recombination glow ONLY in cool outer ionized shear fringes
    if (uLayer > 1.5) {
      float ionFringe = smoothstep(0.22, 0.75, h) * (1.0 - fresnel * 0.6) * pow(fineFilaments, 1.6);
      col = mix(col, vec3(0.72, 0.36, 0.96), ionFringe * 0.42);
    }

    float baseAlpha = uLayer < 1.5 ? 0.82 : 0.48;
    float alpha = bottomWrap * tongue * fresnel * (0.42 + 0.72 * fineFilaments) * uIntensity * baseAlpha;
    if (alpha <= 0.002) discard;

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

export function createPlasmaSheathMaterial(layer: 0 | 1 | 2): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: plasmaVertexShader,
    fragmentShader: plasmaFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uLayer: { value: layer },
      uWarpAmp: { value: layer === 0 ? 0.05 : layer === 1 ? 0.24 : 0.42 }
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide
  });
}

const fireballVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform float uTurbulence;

  ${GLSL_NOISE_LIB}

  void main() {
    vUv = uv;
    float boil = warpedFbm(uv * 5.0 + vec2(uTime * 1.4, -uTime * 1.9)) - 0.5;
    vec3 displaced = position + normal * boil * uTurbulence;
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fireballFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform float uHeat;
  uniform float uOpacity;

  ${GLSL_NOISE_LIB}

  void main() {
    float f = warpedFbm(vUv * 6.5 + vec2(uTime * 0.9, -uTime * 1.6));
    float detail = fbm4(vUv * 13.0 - vec2(uTime * 1.4, uTime * 2.2));
    float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
    float fresnel = pow(ndotv, 1.25);

    float temp = clamp(uHeat * (0.45 + 0.65 * f + 0.30 * detail), 0.0, 1.35);
    vec3 col = blackbodyFireColor(
      temp,
      vec3(1.6, 1.45, 1.05),
      vec3(1.25, 0.50, 0.08),
      vec3(0.45, 0.08, 0.02)
    );
    float alpha = clamp(fresnel * smoothstep(0.18, 0.78, f * 0.75 + detail * 0.45) * uOpacity, 0.0, 1.0);
    if (alpha <= 0.005) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createTurbulentFireballMaterial(turbulence = 0.26): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: fireballVertexShader,
    fragmentShader: fireballFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uHeat: { value: 1.0 },
      uOpacity: { value: 1.0 },
      uTurbulence: { value: turbulence }
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide
  });
}

let cachedVolumetricNoise3D: Data3DTexture | null = null;

function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise3D(
  x: number,
  y: number,
  z: number,
  period: number,
  seed: number
): number {
  const px = x * period;
  const py = y * period;
  const pz = z * period;
  const ix0 = Math.floor(px);
  const iy0 = Math.floor(py);
  const iz0 = Math.floor(pz);
  const fx = px - ix0;
  const fy = py - iy0;
  const fz = pz - iz0;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const mask = period - 1;
  const x0 = ix0 & mask;
  const y0 = iy0 & mask;
  const z0 = iz0 & mask;
  const x1 = (ix0 + 1) & mask;
  const y1 = (iy0 + 1) & mask;
  const z1 = (iz0 + 1) & mask;

  const c000 = hash3i(x0, y0, z0, seed);
  const c100 = hash3i(x1, y0, z0, seed);
  const c010 = hash3i(x0, y1, z0, seed);
  const c110 = hash3i(x1, y1, z0, seed);
  const c001 = hash3i(x0, y0, z1, seed);
  const c101 = hash3i(x1, y0, z1, seed);
  const c011 = hash3i(x0, y1, z1, seed);
  const c111 = hash3i(x1, y1, z1, seed);

  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;
  const y0v = x00 + (x10 - x00) * uy;
  const y1v = x01 + (x11 - x01) * uy;
  return y0v + (y1v - y0v) * uz;
}

function buildWorleyCellOffsets(period: number, seed: number): Float32Array {
  const pts = new Float32Array(period * period * period * 3);
  let ptr = 0;
  for (let cz = 0; cz < period; cz++) {
    for (let cy = 0; cy < period; cy++) {
      for (let cx = 0; cx < period; cx++) {
        pts[ptr++] = cx + 0.15 + 0.7 * hash3i(cx, cy, cz, seed + 11);
        pts[ptr++] = cy + 0.15 + 0.7 * hash3i(cx, cy, cz, seed + 37);
        pts[ptr++] = cz + 0.15 + 0.7 * hash3i(cx, cy, cz, seed + 73);
      }
    }
  }
  return pts;
}

function periodicWorley3D(
  x: number,
  y: number,
  z: number,
  period: number,
  pts: Float32Array
): number {
  const px = x * period;
  const py = y * period;
  const pz = z * period;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  const mask = period - 1;
  let minDistSq = 4.0;

  for (let dz = -1; dz <= 1; dz++) {
    const cz = (iz + dz) & mask;
    const zShift = iz + dz - cz;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = (iy + dy) & mask;
      const yShift = iy + dy - cy;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (ix + dx) & mask;
        const xShift = ix + dx - cx;
        const idx = ((cz * period + cy) * period + cx) * 3;
        const ox = pts[idx] + xShift - px;
        const oy = pts[idx + 1] + yShift - py;
        const oz = pts[idx + 2] + zShift - pz;
        const d2 = ox * ox + oy * oy + oz * oz;
        if (d2 < minDistSq) minDistSq = d2;
      }
    }
  }
  return Math.max(0, Math.min(1, 1.0 - Math.sqrt(minDistSq) * 1.12));
}

/**
 * Generate seamless periodic 3D multi-octave turbulence + Worley billow data
 * (RGBA8, size^3) for hardware-trilinear WebGL2 volumetric raymarching.
 */
export function createVolumetricNoise3DData(size = 48): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const worley4 = buildWorleyCellOffsets(4, 901);
  const worley8 = buildWorleyCellOffsets(8, 1709);
  let ptr = 0;

  for (let z = 0; z < size; z++) {
    const nz = z / size;
    for (let y = 0; y < size; y++) {
      const ny = y / size;
      for (let x = 0; x < size; x++) {
        const nx = x / size;

        const r0 = periodicValueNoise3D(nx, ny, nz, 4, 101);
        const r1 = periodicValueNoise3D(nx, ny, nz, 8, 211);
        const lowFbm = r0 * 0.67 + r1 * 0.33;

        const g0 = periodicValueNoise3D(nx, ny, nz, 8, 331);
        const g1 = periodicValueNoise3D(nx, ny, nz, 16, 443);
        const midFbm = g0 * 0.65 + g1 * 0.35;

        const b0 = periodicValueNoise3D(nx, ny, nz, 16, 557);
        const b1 = periodicValueNoise3D(nx, ny, nz, 32, 673);
        const hiFbm = b0 * 0.65 + b1 * 0.35;

        const w0 = periodicWorley3D(nx, ny, nz, 4, worley4);
        const w1 = periodicWorley3D(nx, ny, nz, 8, worley8);
        const billow = w0 * 0.66 + w1 * 0.34;

        data[ptr++] = Math.round(lowFbm * 255);
        data[ptr++] = Math.round(midFbm * 255);
        data[ptr++] = Math.round(hiFbm * 255);
        data[ptr++] = Math.round(billow * 255);
      }
    }
  }
  return data;
}

export function getSharedVolumetricNoise3D(size = 48): Data3DTexture {
  if (!cachedVolumetricNoise3D) {
    const data = createVolumetricNoise3DData(size);
    const tex = new Data3DTexture(data, size, size, size);
    tex.format = RGBAFormat;
    tex.type = UnsignedByteType;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.wrapR = RepeatWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    cachedVolumetricNoise3D = tex;
  }
  return cachedVolumetricNoise3D;
}

export interface RetroNozzleImpact {
  worldOrigin: Vector3;
  worldDir: Vector3;
  impactPos: Vector3;
  distToPad: number;
  impingeStrength: number;
}

/**
 * Project a capsule retro-rocket nozzle ray onto the concrete recovery pad plane (y = padTopY)
 * in world space, yielding exact contact spot and impingement intensity.
 */
export function computeRetroNozzleImpact(
  spec: RetroNozzleSpec,
  capsuleWorldMat: Matrix4,
  padTopY: number
): RetroNozzleImpact {
  const worldOrigin = new Vector3(...spec.throat).applyMatrix4(capsuleWorldMat);
  const worldDir = new Vector3(...spec.dir).transformDirection(capsuleWorldMat).normalize();
  const denom = worldDir.y;
  const distToPad =
    denom < -1e-3 ? Math.max(0, (padTopY - worldOrigin.y) / denom) : 12.0;
  const impactPos = new Vector3(
    worldOrigin.x + worldDir.x * distToPad,
    padTopY,
    worldOrigin.z + worldDir.z * distToPad
  );
  // Strong impingement once pad is within ~2.1 scene units (~7.5 m) of nozzle exit
  const impingeStrength = Math.max(0, Math.min(1, Math.exp(-Math.max(0, distToPad - 0.18) * 0.78)));
  return { worldOrigin, worldDir, impactPos, distToPad, impingeStrength };
}

const landingFireRaymarchVertexShader = /* glsl */ `
  out vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const landingFireRaymarchFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  in vec3 vWorldPos;
  layout(location = 0) out vec4 fragColor;

  uniform highp sampler3D uNoiseTex;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uIgnitionFlash;
  uniform float uPadTopY;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform mat4 uCapsuleInvMat;
  uniform vec3 uNozzlePos[4];
  uniform vec3 uNozzleDir[4];
  uniform vec4 uImpactPos[4];
  uniform vec2 uCenterXZ;
  uniform float uSteps;
  uniform float uCrashMode;
  uniform float uCrashElapsed;

  // Filmic ACES curve keeps blinding white-gold Mach cores vivid without harsh channel clipping
  vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Physically inspired solid aluminized APCP propellant + hydrocarbon concrete-blast blackbody
  // Balanced for vivid electric Mach-gold cores transitioning to saturated amber & crimson flame tongues
  vec3 solidRocketBlackbody(float temp) {
    vec3 sootEmber = vec3(0.45, 0.028, 0.002);
    vec3 crimson   = vec3(1.35, 0.14,  0.008);
    vec3 amber     = vec3(2.45, 0.68,  0.048);
    vec3 gold      = vec3(3.45, 2.05,  0.34);
    vec3 coreWhite = vec3(4.50, 3.80,  2.55);

    vec3 c = mix(sootEmber, crimson, smoothstep(0.06, 0.30, temp));
    c = mix(c, amber, smoothstep(0.28, 0.64, temp));
    c = mix(c, gold, smoothstep(0.62, 1.04, temp));
    c = mix(c, coreWhite, smoothstep(1.02, 1.50, temp));
    return c;
  }

  // Exact Apollo Block II Command Module hull SDF in capsule-local space for clean occlusion
  float sdCapsuleHull(vec3 q) {
    float tCone = clamp((q.y + 0.56) / 1.50, 0.0, 1.0);
    float rCone = mix(1.355, 0.455, tCone);
    float dCone = max(length(q.xz) - rCone, max(-0.68 - q.y, q.y - 0.96));
    float dCrush = max(length(q.xz) - 0.35, max(-0.82 - q.y, q.y - (-0.66)));
    return min(dCone, dCrush);
  }

  void main() {
    if (uIntensity <= 0.01) discard;

    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - cameraPosition);
    if (ro.y <= uPadTopY - 0.06) discard;

    vec3 safeRd = vec3(
      abs(rd.x) < 1e-5 ? (rd.x < 0.0 ? -1e-5 : 1e-5) : rd.x,
      abs(rd.y) < 1e-5 ? (rd.y < 0.0 ? -1e-5 : 1e-5) : rd.y,
      abs(rd.z) < 1e-5 ? (rd.z < 0.0 ? -1e-5 : 1e-5) : rd.z
    );
    vec3 invRd = 1.0 / safeRd;
    vec3 t0 = (uBoxMin - ro) * invRd;
    vec3 t1 = (uBoxMax - ro) * invRd;
    vec3 tSmaller = min(t0, t1);
    vec3 tBigger = max(t0, t1);
    float tEnter = max(0.0, max(max(tSmaller.x, tSmaller.y), tSmaller.z));
    float tExit = min(min(tBigger.x, tBigger.y), tBigger.z);
    if (tExit <= tEnter) discard;

    int numSteps = int(uSteps);
    float marchDist = min(tExit - tEnter, 9.6);
    float ds = marchDist / float(numSteps);

    // Interleaved Gradient Noise ray-start jitter removes all volumetric slicing bands
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = tEnter + ign * ds;

    vec3 accumRGB = vec3(0.0);
    float T = 1.0;

    float avgImpinge = 0.25 * (uImpactPos[0].w + uImpactPos[1].w + uImpactPos[2].w + uImpactPos[3].w);

    for (int i = 0; i < 24; i++) {
      if (i >= numSteps || T < 0.03) break;
      vec3 p = ro + rd * t;
      t += ds;

      float h = p.y - uPadTopY;
      if (h < -0.01) continue;

      if (uCrashMode < 0.5) {
        // 1. Stop rays hitting the opaque Apollo CM hull
        vec3 pLocal = (uCapsuleInvMat * vec4(p, 1.0)).xyz;
        if (sdCapsuleHull(pLocal) < -0.012) break;

        vec2 dVec = p.xz - uCenterXZ;
        float R = length(dVec);

        // 2. Analytic jet & wall-jet envelopes BEFORE any 3D texture reads
        bool nearJet = false;
        float sArr[4];
        float rArr[4];
        float spotHot = 0.0;
        for (int k = 0; k < 4; k++) {
          vec3 rel = p - uNozzlePos[k];
          float sk = dot(rel, uNozzleDir[k]);
          float rk = length(rel - sk * uNozzleDir[k]);
          sArr[k] = sk;
          rArr[k] = rk;
          if (sk > -0.04 && sk < 2.25 && rk < 0.44) {
            nearJet = true;
          }
          if (avgImpinge > 0.03 && h < 1.35 && R < 4.6) {
            vec2 dsSpot = p.xz - uImpactPos[k].xz;
            float d2 = dot(dsSpot, dsSpot);
            spotHot = max(spotHot, uImpactPos[k].w * exp(-d2 * 2.3) * exp(-h * 3.1));
          }
        }

        float ang = atan(dVec.y, dVec.x);
        // 4 diagonal nozzle blast lobes (pi/4 + k*pi/2 => -cos(4*theta) = +1)
        float diagLobe = 0.54 + 0.46 * smoothstep(-0.45, 0.85, -cos(ang * 4.0));
        float crossWash = exp(-min(abs(dVec.x), abs(dVec.y)) * 1.85)
          * smoothstep(0.35, 1.65, R) * exp(-R * 0.36);
        float maxWallH = (0.30 + 0.78 * smoothstep(0.55, 2.55, R) + 0.85 * crossWash + uIgnitionFlash * 0.35)
          * (0.35 + 0.65 * avgImpinge);
        float radReach = smoothstep(4.35 + uIgnitionFlash * 0.65, 0.45, R) * diagLobe;
        float hEnv = smoothstep(maxWallH * 1.32, 0.0, h) * smoothstep(-0.02, 0.05, h);
        float wallFireEnv = radReach * hEnv * 1.05 + spotHot * 0.68;

        float smokeMaxH = (0.95 + 1.70 * smoothstep(0.65, 3.8, R) + 0.85 * crossWash) * (0.4 + 0.6 * avgImpinge);
        float smokeEnv = smoothstep(4.95, 0.65, R) * smoothstep(smokeMaxH, 0.02, h) * smoothstep(0.0, 0.12, h);

        bool nearWallFire = avgImpinge > 0.03 && wallFireEnv > 0.10;
        bool nearWallSmoke = avgImpinge > 0.03 && smokeEnv > 0.15;
        if (!nearJet && !nearWallFire && !nearWallSmoke) continue;

        // 3. Hardware-trilinear 3D noise (all 4 octaves + Worley billows packed in RGBA)
        vec2 radDir = R > 0.001 ? dVec / R : vec2(1.0, 0.0);
        vec3 wallFlow = vec3(radDir.x * 4.8, 1.2 + 1.45 * smoothstep(0.8, 3.6, R), radDir.y * 4.8);

        float jetDens = 0.0;
        float jetHeat = 0.0;
        if (nearJet) {
          vec4 nJet = texture(uNoiseTex, pLocal * 0.48 + vec3(0.0, uTime * 4.1, 0.0));
          float padSoft = smoothstep(-0.01, 0.22, h);
          for (int k = 0; k < 4; k++) {
            float sk = sArr[k];
            if (sk > -0.04 && sk < 2.2) {
              float rk = rArr[k];
              float rExpand = 0.10 + 0.13 * pow(max(0.0, sk), 0.68)
                + (nJet.g - 0.5) * 0.085 * smoothstep(0.04, 0.82, sk);
              float jProf = smoothstep(rExpand * 1.40, rExpand * 0.12, rk)
                * smoothstep(-0.04, 0.05, sk)
                * exp(-max(0.0, sk) * 0.36)
                * (0.45 + 0.55 * padSoft);
              if (jProf > 0.005) {
                float shockWave = cos(sk * 21.0 - uTime * 44.0 + (nJet.r - 0.5) * 1.4);
                float mach = exp(-max(0.0, sk) * 1.40) * pow(max(0.0, shockWave), 5.0)
                  * exp(-pow(rk / max(0.045, rExpand * 0.50), 2.0));
                float throat = exp(-max(0.0, sk) * 3.0) * smoothstep(0.18, 0.0, rk);
                jetDens += jProf;
                jetHeat += jProf * (0.95 * exp(-max(0.0, sk) * 0.45) + 0.35 * nJet.b)
                  + mach * 1.35 + throat * 1.05;
              }
            }
          }
        }

        float wallDens = 0.0;
        float wallHeat = 0.0;
        float smokeDens = 0.0;
        float cellTurb = 0.5;
        if (nearWallFire || nearWallSmoke) {
          vec4 nCoarse = texture(uNoiseTex, p * 0.25 - wallFlow * (uTime * 0.27));
          float fbmWall = nCoarse.r * 0.34 + nCoarse.g * 0.28 + nCoarse.b * 0.16 + nCoarse.a * 0.22;
          cellTurb = nCoarse.a;
          if (nearWallFire) {
            if (wallFireEnv > 0.24) {
              vec3 warp = (nCoarse.rgb - 0.5) * (0.40 + 0.42 * smoothstep(0.4, 3.0, R));
              vec4 nFine = texture(uNoiseTex, (p + warp) * 0.62 - wallFlow * (uTime * 0.54));
              fbmWall = nCoarse.r * 0.24 + nFine.g * 0.30 + nFine.b * 0.24 + nFine.a * 0.22;
              cellTurb = nFine.a;
            }
            float fireThresh = mix(0.66, 0.36, clamp(uIntensity, 0.0, 1.0));
            float fireMask = smoothstep(
              fireThresh,
              fireThresh + 0.30,
              wallFireEnv * (0.50 + 0.50 * clamp(uIntensity, 0.0, 1.0)) + (fbmWall - 0.48) * 1.08
            );
            wallDens = fireMask * avgImpinge;
            // Carve dark fiery cavities instead of saturating the inner blast to flat white
            wallHeat = wallDens * (0.38 + 0.72 * spotHot + 0.62 * fbmWall * fbmWall + 0.26 * crossWash + uIgnitionFlash * 0.38)
              * (1.12 - 0.46 * smoothstep(0.85, 3.8, R));
          }
          if (nearWallSmoke) {
            float rawSmoke = smoothstep(0.42, 0.78, smokeEnv * 0.94 + (fbmWall - 0.48) * 0.92) * avgImpinge;
            smokeDens = rawSmoke * (1.0 - smoothstep(0.35, 0.85, wallHeat));
          }
        }

        float fireDens = clamp(jetDens * 1.45 + wallDens * 1.35, 0.0, 2.8) * smoothstep(0.03, 0.42, uIntensity);
        float totalHeat = (jetHeat * 1.05 + wallHeat) * uIntensity;
        if (fireDens <= 0.004 && smokeDens <= 0.004) continue;

        vec3 fireColor = solidRocketBlackbody(totalHeat);
        vec3 fireEmit = fireColor * (fireDens * (0.82 + 1.02 * totalHeat)) * uIntensity;

        float internalGlow = exp(-R * 0.62) * exp(-h * 0.95) * (0.35 + 0.85 * cellTurb) * uIntensity * avgImpinge;
        vec3 smokeCol = mix(vec3(0.085, 0.08, 0.08), vec3(1.12, 0.32, 0.03), clamp(internalGlow * 1.15, 0.0, 1.0));
        float sigmaFire = fireDens * 2.15;
        float sigmaSmoke = smokeDens * 2.95;
        float sigmaT = sigmaFire + sigmaSmoke;

        vec3 stepEmit = fireEmit + smokeCol * sigmaSmoke;
        float stepTrans = exp(-sigmaT * ds);
        float weight = sigmaT > 0.001 ? (1.0 - stepTrans) / sigmaT : ds;
        accumRGB += T * stepEmit * weight;
        T *= stepTrans;
      } else {
        // Hard-impact crash mode: turbulent expanding impact fireball + rising oil-black/orange smoke plume
        vec2 dVec = p.xz - uCenterXZ;
        float R = length(dVec);
        if (h > 3.9 || R > 4.6) continue;

        float burstGrow = smoothstep(0.0, 0.35, uCrashElapsed);
        float burstFade = exp(-max(0.0, uCrashElapsed - 0.4) * 0.24);
        float poolBase = 0.55 + 0.45 * burstFade;

        float fireRadius = mix(2.0, 3.2, burstGrow) * (0.65 + 0.35 * burstFade);
        float fireH = mix(1.6, 2.7, burstGrow) * (0.65 + 0.35 * burstFade);
        float ellipDist = length(vec3(dVec.x / fireRadius, h / fireH, dVec.y / fireRadius));
        float smokeEllip = length(vec3(dVec.x / 4.3, (h - 0.25) / 3.7, dVec.y / 4.3));
        if (ellipDist > 1.25 && smokeEllip > 1.15) continue;

        vec3 riseFlow = vec3(dVec.x * 0.22, 2.2, dVec.y * 0.22);
        vec4 n0 = texture(uNoiseTex, p * 0.22 - riseFlow * (uTime * 0.26));
        float fbm = n0.r * 0.36 + n0.g * 0.28 + n0.b * 0.16 + n0.a * 0.20;

        float fireEnv = smoothstep(1.18, 0.15, ellipDist) * smoothstep(-0.02, 0.08, h);
        float fireDens = smoothstep(0.28, 0.72, fireEnv * 1.15 + (fbm - 0.48) * 0.85) * poolBase;
        float heat = fireDens * (1.25 - 0.65 * ellipDist + 0.35 * fbm) * (1.0 + 0.45 * burstFade);

        float smokeEnv = smoothstep(1.12, 0.25, smokeEllip) * smoothstep(0.0, 0.22, h);
        float smokeDens = smoothstep(0.30, 0.76, smokeEnv * 0.95 + (fbm - 0.48) * 0.72)
          * (1.0 - smoothstep(0.42, 0.92, heat));

        if (fireDens <= 0.004 && smokeDens <= 0.004) continue;

        vec3 fireEmit = solidRocketBlackbody(heat) * (fireDens * (0.9 + 1.45 * heat)) * uIntensity;
        float internalGlow = exp(-ellipDist * 1.3) * uIntensity;
        vec3 smokeCol = mix(vec3(0.06, 0.055, 0.055), vec3(0.95, 0.28, 0.04), clamp(internalGlow * 1.1, 0.0, 1.0));
        float sigmaT = fireDens * 1.25 + smokeDens * 3.1;
        vec3 stepEmit = fireEmit + smokeCol * (smokeDens * 3.1);
        float stepTrans = exp(-sigmaT * ds);
        float weight = sigmaT > 0.001 ? (1.0 - stepTrans) / sigmaT : ds;
        accumRGB += T * stepEmit * weight;
        T *= stepTrans;
      }
    }

    float alpha = clamp(1.0 - T, 0.0, 1.0);
    if (alpha <= 0.003 && dot(accumRGB, accumRGB) <= 1e-5) discard;

    vec3 mapped = acesFilm(accumRGB);
    vec3 srgb = pow(mapped, vec3(1.0 / 2.2));
    fragColor = vec4(srgb, alpha);
  }
`;

/**
 * Create a GLSL3 true 3D raymarched volumetric fire, Mach-shock, wall-jet, and
 * internally-lit smoke ShaderMaterial using CustomBlending (One, OneMinusSrcAlpha).
 */
export function createLandingFireVolumeMaterial(): ShaderMaterial {
  const noise3D = getSharedVolumetricNoise3D();
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: landingFireRaymarchVertexShader,
    fragmentShader: landingFireRaymarchFragmentShader,
    uniforms: {
      uNoiseTex: { value: noise3D },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uIgnitionFlash: { value: 0 },
      uPadTopY: { value: -0.93 },
      uBoxMin: { value: new Vector3(-5.8, -0.93, -5.8) },
      uBoxMax: { value: new Vector3(5.8, 2.7, 5.8) },
      uCapsuleInvMat: { value: new Matrix4() },
      uNozzlePos: {
        value: [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
      },
      uNozzleDir: {
        value: [
          new Vector3(0, -1, 0),
          new Vector3(0, -1, 0),
          new Vector3(0, -1, 0),
          new Vector3(0, -1, 0)
        ]
      },
      uImpactPos: {
        value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()]
      },
      uCenterXZ: { value: new Vector2(0, 0) },
      uSteps: { value: 26 },
      uCrashMode: { value: 0 },
      uCrashElapsed: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    side: FrontSide,
    toneMapped: false
  });
}

const padScorchVertexShader = /* glsl */ `
  out vec2 vUv;
  out vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const padScorchFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  in vec3 vWorldPos;
  layout(location = 0) out vec4 fragColor;

  uniform highp sampler3D uNoiseTex;
  uniform float uTime;
  uniform float uBurnIntensity;
  uniform float uScorchAmount;
  uniform vec2 uCenterXZ;
  uniform vec4 uImpactPos[4];

  vec3 scorchBlackbody(float t) {
    vec3 crimson = vec3(0.55, 0.06, 0.008);
    vec3 amber   = vec3(1.55, 0.48, 0.05);
    vec3 gold    = vec3(2.20, 1.65, 0.90);
    vec3 col = mix(crimson * 0.4, crimson, smoothstep(0.04, 0.28, t));
    col = mix(col, amber, smoothstep(0.24, 0.62, t));
    col = mix(col, gold, smoothstep(0.58, 0.96, t));
    return col;
  }

  void main() {
    vec2 p = vWorldPos.xz - uCenterXZ;
    float R = length(p);
    if (R > 6.2) discard;

    float ang = atan(p.y, p.x);
    vec4 nScorch = texture(uNoiseTex, vec3(p * 0.28, 0.37));
    vec4 nFlow = texture(uNoiseTex, vec3(p * 0.42 - normalize(p + 1e-4) * (uTime * 0.45), uTime * 0.08));
    float radialStreaks = nFlow.r * 0.55 + nFlow.g * 0.45;
    float charNoise = nScorch.r * 0.4 + nScorch.a * 0.35 + nScorch.b * 0.25;

    // 4-lobed jet impingement thermal hotspots directly under the diagonal canted nozzles
    float spotHeat = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 dp = vWorldPos.xz - uImpactPos[k].xz;
      spotHeat = max(spotHeat, uImpactPos[k].w * exp(-dot(dp, dp) * 1.65));
    }

    // Diagonal 4-lobe carbonized soot blast pattern (-cos(4*theta) peaks at 45, 135, 225, 315 deg)
    float crossLobe = 0.66 - 0.34 * cos(ang * 4.0);
    float scorchMask = smoothstep(5.4, 0.4, R * (0.85 + 0.35 * nScorch.g))
      * crossLobe * (0.55 + 0.45 * charNoise) * uScorchAmount;

    // Live incandescent thermal bounce + glowing hot concrete beneath jets
    float flicker = 0.88 + 0.12 * sin(uTime * 37.0 + radialStreaks * 6.0);
    float glowField = (spotHeat * 1.15 + exp(-R * 0.58) * (0.42 + 0.58 * radialStreaks))
      * uBurnIntensity * flicker;

    vec3 sootCol = vec3(0.05, 0.045, 0.042);
    vec3 heatCol = scorchBlackbody(clamp(glowField * 0.92, 0.0, 1.35));

    // Darken concrete via alpha soot while radiating bright incandescent fire bounce
    float sootAlpha = clamp(scorchMask * 0.76, 0.0, 0.88);
    float glowAlpha = clamp(glowField * 0.80, 0.0, 0.90);
    float alpha = max(sootAlpha, glowAlpha);
    if (alpha <= 0.005) discard;

    vec3 finalRgb = sootCol * sootAlpha * (1.0 - min(1.0, glowField)) + heatCol * glowAlpha;
    fragColor = vec4(finalRgb, alpha);
  }
`;

export function createPadScorchMaterial(): ShaderMaterial {
  const noise3D = getSharedVolumetricNoise3D();
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: padScorchVertexShader,
    fragmentShader: padScorchFragmentShader,
    uniforms: {
      uNoiseTex: { value: noise3D },
      uTime: { value: 0 },
      uBurnIntensity: { value: 0 },
      uScorchAmount: { value: 0 },
      uCenterXZ: { value: new Vector2(0, 0) },
      uImpactPos: {
        value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()]
      }
    },
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });
}

const landingSmokeVertexShader = /* glsl */ `
  in vec4 aSmokeParam; // x: life [0..1], y: fireGlow [0..1], z: seed, w: darkFactor [0..1]

  out vec2 vUv;
  out vec3 vWorldPos;
  out vec4 vSmokeParam;

  void main() {
    vUv = uv;
    vSmokeParam = aSmokeParam;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const landingSmokeFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  in vec3 vWorldPos;
  in vec4 vSmokeParam;
  layout(location = 0) out vec4 fragColor;

  uniform highp sampler3D uNoiseTex;
  uniform float uTime;
  uniform float uPadTopY;
  uniform float uOpacity;

  void main() {
    float life = vSmokeParam.x;
    float fireGlow = vSmokeParam.y;
    float seed = vSmokeParam.z;
    float darkFactor = vSmokeParam.w;

    vec2 centered = vUv * 2.0 - 1.0;
    float r = length(centered);
    if (r >= 1.0) discard;

    // Hardware-trilinear 3D FBM + Worley cellular billow in one texture lookup
    vec3 nCoord = vec3(
      centered * 0.42 + vec2(seed * 3.7, -uTime * 0.12 + seed * 1.9),
      seed * 2.3 + uTime * 0.04
    );
    vec4 n = texture(uNoiseTex, nCoord);
    float billow = n.r * 0.34 + n.g * 0.28 + n.b * 0.16 + n.a * 0.22;
    float puff = smoothstep(0.92, 0.34, r + (billow - 0.5) * 0.68);
    if (puff <= 0.01) discard;

    // Seamless ground-plane soft fade prevents hard intersection lines against concrete pad
    float groundFade = smoothstep(uPadTopY - 0.08, uPadTopY + 0.34, vWorldPos.y);
    float lifeFade = sin(clamp(life, 0.0, 1.0) * 3.14159265);

    // Top sunlit rim + underside internal fire scatter
    float topSun = clamp(0.42 + 0.58 * centered.y + (n.g - 0.5) * 0.42, 0.0, 1.0);
    vec3 coolSmoke = mix(vec3(0.16, 0.15, 0.15), vec3(0.62, 0.60, 0.56), topSun);
    vec3 sootSmoke = mix(vec3(0.06, 0.055, 0.055), vec3(0.22, 0.20, 0.19), topSun);
    vec3 baseSmoke = mix(coolSmoke, sootSmoke, darkFactor);

    // Warm orange-amber bounce glow from the blast core onto lower/inner cloud surfaces
    float underGlow = clamp((0.68 - centered.y * 0.65) * fireGlow * (0.65 + 0.6 * n.b), 0.0, 1.35);
    vec3 finalCol = baseSmoke + vec3(1.45, 0.48, 0.08) * underGlow;

    float alpha = clamp(puff * groundFade * lifeFade * uOpacity, 0.0, 0.78);
    if (alpha <= 0.004) discard;
    fragColor = vec4(finalCol, alpha);
  }
`;

export function createLandingSmokeMaterial(): ShaderMaterial {
  const noise3D = getSharedVolumetricNoise3D();
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: landingSmokeVertexShader,
    fragmentShader: landingSmokeFragmentShader,
    uniforms: {
      uNoiseTex: { value: noise3D },
      uTime: { value: 0 },
      uPadTopY: { value: -0.93 },
      uOpacity: { value: 0.62 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true
  });
}
