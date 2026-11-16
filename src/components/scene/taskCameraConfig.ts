import { MOUSE, TOUCH } from 'three';

/**
 * Standard mouse button mapping shared across all 3D task scenes:
 * - Left drag (LEFT): Rotate camera (MOUSE.ROTATE)
 * - Right drag (RIGHT): Pan camera (MOUSE.PAN)
 * - Scroll wheel / middle button (MIDDLE): Dolly / Zoom (MOUSE.DOLLY)
 */
export const TASK_CAMERA_MOUSE_BUTTONS = {
  LEFT: MOUSE.ROTATE,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.PAN
} as const;

/**
 * Standard touch gesture mapping for touchscreen devices:
 * - One-finger drag: Rotate camera (TOUCH.ROTATE)
 * - Two-finger pinch/drag: Zoom and pan (TOUCH.DOLLY_PAN)
 */
export const TASK_CAMERA_TOUCHES = {
  ONE: TOUCH.ROTATE,
  TWO: TOUCH.DOLLY_PAN
} as const;

/**
 * Base camera control parameters shared across all 3D task scenes
 */
export const TASK_CAMERA_BASE_CONFIG = {
  enableRotate: true,
  enablePan: true,
  enableZoom: true,
  screenSpacePanning: true,
  rotateSpeed: 0.85,
  panSpeed: 0.85,
  zoomSpeed: 1.0,
  mouseButtons: TASK_CAMERA_MOUSE_BUTTONS,
  touches: TASK_CAMERA_TOUCHES
} as const;

/**
 * Unified 3D viewport mouse operation hint text
 */
export const TASK_CAMERA_HINT_TEXT = {
  zh: 'LEFT DRAG ROTATE · RIGHT DRAG PAN · SCROLL ZOOM',
  en: 'LEFT DRAG ROTATE · RIGHT DRAG PAN · SCROLL ZOOM'
} as const;

export interface FollowTargetStepResult {
  nextTarget: [number, number, number];
  nextAnchor: [number, number, number];
  delta: [number, number, number];
}

/**
 * Computes camera target incremental updates when smoothly following a dynamic target.
 * By only adding the frame displacement delta of the follow anchor, it follows the target
 * smoothly while 100% preserving user right-click pan offsets without resetting them.
 */
export function stepFollowTargetWithPan(
  currentTarget: readonly [number, number, number],
  smoothedAnchor: readonly [number, number, number],
  rawFollowPoint: readonly [number, number, number],
  lerpFactor = 0.05
): FollowTargetStepResult {
  const t = Math.max(0, Math.min(1, lerpFactor));
  const nextAnchor: [number, number, number] = [
    smoothedAnchor[0] + (rawFollowPoint[0] - smoothedAnchor[0]) * t,
    smoothedAnchor[1] + (rawFollowPoint[1] - smoothedAnchor[1]) * t,
    smoothedAnchor[2] + (rawFollowPoint[2] - smoothedAnchor[2]) * t
  ];

  const delta: [number, number, number] = [
    nextAnchor[0] - smoothedAnchor[0],
    nextAnchor[1] - smoothedAnchor[1],
    nextAnchor[2] - smoothedAnchor[2]
  ];

  const nextTarget: [number, number, number] = [
    currentTarget[0] + delta[0],
    currentTarget[1] + delta[1],
    currentTarget[2] + delta[2]
  ];

  return { nextTarget, nextAnchor, delta };
}
