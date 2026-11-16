import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, useGLTF } from '@react-three/drei';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  Object3D,
  Quaternion,
  Vector3
} from 'three';
import { Earth } from '../scene/Earth';
import { TaskCameraControls } from '../scene/TaskCameraControls';
import { applyAntiMoireToObject } from '../scene/textureQuality';
import { createSupersonicPlumeGeometry, createVolumetricPlumeMaterial } from '../scene/volumetricFire';
import { TeachingStation } from '../../Scene';
import { useSession } from '../../store';
import {
  computeCorridorRadius,
  KEEP_OUT_ZONE_M,
  type DepartureState
} from '../../sim/departure';
import type { Language } from '../../sim/types';

const _depEuler = new Euler();
const _depQuat = new Quaternion();
const _depCamUp = new Vector3();
const _depCamLook = new Vector3();

function StarField() {
  const geometry = useMemo(() => {
    const n = 1800;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 20261019;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = -0.3 + 1.3 * rnd();
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const r = 1.5e7;
      pos.set([s * Math.cos(a) * r, u * r, s * Math.sin(a) * r], i * 3);
      const b = 0.4 + 0.6 * rnd() ** 2;
      col.set([b, b, b], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={1.5} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  );
}

function StationAndSpringPort({ latchesReleased }: { latchesReleased: boolean }) {
  const { scene } = useGLTF('/models/iss.glb');
  const quality = useSession((s) => s.quality);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    return copy;
  }, [scene]);
  useEffect(() => {
    applyAntiMoireToObject(model, quality);
  }, [model, quality]);

  // 4 spring push-off rods: compressed when latched (len=0.18), extended when released (len=0.48)
  const springLen = latchesReleased ? 0.48 : 0.18;
  const springAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];

  return (
    <group>
      <primitive object={model} position={[0, 0.7347664, -21.8053501]} />
      {/* PMA-2 docking adapter ring */}
      <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.8, 24]} />
        <meshStandardMaterial color="#9ea8a7" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 8]}>
        <torusGeometry args={[0.67, 0.13, 12, 16]} />
        <meshStandardMaterial color="#dce1df" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* 4 sets of mechanical spring pushers */}
      {springAngles.map((ang, idx) => (
        <mesh
          key={idx}
          position={[
            Math.cos(ang) * 0.62,
            Math.sin(ang) * 0.62,
            springLen * 0.5
          ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.04, 0.04, springLen, 10]} />
          <meshStandardMaterial
            color={latchesReleased ? '#b5f97b' : '#f59e0b'}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

function DepartureCorridorVisual({
  showGuidance,
  inKeepOutZone
}: {
  showGuidance: boolean;
  inKeepOutZone: boolean;
}) {
  const corridorRings = useMemo(() => {
    const stations = [5, 12, 18, 24, 32];
    const base = Array.from({ length: 65 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)] as const;
    });
    return stations.map((z) => {
      const r = computeCorridorRadius(z);
      const isKeepOutBorder = z === KEEP_OUT_ZONE_M;
      const isHoldRing = z === 12 || z === 32;
      return {
        z,
        points: base.map(([x, y]) => [x * r, y * r, 0] as [number, number, number]),
        color: isKeepOutBorder ? '#ff7849' : isHoldRing ? '#b8f566' : '#4de2d1',
        lineWidth: isKeepOutBorder || isHoldRing ? 2.2 : 1.2,
        opacity: isKeepOutBorder || isHoldRing ? 0.72 : 0.32
      };
    });
  }, []);

  if (!showGuidance) return null;

  return (
    <group>
      {/* 0 ~ 5m Plume keep-out zone guard and boundary ring */}
      <mesh position={[0, 0, KEEP_OUT_ZONE_M * 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[
            computeCorridorRadius(KEEP_OUT_ZONE_M),
            computeCorridorRadius(0),
            KEEP_OUT_ZONE_M,
            32,
            1,
            true
          ]}
        />
        <meshBasicMaterial
          color={inKeepOutZone ? '#ff6b4a' : '#f59e0b'}
          transparent
          opacity={inKeepOutZone ? 0.11 : 0.05}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Departure conical corridor rings */}
      {corridorRings.map((ring) => (
        <group key={ring.z} position={[0, 0, ring.z]}>
          <Line
            points={ring.points}
            color={ring.color}
            lineWidth={ring.lineWidth}
            transparent
            opacity={ring.opacity}
          />
        </group>
      ))}

      {/* Central corridor centerline axis */}
      <Line
        points={[
          [0, 0, 0],
          [0, 0, 38]
        ]}
        color="#4de2d1"
        transparent
        opacity={0.35}
        dashed
        dashSize={0.35}
        gapSize={0.35}
      />
    </group>
  );
}

function DepartingDragonShip({
  state,
  cameraMode
}: {
  state: DepartureState;
  cameraMode: 'orbit' | 'side' | 'pilot';
}) {
  const groupRef = useRef<Group>(null);
  const { scene } = useGLTF('/models/dragon.glb');
  const quality = useSession((s) => s.quality);
  const clone = useMemo(() => scene.clone(true), [scene]);
  const hingeRef = useRef<Object3D | null>(null);
  const displayProgressRef = useRef(state.noseconeProgress);

  useEffect(() => {
    applyAntiMoireToObject(clone, quality);
    clone.traverse((obj) => {
      if (obj.name === 'Hinge') {
        hingeRef.current = obj;
      }
    });
  }, [clone, quality]);

  const rcsGeo = useMemo(() => createSupersonicPlumeGeometry(0.03, 0.16, 0.92, 16, 12), []);
  const rcsMat = useMemo(
    () =>
      createVolumetricPlumeMaterial({
        coreColor: '#ffffff',
        midColor: '#7dd3fc',
        outerColor: '#2563eb',
        speed: 18.0,
        dispAmp: 0.04,
        machStrength: 0.65,
        opacity: 0.86
      }),
    []
  );

  useEffect(() => {
    return () => {
      rcsGeo.dispose();
      rcsMat.dispose();
    };
  }, [rcsGeo, rcsMat]);

  useFrame((_, delta) => {
    rcsMat.uniforms.uTime.value += Math.min(0.05, delta);
    rcsMat.uniforms.uThrottle.value = 1;
    if (groupRef.current) {
      groupRef.current.position.set(...state.position);
      _depEuler.set(
        (state.attitudeDeg[0] * Math.PI) / 180,
        (state.attitudeDeg[1] * Math.PI) / 180,
        (state.attitudeDeg[2] * Math.PI) / 180
      );
      groupRef.current.quaternion.setFromEuler(_depEuler);
    }
    const diff = state.noseconeProgress - displayProgressRef.current;
    displayProgressRef.current +=
      Math.abs(diff) < 0.002 ? diff : diff * Math.min(1, delta * 18);
    if (hingeRef.current) {
      // noseconeProgress = 0 (open) -> rotation.x = 0; noseconeProgress = 1 (closed) -> -Math.PI/2
      hingeRef.current.rotation.x = displayProgressRef.current * (-Math.PI / 2);
    }
  });

  const [tx, ty, tz] = state.activeThrust;

  return (
    <group ref={groupRef} visible={cameraMode !== 'pilot'}>
      <primitive object={clone} scale={1.0} />

      {/* Nose lidar beam (pointing at station docking target) */}
      {state.latchesReleased && state.noseconeProgress < 0.5 && (
        <Line
          points={[
            [0, 0, -0.2],
            [0, 0, -Math.max(1, state.position[2])]
          ]}
          color="#b8f566"
          lineWidth={1.4}
          transparent
          opacity={0.45}
          dashed
          dashSize={0.2}
          gapSize={0.25}
        />
      )}

      {/* Forward volumetric thruster plumes (pushing spacecraft rearward along -Z nozzle axis) */}
      {tz > 0.05 && (
        <group>
          {[
            [0, 1.15, 0.76],
            [0, -1.13, 0.76],
            [1.15, 0, 0.76],
            [-1.19, 0, 0.76]
          ].map((pos, idx) => (
            <mesh
              key={`fwd-${idx}`}
              position={pos as [number, number, number]}
              rotation={[Math.PI / 2, 0, 0]}
              geometry={rcsGeo}
              material={rcsMat}
            />
          ))}
        </group>
      )}

      {/* Aft volumetric thruster plumes (braking rearward speed along +Z nozzle axis) */}
      {tz < -0.05 && (
        <group>
          {[
            [-0.52, -0.52, 4.7],
            [0.52, -0.52, 4.7],
            [-0.52, 0.52, 4.7],
            [0.52, 0.52, 4.7]
          ].map((pos, idx) => (
            <mesh
              key={`aft-${idx}`}
              position={pos as [number, number, number]}
              rotation={[-Math.PI / 2, 0, 0]}
              geometry={rcsGeo}
              material={rcsMat}
            />
          ))}
        </group>
      )}

      {/* Lateral RCS volumetric correction plume */}
      {Math.hypot(tx, ty) > 0.05 && (
        <mesh
          position={[-tx * 1.15, -ty * 1.15, 1.6]}
          rotation={[0, 0, Math.atan2(-tx, ty)]}
          geometry={rcsGeo}
          material={rcsMat}
          scale={[0.85, 0.75, 0.85]}
        />
      )}
    </group>
  );
}

class DepartureSceneBoundary extends Component<
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

export interface DepartureScene3DProps {
  state: DepartureState;
  scenarioId: number;
  cameraMode: 'orbit' | 'side' | 'pilot';
  showGuidance: boolean;
  language: Language;
}

export function DepartureScene3D({
  state,
  scenarioId,
  cameraMode,
  showGuidance,
  language
}: DepartureScene3DProps) {
  const quality = useSession((s) => s.quality);
  const stateRef = useRef(state);
  stateRef.current = state;

  const initialPosition: [number, number, number] =
    cameraMode === 'side'
      ? [26, 2.5, Math.max(8, state.position[2])]
      : [state.position[0] + 5.8, state.position[1] + 3.2, state.position[2] + 6.8];

  const initialTarget: [number, number, number] = [
    state.position[0],
    state.position[1],
    Math.max(1.5, state.position[2] - 0.5)
  ];

  return (
    <DepartureSceneBoundary
      fallback={
        <div className="scene-fallback">
          3D Departure Viewport Ready
        </div>
      }
    >
      <Canvas
        dpr={quality === 'low' ? 1 : [1, 1.75]}
        camera={{ position: [5.8, 3.2, 8.5], fov: 48, near: 0.1, far: 3e7 }}
        gl={{ antialias: quality === 'high', logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={['#090e13']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[30, 30, 35]} intensity={3.2} color="#fff3de" />
        <directionalLight position={[-40, -20, 10]} intensity={1.2} color="#80a8d2" />

        <StarField />

        <Suspense fallback={<TeachingStation />}>
          <StationAndSpringPort latchesReleased={state.latchesReleased} />
        </Suspense>

        <DepartureCorridorVisual
          showGuidance={showGuidance}
          inKeepOutZone={state.inKeepOutZone}
        />

        <Suspense fallback={null}>
          <DepartingDragonShip state={state} cameraMode={cameraMode} />
        </Suspense>

        <Suspense fallback={null}>
          <Earth />
        </Suspense>

        {/* Unified 3D task camera mouse controls */}
        <TaskCameraControls
          enabled={cameraMode !== 'pilot'}
          resetKey={`dep-${cameraMode}-${scenarioId}`}
          initialPosition={initialPosition}
          initialTarget={initialTarget}
          followTarget={() => [
            stateRef.current.position[0],
            stateRef.current.position[1],
            stateRef.current.position[2] - 0.5
          ]}
          minDistance={2.5}
          maxDistance={160}
          maxPolarAngle={Math.PI * 0.9}
          onFrame={(camera) => {
            if (cameraMode === 'pilot') {
              const s = stateRef.current;
              _depEuler.set(
                (s.attitudeDeg[0] * Math.PI) / 180,
                (s.attitudeDeg[1] * Math.PI) / 180,
                (s.attitudeDeg[2] * Math.PI) / 180
              );
              const q = _depQuat.setFromEuler(_depEuler);
              camera.position.set(...s.position);
              camera.up.copy(_depCamUp.set(0, 1, 0).applyQuaternion(q));
              camera.lookAt(
                _depCamLook.set(0, 0, -10).applyQuaternion(q).add(camera.position)
              );
            }
          }}
        />
      </Canvas>
    </DepartureSceneBoundary>
  );
}
