import { Suspense, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  PointLight,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from 'three';
import { HOME_MISSIONS } from '../../data/homeMissions';
import {
  ToonInkPass,
  createSparkleTexture,
  createToonGradient,
  toonifyObject,
  type ToonifyOptions
} from './homeToon';
import {
  buildPanoramaCapAsset,
  createFallbackCapAsset,
  type PanoramaCapAsset
} from './panoramaTexture';

export const PANORAMA_MAX_PITCH_DEG = 46;

export interface HomePanoramaProps {
  selectedTaskId: number;
  autoRotate?: boolean;
  onAngleChange?: (yawDeg: number, pitchDeg: number) => void;
  resetSignal?: number;
  quality?: 'high' | 'low';
}

// Cel-shading lighting mood per mission: key / rim / ambient / starfield opacity
interface ToonMood {
  ambient: string;
  ambientIntensity: number;
  key: string;
  keyIntensity: number;
  keyPosition: [number, number, number];
  rim: string;
  rimIntensity: number;
  starOpacity: number;
}

const TOON_MOODS: Record<number, ToonMood> = {
  // Dusk launch site: warm orange key + blue-purple skylight
  1: { ambient: '#8f86c9', ambientIntensity: 0.75, key: '#ffd3a3', keyIntensity: 2.4, keyPosition: [-30, 22, 30], rim: '#9db8ff', rimIntensity: 1.4, starOpacity: 0.45 },
  // LEO daylight: direct sun from upper left
  2: { ambient: '#7f9fd6', ambientIntensity: 0.7, key: '#fffaf0', keyIntensity: 2.7, keyPosition: [-40, 35, 20], rim: '#7fd8ff', rimIntensity: 1.3, starOpacity: 1 },
  // Orbital sunrise: low-angle warm sunlight + magenta skylight
  3: { ambient: '#8a78c8', ambientIntensity: 0.7, key: '#ffcf9a', keyIntensity: 2.6, keyPosition: [-45, 8, 15], rim: '#ff8fd0', rimIntensity: 1.2, starOpacity: 1 },
  // Pacific daylight: bright clear sky
  4: { ambient: '#9cc4ff', ambientIntensity: 0.95, key: '#ffffff', keyIntensity: 2.5, keyPosition: [-30, 40, 25], rim: '#e6f4ff', rimIntensity: 1.1, starOpacity: 0 }
};

const PANORAMA_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Wraps a widescreen illustration into a seamless 360° panorama:
// Front 180° displays the primary art, rear 180° mirrors with continuous seams;
// vertical borders softly diffuse into a yaw-invariant zenith/nadir dome to prevent polar streaks.
const PANORAMA_FRAGMENT = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform sampler2D softA;
uniform sampler2D softB;
uniform vec3 topPoleA;
uniform vec3 botPoleA;
uniform vec3 topPoleB;
uniform vec3 botPoleB;
uniform float aspectA;
uniform float aspectB;
uniform float mixT;
varying vec3 vDir;
#define PI 3.141592653589793

float mirrorX(float u) {
  float m = mod(u, 2.0);
  return m > 1.0 ? 2.0 - m : m;
}

vec3 samplePano(
  sampler2D map,
  sampler2D softMap,
  vec3 topPole,
  vec3 botPole,
  float aspect,
  float yaw,
  float pitch
) {
  float x = mirrorX(0.5 + yaw / PI);
  float vSpan = PI / aspect;
  float y = 0.5 + pitch / vSpan;

  float margin = 0.05;
  if (y >= margin && y <= 1.0 - margin) {
    return texture2D(map, vec2(clamp(x, 0.001, 0.999), y)).rgb;
  }

  bool isTop = y > 0.5;
  float distIn = isTop ? (1.0 - y) : y;
  vec3 pole = isTop ? topPole : botPole;

  float yClamped = clamp(y, 0.004, 0.996);
  vec3 sharp = distIn > -0.002
    ? texture2D(map, vec2(clamp(x, 0.001, 0.999), yClamped)).rgb
    : vec3(0.0);

  float u = clamp(-distIn / 0.18, 0.0, 1.0);
  float ySoft = isTop
    ? (distIn >= 0.0 ? clamp(y, 0.008, 0.992) : mix(0.992, 0.91, u))
    : (distIn >= 0.0 ? clamp(y, 0.008, 0.992) : mix(0.008, 0.09, u));

  float spread = u * 0.24;
  vec3 softCol = texture2D(softMap, vec2(clamp(x, 0.004, 0.996), ySoft)).rgb * 0.30;
  softCol += texture2D(softMap, vec2(clamp(mirrorX(x - spread), 0.004, 0.996), ySoft)).rgb * 0.20;
  softCol += texture2D(softMap, vec2(clamp(mirrorX(x + spread), 0.004, 0.996), ySoft)).rgb * 0.20;
  softCol += texture2D(softMap, vec2(clamp(mirrorX(x - spread * 2.0), 0.004, 0.996), ySoft)).rgb * 0.15;
  softCol += texture2D(softMap, vec2(clamp(mirrorX(x + spread * 2.0), 0.004, 0.996), ySoft)).rgb * 0.15;

  float wSoft = smoothstep(margin, 0.0, distIn);
  vec3 edgeCol = mix(sharp, softCol, wSoft);

  float wPole = smoothstep(0.01, -0.18, distIn);
  float poleDepth = smoothstep(-0.14, -0.40, distIn);
  vec3 domeCol = pole * mix(1.0, isTop ? 0.84 : 0.78, poleDepth);

  return mix(edgeCol, domeCol, wPole);
}

void main() {
  vec3 d = normalize(vDir);
  float yaw = atan(d.x, -d.z);
  float pitch = asin(clamp(d.y, -1.0, 1.0));
  vec3 a = samplePano(mapA, softA, topPoleA, botPoleA, aspectA, yaw, pitch);
  vec3 b = samplePano(mapB, softB, topPoleB, botPoleB, aspectB, yaw, pitch);
  gl_FragColor = vec4(mix(a, b, mixT), 1.0);
  #include <colorspace_fragment>
}
`;

function copyPanoramaTargetToBase(u: ShaderMaterial['uniforms']) {
  u.mapA.value = u.mapB.value;
  u.softA.value = u.softB.value;
  (u.topPoleA.value as Color).copy(u.topPoleB.value as Color);
  (u.botPoleA.value as Color).copy(u.botPoleB.value as Color);
  u.aspectA.value = u.aspectB.value;
}

// 360° panorama sphere: smooth cross-fade during texture transitions
function PanoramaSphere({ selectedTaskId }: { selectedTaskId: number }) {
  const assetsRef = useRef<Map<string, PanoramaCapAsset>>(new Map());
  const fadeRef = useRef({ active: false });
  const mountedRef = useRef(true);

  const currentMission = HOME_MISSIONS.find((m) => m.id === selectedTaskId) ?? HOME_MISSIONS[0];
  const imageUrl = currentMission.image;

  const { material, fallback } = useMemo(() => {
    const fb = createFallbackCapAsset();
    const mat = new ShaderMaterial({
      uniforms: {
        mapA: { value: fb.tex },
        mapB: { value: fb.tex },
        softA: { value: fb.softTex },
        softB: { value: fb.softTex },
        topPoleA: { value: fb.topPole.clone() },
        botPoleA: { value: fb.botPole.clone() },
        topPoleB: { value: fb.topPole.clone() },
        botPoleB: { value: fb.botPole.clone() },
        aspectA: { value: fb.aspect },
        aspectB: { value: fb.aspect },
        mixT: { value: 0 }
      },
      vertexShader: PANORAMA_VERTEX,
      fragmentShader: PANORAMA_FRAGMENT,
      side: BackSide,
      depthWrite: false
    });
    return { material: mat, fallback: fb };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      material.dispose();
      fallback.tex.dispose();
      fallback.softTex.dispose();
      assetsRef.current.forEach((asset) => {
        asset.tex.dispose();
        asset.softTex.dispose();
      });
      assetsRef.current.clear();
    };
  }, [material, fallback]);

  useEffect(() => {
    let cancelled = false;
    const apply = (asset: PanoramaCapAsset) => {
      if (cancelled) return;
      const u = material.uniforms;
      // If previous cross-fade is still in flight, snap A to previous target
      if (fadeRef.current.active) {
        copyPanoramaTargetToBase(u);
      }
      u.mapB.value = asset.tex;
      u.softB.value = asset.softTex;
      (u.topPoleB.value as Color).copy(asset.topPole);
      (u.botPoleB.value as Color).copy(asset.botPole);
      u.aspectB.value = asset.aspect;
      u.mixT.value = 0;
      fadeRef.current.active = true;
    };
    const cached = assetsRef.current.get(imageUrl);
    if (cached) {
      apply(cached);
    } else {
      new TextureLoader().load(imageUrl, (tex) => {
        if (!mountedRef.current) {
          tex.dispose();
          return;
        }
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 16;
        tex.wrapS = ClampToEdgeWrapping;
        tex.wrapT = ClampToEdgeWrapping;
        const asset = buildPanoramaCapAsset(tex);
        assetsRef.current.set(imageUrl, asset);
        apply(asset);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [imageUrl, material]);

  useFrame((_, delta) => {
    if (!fadeRef.current.active) return;
    const u = material.uniforms;
    u.mixT.value = Math.min(1, u.mixT.value + delta * 1.6);
    if (u.mixT.value >= 1) {
      copyPanoramaTargetToBase(u);
      u.mixT.value = 0;
      fadeRef.current.active = false;
    }
  });

  return (
    <mesh material={material} renderOrder={-10}>
      <sphereGeometry args={[500, 64, 40]} />
    </mesh>
  );
}

// Anime-style starfield: distant dust particles + twinkling 4-point stars (spatial parallax during 360° rotation)
function CosmicStarfield({ opacity }: { opacity: number }) {
  const dustRef = useRef<Points>(null);
  const sparkleRef = useRef<Points>(null);
  const sparkleTexture = useMemo(() => createSparkleTexture(), []);
  const opacityRef = useRef(opacity);

  const [{ dust, sparkles }] = useState(() => {
    const build = (count: number, rMin: number, rRange: number) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        // Bias toward upper hemisphere to keep stars off ground/ocean
        const phi = Math.acos(1 - Math.random() * 1.25);
        const r = rMin + Math.random() * rRange;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        const tone = Math.random();
        const c = tone > 0.8 ? [0.7, 0.9, 1.0] : tone > 0.62 ? [1.0, 0.9, 0.7] : tone > 0.55 ? [1.0, 0.75, 0.92] : [1, 1, 1];
        colors.set(c, i * 3);
      }
      const geom = new BufferGeometry();
      geom.setAttribute('position', new BufferAttribute(positions, 3));
      geom.setAttribute('color', new BufferAttribute(colors, 3));
      return geom;
    };
    return { dust: build(1400, 400, 60), sparkles: build(90, 360, 40) };
  });

  useEffect(() => () => {
    dust.dispose();
    sparkles.dispose();
    sparkleTexture.dispose();
  }, [dust, sparkles, sparkleTexture]);

  useFrame(({ clock }, delta) => {
    opacityRef.current = MathUtils.damp(opacityRef.current, opacity, 3, delta);
    const t = clock.getElapsedTime();
    if (dustRef.current) {
      dustRef.current.rotation.y += delta * 0.006;
      (dustRef.current.material as PointsMaterial).opacity = 0.7 * opacityRef.current;
      dustRef.current.visible = opacityRef.current > 0.01;
    }
    if (sparkleRef.current) {
      sparkleRef.current.rotation.y += delta * 0.006;
      const m = sparkleRef.current.material as PointsMaterial;
      m.opacity = (0.75 + Math.sin(t * 2.2) * 0.25) * opacityRef.current;
      m.size = 9 + Math.sin(t * 1.3) * 1.5;
      sparkleRef.current.visible = opacityRef.current > 0.01;
    }
  });

  return (
    <>
      <points ref={dustRef} geometry={dust}>
        <pointsMaterial size={1.8} vertexColors transparent opacity={0.7} depthWrite={false} />
      </points>
      <points ref={sparkleRef} geometry={sparkles}>
        <pointsMaterial
          size={9}
          map={sparkleTexture}
          vertexColors
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </>
  );
}

// Clone GLB and convert to toon materials (without dirtying cached GLTF shared across scenes)
function useToonClone(url: string, options: Omit<ToonifyOptions, 'gradientMap'>) {
  const { scene } = useGLTF(url);
  const gradientMap = useMemo(() => createToonGradient(), []);
  const cloned = useMemo(
    () => toonifyObject(scene.clone(true), { rimStrength: 0.45, ...options, gradientMap }),
    [scene, gradientMap, options.rimColor]
  );

  useEffect(() => {
    return () => {
      cloned.traverse((obj) => {
        if (obj instanceof Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) mat?.dispose?.();
        }
      });
    };
  }, [cloned]);

  return cloned;
}

// SLS smoke: milky-white clouds + cool purple shadows, matching cel anime smoke
const SLS_OVERRIDES: ToonifyOptions['overrides'] = {
  Mat_Smoke_Unified: (m) => {
    m.color.set('#fff3e2');
    m.emissive.set('#3b2f52');
    m.emissiveIntensity = 1;
  },
  Mat_Tower_Steel: (m) => m.color.set('#8b97ab'),
  Mat_Tower_Deck: (m) => m.color.set('#5d6880')
};

// NASA Artemis SLS heavy rocket & mobile launcher (Liftoff main model)
function SLSArtemisModel() {
  const clone = useToonClone('/models/sls_artemis_launch.glb', {
    rimColor: '#ffd9b0',
    saturation: 1.3,
    brightness: 1.1,
    overrides: SLS_OVERRIDES
  });

  const groupRef = useRef<Group>(null);
  const flameLightRef = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (flameLightRef.current) {
      // RS-25 and SRB ignition light breathing flicker
      flameLightRef.current.intensity = 5.2 + Math.sin(t * 16) * 0.9 + Math.cos(t * 31) * 0.6;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[15.5, -11.8, -38]}
      rotation={[0, -0.65, 0]}
      scale={0.88}
    >
      <primitive object={clone} />

      {/* Main nozzle bright glare at bottom of launch mount */}
      <pointLight
        ref={flameLightRef}
        position={[0, -0.8, 0]}
        color="#ff7b24"
        intensity={5.5}
        distance={55}
        decay={2}
      />

      {/* Launch tower structural illumination */}
      <pointLight
        position={[3.5, 17, -1.5]}
        color="#ffe2ba"
        intensity={2.8}
        distance={40}
        decay={2}
      />

      {/* Mobile launcher side plume lighting */}
      <pointLight
        position={[-5, -1, 3]}
        color="#ffaa55"
        intensity={2.2}
        distance={35}
        decay={2}
      />
    </group>
  );
}

useGLTF.preload('/models/sls_artemis_launch.glb');

// International Space Station (ISS) 3D model
function NASAStationModel({ rimColor }: { rimColor: string }) {
  const clone = useToonClone('/models/iss.glb', { rimColor, saturation: 1.2, brightness: 1.5 });
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.025;
      groupRef.current.rotation.x += delta * 0.008;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[16, 1.5, -35]}
      rotation={[0.35, -0.75, 0.2]}
      scale={0.52}
    >
      <primitive object={clone} />
      <pointLight position={[0, 8, 10]} color="#b5e0ff" intensity={2.2} distance={60} decay={2} />
      <pointLight position={[-10, -5, -10]} color="#ffd299" intensity={1.5} distance={50} decay={2} />
    </group>
  );
}

// Crew Dragon spacecraft 3D model
function DragonCapsuleModel() {
  const clone = useToonClone('/models/dragon.glb', { rimColor: '#eaf6ff', saturation: 1.1, brightness: 1.2 });
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    clone.traverse((obj) => {
      if (obj.name === 'Hinge') {
        obj.rotation.x = -Math.PI / 2;
      }
    });
  }, [clone]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03;
      groupRef.current.rotation.z += delta * 0.01;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[15, -1.0, -32]}
      rotation={[-0.35, 0.85, -0.2]}
      scale={2.2}
    >
      <primitive object={clone} />
      <pointLight position={[5, 4, 10]} color="#fff1db" intensity={2.5} distance={40} decay={2} />
      <pointLight position={[-6, -4, -5]} color="#ff7733" intensity={1.8} distance={35} decay={2} />
    </group>
  );
}

// Mission-specific 3D asset showcase
function MissionAmbience3D({ taskId }: { taskId: number }) {
  if (taskId === 1) {
    return <SLSArtemisModel />;
  }
  if (taskId === 2) {
    return <NASAStationModel rimColor="#c9ecff" />;
  }
  if (taskId === 3) {
    return <NASAStationModel rimColor="#ffc3e6" />;
  }
  if (taskId === 4) {
    return <DragonCapsuleModel />;
  }
  return <SLSArtemisModel />;
}

// Cel lighting: smoothly transitions color and intensity when mission changes
function ToonLighting({ mood }: { mood: ToonMood }) {
  const ambientRef = useRef<AmbientLight>(null);
  const keyRef = useRef<DirectionalLight>(null);
  const rimRef = useRef<DirectionalLight>(null);
  const target = useMemo(
    () => ({
      ambient: new Color(mood.ambient),
      key: new Color(mood.key),
      rim: new Color(mood.rim),
      keyPos: new Vector3(...mood.keyPosition)
    }),
    [mood]
  );

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 3);
    if (ambientRef.current) {
      ambientRef.current.color.lerp(target.ambient, k);
      ambientRef.current.intensity = MathUtils.lerp(ambientRef.current.intensity, mood.ambientIntensity, k);
    }
    if (keyRef.current) {
      keyRef.current.color.lerp(target.key, k);
      keyRef.current.intensity = MathUtils.lerp(keyRef.current.intensity, mood.keyIntensity, k);
      keyRef.current.position.lerp(target.keyPos, k);
    }
    if (rimRef.current) {
      rimRef.current.color.lerp(target.rim, k);
      rimRef.current.intensity = MathUtils.lerp(rimRef.current.intensity, mood.rimIntensity, k);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={mood.ambientIntensity} color={mood.ambient} />
      {/* Primary key light: determines cel light/shadow terminator */}
      <directionalLight ref={keyRef} position={mood.keyPosition} intensity={mood.keyIntensity} color={mood.key} />
      {/* Side-rear rim light: defines structural silhouette */}
      <directionalLight ref={rimRef} position={[60, 30, -70]} intensity={mood.rimIntensity} color={mood.rim} />
    </>
  );
}

// 360° camera rotation & damping controller
function PanoramaCameraRig({
  autoRotate,
  onAngleChange,
  resetSignal
}: {
  autoRotate: boolean;
  onAngleChange?: (yawDeg: number, pitchDeg: number) => void;
  resetSignal?: number;
}) {
  const { camera, gl } = useThree();

  // Current azimuth and elevation (radians)
  const rotRef = useRef({ yaw: 0, pitch: 0 });
  const targetRotRef = useRef({ yaw: 0, pitch: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, startYaw: 0, startPitch: 0 });
  const lastInteractionRef = useRef(performance.now());
  const lookTarget = useMemo(() => new Vector3(), []);
  const lastSentAnglesRef = useRef({ yaw: Number.NaN, pitch: Number.NaN });

  // Reset view signal
  useEffect(() => {
    targetRotRef.current = { yaw: 0, pitch: 0 };
    lastInteractionRef.current = performance.now();
  }, [resetSignal]);

  // Global pointer event binding
  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      // Primary button drag only (Button 0)
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startYaw: targetRotRef.current.yaw,
        startPitch: targetRotRef.current.pitch
      };
      lastInteractionRef.current = performance.now();
      dom.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      // Rotation sensitivity
      const sens = 0.0035;
      targetRotRef.current.yaw = dragStartRef.current.startYaw - dx * sens;
      // Keep vertical look within the panorama band + blended cap without crossing ±90° poles
      const maxPitch = (PANORAMA_MAX_PITCH_DEG * Math.PI) / 180;
      targetRotRef.current.pitch = MathUtils.clamp(
        dragStartRef.current.startPitch + dy * sens,
        -maxPitch,
        maxPitch
      );

      lastInteractionRef.current = performance.now();
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
      dom.style.cursor = 'grab';
    };

    dom.style.cursor = 'grab';
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    // Auto-cruise gentle drift: orbits back and forth around model (±14°) to maintain front view
    const now = performance.now();
    if (autoRotate && !isDraggingRef.current && now - lastInteractionRef.current > 1800) {
      const t = (now - lastInteractionRef.current - 1800) * 0.0003;
      targetRotRef.current.yaw = Math.sin(t) * 0.22;
      targetRotRef.current.pitch = Math.sin(t * 0.6) * 0.04;
    }

    // Lerp damping
    const lerpFactor = Math.min(1, delta * 10);
    rotRef.current.yaw = MathUtils.lerp(rotRef.current.yaw, targetRotRef.current.yaw, lerpFactor);
    rotRef.current.pitch = MathUtils.lerp(rotRef.current.pitch, targetRotRef.current.pitch, lerpFactor);

    // Convert spherical coordinates to camera gaze vector
    const yaw = rotRef.current.yaw;
    const pitch = rotRef.current.pitch;

    const dirX = Math.cos(pitch) * Math.sin(yaw);
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(pitch) * Math.cos(yaw);

    lookTarget.set(dirX * 100, dirY * 100, dirZ * 100);
    camera.position.set(0, 0, 0);
    camera.lookAt(lookTarget);

    if (onAngleChange) {
      const yawDeg = Math.round(((((-yaw * 180) / Math.PI) % 360) + 360) % 360);
      const pitchDeg = Math.round((pitch * 180) / Math.PI);
      if (
        yawDeg !== lastSentAnglesRef.current.yaw ||
        pitchDeg !== lastSentAnglesRef.current.pitch
      ) {
        lastSentAnglesRef.current.yaw = yawDeg;
        lastSentAnglesRef.current.pitch = pitchDeg;
        onAngleChange(yawDeg, pitchDeg);
      }
    }
  });

  return null;
}

export const HomePanorama = memo(function HomePanorama({
  selectedTaskId,
  autoRotate = true,
  onAngleChange,
  resetSignal,
  quality = 'high'
}: HomePanoramaProps) {
  const mood = TOON_MOODS[selectedTaskId] ?? TOON_MOODS[1];
  const lowQuality = quality === 'low';
  return (
    <div className="home-panorama-canvas-wrap" data-testid="home-panorama-canvas">
      <Canvas
        flat
        dpr={lowQuality ? 1 : [1, 1.5]}
        camera={{ position: [0, 0, 0], fov: 65, near: 0.5, far: 1200 }}
        gl={{ antialias: !lowQuality, alpha: true, powerPreference: 'high-performance' }}
      >
        {/* Cel lighting mood */}
        <ToonLighting mood={mood} />

        {/* 360° anime illustration sphere */}
        <PanoramaSphere selectedTaskId={selectedTaskId} />

        {/* Anime starfield */}
        <CosmicStarfield opacity={mood.starOpacity} />

        {/* 3D solid model (cel-shaded) */}
        <Suspense fallback={null}>
          <MissionAmbience3D taskId={selectedTaskId} />
        </Suspense>

        {/* 360° camera controller */}
        <PanoramaCameraRig
          autoRotate={autoRotate}
          onAngleChange={onAngleChange}
          resetSignal={resetSignal}
        />

        {/* Ink outline post-processing pass */}
        <ToonInkPass inkColor="#0b1030" thickness={1.2} samples={lowQuality ? 0 : 4} />
      </Canvas>
    </div>
  );
});
