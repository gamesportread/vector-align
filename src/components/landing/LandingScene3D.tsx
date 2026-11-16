import { Component, Suspense, memo, useEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Line, useGLTF, useTexture } from '@react-three/drei';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Fog,
  FrontSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  Vector4
} from 'three';
import { translate } from '../../i18n';
import { useSession } from '../../store';
import { TaskCameraControls } from '../scene/TaskCameraControls';
import {
  applyAntiMoireToObject,
  configureMipmappedTexture,
  type RenderQuality
} from '../scene/textureQuality';
import {
  APOLLO_RETRO_NOZZLES,
  computeRetroNozzleImpact,
  createLandingFireVolumeMaterial,
  createLandingSmokeMaterial,
  createPadScorchMaterial,
  createPlasmaSheathMaterial,
  createPlasmaWakeGeometry,
  createSupersonicPlumeGeometry,
  createVolumetricPlumeMaterial
} from '../scene/volumetricFire';
import type { LandingCommand, LandingState } from '../../sim/landing';
import type { Language } from '../../sim/types';

let cachedMainChuteTex: CanvasTexture | null = null;
let cachedDrogueChuteTex: CanvasTexture | null = null;
let cachedMainCanopyGeo: BufferGeometry | null = null;
let cachedDrogueCanopyGeo: BufferGeometry | null = null;
let cachedRecoveryZoneTex: CanvasTexture | null = null;
let cachedLandingCloudTex: CanvasTexture | null = null;
let cachedReentryGeos: { wakeInnerGeo: BufferGeometry; wakeOuterGeo: BufferGeometry } | null = null;

function getSharedReentryGeos() {
  if (!cachedReentryGeos) {
    cachedReentryGeos = {
      wakeInnerGeo: createPlasmaWakeGeometry(1.38, 1.56, 3.65, 1.88, 56),
      wakeOuterGeo: createPlasmaWakeGeometry(1.48, 1.72, 5.15, 2.52, 56)
    };
  }
  return cachedReentryGeos;
}

export type LandingCameraPreset = 'chase' | 'chute' | 'pad';

const APOLLO_CM_MODEL_URL = '/models/apollo_cm.glb';
const PX_PER_M = 0.28;
const GROUND_BASE_DEPTH = 1.04;
const PAD_SURFACE_OFFSET = 0.11;
const EARTH_COMPRESSION = 18;
const EARTH_RADIUS_UNITS = 6371000 * 0.08;
const EARTH_MAX_RENDER_RADIUS = 16000;

const UP_AXIS = new Vector3(0, 1, 0);

function padSurfaceWorldY(altitudeM: number, lateralOffsetM: number): number {
  const groundY = -GROUND_BASE_DEPTH - altitudeM * PX_PER_M;
  const distFromPadCenter = Math.abs(lateralOffsetM * 0.55);
  const surfaceOffset = distFromPadCenter <= 9.5 ? PAD_SURFACE_OFFSET : distFromPadCenter <= 13.2 ? 0.09 : 0;
  return groundY + surfaceOffset;
}

useGLTF.preload(APOLLO_CM_MODEL_URL);

function landingGroundView(altitudeM: number): { depth: number; k: number } {
  const h = Math.max(0, altitudeM) * 0.08;
  const real = 6.5 + h;
  const depth = 6.5 + EARTH_COMPRESSION * Math.log(1 + h / EARTH_COMPRESSION);
  return { depth, k: depth / real };
}

function cloudWorldY(altitudeM: number, layerAltM: number): number {
  return (layerAltM - altitudeM) * 0.085;
}

/**
 * Cap raw metallic reflectance slightly so offline Lightformer IBL highlights
 * retain crisp readable aerospace shading in WebGL preview/headless builds.
 */
function prepareAerospacePart(
  root: Object3D,
  castShadow = true,
  quality: RenderQuality = 'high'
): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as MeshStandardMaterial;
      if (std && 'metalness' in std && typeof std.metalness === 'number') {
        std.metalness = Math.min(0.84, std.metalness);
      }
    }
  });
  applyAntiMoireToObject(root, quality);
}

/**
 * NASA Apollo Ring-Sail orange & white radial gore canopy fabric texture
 * with woven panel seams, radial reinforcement tapes, and skirt shadow AO.
 */
function createMainChuteTexture(): CanvasTexture {
  if (cachedMainChuteTex) return cachedMainChuteTex;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const nGores = 24;
  const goreW = canvas.width / nGores;

  for (let i = 0; i < nGores; i++) {
    // Classic Apollo alternating International Orange + cream-white gore blocks
    const isOrange = Math.floor(i / 2) % 2 === 0;
    const x0 = i * goreW;
    const goreGrad = ctx.createLinearGradient(x0, 0, x0 + goreW, 0);
    if (isOrange) {
      goreGrad.addColorStop(0, '#c2360c');
      goreGrad.addColorStop(0.2, '#f9581a');
      goreGrad.addColorStop(0.5, '#ff6d2e');
      goreGrad.addColorStop(0.8, '#f9581a');
      goreGrad.addColorStop(1, '#c2360c');
    } else {
      goreGrad.addColorStop(0, '#cbd5e1');
      goreGrad.addColorStop(0.2, '#f8fafc');
      goreGrad.addColorStop(0.5, '#ffffff');
      goreGrad.addColorStop(0.8, '#f8fafc');
      goreGrad.addColorStop(1, '#cbd5e1');
    }
    ctx.fillStyle = goreGrad;
    ctx.fillRect(x0, 0, goreW + 0.5, canvas.height);

    // High-tensile nylon radial suspension tape seams
    ctx.fillStyle = 'rgba(30, 41, 59, 0.28)';
    ctx.fillRect(x0, 0, 2.2, canvas.height);
  }

  // Concentric stitched sail panel bands + darkened lower skirt hem
  for (let y = 52; y < canvas.height; y += 72) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.fillRect(0, y, canvas.width, 3);
  }
  const skirtGrad = ctx.createLinearGradient(0, canvas.height * 0.72, 0, canvas.height);
  skirtGrad.addColorStop(0, 'rgba(0,0,0,0)');
  skirtGrad.addColorStop(1, 'rgba(15,23,42,0.34)');
  ctx.fillStyle = skirtGrad;
  ctx.fillRect(0, canvas.height * 0.72, canvas.width, canvas.height * 0.28);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  configureMipmappedTexture(tex, 'high');
  cachedMainChuteTex = tex;
  return tex;
}

function createDrogueChuteTexture(): CanvasTexture {
  if (cachedDrogueChuteTex) return cachedDrogueChuteTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rings = 7;
  const rH = canvas.height / rings;
  for (let r = 0; r < rings; r++) {
    ctx.fillStyle = r % 2 === 0 ? '#f97316' : '#f1f5f9';
    ctx.fillRect(0, r * rH, canvas.width, rH * 0.84);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, r * rH + rH * 0.84, canvas.width, rH * 0.16);
  }
  for (let g = 0; g < 16; g++) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.fillRect((g / 16) * canvas.width, 0, 2, canvas.height);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  configureMipmappedTexture(tex, 'high');
  cachedDrogueChuteTex = tex;
  return tex;
}

/**
 * Multi-gore scalloped parachute BufferGeometry with pneumatic fabric billowing
 * between radial suspension tapes, Ring-Sail vent slots, and open crown apex.
 */
function createScallopedCanopyGeometry(
  radius: number,
  nGores = 24,
  rings = 14,
  isMain = true
): BufferGeometry {
  const segU = nGores * 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= rings; j++) {
    const v = j / rings; // 0 = top vent rim, 1 = bottom reefing skirt
    const phi = 0.16 + v * (Math.PI * 0.44);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    // Slight pneumatic annular waist tightening + open Ring-Sail vent bulge
    const baseHeight = radius * (cosPhi - Math.cos(0.16 + Math.PI * 0.44));
    const slotWave = isMain && v > 0.28 && v < 0.72 ? Math.sin((v - 0.28) * Math.PI * 6) * 0.028 * radius : 0;

    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const theta = u * Math.PI * 2;
      const gorePhase = (u * nGores) % 1;
      const puff = Math.sin(gorePhase * Math.PI); // 0 on radial seams, 1 mid-gore

      const puffRadial = puff * (0.068 * sinPhi + 0.025) * radius;
      const puffLift = puff * (0.045 * Math.sin(v * Math.PI)) * radius;
      const skirtArch = v > 0.85 ? puff * 0.055 * ((v - 0.85) / 0.15) * radius : 0;

      const rCur = radius * sinPhi + puffRadial + slotWave;
      const yCur = baseHeight + puffLift + skirtArch;

      positions.push(Math.cos(theta) * rCur, yCur, Math.sin(theta) * rCur);
      uvs.push(u, 1 - v);
    }
  }

  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = (j + 1) * (segU + 1) + i;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * NASA Coastal Pacific / Recovery Zone surface with surf, shoreline, service roads & target pad.
 */
