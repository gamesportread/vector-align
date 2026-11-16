import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Camera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  TASK_CAMERA_BASE_CONFIG,
  TASK_CAMERA_MOUSE_BUTTONS,
  TASK_CAMERA_TOUCHES,
  stepFollowTargetWithPan
} from './taskCameraConfig';

export interface TaskCameraControlsProps {
  /** Initial camera target point */
  initialTarget?: [number, number, number];
  /** Initial camera position (optional, defaults to Canvas initial position) */
  initialPosition?: [number, number, number];
  /** Resets camera position, target, and pan offset when this key changes */
  resetKey?: string | number;
  /** Dynamic target follow callback (preserves right-click pan offsets) */
  followTarget?: () => [number, number, number];
  /** Dynamic follow lerp smoothing factor, default 0.05 */
  followLerp?: number;
  /** Minimum zoom distance */
  minDistance?: number;
  /** Maximum zoom distance */
  maxDistance?: number;
  /** Minimum polar elevation angle */
  minPolarAngle?: number;
  /** Maximum polar elevation angle */
  maxPolarAngle?: number;
  /** Whether mouse controls are enabled (false for fixed cockpit view) */
  enabled?: boolean;
  /** Optional per-frame callback (for cockpit pose sync or camera shake) */
  onFrame?: (camera: Camera) => void;
}

/**
 * Unified camera and mouse interaction component shared across all 3D task scenes:
 * - Left drag: Rotate view (MOUSE.ROTATE)
 * - Right drag: Pan view (MOUSE.PAN, screenSpacePanning)
 * - Wheel scroll: Dolly zoom (MOUSE.DOLLY)
 *
 * Note: Never pass an inline target array to underlying <OrbitControls> to avoid clobbering right-click pan state.
 */
export function TaskCameraControls({
  initialTarget = [0, 0, 0],
  initialPosition,
  resetKey = 'default',
  followTarget,
  followLerp = 0.05,
  minDistance = 2.5,
  maxDistance = 180,
  minPolarAngle = 0,
  maxPolarAngle = Math.PI * 0.9,
  enabled = true,
  onFrame
}: TaskCameraControlsProps) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const initialTargetRef = useRef<[number, number, number]>(initialTarget);
  initialTargetRef.current = initialTarget;
  const lastResetKeyRef = useRef<string | number | null>(null);
  const smoothedAnchorRef = useRef<[number, number, number]>([...initialTarget]);
  const overrideRef = useRef<{
    pos: [number, number, number];
    target: [number, number, number];
  } | null>(null);

  useEffect(() => {
    const win = window as any;
    win.__setCamera = (
      x: number,
      y: number,
      z: number,
      tx = initialTargetRef.current[0],
      ty = initialTargetRef.current[1],
      tz = initialTargetRef.current[2]
    ) => {
      overrideRef.current = { pos: [x, y, z], target: [tx, ty, tz] };
      camera.position.set(x, y, z);
      camera.lookAt(tx, ty, tz);
      if (controlsRef.current) {
        controlsRef.current.target.set(tx, ty, tz);
        controlsRef.current.update();
      }
    };
    win.__resetCamera = () => {
      overrideRef.current = null;
      lastResetKeyRef.current = null;
    };
    win.__getCameraControlsState = () => ({
      enabled,
      enableRotate: controlsRef.current?.enableRotate ?? TASK_CAMERA_BASE_CONFIG.enableRotate,
      enablePan: controlsRef.current?.enablePan ?? TASK_CAMERA_BASE_CONFIG.enablePan,
      enableZoom: controlsRef.current?.enableZoom ?? TASK_CAMERA_BASE_CONFIG.enableZoom,
      screenSpacePanning:
        controlsRef.current?.screenSpacePanning ?? TASK_CAMERA_BASE_CONFIG.screenSpacePanning,
      mouseButtons: TASK_CAMERA_MOUSE_BUTTONS,
      position: [camera.position.x, camera.position.y, camera.position.z] as [
        number,
        number,
        number
      ],
      target: controlsRef.current
        ? ([
            controlsRef.current.target.x,
            controlsRef.current.target.y,
            controlsRef.current.target.z
          ] as [number, number, number])
        : [...initialTargetRef.current]
    });
    return () => {
      delete win.__setCamera;
      delete win.__resetCamera;
      delete win.__getCameraControlsState;
    };
  }, [camera, enabled]);

  useFrame(() => {
    if (overrideRef.current) {
      const { pos, target } = overrideRef.current;
      camera.position.set(...pos);
      camera.lookAt(...target);
      if (controlsRef.current) {
        controlsRef.current.target.set(...target);
      }
      return;
    }

    if (enabled) {
      if (lastResetKeyRef.current !== resetKey && controlsRef.current) {
        camera.up.set(0, 1, 0);
        if (initialPosition) {
          camera.position.set(...initialPosition);
        }
        const startAnchor = followTarget ? followTarget() : initialTarget;
        smoothedAnchorRef.current = [...startAnchor];
        controlsRef.current.target.set(...initialTarget);
        controlsRef.current.update();
        lastResetKeyRef.current = resetKey;
      } else if (followTarget && controlsRef.current) {
        const t = controlsRef.current.target;
        const { nextTarget, nextAnchor } = stepFollowTargetWithPan(
          [t.x, t.y, t.z],
          smoothedAnchorRef.current,
          followTarget(),
          followLerp
        );
        smoothedAnchorRef.current = nextAnchor;
        t.set(...nextTarget);
      }
    } else {
      lastResetKeyRef.current = null;
    }

    onFrame?.(camera);
  });

  if (!enabled) return null;

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
      enableRotate={TASK_CAMERA_BASE_CONFIG.enableRotate}
      enablePan={TASK_CAMERA_BASE_CONFIG.enablePan}
      enableZoom={TASK_CAMERA_BASE_CONFIG.enableZoom}
      screenSpacePanning={TASK_CAMERA_BASE_CONFIG.screenSpacePanning}
      rotateSpeed={TASK_CAMERA_BASE_CONFIG.rotateSpeed}
      panSpeed={TASK_CAMERA_BASE_CONFIG.panSpeed}
      zoomSpeed={TASK_CAMERA_BASE_CONFIG.zoomSpeed}
      mouseButtons={TASK_CAMERA_MOUSE_BUTTONS}
      touches={TASK_CAMERA_TOUCHES}
    />
  );
}
