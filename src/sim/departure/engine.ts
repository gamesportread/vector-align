import { clamp } from '../engine';
import type { Vec3 } from '../types';
import type {
  DepartureCommand,
  DepartureSample,
  DepartureScenarioConfig,
  DepartureState
} from './types';

export const DEPARTURE_DT = 1 / 60;
export const KEEP_OUT_ZONE_M = 5.0;
export const SPRING_PUSHOFF_VZ = 0.28; // Mechanical spring push-off speed (m/s)
export const TRANS_ACCEL = 0.26; // RCS translation acceleration (m/s^2)
export const ROT_ACCEL_DEG = 6.0; // RCS angular acceleration (deg/s^2)
export const NOSECONE_SERVO_SPEED = 0.75; // ~1.33s full open/close stroke

/**
 * Advance nosecone hatch servo progress smoothly toward closed (1) or open (0).
 */
export function stepNoseconeServo(progress: number, closed: boolean, dt: number): number {
  const target = closed ? 1 : 0;
  if (progress < target) {
    return Math.min(1, progress + dt * NOSECONE_SERVO_SPEED);
  }
  if (progress > target) {
    return Math.max(0, progress - dt * NOSECONE_SERVO_SPEED);
  }
  return progress;
}

/**
 * Toggle nosecone hatch target state immediately (safe in ready, paused, flying, or post-flight).
 */
export function toggleDepartureNosecone(state: DepartureState): DepartureState {
  return {
    ...state,
    noseconeClosed: !state.noseconeClosed
  };
}

/**
 * Compute safe departure corridor radius at z meters from docking port (Conical Departure Corridor Radius)
 */
export function computeCorridorRadius(z: number): number {
  return 0.55 + Math.max(0, z) * 0.12;
}

export function emptyDepartureCommand(): DepartureCommand {
  return {
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
    releaseLatches: false,
    toggleNosecone: false,
    assistBrake: false
  };
}

export function createDepartureState(scenario: DepartureScenarioConfig): DepartureState {
  const init = scenario.initialState;
  const latOffset = Math.hypot(init.position[0], init.position[1]);
  const latSpeed = Math.hypot(init.velocity[0], init.velocity[1]);
  const attErr = Math.hypot(init.attitudeDeg[0], init.attitudeDeg[1], init.attitudeDeg[2]);
  return {
    time: 0,
    status: 'ready',
    position: [...init.position],
    velocity: [...init.velocity],
    attitudeDeg: [...init.attitudeDeg],
    angularVelDeg: [...init.angularVelDeg],
    latchesReleased: init.latchesReleased,
    noseconeClosed: init.noseconeClosed,
    noseconeProgress: init.noseconeClosed ? 1 : 0,
    fuelPct: 100,
    corridorRadiusM: computeCorridorRadius(init.position[2]),
    lateralOffsetM: latOffset,
    lateralSpeedMs: latSpeed,
    attitudeErrorDeg: attErr,
    inKeepOutZone: init.position[2] < KEEP_OUT_ZONE_M,
    holdTimerS: 0,
    activeThrust: [0, 0, 0],
    activeTorque: [0, 0, 0]
  };
}

export function sampleDeparture(state: DepartureState): DepartureSample {
  return {
    time: Number(state.time.toFixed(2)),
    distanceM: Number(state.position[2].toFixed(2)),
    backSpeedMs: Number(state.velocity[2].toFixed(3)),
    lateralOffsetM: Number(state.lateralOffsetM.toFixed(3)),
    attitudeErrorDeg: Number(state.attitudeErrorDeg.toFixed(2)),
    fuelPct: Number(state.fuelPct.toFixed(1))
  };
}

/**
 * Fixed-step 60 Hz space station departure physics integration and safety evaluation
 */