function createRecoveryZoneTexture(): CanvasTexture {
  if (cachedRecoveryZoneTex) return cachedRecoveryZoneTex;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#334e31';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let i = 0; i < 520; i++) {
    const x = (i * 197) % 1024;
    const y = (i * 313) % 1024;
    const r = 10 + (i % 26);
    ctx.fillStyle =
      i % 3 === 0 ? 'rgba(72, 104, 58, 0.32)' : i % 2 === 0 ? 'rgba(34, 54, 30, 0.35)' : 'rgba(92, 98, 72, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const seaGrad = ctx.createLinearGradient(0, 0, 300, 0);
  seaGrad.addColorStop(0, '#072a4a');
  seaGrad.addColorStop(0.68, '#0e4f82');
  seaGrad.addColorStop(1, '#2986b8');
  ctx.fillStyle = seaGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(255, 0);
  for (let y = 0; y <= 1024; y += 64) {
    ctx.lineTo(235 + Math.sin(y * 0.012) * 28 + Math.cos(y * 0.025) * 14, y);
  }
  ctx.lineTo(0, 1024);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(241, 245, 249, 0.78)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let y = 0; y <= 1024; y += 32) {
    const sx = 235 + Math.sin(y * 0.012) * 28 + Math.cos(y * 0.025) * 14;
    if (y === 0) ctx.moveTo(sx, y);
    else ctx.lineTo(sx, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#d4bd8c';
  ctx.lineWidth = 24;
  ctx.beginPath();
  for (let y = 0; y <= 1024; y += 32) {
    const sx = 252 + Math.sin(y * 0.012) * 28 + Math.cos(y * 0.025) * 14;
    if (y === 0) ctx.moveTo(sx, y);
    else ctx.lineTo(sx, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#3f4b5a';
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(512, 512);
  ctx.lineTo(1024, 512);
  ctx.moveTo(512, 512);
  ctx.lineTo(512, 1024);
  ctx.stroke();

  ctx.fillStyle = '#8b95a3';
  ctx.beginPath();
  const apR = 122;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = 512 + Math.cos(a) * apR;
    const py = 512 + Math.sin(a) * apR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#4f5a69';
  ctx.beginPath();
  ctx.arc(512, 512, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(512, 512, 74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#b8f566';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(512, 512, 34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(496, 488, 7, 48);
  ctx.fillRect(521, 488, 7, 48);
  ctx.fillRect(496, 509, 32, 7);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  configureMipmappedTexture(tex, 'high');
  cachedRecoveryZoneTex = tex;
  return tex;
}

function createSoftCloudTexture(): CanvasTexture {
  if (cachedLandingCloudTex) return cachedLandingCloudTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.92)');
  grad.addColorStop(0.5, 'rgba(241,248,255,0.52)');
  grad.addColorStop(1, 'rgba(241,248,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cachedLandingCloudTex = tex;
  return tex;
}

/**
 * 100 high-velocity incandescent molten slag & plasma spark streaks shearing past
 * the capsule windows during hypersonic blackout reentry.
 */
function PlasmaEmberStreaks3D({ intensity, active }: { intensity: number; active: boolean }) {
  const count = 96;
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const ang = ((i * 137.5) % 360) * (Math.PI / 180);
        const rad = 1.44 + ((i * 23) % 100) / 155;
        return {
          ang,
          rad,
          phase: ((i * 29) % 97) / 97,
          speed: 1.65 + (i % 9) * 0.28,
          len: 0.45 + (i % 7) * 0.16,
          flareOut: 0.25 + ((i * 19) % 100) / 160
        };
      }),
    []
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (intensity <= 0.08) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    const t = clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const prog = active ? (t * p.speed + p.phase) % 1 : p.phase;
      const r = p.rad + Math.pow(prog, 0.85) * p.flareOut * 1.45;
      const y = -0.92 + prog * 4.8;
      dummy.position.set(Math.cos(p.ang) * r, y, Math.sin(p.ang) * r);
      dummy.rotation.set(0, -p.ang, (0.28 * p.flareOut));
      const fade = Math.sin(prog * Math.PI);
      const thick = 0.018 * fade * Math.min(1, intensity * 1.4);
      dummy.scale.set(thick, p.len * (0.5 + 0.85 * intensity) * fade, thick);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <cylinderGeometry args={[0.25, 1.0, 1.0, 5]} />
      <meshBasicMaterial
        color="#ffd28a"
        transparent
        opacity={0.85}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * Multi-layer GLSL volumetric reentry bow shock & supersonic ionized plasma wake
 */
function ReentryPlasmaFire3D({ intensity, flying }: { intensity: number; flying: boolean }) {
  const { wakeInnerGeo, wakeOuterGeo } = useMemo(() => getSharedReentryGeos(), []);

  const bowMat = useMemo(() => createPlasmaSheathMaterial(0), []);
  const wakeInnerMat = useMemo(() => createPlasmaSheathMaterial(1), []);
  const wakeOuterMat = useMemo(() => createPlasmaSheathMaterial(2), []);

  useEffect(() => {
    return () => {
      bowMat.dispose();
      wakeInnerMat.dispose();
      wakeOuterMat.dispose();
    };
  }, [bowMat, wakeInnerMat, wakeOuterMat]);

  useFrame((_, delta) => {
    if (intensity <= 0.02) return;
    const dt = flying ? Math.min(0.05, delta) : 0.01;
    bowMat.uniforms.uTime.value += dt;
    wakeInnerMat.uniforms.uTime.value += dt;
    wakeOuterMat.uniforms.uTime.value += dt;

    bowMat.uniforms.uIntensity.value = intensity;
    wakeInnerMat.uniforms.uIntensity.value = intensity;
    wakeOuterMat.uniforms.uIntensity.value = intensity;
  });

  if (intensity <= 0.02) return null;

  return (
    <group>
      {/* Curved bow-shock stagnation wave below heat shield */}
      <mesh position={[0, -0.82, 0]} rotation={[Math.PI, 0, 0]} material={bowMat}>
        <sphereGeometry args={[1.52, 42, 22, 0, Math.PI * 2, 0, Math.PI * 0.44]} />
      </mesh>

      {/* Swirling boundary-layer plasma hugging shoulder and licking past windows */}
      <mesh geometry={wakeInnerGeo} material={wakeInnerMat} />

      {/* Wider supersonic shear & rarefied nitrogen afterglow fringes */}
      <mesh geometry={wakeOuterGeo} material={wakeOuterMat} />

      {/* Supersonic incandescent ablation sparks */}
      <PlasmaEmberStreaks3D intensity={intensity} active={flying} />
    </group>
  );
}

/**
 * Permanent dynamic light rig (never unmounted) so 1.5 m retro ignition or crash never
 * triggers a Three.js shader recompilation hitch.
 */
function LandingDynamicLightRig({ state }: { state: LandingState }) {
  const plasmaRef = useRef<PointLight>(null);
  const blastRef = useRef<PointLight>(null);
  const bellyRef = useRef<PointLight>(null);
  const postTouchdownAgeRef = useRef(0);

  const retroActive =
    state.retroFired &&
    (state.retroBurnLeftS > 0 ||
      (state.altitudeM === 0 && state.time > 0 && state.status !== 'failed'));
  const crashActive =
    state.status === 'failed' && state.failReason === 'hard_impact' && state.altitudeM <= 0.1;

  useFrame(({ clock }, delta) => {
    const dt = Math.min(0.05, delta);
    if (!state.retroFired && state.status !== 'failed') {
      postTouchdownAgeRef.current = 0;
    } else if (retroActive && state.altitudeM === 0 && state.retroBurnLeftS === 0) {
      postTouchdownAgeRef.current += dt;
    } else {
      postTouchdownAgeRef.current = 0;
    }

    const tail = Math.exp(-postTouchdownAgeRef.current * 2.1);
    const t = clock.getElapsedTime();
    const plasmaIntensity = Math.min(1, Math.max(0, (state.heatshieldTempC - 420) / 1380));

    if (plasmaRef.current) {
      const f = 0.88 + Math.sin(t * 39) * 0.12;
      plasmaRef.current.intensity = plasmaIntensity > 0.02 ? plasmaIntensity * 34 * f : 0;
    }

    const padTopY = padSurfaceWorldY(state.altitudeM, state.lateralOffsetM);
    const groundProximity = Math.max(0, Math.min(1, 1 - state.altitudeM / 3.8));
    const flicker = 0.84 + Math.sin(t * 53) * 0.10 + Math.cos(t * 87) * 0.06;

    if (blastRef.current) {
      if (retroActive) {
        blastRef.current.position.set(0, padTopY + 0.55, 0);
        blastRef.current.color.setHex(0xff9d3b);
        blastRef.current.intensity = (24 + 44 * groundProximity) * flicker * tail;
      } else if (crashActive) {
        blastRef.current.position.set(0, padTopY + 0.9, 0);
        blastRef.current.color.setHex(0xff6b1a);
        blastRef.current.intensity = 58 * flicker;
      } else {
        blastRef.current.intensity = 0;
      }
    }

    if (bellyRef.current) {
      if (retroActive) {
        bellyRef.current.position.set(0, -1.05, 0);
        bellyRef.current.color.setHex(0xffb854);
        bellyRef.current.intensity = 34 * flicker * tail;
      } else if (crashActive) {
        bellyRef.current.position.set(0, 0.2, 0.8);
        bellyRef.current.color.setHex(0xff7426);
        bellyRef.current.intensity = 28 * flicker;
      } else {
        bellyRef.current.intensity = 0;
      }
    }
  });

  return (
    <>
      <pointLight ref={plasmaRef} position={[0, -1.25, 0]} color="#ff8c3a" intensity={0} distance={22} decay={1.6} />
      <pointLight ref={blastRef} position={[0, -1.0, 0]} color="#ff9d3b" intensity={0} distance={34} decay={1.5} />
      <pointLight ref={bellyRef} position={[0, -1.05, 0]} color="#ffb854" intensity={0} distance={18} decay={1.6} />
    </>
  );
}

/**
 * Glowing white-gold combustion chamber cores tucked deep inside the 4 canted Inconel retro bells.
 */
function RetroThroatGlowCores3D({ visible }: { visible: boolean }) {
  const matRef = useRef<MeshStandardMaterial>(null);
  const throatMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#fff8dc',
        emissive: '#ffcf5c',
        emissiveIntensity: 4.2,
        roughness: 0.2,
        toneMapped: false
      }),
    []
  );

  useEffect(() => {
    matRef.current = throatMat;
    return () => {
      throatMat.dispose();
    };
  }, [throatMat]);

  useFrame(({ clock }) => {
    if (!visible || !matRef.current) return;
    const flicker = 0.88 + Math.sin(clock.getElapsedTime() * 68) * 0.12;
    matRef.current.emissiveIntensity = 4.5 * flicker;
  });

  if (!visible) return null;

  return (
    <group>
      {APOLLO_RETRO_NOZZLES.map((nozzle, i) => (
        <mesh
          key={`throat-${i}`}
          position={[nozzle.exit[0] * 0.96, -0.86, nozzle.exit[2] * 0.96]}
          material={throatMat}
        >
          <sphereGeometry args={[0.105, 14, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * True 3D Volumetric Raymarched Landing Fire System:
 * - Four canted supersonic solid-rocket jets with Mach shock diamonds
 * - Exact concrete pad impingement stagnation cushions + 4-lobe radial wall-jet vortices
 * - Dynamic thermal glow & carbon scorch marks on the concrete pad
 * - 120 ballistic molten slag & spark embers bouncing across the concrete apron
 * - 72 swirling fire-lit exhaust smoke & pad dust billows with seamless ground fade
 * - Also drives hard-impact crash fireball & burning soot plume if touchdown fails
 */
function TouchdownFireSystem3D({
  state,
  capsuleGroupRef,
  quality
}: {
  state: LandingState;
  capsuleGroupRef: RefObject<Group | null>;
  quality: 'low' | 'high';
}) {
  const retroActive =
    state.retroFired &&
    (state.retroBurnLeftS > 0 ||
      (state.altitudeM === 0 && state.time > 0 && state.status !== 'failed'));
  const crashActive =
    state.status === 'failed' && state.failReason === 'hard_impact' && state.altitudeM <= 0.1;
  const active = retroActive || crashActive;

  const volumeMeshRef = useRef<Mesh>(null);
  const scorchMeshRef = useRef<Mesh>(null);
  const sparksRef = useRef<InstancedMesh>(null);
  const smokeRef = useRef<InstancedMesh>(null);

  const animTimeRef = useRef(0);
  const ignitionAgeRef = useRef(0);
  const postTouchdownAgeRef = useRef(0);
  const crashAgeRef = useRef(0);
  const scorchAccumRef = useRef(0);
  const wasActiveRef = useRef(false);
  const wasRetroRef = useRef(false);
  const wasCrashRef = useRef(false);

  const volumeMat = useMemo(() => createLandingFireVolumeMaterial(), []);
  const scorchMat = useMemo(() => createPadScorchMaterial(), []);
  const smokeMat = useMemo(() => createLandingSmokeMaterial(), []);

  const dummy = useMemo(() => new Object3D(), []);
  const tempMat4 = useMemo(() => new Matrix4(), []);
  const tempQuat = useMemo(() => new Quaternion(), []);
  const tempVec = useMemo(() => new Vector3(), []);
  const tempColor = useMemo(() => new Color(), []);

  useEffect(() => {
    return () => {
      volumeMat.dispose();
      scorchMat.dispose();
      smokeMat.dispose();
    };
  }, [volumeMat, scorchMat, smokeMat]);

  const sparkCount = 120;
  const sparkSeeds = useMemo(
    () =>
      Array.from({ length: sparkCount }, (_, i) => {
        const nozzleIdx = i % 4;
        const baseNozzle = APOLLO_RETRO_NOZZLES[nozzleIdx];
        const baseAz = Math.atan2(baseNozzle.dir[2], baseNozzle.dir[0]);
        const jitter = (((i * 73) % 100) / 100 - 0.5) * 1.65;
        const az = baseAz + jitter;
        return {
          nozzleIdx,
          az,
          phase: ((i * 37) % 97) / 97,
          lifetime: 0.55 + ((i * 19) % 100) / 145,
          vRad: 3.2 + ((i * 29) % 100) / 11.8,
          vUp: 1.1 + ((i * 43) % 100) / 24,
          thick: 0.0045 + (i % 5) * 0.0014,
          lenMul: 0.048 + (i % 4) * 0.015
        };
      }),
    []
  );

  const smokeCount = 48;
  const smokeGeo = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const params = new Float32Array(smokeCount * 4);
    g.setAttribute('aSmokeParam', new InstancedBufferAttribute(params, 4));
    return g;
  }, []);

  useEffect(() => {
    return () => {
      smokeGeo.dispose();
    };
  }, [smokeGeo]);

  const smokeSeeds = useMemo(
    () =>
      Array.from({ length: smokeCount }, (_, i) => ({
        ang: ((i * 137.508) % 360) * (Math.PI / 180),
        phase: (i * 0.6180339) % 1,
        speed: 0.28 + ((i * 23) % 100) / 420,
        rStart: 0.7 + ((i * 17) % 100) / 90,
        rSpan: 5.5 + ((i * 31) % 100) / 22,
        liftMax: 1.6 + ((i * 41) % 100) / 36,
        baseSize: 1.35 + ((i * 13) % 100) / 70,
        spin: (i % 2 === 0 ? 1 : -1) * (0.25 + (i % 5) * 0.12),
        seed: ((i * 53) % 100) / 100
      })),
    []
  );

  // Initialize spark instanceColor buffer cleanly on mount
  useEffect(() => {
    if (sparksRef.current) {
      for (let i = 0; i < sparkCount; i++) {
        sparksRef.current.setColorAt(i, tempColor.set('#ffd27d'));
      }
      if (sparksRef.current.instanceColor) {
        sparksRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [sparkCount, tempColor]);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(0.05, delta);

    // Reset accumulated transient counters on mission restart
    if (!state.retroFired && state.status !== 'failed') {
      scorchAccumRef.current = 0;
      ignitionAgeRef.current = 0;
      postTouchdownAgeRef.current = 0;
      crashAgeRef.current = 0;
    }

    if (retroActive && !wasRetroRef.current) {
      ignitionAgeRef.current = 0;
      postTouchdownAgeRef.current = 0;
    }
    wasRetroRef.current = retroActive;

    if (crashActive && !wasCrashRef.current) {
      crashAgeRef.current = 0;
      scorchAccumRef.current = Math.max(scorchAccumRef.current, 0.75);
    }
    wasCrashRef.current = crashActive;

    const padTopY = padSurfaceWorldY(state.altitudeM, state.lateralOffsetM);
    const keepScorchVisible =
      (state.retroFired || crashActive) && state.altitudeM <= 12;

    if (!active) {
      if (wasActiveRef.current) {
        if (volumeMeshRef.current) volumeMeshRef.current.visible = false;
        if (sparksRef.current) sparksRef.current.visible = false;
        if (smokeRef.current) smokeRef.current.visible = false;
        wasActiveRef.current = false;
      }
      if (scorchMeshRef.current) {
        scorchMeshRef.current.visible = keepScorchVisible && scorchAccumRef.current > 0.02;
        if (scorchMeshRef.current.visible) {
          scorchMeshRef.current.position.set(0, padTopY + 0.006, 0);
          scorchMat.uniforms.uTime.value += dt;
          scorchMat.uniforms.uBurnIntensity.value = 0;
          scorchMat.uniforms.uScorchAmount.value = scorchAccumRef.current;
        }
      }
      return;
    }

    wasActiveRef.current = true;
    animTimeRef.current += dt;
    const isPostTouchdownTail =
      retroActive && state.altitudeM === 0 && state.retroBurnLeftS === 0;
    if (retroActive) {
      ignitionAgeRef.current += dt;
      if (isPostTouchdownTail) {
        postTouchdownAgeRef.current += dt;
      } else {
        postTouchdownAgeRef.current = 0;
      }
    }
    if (crashActive) crashAgeRef.current += dt;

    // Update capsule world matrix & compute exact nozzle-to-pad impingement spots
    const capGroup = capsuleGroupRef.current;
    if (capGroup) {
      capGroup.updateMatrixWorld(true);
      tempMat4.copy(capGroup.matrixWorld);
    } else {
      tempMat4.identity();
    }
    volumeMat.uniforms.uCapsuleInvMat.value.copy(tempMat4).invert();

    let centerX = 0;
    let centerZ = 0;
    let avgImpinge = 0;
    const impacts = APOLLO_RETRO_NOZZLES.map((spec, idx) => {
      const imp = computeRetroNozzleImpact(spec, tempMat4, padTopY);
      (volumeMat.uniforms.uNozzlePos.value as Vector3[])[idx].copy(imp.worldOrigin);
      (volumeMat.uniforms.uNozzleDir.value as Vector3[])[idx].copy(imp.worldDir);
      (volumeMat.uniforms.uImpactPos.value as Vector4[])[idx].set(
        imp.impactPos.x,
        imp.impactPos.y,
        imp.impactPos.z,
        crashActive ? 1.0 : imp.impingeStrength
      );
      (scorchMat.uniforms.uImpactPos.value as Vector4[])[idx].set(
        imp.impactPos.x,
        imp.impactPos.y,
        imp.impactPos.z,
        crashActive ? 1.0 : imp.impingeStrength
      );
      centerX += imp.impactPos.x * 0.25;
      centerZ += imp.impactPos.z * 0.25;
      avgImpinge += (crashActive ? 1.0 : imp.impingeStrength) * 0.25;
      return imp;
    });

    if (crashActive) {
      centerX = 0;
      centerZ = 0;
      avgImpinge = 1.0;
    }

    const touchdownTail = isPostTouchdownTail
      ? Math.exp(-postTouchdownAgeRef.current * 2.1)
      : 1.0;
    const smokeTail = isPostTouchdownTail
      ? Math.exp(-postTouchdownAgeRef.current * 0.65)
      : 1.0;
    const burnRamp = crashActive
      ? 1.05 * Math.exp(-Math.max(0, crashAgeRef.current - 3.0) * 0.25)
      : Math.min(1.0, ignitionAgeRef.current / 0.07) * 1.02 * touchdownTail;
    const ignitionFlash = crashActive
      ? 0
      : Math.exp(-ignitionAgeRef.current * 4.5) * touchdownTail;

    if (avgImpinge > 0.05) {
      scorchAccumRef.current = Math.min(1, scorchAccumRef.current + dt * (crashActive ? 1.4 : 0.9 * avgImpinge));
    }

    // 1. Update 3D Raymarched Volumetric Fire Box
    const boxHalfXZ = 4.6;
    const boxMaxY = Math.max(padTopY + (crashActive ? 3.8 : 2.6), 1.25);
    const boxHeight = Math.max(0.5, boxMaxY - padTopY);
    if (volumeMeshRef.current) {
      volumeMeshRef.current.visible = burnRamp > 0.03;
      if (volumeMeshRef.current.visible) {
        volumeMeshRef.current.position.set(centerX, padTopY + boxHeight * 0.5, centerZ);
        volumeMeshRef.current.scale.set(boxHalfXZ * 2, boxHeight, boxHalfXZ * 2);

        volumeMat.uniforms.uTime.value = animTimeRef.current;
        volumeMat.uniforms.uIntensity.value = burnRamp;
        volumeMat.uniforms.uIgnitionFlash.value = ignitionFlash;
        volumeMat.uniforms.uPadTopY.value = padTopY;
        (volumeMat.uniforms.uBoxMin.value as Vector3).set(
          centerX - boxHalfXZ,
          padTopY,
          centerZ - boxHalfXZ
        );
        (volumeMat.uniforms.uBoxMax.value as Vector3).set(
          centerX + boxHalfXZ,
          boxMaxY,
          centerZ + boxHalfXZ
        );
        volumeMat.uniforms.uCenterXZ.value.set(centerX, centerZ);
        volumeMat.uniforms.uSteps.value = quality === 'low' ? 12 : 18;
        volumeMat.uniforms.uCrashMode.value = crashActive ? 1.0 : 0.0;
        volumeMat.uniforms.uCrashElapsed.value = crashAgeRef.current;

        // Seamlessly switch to BackSide + depthTest=false if camera zooms inside the flame box
        const camInside =
          camera.position.x >= centerX - boxHalfXZ - 0.15 &&
          camera.position.x <= centerX + boxHalfXZ + 0.15 &&
          camera.position.z >= centerZ - boxHalfXZ - 0.15 &&
          camera.position.z <= centerZ + boxHalfXZ + 0.15 &&
          camera.position.y >= padTopY - 0.15 &&
          camera.position.y <= boxMaxY + 0.15;

        const targetSide = camInside ? BackSide : FrontSide;
        const targetDepth = !camInside;
        if (volumeMat.side !== targetSide || volumeMat.depthTest !== targetDepth) {
          volumeMat.side = targetSide;
          volumeMat.depthTest = targetDepth;
        }
      }
    }

    // 2. Update Concrete Pad Thermal Glow & Scorch Decal
    if (scorchMeshRef.current) {
      scorchMeshRef.current.visible = avgImpinge > 0.04 || scorchAccumRef.current > 0.02;
      if (scorchMeshRef.current.visible) {
        scorchMeshRef.current.position.set(centerX, padTopY + 0.006, centerZ);
        scorchMat.uniforms.uTime.value = animTimeRef.current;
        scorchMat.uniforms.uBurnIntensity.value = avgImpinge * burnRamp;
        scorchMat.uniforms.uScorchAmount.value = scorchAccumRef.current;
        scorchMat.uniforms.uCenterXZ.value.set(centerX, centerZ);
      }
    }

    // 3. Update 120 Ballistic Pad-Ricochet Sparks & Slag Embers
    if (sparksRef.current) {
      if (avgImpinge <= 0.05 || burnRamp <= 0.04) {
        sparksRef.current.visible = false;
      } else {
        sparksRef.current.visible = true;
        const g = 9.8;
        const drag = 0.72;
        const tNow = animTimeRef.current;

        for (let i = 0; i < sparkCount; i++) {
          const sp = sparkSeeds[i];
          const prog = (tNow / sp.lifetime + sp.phase) % 1;
          const age = prog * sp.lifetime;
          const imp = impacts[sp.nozzleIdx];
          const originX = crashActive ? (i % 4 - 1.5) * 0.35 : imp.impactPos.x;
          const originZ = crashActive ? ((i >> 2) % 4 - 1.5) * 0.35 : imp.impactPos.z;

          const speedScale = (crashActive ? 1.25 : 1.0) * avgImpinge;
          const vRad0 = sp.vRad * speedScale;
          const vy0 = sp.vUp * (crashActive ? 1.65 : 1.0) * avgImpinge;
          const vx0 = Math.cos(sp.az) * vRad0;
          const vz0 = Math.sin(sp.az) * vRad0;

          // Exponential drag horizontal motion
          const dragFactor = (1 - Math.exp(-drag * age)) / drag;
          const dragDecay = Math.exp(-drag * age);
          const px = originX + vx0 * dragFactor;
          const pz = originZ + vz0 * dragFactor;
          let vx = vx0 * dragDecay;
          let vz = vz0 * dragDecay;

          // Vertical ballistic trajectory with concrete pad bounce (restitution = 0.36)
          const tFlight1 = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * 0.04)) / g;
          let py: number;
          let vy: number;
          if (age <= tFlight1) {
            py = 0.05 + vy0 * age - 0.5 * g * age * age;
            vy = vy0 - g * age;
          } else {
            const dtBounce = age - tFlight1;
            const vyImpact = Math.abs(vy0 - g * tFlight1);
            const vyBounce = vyImpact * 0.38;
            const pyBounce = vyBounce * dtBounce - 0.5 * g * dtBounce * dtBounce;
            if (pyBounce > 0.015) {
              py = 0.015 + pyBounce;
              vy = vyBounce - g * dtBounce;
            } else {
              py = 0.015;
              vy = 0;
            }
          }

          tempVec.set(vx, vy, vz);
          const speed = tempVec.length();
          if (speed > 0.05) {
            tempVec.divideScalar(speed);
          } else {
            tempVec.set(Math.cos(sp.az), 0.1, Math.sin(sp.az)).normalize();
          }
          tempQuat.setFromUnitVectors(UP_AXIS, tempVec);

          const fade = Math.max(0, 1 - Math.pow(prog, 1.5)) * avgImpinge;
          const thick = sp.thick * (0.4 + 0.6 * fade);
          const len = Math.max(0.05, speed * sp.lenMul) * (0.35 + 0.65 * fade);

          dummy.position.set(px, padTopY + py, pz);
          dummy.quaternion.copy(tempQuat);
          dummy.scale.set(thick, len, thick);
          dummy.updateMatrix();
          sparksRef.current.setMatrixAt(i, dummy.matrix);

          // Blackbody cooling: blinding molten gold -> fiery orange -> dark cherry ember
          if (prog < 0.22) {
            tempColor.setRGB(1.0, 0.72 - prog * 0.85, 0.24 - prog * 0.72);
          } else if (prog < 0.62) {
            const k = (prog - 0.22) / 0.4;
            tempColor.setRGB(1.0, 0.48 - k * 0.30, 0.08 - k * 0.06);
          } else {
            const k = (prog - 0.62) / 0.38;
            tempColor.setRGB(0.92 - k * 0.45, 0.16 - k * 0.13, 0.015);
          }
          sparksRef.current.setColorAt(i, tempColor);
        }
        sparksRef.current.instanceMatrix.needsUpdate = true;
        if (sparksRef.current.instanceColor) {
          sparksRef.current.instanceColor.needsUpdate = true;
        }
      }
    }

    // 4. Update Swirling Fire-Lit Exhaust Smoke & Pad Dust Billows
    if (smokeRef.current) {
      if (avgImpinge <= 0.04 || smokeTail <= 0.03) {
        smokeRef.current.visible = false;
      } else {
        smokeRef.current.visible = true;
        smokeMat.uniforms.uTime.value = animTimeRef.current;
        smokeMat.uniforms.uPadTopY.value = padTopY;
        smokeMat.uniforms.uOpacity.value = (crashActive ? 0.76 : 0.56) * avgImpinge * smokeTail;

        const paramAttr = smokeGeo.getAttribute('aSmokeParam') as InstancedBufferAttribute;
        const arr = paramAttr.array as Float32Array;
        const tNow = animTimeRef.current;

        for (let i = 0; i < smokeCount; i++) {
          const sm = smokeSeeds[i];
          const cycle = (tNow * sm.speed + sm.phase) % 1;
          const r = (crashActive ? 0.45 : sm.rStart) + Math.pow(cycle, 0.68) * sm.rSpan * (crashActive ? 0.75 : 1.0);
          const lift =
            0.28 +
            Math.pow(cycle, crashActive ? 1.15 : 1.65) *
              sm.liftMax *
              (crashActive ? 2.1 : 1.0);
          const size = sm.baseSize * (0.55 + cycle * 1.95) * avgImpinge;

          dummy.position.set(
            centerX + Math.cos(sm.ang) * r,
            padTopY + lift,
            centerZ + Math.sin(sm.ang) * r
          );
          dummy.quaternion.copy(camera.quaternion);
          dummy.rotateZ(tNow * sm.spin + i);
          dummy.scale.set(size * 1.25, size, 1);
          dummy.updateMatrix();
          smokeRef.current.setMatrixAt(i, dummy.matrix);

          const fireGlow = Math.exp(-r * 0.45) * Math.exp(-lift * 0.72) * (1 - cycle * 0.55) * burnRamp;
          arr[i * 4 + 0] = cycle;
          arr[i * 4 + 1] = fireGlow;
          arr[i * 4 + 2] = sm.seed;
          arr[i * 4 + 3] = crashActive ? 0.85 : 0.36;
        }
        smokeRef.current.instanceMatrix.needsUpdate = true;
        paramAttr.needsUpdate = true;
      }
    }
  });

  const keepScorchMounted = (state.retroFired || crashActive) && state.altitudeM <= 12;
  if (!active && !keepScorchMounted) return null;

  return (
    <group>
      {/* Dynamic Concrete Thermal Incandescence & Radial Carbon Scorch Decal */}
      <mesh
        ref={scorchMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        material={scorchMat}
        renderOrder={2}
      >
        <planeGeometry args={[13.2, 13.2]} />
      </mesh>

      {/* 3D Raymarched Volumetric Supersonic Retro Jets, Wall-Jet Flames & Soot */}
      <mesh ref={volumeMeshRef} material={volumeMat} renderOrder={4} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>

      {/* Swirling Fire-Lit Exhaust Smoke & Pad Dust Billows */}
      <instancedMesh
        ref={smokeRef}
        args={[smokeGeo, smokeMat, smokeCount]}
        renderOrder={3}
        frustumCulled={false}
      />

      {/* Ballistic Incandescent Pad-Ricochet Sparks & Slag Embers */}
      <instancedMesh
        ref={sparksRef}
        args={[undefined, undefined, sparkCount]}
        renderOrder={5}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.16, 1.0, 1.0, 5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

/**
 * Volumetric animated cold-gas/hypergolic RCS reaction thruster jet
 */
function RcsThrusterJet3D({ active, side }: { active: boolean; side: -1 | 1 }) {
  const geo = useMemo(() => createSupersonicPlumeGeometry(0.025, 0.14, 0.58, 16, 10), []);
  const mat = useMemo(
    () =>
      createVolumetricPlumeMaterial({
        coreColor: '#ffffff',
        midColor: '#bae6fd',
        outerColor: '#38bdf8',
        speed: 19.0,
        dispAmp: 0.035,
        machStrength: 0.5,
        opacity: 0.8
      }),
    []
  );

  useFrame((_, delta) => {
    if (active) {
      mat.uniforms.uTime.value += delta;
      mat.uniforms.uThrottle.value = 1;
    }
  });

  if (!active) return null;

  return (
    <mesh
      position={[side * 1.32, -0.38, 0]}
      rotation={[0, 0, side * (Math.PI / 2)]}
      geometry={geo}
      material={mat}
    />
  );
}

/**
 * Sculpted Apollo Command Module GLB (CM_Hull + CM_ChuteBay + CM_ApexCap + CM_HeatShield)
 * + GLSL Reentry Plasma + Multi-Gore Ring-Sail Canopies + 1.5 m Solid Retro-Rocket Fires
 */
function ApolloCommandModuleMesh({
  state,
  command,
  running,
  groupRef
}: {
  state: LandingState;
  command?: LandingCommand;
  running: boolean;
  groupRef: RefObject<Group | null>;
}) {
  const { nodes } = useGLTF(APOLLO_CM_MODEL_URL);
  const quality = useSession((s) => s.quality);

  const cmParts = useMemo(() => {
    const hull = nodes.CM_Hull.clone(true);
    const chuteBay = nodes.CM_ChuteBay.clone(true);
    const apexCap = nodes.CM_ApexCap.clone(true);
    const heatShield = nodes.CM_HeatShield.clone(true);

    prepareAerospacePart(hull, true, quality);
    prepareAerospacePart(chuteBay, true, quality);
    prepareAerospacePart(apexCap, true, quality);
    prepareAerospacePart(heatShield, true, quality);

    const shieldMats: MeshStandardMaterial[] = [];
    heatShield.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as MeshStandardMaterial;
          if (std && 'emissive' in std) {
            std.emissive = new Color('#ff4800');
            std.emissiveIntensity = 0;
            shieldMats.push(std);
          }
        }
      }
    });

    return { hull, chuteBay, apexCap, heatShield, shieldMats };
  }, [nodes, quality]);

  const plasmaIntensity = Math.min(1, Math.max(0, (state.heatshieldTempC - 420) / 1380));

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const t = clock.getElapsedTime();
      const tiltRad = (state.attitudeDeviationDeg * Math.PI) / 180;
      const sway =
        state.chuteState !== 'stowed' && state.altitudeM > 0.2
          ? Math.sin(t * 1.65) * 0.042
          : 0;
      const blackoutShake =
        state.inBlackout && state.status === 'flying' ? Math.sin(t * 29) * 0.008 : 0;
      const retroActiveShake =
        state.retroFired && state.retroBurnLeftS > 0 && state.status === 'flying';
      const retroPitchShake = retroActiveShake
        ? Math.sin(t * 67) * 0.011 + Math.cos(t * 103) * 0.006
        : 0;
      const retroRollShake = retroActiveShake ? Math.cos(t * 79) * 0.01 : 0;
      groupRef.current.rotation.set(
        blackoutShake + retroPitchShake,
        0,
        tiltRad + sway + retroRollShake
      );
    }

    for (const mat of cmParts.shieldMats) {
      mat.emissiveIntensity = plasmaIntensity * 2.9;
    }
  });

  // RCS thruster jets active when rolling/trimming
  const attCmd = command?.attitudeInput ?? 0;
  const liftCmd = command?.liftTrimInput ?? 0;

  // Heat shield drop animation (origin in GLB is [0, -0.78, 0])
  const shieldElapsed = state.heatshieldJettisoned ? state.heatshieldSepElapsedS : 0;
  const shieldY = state.heatshieldJettisoned
    ? -0.82 - shieldElapsed * 4.4 - 1.8 * shieldElapsed * shieldElapsed
    : -0.78;
  const shieldDriftX = state.heatshieldJettisoned ? shieldElapsed * 0.45 : 0;
  const shieldTilt = state.heatshieldJettisoned ? shieldElapsed * 0.92 : 0;
  const padTopY = padSurfaceWorldY(state.altitudeM, state.lateralOffsetM);
  const shieldVisible =
    !state.heatshieldJettisoned || (shieldY > -28 && shieldY > padTopY - 0.18);

  // Apex forward cover pops off when drogues fire
  const apexDetached = state.chuteState !== 'stowed';

  const retroPlumeVisible =
    state.retroFired &&
    (state.retroBurnLeftS > 0 ||
      (state.altitudeM === 0 &&
        state.time > 0 &&
        state.retroBurnLeftS === 0 &&
        state.status !== 'failed'));

  // Scalloped multi-gore parachute canopies
  const mainChuteTex = useMemo(() => createMainChuteTexture(), []);
  const drogueChuteTex = useMemo(() => createDrogueChuteTexture(), []);
  const mainCanopyGeo = useMemo(() => {
    if (!cachedMainCanopyGeo) {
      cachedMainCanopyGeo = createScallopedCanopyGeometry(2.12, 24, 15, true);
    }
    return cachedMainCanopyGeo;
  }, []);
  const drogueCanopyGeo = useMemo(() => {
    if (!cachedDrogueCanopyGeo) {
      cachedDrogueCanopyGeo = createScallopedCanopyGeometry(1.06, 16, 10, false);
    }
    return cachedDrogueCanopyGeo;
  }, []);

  const chuteScale = Math.max(0.14, state.chuteProgress);
  const isMain = state.chuteState === 'main';
  const mainCanopies = useMemo(() => [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3], []);
  const drogueCanopies = useMemo(() => [-0.45, 0.45], []);
  const suspensionAngles = useMemo(
    () => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2),
    []
  );

  return (
    <group ref={groupRef}>
      {/* Sculpted NASA Apollo Block II Command Module Hull + Windows + Hatch + Exposed Aft Retros */}
      <primitive object={cmParts.hull} />

      {/* Exposed Forward Parachute Bay & Mortar Tubes once Apex Cap jettisons */}
      {apexDetached && <primitive object={cmParts.chuteBay} />}

      {/* Apex Forward Protective Dome */}
      {!apexDetached && <primitive object={cmParts.apexCap} position={[0, 1.04, 0]} />}

      {/* Detachable Honeycomb Avcoat Ablative Heat Shield */}
      {shieldVisible && (
        <primitive
          object={cmParts.heatShield}
          position={[shieldDriftX, shieldY, 0]}
          rotation={[shieldTilt * 0.65, 0, shieldTilt]}
        />
      )}

      {/* Volumetric Animated RCS Attitude Thrusters */}
      <RcsThrusterJet3D side={-1} active={attCmd > 0.1 || Math.abs(liftCmd) > 0.15} />
      <RcsThrusterJet3D side={1} active={attCmd < -0.1 || Math.abs(liftCmd) > 0.15} />

      {/* 2000°C Hypersonic Bow Shock & Swirling Turbulent Reentry Plasma Fire */}
      <ReentryPlasmaFire3D intensity={plasmaIntensity} flying={running} />

      {/* Scalloped Multi-Gore NASA Ring-Sail Main Cluster / Dual Ribbon Drogues */}
      {state.chuteState !== 'stowed' && (
        <group>
          <Line
            points={[
              [0, 1.24, 0],
              [0, 2.32, 0]
            ]}
            color="#e2e8f0"
            lineWidth={2.2}
          />
          {isMain
            ? mainCanopies.map((azim, ci) => {
                const spreadDist = 2.65 * chuteScale;
                const canopyY = 7.15;
                const canopyR = 2.12 * chuteScale;
                const cx = Math.cos(azim) * spreadDist;
                const cz = Math.sin(azim) * spreadDist;
                return (
                  <group key={`main-chute-${ci}`}>
                    <Line
                      points={[
                        [0, 2.32, 0],
                        [cx * 0.5, 4.05, cz * 0.5]
                      ]}
                      color="#f1f5f9"
                      lineWidth={1.8}
                      transparent
                      opacity={0.88}
                    />
                    {suspensionAngles.map((ang) => {
                      const rimX = cx + Math.cos(ang) * canopyR * 0.96;
                      const rimZ = cz + Math.sin(ang) * canopyR * 0.96;
                      return (
                        <Line
                          key={ang}
                          points={[
                            [cx * 0.5, 4.05, cz * 0.5],
                            [rimX, canopyY - canopyR * 0.22, rimZ]
                          ]}
                          color="#cbd5e1"
                          lineWidth={1.0}
                          transparent
                          opacity={0.72}
                        />
                      );
                    })}
                    <mesh
                      geometry={mainCanopyGeo}
                      position={[cx, canopyY - canopyR * 0.2, cz]}
                      rotation={[Math.sin(azim) * 0.22, 0, -Math.cos(azim) * 0.22]}
                      scale={[chuteScale, chuteScale, chuteScale]}
                      castShadow
                    >
                      <meshStandardMaterial
                        map={mainChuteTex}
                        side={DoubleSide}
                        roughness={0.62}
                        metalness={0.04}
                      />
                    </mesh>
                  </group>
                );
              })
            : drogueCanopies.map((dx, di) => {
                const cx = dx * (1.3 * chuteScale);
                const canopyY = 4.95;
                const canopyR = 1.06 * chuteScale;
                return (
                  <group key={`drogue-${di}`}>
                    {suspensionAngles.map((ang) => (
                      <Line
                        key={ang}
                        points={[
                          [0, 2.32, 0],
                          [
                            cx + Math.cos(ang) * canopyR * 0.94,
                            canopyY - canopyR * 0.16,
                            Math.sin(ang) * canopyR * 0.94
                          ]
                        ]}
                        color="#e2e8f0"
                        lineWidth={1.1}
                        transparent
                        opacity={0.76}
                      />
                    ))}
                    <mesh
                      geometry={drogueCanopyGeo}
                      position={[cx, canopyY - canopyR * 0.15, 0]}
                      rotation={[0, 0, -dx * 0.34]}
                      scale={[chuteScale, chuteScale, chuteScale]}
                    >
                      <meshStandardMaterial
                        map={drogueChuteTex}
                        side={DoubleSide}
                        roughness={0.58}
                        metalness={0.05}
                      />
                    </mesh>
                  </group>
                );
              })}
        </group>
      )}

      {/* Incandescent Inconel 23.8° canted retro-rocket throat cores */}
      <RetroThroatGlowCores3D visible={retroPlumeVisible} />
    </group>
  );
}

