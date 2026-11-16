import type { ScenarioConfig } from './types';
const base = { fuel: 100, positionTolerance: .2, speedTolerance: .06, angleTolerance: 2, angularSpeedTolerance: .5, holdDuration: 1.5, maxTime: 600 };
export const scenarios: ScenarioConfig[] = [
  { ...base, id: 1,
    title: { zh: 'Learn to stop', en: 'Learn to stop' },
    subtitle: { zh: 'Goal: Stop at 8 m yellow ring (or dock directly)', en: 'Goal: Stop at 8 m yellow ring (or dock directly)' },
    objective: { zh: 'Stop steadily at 8 m yellow ring for 1.5 s; or fly directly into the port to dock!', en: 'Stop steadily at 8 m yellow ring for 1.5 s; or fly directly into the port to dock!' },
    hint: { zh: 'Press F to brake and stop at 8 m; or stay centered and fly straight in to dock directly!', en: 'Press F to brake and stop at 8 m; or stay centered and fly straight in to dock directly!' },
    passCriteria: { zh: 'Hold at 8 m ring for 1.5 s · Or dock directly into the port', en: 'Hold at 8 m ring for 1.5 s · Or dock directly into the port' },
    brief: { zh: 'Your ship is gliding toward the station. Brake with F to stop at the 8 m ring; or dock directly with the port to pass.', en: 'Your ship is gliding toward the station. Brake with F to stop at the 8 m ring; or dock directly with the port to pass.' },
    lesson: { zh: 'Thrust changes velocity, not position. Watch your closing speed, brake early, then release when your speed reaches zero.', en: 'Thrust changes velocity, not position. Watch your closing speed, brake early, then release when your speed reaches zero.' },
    constraints: { zh: 'All 6-DOF unlocked · Full translation & rotation', en: 'All 6-DOF unlocked · Full translation & rotation' },
    position: [0, 0, 18], velocity: [0, 0, -0.65], attitude: [0, 0, 0], translation: [true, true, true], rotation: true, targetZ: 8, positionTolerance: 0.35
  },
  { ...base, id: 2,
    title: { zh: 'Cancel the drift', en: 'Cancel the drift' },
    subtitle: { zh: 'Goal: Cancel sideways drift and align with green crosshair', en: 'Goal: Cancel sideways drift and align with green crosshair' },
    objective: { zh: 'Cancel vertical & lateral drift, zero out sideways speed, and center on the green crosshair', en: 'Cancel vertical & lateral drift, zero out sideways speed, and center on the green crosshair' },
    hint: { zh: 'Use W / S (vertical) and A / D (lateral) to push the ship back to center and cancel sideways speed!', en: 'Use W / S (vertical) and A / D (lateral) to push the ship back to center and cancel sideways speed!' },
    passCriteria: { zh: 'Aligned with port center (< 0.20m) · Sideways speed < 0.04 m/s · Hold for 1.5 s', en: 'Aligned with port center (< 0.20m) · Sideways speed < 0.04 m/s · Hold for 1.5 s' },
    brief: { zh: 'The port is ahead, but your ship is drifting sideways. Use vertical and lateral thrusters to center your position and eliminate sideways speed.', en: 'The port is ahead, but your ship is drifting sideways. Use vertical and lateral thrusters to center your position and eliminate sideways speed.' },
    lesson: { zh: 'The markers can overlap while you are still drifting. Both lateral position and velocity must be close to zero.', en: 'The markers can overlap while you are still drifting. Both lateral position and velocity must be close to zero.' },
    constraints: { zh: 'All 6-DOF unlocked · Full translation & rotation', en: 'All 6-DOF unlocked · Full translation & rotation' },
    position: [2.4, -1.4, 12], velocity: [0.08, -0.04, 0], attitude: [0, 0, 0], translation: [true, true, true], rotation: true, targetZ: 12
  },
  { ...base, id: 3,
    title: { zh: 'Align the port', en: 'Align the port' },
    subtitle: { zh: 'Goal: Rotate nose to face station hatch and stop rotating', en: 'Goal: Rotate nose to face station hatch and stop rotating' },
    objective: { zh: 'Rotate pitch, yaw, and roll so both hatches face each other directly, then stop rotation (< 2°)', en: 'Rotate pitch, yaw, and roll so both hatches face each other directly, then stop rotation (< 2°)' },
    hint: { zh: 'Use arrow keys ↑ ↓ ← → to rotate nose, Q / E to roll. Counter-tap to halt rotation once aligned!', en: 'Use arrow keys ↑ ↓ ← → to rotate nose, Q / E to roll. Counter-tap to halt rotation once aligned!' },
    passCriteria: { zh: 'Attitude error < 2° · Angular rotation speed < 0.5°/s · Hold for 1.5 s', en: 'Attitude error < 2° · Angular rotation speed < 0.5°/s · Hold for 1.5 s' },
    brief: { zh: 'Your hatch is misaligned! Use arrows ↑ ↓ ← → and Q/E to align with the station, then counter-tap to stop rotating.', en: 'Your hatch is misaligned! Use arrows ↑ ↓ ← → and Q/E to align with the station, then counter-tap to stop rotating.' },
    lesson: { zh: 'Rotational thrusters change angular velocity. Momentary alignment is not enough: rotation must also stop.', en: 'Rotational thrusters change angular velocity. Momentary alignment is not enough: rotation must also stop.' },
    constraints: { zh: 'All 6-DOF unlocked · Full translation & rotation', en: 'All 6-DOF unlocked · Full translation & rotation' },
    position: [0, 0, 8], velocity: [0, 0, 0], attitude: [9, -12, 7], translation: [true, true, true], rotation: true, targetZ: 8
  },
  { ...base, id: 4,
    title: { zh: 'The final 50 metres', en: 'The final 50 metres' },
    subtitle: { zh: 'Goal: Approach from 50 m and make gentle contact docking', en: 'Goal: Approach from 50 m and make gentle contact docking' },
    objective: { zh: 'Fly in from 50 m and make gentle contact docking at under 0.15 m/s directly on the port center', en: 'Fly in from 50 m and make gentle contact docking at under 0.15 m/s directly on the port center' },
    hint: { zh: 'Stay centered on the green crosshair. Tap F to brake on approach. Contact speed must be < 0.15 m/s or collision occurs!', en: 'Stay centered on the green crosshair. Tap F to brake on approach. Contact speed must be < 0.15 m/s or collision occurs!' },
    passCriteria: { zh: 'Contact speed < 0.15 m/s · Center error < 0.18m · Angle error < 2° · Latched', en: 'Contact speed < 0.15 m/s · Center error < 0.18m · Angle error < 2° · Latched' },
    brief: { zh: 'Complete manual docking independently! Align center and attitude first, then creep in gently. Contact speed must be below 0.15 m/s.', en: 'Complete manual docking independently! Align center and attitude first, then creep in gently. Contact speed must be below 0.15 m/s.' },
    lesson: { zh: 'Cancel lateral and attitude errors before the final approach. Docking requires safe position, orientation, velocity and angular velocity together.', en: 'Cancel lateral and attitude errors before the final approach. Docking requires safe position, orientation, velocity and angular velocity together.' },
    constraints: { zh: 'All six degrees of freedom · every thrust uses resources', en: 'All six degrees of freedom · every thrust uses resources' },
    position: [0.6, -0.3, 50], velocity: [0, 0, -0.35], attitude: [2, -3, 2], translation: [true, true, true], rotation: true, targetZ: 0.35, positionTolerance: 0.18, speedTolerance: 0.15, maxTime: 900
  }
];

export const getScenario = (id: number) => scenarios.find(s=>s.id === id) ?? scenarios[0];