export function stepDeparture(
  state: DepartureState,
  cmd: DepartureCommand,
  scenario: DepartureScenarioConfig,
  dt = DEPARTURE_DT
): DepartureState {
  if (state.status !== 'flying') return state;

  const next: DepartureState = {
    ...state,
    position: [...state.position],
    velocity: [...state.velocity],
    attitudeDeg: [...state.attitudeDeg],
    angularVelDeg: [...state.angularVelDeg],
    activeThrust: [0, 0, 0],
    activeTorque: [0, 0, 0]
  };

  next.time += dt;

  // 1. Nosecone hatch toggle and smooth servo animation (~1.33s)
  if (cmd.toggleNosecone) {
    next.noseconeClosed = !next.noseconeClosed;
  }
  next.noseconeProgress = stepNoseconeServo(
    next.noseconeProgress,
    next.noseconeClosed,
    dt
  );

  // 2. Before releasing mechanical latches: ship remains docked, but firing forward/aft thrusters triggers plume contamination
  if (!next.latchesReleased) {
    if (Math.abs(cmd.translation[2]) > 0.1) {
      next.status = 'failed';
      next.failReason = 'plume_contamination';
      return next;
    }
    if (cmd.releaseLatches) {
      next.latchesReleased = true;
      next.velocity[2] = SPRING_PUSHOFF_VZ;
      // Scenario 4 simulates slight spring tip-off perturbation, testing pilot correction skills
      if (scenario.id === 4) {
        next.velocity[0] = 0.035;
        next.velocity[1] = -0.025;
        next.angularVelDeg[0] = 0.25;
        next.angularVelDeg[1] = -0.2;
      }
    } else {
      if (next.time >= scenario.maxTimeS) {
        next.status = 'failed';
        next.failReason = 'timeout';
      }
      return next;
    }
  }

  // 3. Plume Keep-Out Zone check (firing axial main thrusters prohibited within 0 ~ 5.0m)
  const inKeepOut = next.position[2] < KEEP_OUT_ZONE_M;
  next.inKeepOutZone = inKeepOut;
  if (inKeepOut && Math.abs(cmd.translation[2]) > 0.1) {
    next.activeThrust[2] = cmd.translation[2];
    next.status = 'failed';
    next.failReason = 'plume_contamination';
    return next;
  }

  // 4. Compute translation and rotation commands (supports Key B assist damping)
  const txInput: Vec3 = [
    clamp(cmd.translation[0], -1, 1),
    clamp(cmd.translation[1], -1, 1),
    clamp(cmd.translation[2], -1, 1)
  ];
  const rotInput: Vec3 = [
    clamp(cmd.rotation[0], -1, 1),
    clamp(cmd.rotation[1], -1, 1),
    clamp(cmd.rotation[2], -1, 1)
  ];

  if (cmd.assistBrake) {
    // Assist damping: cancel lateral drift and angular rates (without axial firing in keep-out zone)
    if (Math.abs(txInput[0]) < 0.05 && Math.abs(next.velocity[0]) > 0.005) {
      txInput[0] = clamp(-next.velocity[0] * 6, -1, 1);
    }
    if (Math.abs(txInput[1]) < 0.05 && Math.abs(next.velocity[1]) > 0.005) {
      txInput[1] = clamp(-next.velocity[1] * 6, -1, 1);
    }
    if (!inKeepOut && Math.abs(txInput[2]) < 0.05 && Math.abs(next.velocity[2]) > 0.005) {
      txInput[2] = clamp(-next.velocity[2] * 4, -1, 1);
    }
    for (let i = 0; i < 3; i++) {
      if (Math.abs(rotInput[i]) < 0.05) {
        const rateTerm = -next.angularVelDeg[i] * 0.9;
        const angleTerm = -next.attitudeDeg[i] * 0.35;
        rotInput[i] = clamp(rateTerm + angleTerm, -1, 1);
      }
    }
  }

  const hasFuel = next.fuelPct > 0.01;
  const effTx: Vec3 = hasFuel ? txInput : [0, 0, 0];
  const effRot: Vec3 = hasFuel ? rotInput : [0, 0, 0];

  next.activeThrust = effTx;
  next.activeTorque = effRot;

  // Propellant consumption
  const thrustEffort =
    Math.abs(effTx[0]) +
    Math.abs(effTx[1]) +
    Math.abs(effTx[2]) +
    0.35 * (Math.abs(effRot[0]) + Math.abs(effRot[1]) + Math.abs(effRot[2]));
  next.fuelPct = Math.max(0, next.fuelPct - thrustEffort * 0.65 * dt);

  // 5. Semi-implicit Euler integration for velocity and position
  for (let i = 0; i < 3; i++) {
    next.velocity[i] += effTx[i] * TRANS_ACCEL * dt;
    next.position[i] += next.velocity[i] * dt;

    next.angularVelDeg[i] += effRot[i] * ROT_ACCEL_DEG * dt;
    next.attitudeDeg[i] += next.angularVelDeg[i] * dt;
  }

  // 6. Update corridor and geometric telemetry
  next.inKeepOutZone = next.position[2] < KEEP_OUT_ZONE_M;
  next.corridorRadiusM = computeCorridorRadius(next.position[2]);
  next.lateralOffsetM = Math.hypot(next.position[0], next.position[1]);
  next.lateralSpeedMs = Math.hypot(next.velocity[0], next.velocity[1]);
  next.attitudeErrorDeg = Math.hypot(
    next.attitudeDeg[0],
    next.attitudeDeg[1],
    next.attitudeDeg[2]
  );
  const angRate = Math.hypot(
    next.angularVelDeg[0],
    next.angularVelDeg[1],
    next.angularVelDeg[2]
  );

  // 7. Safety boundary failure evaluation
  if (next.position[2] < 0.22) {
    next.status = 'failed';
    next.failReason = 'station_collision';
    return next;
  }
  if (next.lateralOffsetM > next.corridorRadiusM) {
    next.status = 'failed';
    next.failReason = 'corridor_breach';
    return next;
  }
  if (next.attitudeErrorDeg > 25) {
    next.status = 'failed';
    next.failReason = 'attitude_lost';
    return next;
  }
  if (Math.hypot(next.velocity[0], next.velocity[1], next.velocity[2]) > 1.8) {
    next.status = 'failed';
    next.failReason = 'overspeed';
    return next;
  }

  // 8. Scenario victory condition checks
  const z = next.position[2];
  const vz = next.velocity[2];

  if (scenario.id === 1) {
    // Scenario 1: Brake to rest (|vz| <= 0.06 m/s) at 11.0 ~ 14.0m waypoint and hold 1.5s
    const inZone = z >= 11.0 && z <= 14.0 && Math.abs(vz) <= 0.06 && next.lateralOffsetM <= 0.4;
    next.holdTimerS = inZone ? next.holdTimerS + dt : 0;
    if (next.holdTimerS >= 1.5) {
      next.status = 'success';
      return next;
    }
  } else if (scenario.id === 2) {
    // Scenario 2: Cancel lateral drift and retreat past z >= 18m
    const ok =
      z >= 18.0 &&
      next.lateralOffsetM <= 0.25 &&
      next.lateralSpeedMs <= 0.04 &&
      vz >= 0.05 &&
      vz <= 0.8;
    next.holdTimerS = ok ? next.holdTimerS + dt : 0;
    if (next.holdTimerS >= 0.5) {
      next.status = 'success';
      return next;
    }
  } else if (scenario.id === 3) {
    // Scenario 3: Align attitude (error <= 2.0°, rate <= 0.4°/s) and retreat past z >= 24m
    const ok =
      z >= 24.0 &&
      next.attitudeErrorDeg <= 2.0 &&
      angRate <= 0.4 &&
      next.lateralOffsetM <= 0.45;
    next.holdTimerS = ok ? next.holdTimerS + dt : 0;
    if (next.holdTimerS >= 0.5) {
      next.status = 'success';
      return next;
    }
  } else if (scenario.id === 4) {
    // Scenario 4: Full departure past z >= 32m, close nosecone (noseconeClosed && progress >= 0.95), nominal attitude and offset
    const ok =
      z >= 32.0 &&
      next.noseconeClosed &&
      next.noseconeProgress >= 0.95 &&
      next.attitudeErrorDeg <= 2.5 &&
      next.lateralOffsetM <= 0.6 &&
      vz >= 0.05 &&
      vz <= 1.2;
    next.holdTimerS = ok ? next.holdTimerS + dt : 0;
    if (next.holdTimerS >= 0.4) {
      next.status = 'success';
      return next;
    }
  }

  if (next.time >= scenario.maxTimeS) {
    next.status = 'failed';
    next.failReason = 'timeout';
  }

  return next;
}