/**
 * Dynamic Rayleigh scattering sky dome responding smoothly from orbital twilight (66 km)
 * down to sea-level California/Pacific blue sky (0 m), with warm plasma backscatter during blackout.
 */
const skyDomeVertexShader = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyDomeFragmentShader = /* glsl */ `
  varying vec3 vWorldDir;
  uniform float uSpaceFactor;
  uniform float uPlasmaGlow;
  uniform vec3 uSunDir;

  void main() {
    float y = clamp(vWorldDir.y, -1.0, 1.0);
    float up = max(0.0, y);

    vec3 dayZenith = vec3(0.08, 0.34, 0.72);
    vec3 dayHorizon = vec3(0.58, 0.79, 0.96);
    vec3 dayGround = vec3(0.24, 0.32, 0.34);

    vec3 spaceZenith = vec3(0.004, 0.008, 0.02);
    vec3 spaceHorizon = vec3(0.03, 0.15, 0.40);
    vec3 spaceGround = vec3(0.002, 0.005, 0.012);

    vec3 zenith = mix(dayZenith, spaceZenith, uSpaceFactor);
    vec3 horizon = mix(dayHorizon, spaceHorizon, uSpaceFactor);
    vec3 ground = mix(dayGround, spaceGround, uSpaceFactor);

    vec3 col = mix(horizon, zenith, pow(up, 0.52));
    if (y < 0.0) {
      col = mix(horizon, ground, pow(min(1.0, -y * 2.5), 0.7));
    }

    float rimBand = exp(-abs(y) * 14.0) * (0.28 + 0.52 * uSpaceFactor);
    col += vec3(0.22, 0.56, 0.98) * rimBand;

    float sunDot = max(0.0, dot(normalize(vWorldDir), normalize(uSunDir)));
    col += vec3(1.0, 0.93, 0.80) * pow(sunDot, 160.0) * 1.1;
    col += vec3(1.0, 0.72, 0.45) * pow(sunDot, 10.0) * 0.15;

    if (uPlasmaGlow > 0.01) {
      float downGlow = exp(-max(0.0, y + 0.35) * 3.5);
      col += vec3(1.0, 0.34, 0.06) * downGlow * uPlasmaGlow * 0.44;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

function LandingSkyDome({ state }: { state: LandingState }) {
  const sunDir = useMemo(() => new Vector3(18, 28, 16).normalize(), []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyDomeVertexShader,
        fragmentShader: skyDomeFragmentShader,
        uniforms: {
          uSpaceFactor: { value: 0 },
          uPlasmaGlow: { value: 0 },
          uSunDir: { value: sunDir.clone() }
        },
        side: BackSide,
        depthWrite: false
      }),
    [sunDir]
  );

  const starGeo = useMemo(() => {
    const count = 320;
    const pts = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = ((i * 73) % 360) * (Math.PI / 180);
      const z = ((i * 19) % 100) / 100;
      const r = Math.sqrt(Math.max(0.01, 1 - z * z));
      const rad = 285;
      pts[i * 3] = Math.cos(u) * r * rad;
      pts[i * 3 + 1] = z * rad;
      pts[i * 3 + 2] = Math.sin(u) * r * rad;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pts, 3));
    return g;
  }, []);

  useEffect(() => {
    return () => {
      mat.dispose();
      starGeo.dispose();
    };
  }, [mat, starGeo]);

  const spaceFactor = Math.min(1, Math.max(0, (state.altitudeM - 3000) / 42000));
  const plasmaGlow = Math.min(1, Math.max(0, (state.heatshieldTempC - 550) / 1200));

  useEffect(() => {
    mat.uniforms.uSpaceFactor.value = spaceFactor;
    mat.uniforms.uPlasmaGlow.value = plasmaGlow;
  }, [mat, spaceFactor, plasmaGlow]);

  return (
    <group>
      <mesh material={mat}>
        <sphereGeometry args={[320, 32, 24]} />
      </mesh>
      {spaceFactor > 0.15 && (
        <points geometry={starGeo}>
          <pointsMaterial color="#e2e8f0" size={1.1} transparent opacity={spaceFactor * 0.85} />
        </points>
      )}
    </group>
  );
}

/**
 * Curved orbital NASA Earth horizon visible at reentry altitudes (> 2.5 km),
 * reusing existing NASA 4K Earth day + cloud textures.
 */
function CurvedLandingEarth({ altitudeM }: { altitudeM: number }) {
  const quality = useSession((s) => s.quality);
  const [dayMap, cloudMap] = useTexture([
    '/textures/earth_day_4096.jpg',
    '/textures/earth_clouds_4096.jpg'
  ]);
  useEffect(() => {
    dayMap.colorSpace = SRGBColorSpace;
    cloudMap.colorSpace = SRGBColorSpace;
    configureMipmappedTexture(dayMap, quality);
    configureMipmappedTexture(cloudMap, quality);
  }, [dayMap, cloudMap, quality]);

  const { depth, k } = landingGroundView(altitudeM);
  const planetScale = k * (EARTH_MAX_RENDER_RADIUS / EARTH_RADIUS_UNITS);
  const rScaled = EARTH_RADIUS_UNITS * planetScale;
  const centerY = -depth - rScaled;
  const rotZ = useMemo(() => (Math.PI * 0.14), []);
  const wSegs = quality === 'low' ? 72 : 128;
  const hSegs = quality === 'low' ? 54 : 96;

  if (altitudeM < 750) return null;

  return (
    <group position={[0, centerY, 0]} rotation={[0.18, -0.5, rotZ]}>
      <mesh>
        <sphereGeometry args={[rScaled, wSegs, hSegs]} />
        <meshStandardMaterial map={dayMap} roughness={0.86} metalness={0.05} />
      </mesh>
      <mesh>
        <sphereGeometry args={[rScaled * 1.0035, wSegs, hSegs]} />
        <meshStandardMaterial
          map={cloudMap}
          alphaMap={cloudMap}
          transparent
          opacity={0.78}
          depthWrite={false}
          roughness={0.95}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[rScaled * 1.012, wSegs, hSegs]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.22}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Troposphere Cloud Deck passing up around the descending capsule between 750 m and 12 km.
 */
function TroposphereLandingClouds({ altitudeM }: { altitudeM: number }) {
  const cloudTex = useMemo(() => createSoftCloudTexture(), []);
  const puffs = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = (i / 34) * Math.PI * 2 + (i % 5) * 0.25;
        const rad = 10 + (i % 7) * 9.5;
        const altLayer = 1100 + (i % 6) * 1450;
        const sc = 9 + (i % 5) * 4.5;
        return {
          x: Math.cos(a) * rad,
          z: Math.sin(a) * rad - 18,
          altLayer,
          sx: sc * 1.65,
          sy: sc * 0.72
        };
      }),
    []
  );

  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    if (altitudeM < 450 || altitudeM > 18000) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      const y = cloudWorldY(altitudeM, p.altLayer);
      dummy.position.set(p.x, y, p.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.set(p.sx, p.sy, 1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (altitudeM < 450 || altitudeM > 18000) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, puffs.length]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={cloudTex}
        color="#e0f2fe"
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/**
 * Rapid atmospheric airspeed rush streaks for clear descent speed perception
 */
function DescentStreaks({ state, live }: { state: LandingState; live: boolean }) {
  const linesRef = useRef<LineSegments>(null);
  const offsetRef = useRef(0);
  const geometry = useMemo(() => {
    const count = 44;
    const pts = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.5;
      const rad = 2.8 + (i % 5) * 1.5;
      const x = Math.cos(angle) * rad;
      const z = Math.sin(angle) * rad;
      const y = ((i * 1.7) % 16) - 8;
      pts[i * 6] = x;
      pts[i * 6 + 1] = y;
      pts[i * 6 + 2] = z;
      pts[i * 6 + 3] = x;
      pts[i * 6 + 4] = y - 1.3;
      pts[i * 6 + 5] = z;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pts, 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (!linesRef.current) return;
    if (live && state.descentRateMs > 1.5) {
      offsetRef.current = (offsetRef.current + delta * Math.min(28, state.descentRateMs * 0.25)) % 14;
    }
    linesRef.current.position.y = offsetRef.current - 7;
  });

  if (state.altitudeM <= 0.3 || state.descentRateMs <= 1.5) return null;

  return (
    <lineSegments ref={linesRef} geometry={geometry}>
      <lineBasicMaterial
        color={state.inBlackout ? '#ff9d5c' : '#cbd5e1'}
        transparent
        opacity={state.inBlackout ? 0.5 : 0.24}
      />
    </lineSegments>
  );
}

function LowAltitudeHaze({ altitudeM }: { altitudeM: number }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (altitudeM < 750) {
      scene.fog = new Fog('#9bc5e8', 55, 290);
    } else {
      scene.fog = null;
    }
    return () => {
      scene.fog = null;
    };
  }, [altitudeM, scene]);
  return null;
}

/**
 * NASA Coastal Recovery / Landing Complex with concrete octagonal pad apron,
 * tracking radar tower, corner floodlight masts, waiting NASA HH-3 helicopter silhouette,
 * and pulsing 1.8 m Retro Ignition Gate ring.
 */
function TouchdownZone3D({ state }: { state: LandingState }) {
  const tex = useMemo(() => createRecoveryZoneTexture(), []);
  const radarRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (radarRef.current) {
      radarRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.55) * 0.85;
    }
  });

  if (state.altitudeM > 750) return null;

  const groundY = -GROUND_BASE_DEPTH - state.altitudeM * PX_PER_M;
  const padOffsetX = -state.lateralOffsetM * 0.55;
  const inRetroWindow = state.altitudeM >= 1.0 && state.altitudeM <= 2.5;
  const showRetroGate =
    state.heatshieldJettisoned && !state.retroFired && state.altitudeM <= 35 && state.altitudeM > 0;

  return (
    <group position={[padOffsetX, groundY, 0]}>
      {/* Coastal recovery apron texture */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[180, 64]} />
        <meshStandardMaterial map={tex} roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Raised NASA concrete recovery pad apron slab & blast curb */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[12.8, 13.4, 0.1, 8]} />
        <meshStandardMaterial color="#64748b" roughness={0.86} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.095, 0]} receiveShadow>
        <cylinderGeometry args={[9.4, 9.6, 0.03, 40]} />
        <meshStandardMaterial color="#475569" roughness={0.88} metalness={0.1} />
      </mesh>

      {/* Concentric bullseye markings */}
      {[2.4, 5.8, 8.8].map((r, i) => (
        <mesh key={r} position={[0, 0.115 + i * 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.18, r, 48]} />
          <meshBasicMaterial
            color={i === 0 ? '#b8f566' : '#facc15'}
            transparent
            opacity={0.85}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            side={DoubleSide}
          />
        </mesh>
      ))}

      {/* Corner recovery floodlight & optical telemetry pylons */}
      {[
        [-13.5, -13.5],
        [13.5, -13.5],
        [-13.5, 13.5],
        [13.5, 13.5]
      ].map(([bx, bz], i) => (
        <group key={i} position={[bx, 0, bz]}>
          <mesh position={[0, 1.55, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.2, 3.1, 10]} />
            <meshStandardMaterial color="#334155" metalness={0.72} roughness={0.35} />
          </mesh>
          <mesh position={[0, 3.1, 0]}>
            <boxGeometry args={[0.62, 0.22, 0.34]} />
            <meshStandardMaterial color="#1e293b" metalness={0.78} roughness={0.3} />
          </mesh>
          <mesh position={[0, 3.25, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#fde047' : '#fb923c'} />
          </mesh>
        </group>
      ))}

      {/* S-band Telemetry Tracking Radar Tower on NW apron edge */}
      <group position={[-15.5, 0, -9.5]}>
        <mesh position={[0, 2.2, 0]} castShadow>
          <cylinderGeometry args={[0.25, 0.55, 4.4, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.38} />
        </mesh>
        <group ref={radarRef} position={[0, 4.55, 0]}>
          <mesh rotation={[0.65, 0, 0]}>
            <cylinderGeometry args={[1.35, 0.18, 0.42, 20]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.55} roughness={0.32} />
          </mesh>
        </group>
      </group>

      {/* Standby NASA Recovery Helicopter (HH-3 Sea King scale prop outside perimeter) */}
      <group position={[18.5, 0.72, -10.5]} rotation={[0, -0.85, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.4, 1.05, 3.9]} />
          <meshStandardMaterial color="#f8fafc" metalness={0.35} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.15, 2.5]}>
          <boxGeometry args={[0.42, 0.46, 2.4]} />
          <meshStandardMaterial color="#d97706" metalness={0.3} roughness={0.42} />
        </mesh>
        <mesh position={[0, 0.72, -0.2]}>
          <cylinderGeometry args={[3.4, 3.4, 0.03, 18]} />
          <meshBasicMaterial color="#94a3b8" transparent opacity={0.28} />
        </mesh>
      </group>

      {/* Hovering 1.8 m Laser Retro Ignition Gate Ring + Height Poles */}
      {showRetroGate && (
        <group>
          <mesh position={[0, PAD_SURFACE_OFFSET + 1.8 * PX_PER_M, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2.15, 2.55, 56]} />
            <meshBasicMaterial
              color={inRetroWindow ? '#b8f566' : '#38bdf8'}
              transparent
              opacity={inRetroWindow ? 0.96 : 0.65}
              side={DoubleSide}
            />
          </mesh>
          <mesh position={[0, PAD_SURFACE_OFFSET + 1.0 * PX_PER_M, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.85, 1.98, 48]} />
            <meshBasicMaterial
              color={inRetroWindow ? '#b8f566' : '#fbbf24'}
              transparent
              opacity={inRetroWindow ? 0.85 : 0.4}
              side={DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

class LandingSceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const LandingEnvironment = memo(function LandingEnvironment() {
  return (
    <Environment resolution={64} frames={1} environmentIntensity={0.88}>
      <Lightformer
        form="rect"
        intensity={2.6}
        color="#fff6e8"
        position={[16, 18, 18]}
        scale={[20, 20, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.3}
        color="#9fd3ff"
        position={[-18, 10, 14]}
        scale={[26, 16, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.2}
        color="#6ea8dc"
        position={[0, -14, 4]}
        scale={[30, 30, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </Environment>
  );
});

export function LandingScene3D({
  state,
  command,
  scenarioId,
  cameraPreset = 'chase',
  language,
  running = state.status === 'flying'
}: {
  state: LandingState;
  command?: LandingCommand;
  scenarioId: number;
  cameraPreset?: LandingCameraPreset;
  language: Language;
  running?: boolean;
}) {
  const quality = useSession((s) => s.quality);
  const shadowMapSize: [number, number] = quality === 'low' ? [512, 512] : [1024, 1024];
  const capsuleGroupRef = useRef<Group>(null);

  const initialCam = useMemo((): {
    position: [number, number, number];
    target: [number, number, number];
  } => {
    if (cameraPreset === 'chute') {
      return { position: [6.8, 3.8, 17.5], target: [0, 3.0, 0] };
    }
    if (cameraPreset === 'pad') {
      return { position: [5.5, 1.2, 13.0], target: [0, -0.5, 0] };
    }
    return { position: [3.8, 1.65, 9.6], target: [0, 0.25, 0] };
  }, [cameraPreset]);

  return (
    <LandingSceneBoundary
      fallback={
        <div className="scene-fallback">
          {translate(language, '3D unavailable. Please enable WebGL 2 or switch to a supported browser.')}
        </div>
      }
    >
      <Canvas
        shadows="percentage"
        dpr={quality === 'low' ? 1 : [1, 1.5]}
        gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
        camera={{ position: initialCam.position, fov: 44, near: 0.12, far: 4500 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#03050b']} />
        <LowAltitudeHaze altitudeM={state.altitudeM} />

        {/* Aerospace offline HDRI/Lightformer studio reflection rig for brushed metal & glass */}
        <LandingEnvironment />

        <ambientLight intensity={0.42} color="#dcebff" />
        <hemisphereLight args={['#a5d8ff', '#4b5548', 0.95]} />
        <directionalLight
          position={[18, 28, 16]}
          intensity={3.0}
          color="#fff7ed"
          castShadow
          shadow-mapSize={shadowMapSize}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={18}
          shadow-camera-bottom={-18}
          shadow-camera-near={1}
          shadow-camera-far={90}
          shadow-bias={-0.0005}
          shadow-normalBias={0.03}
          shadow-radius={3}
        />
        <directionalLight position={[-14, 6, -12]} intensity={0.65} color="#60a5fa" />

        <LandingSkyDome state={state} />

        <Suspense fallback={null}>
          <CurvedLandingEarth altitudeM={state.altitudeM} />
        </Suspense>

        <TroposphereLandingClouds altitudeM={state.altitudeM} />

        <LandingDynamicLightRig state={state} />

        <Suspense fallback={null}>
          <ApolloCommandModuleMesh
            state={state}
            command={command}
            running={running}
            groupRef={capsuleGroupRef}
          />
        </Suspense>

        <DescentStreaks state={state} live={running} />
        <TouchdownZone3D state={state} />
        <TouchdownFireSystem3D state={state} capsuleGroupRef={capsuleGroupRef} quality={quality} />

        {/* Unified 3D task camera mouse controls */}
        <TaskCameraControls
          resetKey={`lnd-${scenarioId}-${cameraPreset}`}
          initialPosition={initialCam.position}
          initialTarget={initialCam.target}
          minDistance={3.2}
          maxDistance={48}
        />
      </Canvas>
    </LandingSceneBoundary>
  );
}