/**
 * Deterministic departure autopilot (Autopilot for Demo & Headless Verification)
 */
export function departureAutopilot(
  state: DepartureState,
  scenario: DepartureScenarioConfig
): DepartureCommand {
  const cmd = emptyDepartureCommand();

  if (!state.latchesReleased) {
    cmd.releaseLatches = true;
    return cmd;
  }

  // 1. Lateral position and velocity PD control
  const kx = 1.6;
  const kvx = 5.2;
  cmd.translation[0] = clamp(-state.position[0] * kx - state.velocity[0] * kvx, -1, 1);
  cmd.translation[1] = clamp(-state.position[1] * kx - state.velocity[1] * kvx, -1, 1);

  // 2. 3-axis attitude PD control
  for (let i = 0; i < 3; i++) {
    cmd.rotation[i] = clamp(
      -state.attitudeDeg[i] * 0.45 - state.angularVelDeg[i] * 0.95,
      -1,
      1
    );
  }

  // 3. Axial thrust control (strictly respects 0~5m Plume Keep-Out Zone!)
  const z = state.position[2];
  const vz = state.velocity[2];

  if (z < KEEP_OUT_ZONE_M + 0.15) {
    cmd.translation[2] = 0;
  } else if (scenario.id === 1) {
    const targetZ = 12.2;
    const distErr = targetZ - z;
    const desiredVz = clamp(distErr * 0.28, -0.35, 0.45);
    cmd.translation[2] = clamp((desiredVz - vz) * 5.0, -1, 1);
  } else if (scenario.id === 2) {
    const desiredVz = 0.42;
    cmd.translation[2] = clamp((desiredVz - vz) * 3.5, -1, 1);
  } else if (scenario.id === 3) {
    const desiredVz = 0.48;
    cmd.translation[2] = clamp((desiredVz - vz) * 3.5, -1, 1);
  } else {
    // Scenario 4: Accelerate retreat past 5m, close nosecone hatch past 30m
    const desiredVz = z < 31 ? 0.68 : 0.35;
    cmd.translation[2] = clamp((desiredVz - vz) * 3.5, -1, 1);
    if (z >= 30.5 && !state.noseconeClosed) {
      cmd.toggleNosecone = true;
    }
  }

  return cmd;
}
