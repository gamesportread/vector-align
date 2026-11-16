import {
  computeDragCoefficient,
  computeDynamicPressure,
  KARMAN_LINE_ALTITUDE_M,
  sampleAtmosphere
} from './atmosphere';
import {
  atmosphereVelocityAtPosition,
  computeOrbitalElements,
  EARTH_MU,
  EARTH_RADIUS_M,
  gravityVector,
  localHorizonBasis,
  STANDARD_GRAVITY_MS2
} from './orbit';
import type {
  AscentPhase,
  LiftoffCommand,
  LiftoffConsequence,
  LiftoffFailure,
  LiftoffSample,
  LiftoffScenarioConfig,
  LiftoffState,
  RocketVehicleConfig,
  StageRuntimeState,
  Vec2
} from './types';
import { getRocketVehicle } from './vehicles';

/** Fixed physics step 60 Hz (s) */
export const LIFTOFF_DT = 1 / 60;

/** Launch tower clearance height (m) */
export const LAUNCH_TOWER_HEIGHT_M = 150;

const DEG_TO_RAD = Math.PI / 180;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function ascentWindEastMs(altitudeM: number, timeS: number, seed: number): number {
  const towerFade = clamp((altitudeM - LAUNCH_TOWER_HEIGHT_M) / 650, 0, 1);
  const atmosphereFade = clamp((40000 - altitudeM) / 24000, 0, 1);
  const phase = seed * Math.PI * 2;
  const layers = 4.5 * Math.sin(altitudeM / 1850 + phase) + 2.5 * Math.sin(altitudeM / 4400 - phase);
  const gusts = 3.6 * Math.sin(timeS * 0.62 + phase * 3) +
    1.4 * Math.sin(timeS * 1.24 + altitudeM / 950 + phase);
  return (layers + gusts) * towerFade * atmosphereFade;
}

export function emptyLiftoffCommand(
  throttle = 0,
  sasMode: LiftoffCommand['sasMode'] = 'hold'
): LiftoffCommand {
  return {
    throttle,
    pitchInput: 0,
    sasMode,
    triggerStage: false,
    jettisonTower: false
  };
}

/**
 * Compute instantaneous total mass (kg) of remaining stages + LES + payload
 */
export function computeTotalMassKg(
  stages: StageRuntimeState[],
  activeStageIndex: number,
  vehicle: RocketVehicleConfig,
  towerJettisoned: boolean
): number {
  let mass = vehicle.payloadMassKg;
  if (!towerJettisoned) {
    mass += vehicle.launchEscapeTowerMassKg;
  }
  for (let i = activeStageIndex; i < stages.length; i++) {
    const st = stages[i];
    if (!st.separated) {
      mass += st.dryMassKg + st.fuelMassKg;
    }
  }
  return mass;
}

/**
 * Determine current ascent phase (AscentPhase) based on altitude, stage index, and orbit stability
 */
export function determineAscentPhase(
  altitudeM: number,
  clampsReleased: boolean,
  activeStageIndex: number,
  isOrbitStable: boolean
): AscentPhase {
  if (!clampsReleased) return 'prelaunch';
  if (isOrbitStable) return 'orbit_achieved';
  if (altitudeM < LAUNCH_TOWER_HEIGHT_M) return 'tower_clear';
  if (altitudeM < 3000) return 'pitch_over';
  if (altitudeM < 42000 && activeStageIndex === 0) return 'gravity_turn';
  if (activeStageIndex === 0) return 'upper_atmosphere';
  if (altitudeM < 155000 && activeStageIndex === 1) return 'stage2_ascent';
  return 'orbital_insertion';
}

/**
 * Compute reference recommended pitch angle (degrees) based on standard NASA gravity turn profile
 */
export function computeReferencePitchDeg(altitudeM: number, apoapsisM: number, verticalSpeedMs: number): number {
  if (altitudeM < LAUNCH_TOWER_HEIGHT_M) {
    return 90;
  }
  if (altitudeM < 2500) {
    // 150 m ~ 2.5 km: smooth initial pitch-over maneuver 90° -> 78°
    const t = (altitudeM - LAUNCH_TOWER_HEIGHT_M) / (2500 - LAUNCH_TOWER_HEIGHT_M);
    return 90 - 12 * t;
  }
  if (altitudeM < 65000) {
    // 2.5 km ~ 65 km: atmospheric gravity turn profile 78° -> 26°
    const norm = (altitudeM - 2500) / (65000 - 2500);
    return 78 - 52 * Math.pow(norm, 0.72);
  }
  // High altitude (> 65 km) & orbital insertion: Powered Explicit Guidance (PEG Kinematic Law)
  const targetAlt = 184000;
  const altErr = targetAlt - altitudeM;
  const desiredVertSpeed =
    altErr >= 0
      ? Math.sqrt(2 * 3.8 * altErr)
      : -Math.sqrt(2 * 1.5 * Math.abs(altErr));
  const vertSpeedErr = desiredVertSpeed - verticalSpeedMs;
  const basePitch = altitudeM < 135000 && apoapsisM < 178000 ? 20 : 2;
  return clamp(basePitch + vertSpeedErr * 0.14, 0, 38);
}

/**
 * Initialize rocket liftoff physics state according to scenario configuration
 */
export function createLiftoffState(
  scenario: LiftoffScenarioConfig,
  vehicleOverride?: RocketVehicleConfig,
  windSeed = 0
): LiftoffState {
  const vehicle = vehicleOverride ?? getRocketVehicle(scenario.vehicleId);
  const init = scenario.initialState;

  const stages: StageRuntimeState[] = vehicle.stages.map((st, idx) => {
    const frac = clamp(init.stageFuelFractions[idx] ?? 1, 0, 1);
    const separated = idx < init.activeStageIndex;
    return {
      stageNumber: st.stageNumber,
      code: st.code,
      dryMassKg: st.dryMassKg,
      fuelMassKg: separated ? 0 : st.fuelMassKg * frac,
      maxFuelMassKg: st.fuelMassKg,
      separated
    };
  });

  // Compute geocentric inertial position [x, y] from initial altitude and downrange arc
  const r = EARTH_RADIUS_M + init.altitudeM;
  const centralAngleRad = init.downrangeM / EARTH_RADIUS_M;
  const position: Vec2 = [r * Math.sin(centralAngleRad), r * Math.cos(centralAngleRad)];

  // Add Earth surface rotation speed to local horizontal speed to obtain geocentric inertial velocity
  const { up, east } = localHorizonBasis(position);
  const vAtm = atmosphereVelocityAtPosition(position, vehicle.launchLatitudeDeg);
  const velocity: Vec2 = [
    vAtm[0] + up[0] * init.verticalSpeedMs + east[0] * init.horizontalSpeedMs,
    vAtm[1] + up[1] * init.verticalSpeedMs + east[1] * init.horizontalSpeedMs
  ];

  const totalMassKg = computeTotalMassKg(stages, init.activeStageIndex, vehicle, init.towerJettisoned);
  const atm = sampleAtmosphere(init.altitudeM);
  const orbit = computeOrbitalElements(position, velocity, vehicle.launchLatitudeDeg);

  const activeStageCfg = vehicle.stages[init.activeStageIndex] ?? vehicle.stages[0];
  const activeStageRuntime = stages[init.activeStageIndex] ?? stages[0];
  const hasFuel = activeStageRuntime.fuelMassKg > 0.1;
  const effThrottle = hasFuel ? clamp(init.throttle, 0, 1) : 0;

  const thrustN =
    effThrottle > 0
      ? effThrottle *
        (activeStageCfg.thrustVacuumN -
          (activeStageCfg.thrustVacuumN - activeStageCfg.thrustSeaLevelN) * atm.pressureRatio)
      : 0;

  const effectiveIspS =
    activeStageCfg.ispVacuumS -
    (activeStageCfg.ispVacuumS - activeStageCfg.ispSeaLevelS) * atm.pressureRatio;

  const localG = Math.hypot(...gravityVector(position));
  const twr = totalMassKg > 0 ? thrustN / (totalMassKg * localG) : 0;
  const dynamicPressurePa = computeDynamicPressure(atm.densityKgM3, orbit.surfaceSpeedMs);
  const mach = atm.speedOfSoundMs > 0 ? orbit.surfaceSpeedMs / atm.speedOfSoundMs : 0;
  const aoaDeg = orbit.surfaceSpeedMs > 5 ? init.pitchDeg - orbit.surfaceProgradeDeg : 0;
  const cd = computeDragCoefficient(mach, aoaDeg);
  const dragForceN = dynamicPressurePa * activeStageCfg.referenceAreaM2 * cd;
  const qAlphaKpaDeg = (dynamicPressurePa / 1000) * Math.abs(aoaDeg);

  const gLoad =
    !init.clampsReleased && twr <= 1
      ? 1.0
      : Math.max(0, (thrustN + dragForceN) / (totalMassKg * STANDARD_GRAVITY_MS2));

  return {
    time: init.initialTimeS,
    airborneTimeS: 0,
    status: 'ready',
    phase: determineAscentPhase(
      init.altitudeM,
      init.clampsReleased,
      init.activeStageIndex,
      orbit.isOrbitStable
    ),
    position,
    velocity,
    pitchDeg: init.pitchDeg,
    pitchRateDegS: 0,
    windSeed,
    windEastMs: 0,
    activeStageIndex: init.activeStageIndex,
    stages,
    clampsReleased: init.clampsReleased,
    towerJettisoned: init.towerJettisoned,
    throttle: effThrottle,
    sasMode: init.sasMode,
    totalMassKg,
    thrustN,
    effectiveIspS,
    twr,
    gLoad,
    dynamicPressurePa,
    maxQRecordedPa: dynamicPressurePa,
    passedMaxQ: init.altitudeM > 18000,
    mach,
    aoaDeg,
    qAlphaKpaDeg,
    dragForceN,
    orbit,
    stagingCoastTimerS: 0,
    holdTimerS: 0,
    consequence: 'none',
    maxAltitudeM: init.altitudeM
  };
}

/**
 * Execute stage separation or launch clamp release logic
 */
export function stageRocket(
  state: LiftoffState,
  vehicle: RocketVehicleConfig
): { nextState: LiftoffState; failure?: LiftoffFailure } {
  const next: LiftoffState = structuredClone(state);

  // Case 1: Still on launch pad with clamps engaged -> Release hold-down clamps
  if (!next.clampsReleased) {
    next.clampsReleased = true;
    // If TWR < 1.0 when releasing clamps, rocket cannot overcome weight, fall back onto pad
    if (next.twr < 1.0) {
      return { nextState: next, failure: 'pad_fallback' };
    }
    return { nextState: next };
  }

  // Case 2: Airborne -> Execute stage separation (Staging)
  const currentIdx = next.activeStageIndex;
  if (currentIdx >= next.stages.length - 1) {
    // Already at final stage, cannot separate further
    return { nextState: next };
  }

  const currentStage = next.stages[currentIdx];
  const remainingFuelFrac =
    currentStage.maxFuelMassKg > 0 ? currentStage.fuelMassKg / currentStage.maxFuelMassKg : 0;

  // If current stage has > 5% fuel and firing under thrust, premature separation causes collision
  if (remainingFuelFrac > 0.05 && next.throttle > 0.1) {
    return { nextState: next, failure: 'premature_staging' };
  }

  // Jettison current stage and activate next stage
  currentStage.separated = true;
  currentStage.fuelMassKg = 0;
  next.activeStageIndex = currentIdx + 1;
  next.stagingCoastTimerS = 0;

  // Recalculate total stack mass after jettisoning spent stage
  next.totalMassKg = computeTotalMassKg(
    next.stages,
    next.activeStageIndex,
    vehicle,
    next.towerJettisoned
  );

  return { nextState: next };
}

/**
 * Classify surface impact location (pad apron, coastal/inland land, or Atlantic ocean east of shoreline).
 * Shoreline at Kennedy Space Center LC-39A (~1,500 m east in 3D Cape terrain); negative downrange is inland west.
 */
function classifySurfaceImpact(maxAltitudeM: number, downrangeM: number): LiftoffConsequence {
  if (maxAltitudeM < 160 || Math.abs(downrangeM) < 350) {
    return 'crashed_pad';
  }
  return downrangeM >= 1500 ? 'crashed_ocean' : 'crashed_land';
}

/**
 * Failure dynamics engine:
 * Simulates breakup explosion debris, thrust cutoff stall & crash onto pad, land, or ocean, or space drift
 */
export function stepLiftoffFailedAftermath(
  state: LiftoffState,
  vehicle: RocketVehicleConfig,
  dt: number
): LiftoffState {
  const s: LiftoffState = structuredClone(state);
  s.time += dt;

  // Cut thrust and lose power
  s.throttle = 0;
  s.thrustN = 0;
  s.twr = 0;

  const { r } = localHorizonBasis(s.position);
  const altitudeM = Math.max(0, r - EARTH_RADIUS_M);
  s.maxAltitudeM = Math.max(s.maxAltitudeM ?? 0, altitudeM);

  const consequence = s.consequence ?? 'falling';

  // 1. If already impacted pad, land, or ocean, maintain static wreckage state
  if (consequence === 'crashed_pad' || consequence === 'crashed_land' || consequence === 'crashed_ocean') {
    s.position = [
      (s.position[0] / Math.hypot(...s.position)) * EARTH_RADIUS_M,
      (s.position[1] / Math.hypot(...s.position)) * EARTH_RADIUS_M
    ];
    s.velocity = [0, 0];
    s.gLoad = 1.0;
    s.orbit = computeOrbitalElements(
      s.position,
      s.velocity,
      vehicle.launchLatitudeDeg,
      s.airborneTimeS ?? 0
    );
    return s;
  }

  if (s.clampsReleased) {
    s.airborneTimeS = (s.airborneTimeS ?? 0) + dt;
  }

  const atm = sampleAtmosphere(altitudeM);
  const gVec = gravityVector(s.position);

  // 2. Cold space drift (drifting_space)
  if (consequence === 'drifting_space') {
    const vAtm = atmosphereVelocityAtPosition(s.position, vehicle.launchLatitudeDeg);
    const vSurf: Vec2 = [s.velocity[0] - vAtm[0], s.velocity[1] - vAtm[1]];
    const surfSpeed = Math.hypot(vSurf[0], vSurf[1]);
    const dynP = computeDynamicPressure(atm.densityKgM3, surfSpeed);
    const activeStageCfg = vehicle.stages[s.activeStageIndex] ?? vehicle.stages[0];
    const dragForceN = dynP * activeStageCfg.referenceAreaM2 * 1.2;
    const dragDir: Vec2 = surfSpeed > 1e-3 ? [-vSurf[0] / surfSpeed, -vSurf[1] / surfSpeed] : [0, 0];

    const ax = (dragDir[0] * dragForceN) / s.totalMassKg + gVec[0];
    const ay = (dragDir[1] * dragForceN) / s.totalMassKg + gVec[1];

    s.velocity = [s.velocity[0] + ax * dt, s.velocity[1] + ay * dt];
    s.position = [s.position[0] + s.velocity[0] * dt, s.position[1] + s.velocity[1] * dt];
    s.pitchDeg = (s.pitchDeg + 3.2 * dt) % 360;
    s.pitchRateDegS = 3.2;

    s.orbit = computeOrbitalElements(
      s.position,
      s.velocity,
      vehicle.launchLatitudeDeg,
      s.airborneTimeS ?? 0
    );
    if (s.orbit.altitudeM < 65000 && s.orbit.verticalSpeedMs < -15) {
      s.consequence = 'falling';
    }
    return s;
  }

  // 3. Breakup debris (exploding) or gravity fall (falling)
  s.pitchRateDegS += (Math.sin(s.time * 2.8) * 14 - s.pitchRateDegS * 0.15) * dt;
  s.pitchDeg = (s.pitchDeg + s.pitchRateDegS * dt) % 360;

  const vAtm = atmosphereVelocityAtPosition(s.position, vehicle.launchLatitudeDeg);
  const vSurf: Vec2 = [s.velocity[0] - vAtm[0], s.velocity[1] - vAtm[1]];
  const surfSpeed = Math.hypot(vSurf[0], vSurf[1]);
  const dynP = computeDynamicPressure(atm.densityKgM3, surfSpeed);
  const cd = consequence === 'exploding' ? 1.4 : 1.05;
  const activeStageCfg = vehicle.stages[s.activeStageIndex] ?? vehicle.stages[0];
  const dragForceN = dynP * activeStageCfg.referenceAreaM2 * cd;
  const dragDir: Vec2 = surfSpeed > 1e-3 ? [-vSurf[0] / surfSpeed, -vSurf[1] / surfSpeed] : [0, 0];

  const ax = (dragDir[0] * dragForceN) / s.totalMassKg + gVec[0];
  const ay = (dragDir[1] * dragForceN) / s.totalMassKg + gVec[1];

  s.velocity = [s.velocity[0] + ax * dt, s.velocity[1] + ay * dt];
  s.position = [s.position[0] + s.velocity[0] * dt, s.position[1] + s.velocity[1] * dt];
  s.orbit = computeOrbitalElements(
    s.position,
    s.velocity,
    vehicle.launchLatitudeDeg,
    s.airborneTimeS ?? 0
  );

  // Surface, land, or ocean impact check
  if (s.orbit.altitudeM <= 0) {
    s.position = [
      (s.position[0] / Math.hypot(...s.position)) * EARTH_RADIUS_M,
      (s.position[1] / Math.hypot(...s.position)) * EARTH_RADIUS_M
    ];
    s.velocity = [0, 0];
    s.gLoad = 1.0;
    s.consequence = classifySurfaceImpact(s.maxAltitudeM ?? 0, s.orbit.downrangeM);
  }

  return s;
}

/**
 * Single fixed-step (1/60 s) rocket liftoff physics integrator
 */
export function stepLiftoff(
  state: LiftoffState,
  command: LiftoffCommand,
  scenario: LiftoffScenarioConfig,
  dt = LIFTOFF_DT,
  vehicleOverride?: RocketVehicleConfig
): LiftoffState {
  const vehicle = vehicleOverride ?? getRocketVehicle(scenario.vehicleId);

  // Post-failure continuous dynamic simulation (breakup, fall, crash, drift)
  if (state.status === 'failed') {
    return stepLiftoffFailedAftermath(state, vehicle, dt);
  }

  if (state.status !== 'flying') {
    return state;
  }

  let s: LiftoffState = structuredClone(state);
  s.time += dt;

  // 1. Sync throttle and SAS mode
  s.throttle = clamp(command.throttle, 0, 1);
  s.sasMode = command.sasMode;

  // 2. Process Launch Escape System (LES) jettison command
  if (command.jettisonTower && !s.towerJettisoned && s.clampsReleased) {
    s.towerJettisoned = true;
  }

  // 3. Compute ambient atmospheric and gravitational parameters
  const { r, up, east } = localHorizonBasis(s.position);
  const altitudeM = Math.max(0, r - EARTH_RADIUS_M);
  s.maxAltitudeM = Math.max(s.maxAltitudeM ?? 0, altitudeM);
  const atm = sampleAtmosphere(altitudeM);
  const gVec = gravityVector(s.position);
  const localGMag = Math.hypot(gVec[0], gVec[1]);

  // 4. Compute active stage thrust and TWR (for launch clamp release check)
  let activeStageCfg = vehicle.stages[s.activeStageIndex] ?? vehicle.stages[vehicle.stages.length - 1];
  let activeStage = s.stages[s.activeStageIndex];
  s.totalMassKg = computeTotalMassKg(s.stages, s.activeStageIndex, vehicle, s.towerJettisoned);

  const computeStageThrust = (stageCfg: typeof activeStageCfg, stageState: StageRuntimeState, thr: number) => {
    if (stageState.fuelMassKg <= 0.01 || thr <= 0.001) {
      return { thrustN: 0, ispS: stageCfg.ispVacuumS, mDotKgS: 0 };
    }
    const clampedThr = clamp(thr, stageCfg.minThrottle * 0.5, 1);
    const ispS =
      stageCfg.ispVacuumS - (stageCfg.ispVacuumS - stageCfg.ispSeaLevelS) * atm.pressureRatio;
    const maxThrustAtAlt =
      stageCfg.thrustVacuumN -
      (stageCfg.thrustVacuumN - stageCfg.thrustSeaLevelN) * atm.pressureRatio;
    const thrustN = clampedThr * maxThrustAtAlt;
    const mDotKgS =
      (clampedThr * stageCfg.thrustVacuumN) / (stageCfg.ispVacuumS * STANDARD_GRAVITY_MS2);
    return { thrustN, ispS, mDotKgS };
  };

  let prop = computeStageThrust(activeStageCfg, activeStage, s.throttle);
  s.thrustN = prop.thrustN;
  s.effectiveIspS = prop.ispS;
  s.twr = s.totalMassKg > 0 ? s.thrustN / (s.totalMassKg * localGMag) : 0;

  // 5. Handle stage separation or clamp release command
  if (command.triggerStage) {
    const staged = stageRocket(s, vehicle);
    s = staged.nextState;
    if (staged.failure) {
      s.status = 'failed';
      s.reason = staged.failure;
      s.failureTime = s.time;
      s.consequence = staged.failure === 'pad_fallback' ? 'crashed_pad' : 'exploding';
      return s;
    }
    activeStageCfg = vehicle.stages[s.activeStageIndex] ?? vehicle.stages[vehicle.stages.length - 1];
    activeStage = s.stages[s.activeStageIndex];
    prop = computeStageThrust(activeStageCfg, activeStage, s.throttle);
    s.thrustN = prop.thrustN;
    s.effectiveIspS = prop.ispS;
    s.twr = s.totalMassKg > 0 ? s.thrustN / (s.totalMassKg * localGMag) : 0;
  }

  // 6. If clamps not released, vehicle is held down, consuming small ignition buildup fuel
  if (!s.clampsReleased) {
    if (prop.mDotKgS > 0) {
      activeStage.fuelMassKg = Math.max(0, activeStage.fuelMassKg - prop.mDotKgS * dt * 0.15);
      s.totalMassKg = computeTotalMassKg(s.stages, s.activeStageIndex, vehicle, s.towerJettisoned);
      s.twr = s.totalMassKg > 0 ? s.thrustN / (s.totalMassKg * localGMag) : 0;
    }
    s.gLoad = 1.0;
    if (s.time >= scenario.targets.maxTimeS) {
      s.status = 'failed';
      s.reason = 'timeout';
      s.failureTime = s.time;
      s.consequence = 'crashed_pad';
    }
    return s;
  }

  // 7. Variable-mass propellant depletion integration
  let effectiveDtThrust = dt;
  if (activeStage.fuelMassKg > 0 && prop.mDotKgS > 0) {
    const fuelBurned = prop.mDotKgS * dt;
    if (fuelBurned >= activeStage.fuelMassKg) {
      effectiveDtThrust = activeStage.fuelMassKg / prop.mDotKgS;
      activeStage.fuelMassKg = 0;
    } else {
      activeStage.fuelMassKg -= fuelBurned;
    }
  } else {
    s.thrustN = 0;
    s.twr = 0;
  }

  // Coast timer after Stage 1 burnout (MECO) before separation
  if (s.activeStageIndex === 0 && activeStage.fuelMassKg <= 0.01) {
    s.stagingCoastTimerS += dt;
    if (s.stagingCoastTimerS > 28) {
      s.status = 'failed';
      s.reason = 'late_staging';
      s.failureTime = s.time;
      s.consequence = 'falling';
      return s;
    }
  } else {
    s.stagingCoastTimerS = 0;
  }

  s.totalMassKg = computeTotalMassKg(s.stages, s.activeStageIndex, vehicle, s.towerJettisoned);

  // Use air-relative speed for aerodynamic loads while orbital telemetry stays ground-relative.
  s.windEastMs = ascentWindEastMs(altitudeM, s.time, s.windSeed ?? 0);
  const vAtm = atmosphereVelocityAtPosition(s.position, vehicle.launchLatitudeDeg);
  const vAir: Vec2 = [
    s.velocity[0] - vAtm[0] - east[0] * s.windEastMs,
    s.velocity[1] - vAtm[1] - east[1] * s.windEastMs
  ];
  const airSpeed = Math.hypot(...vAir);
  s.dynamicPressurePa = computeDynamicPressure(atm.densityKgM3, airSpeed);

  // 8. Pitch attitude dynamics (Pitch Attitude & Gimbal / SAS Control)
  const maxTurnRateDegS = 9.5; // Maximum allowable safe pitch angular rate for gimbaled rocket
  if (Math.abs(command.pitchInput) > 0.01) {
    // Manual pilot input takes priority
    const targetRate = clamp(command.pitchInput, -1, 1) * maxTurnRateDegS;
    s.pitchRateDegS += (targetRate - s.pitchRateDegS) * Math.min(1, dt * 6);
  } else if (s.sasMode === 'prograde') {
    const targetAngle =
      altitudeM < 70000 ? s.orbit.surfaceProgradeDeg : s.orbit.orbitalProgradeDeg;
    const clampedTarget = altitudeM < LAUNCH_TOWER_HEIGHT_M ? 90 : clamp(targetAngle, -5, 90);
    const err = clampedTarget - s.pitchDeg;
    s.pitchRateDegS = clamp(err * 1.8, -maxTurnRateDegS * 0.65, maxTurnRateDegS * 0.65);
  } else if (s.sasMode === 'pitch_program') {
    const refPitch = computeReferencePitchDeg(
      altitudeM,
      s.orbit.apoapsisM,
      s.orbit.verticalSpeedMs
    );
    const err = refPitch - s.pitchDeg;
    s.pitchRateDegS = clamp(err * 1.6, -maxTurnRateDegS * 0.6, maxTurnRateDegS * 0.6);
  } else if (s.sasMode === 'hold') {
    const holdTarget = command.targetPitchDeg ?? s.pitchDeg;
    const err = holdTarget - s.pitchDeg;
    s.pitchRateDegS = clamp(err * 2.0, -maxTurnRateDegS * 0.5, maxTurnRateDegS * 0.5);
  } else {
    // Damped pitch decay when manual keys released
    s.pitchRateDegS *= Math.max(0, 1 - dt * 3.5);
  }

  // Wind loads deflect the rocket in manual flight. SAS counters the deflection on subsequent steps.
  const pitchWindAcceleration = s.windEastMs * Math.sin(s.pitchDeg * DEG_TO_RAD) * 0.64 *
    Math.min(1, s.dynamicPressurePa / 2500);
  s.pitchRateDegS += pitchWindAcceleration * dt;
  s.pitchDeg = clamp(s.pitchDeg + s.pitchRateDegS * dt, -15, 95);

  // 9. Compute thrust vector, aerodynamic drag vector, and net gravity
  const pitchRad = s.pitchDeg * DEG_TO_RAD;
  // Vehicle thrust unit vector: sin(pitch) * Up + cos(pitch) * East
  const thrustDir: Vec2 = [
    up[0] * Math.sin(pitchRad) + east[0] * Math.cos(pitchRad),
    up[1] * Math.sin(pitchRad) + east[1] * Math.cos(pitchRad)
  ];

  if (s.dynamicPressurePa > s.maxQRecordedPa) {
    s.maxQRecordedPa = s.dynamicPressurePa;
  } else if (
    !s.passedMaxQ &&
    s.maxQRecordedPa > 15000 &&
    altitudeM > 11000 &&
    s.dynamicPressurePa < s.maxQRecordedPa * 0.88
  ) {
    s.passedMaxQ = true;
  }

  s.mach = atm.speedOfSoundMs > 0 ? airSpeed / atm.speedOfSoundMs : 0;

  // Compute Angle of Attack (AoA, aerodynamically significant when speed > 15 m/s)
  const airProgradeDeg =
    airSpeed > 1
      ? Math.atan2(
          vAir[0] * up[0] + vAir[1] * up[1],
          vAir[0] * east[0] + vAir[1] * east[1]
        ) *
        (180 / Math.PI)
      : 90;

  s.aoaDeg = airSpeed > 15 ? ((s.pitchDeg - airProgradeDeg + 540) % 360) - 180 : 0;
  s.qAlphaKpaDeg = (s.dynamicPressurePa / 1000) * Math.abs(s.aoaDeg);

  const cd = computeDragCoefficient(s.mach, s.aoaDeg);
  s.dragForceN = s.dynamicPressurePa * activeStageCfg.referenceAreaM2 * cd;

  const dragDir: Vec2 =
    airSpeed > 1e-3 ? [-vAir[0] / airSpeed, -vAir[1] / airSpeed] : [0, 0];

  // Average effective thrust (handles mid-frame propellant depletion)
  const avgThrustN = s.thrustN * (effectiveDtThrust / dt);

  // Apparent non-gravitational force (for G-load perceived by crew)
  const nonGravForceX = thrustDir[0] * avgThrustN + dragDir[0] * s.dragForceN;
  const nonGravForceY = thrustDir[1] * avgThrustN + dragDir[1] * s.dragForceN;
  s.gLoad = Math.hypot(nonGravForceX, nonGravForceY) / (s.totalMassKg * STANDARD_GRAVITY_MS2);

  // Total acceleration a = F_non_grav / m + g
  const ax = nonGravForceX / s.totalMassKg + gVec[0];
  const ay = nonGravForceY / s.totalMassKg + gVec[1];

  // Semi-implicit Euler integration
  s.velocity = [s.velocity[0] + ax * dt, s.velocity[1] + ay * dt];
  s.position = [s.position[0] + s.velocity[0] * dt, s.position[1] + s.velocity[1] * dt];
  s.airborneTimeS = (s.airborneTimeS ?? 0) + dt;

  // 10. Update Keplerian orbital elements and ascent phase
  s.orbit = computeOrbitalElements(
    s.position,
    s.velocity,
    vehicle.launchLatitudeDeg,
    s.airborneTimeS
  );
  s.twr = s.totalMassKg > 0 ? s.thrustN / (s.totalMassKg * localGMag) : 0;
  s.phase = determineAscentPhase(
    s.orbit.altitudeM,
    s.clampsReleased,
    s.activeStageIndex,
    s.orbit.isOrbitStable
  );

  // 11. Safety boundaries and failure conditions check
  // (a) Pad / surface impact check
  if (s.orbit.altitudeM <= 0) {
    s.position = [
      (s.position[0] / Math.hypot(...s.position)) * EARTH_RADIUS_M,
      (s.position[1] / Math.hypot(...s.position)) * EARTH_RADIUS_M
    ];
    s.velocity = [0, 0];
    s.status = 'failed';
    s.failureTime = s.time;
    // Categorize failure cause by maximum altitude reached in flight:
    // Failed to clear launch tower (< 160 m) -> Fall back onto pad (pad_fallback)
    // Stalled in lower/mid atmosphere (< 65 km) -> Low altitude flameout/crash (low_altitude_crash)
    // Reached high altitude but lacked horizontal speed (>= 65 km) -> Suborbital reentry (suborbital_reentry)
    if (s.maxAltitudeM < 160) {
      s.reason = 'pad_fallback';
      s.consequence = 'crashed_pad';
    } else if (s.maxAltitudeM < 65000) {
      s.reason = 'low_altitude_crash';
      s.consequence = classifySurfaceImpact(s.maxAltitudeM, s.orbit.downrangeM);
    } else {
      s.reason = 'suborbital_reentry';
      s.consequence = classifySurfaceImpact(s.maxAltitudeM, s.orbit.downrangeM);
    }
    return s;
  }

  // (b) Launch tower collision: pitch tilted > 12° (pitch < 78°) while below 150 m tower height
  if (s.orbit.altitudeM > 2 && s.orbit.altitudeM < LAUNCH_TOWER_HEIGHT_M && s.pitchDeg < 78) {
    s.status = 'failed';
    s.reason = 'tower_collision';
    s.failureTime = s.time;
    s.consequence = 'exploding';
    return s;
  }

  // (c) Max-Q aerodynamic bending overstress breakup (Q * |alpha| > maxQAlphaKpaDeg when q > 8 kPa)
  if (s.dynamicPressurePa > 8000 && s.qAlphaKpaDeg > vehicle.maxQAlphaKpaDeg) {
    s.status = 'failed';
    s.reason = 'aero_stress';
    s.failureTime = s.time;
    s.consequence = 'exploding';
    return s;
  }

  // (d) G-load limit exceeded
  if (s.gLoad > vehicle.maxGLoad) {
    s.status = 'failed';
    s.reason = 'over_g';
    s.failureTime = s.time;
    s.consequence = 'falling';
    return s;
  }

  // (e) Suborbital reentry check (reached > 100 km but fell below 65 km without reaching orbit)
  if (state.orbit.altitudeM >= 65000 && s.orbit.altitudeM < 65000 && s.orbit.verticalSpeedMs < -50) {
    s.status = 'failed';
    s.reason = 'suborbital_reentry';
    s.failureTime = s.time;
    s.consequence = 'falling';
    return s;
  }

  // 12. Scenario victory conditions check
  if (checkScenarioSuccess(s, scenario)) {
    s.status = 'success';
    s.throttle = 0;
    s.thrustN = 0;
    return s;
  }

  // (f) All propellant depleted without meeting target
  const lastStage = s.stages[s.stages.length - 1];
  if (s.activeStageIndex === s.stages.length - 1 && lastStage.fuelMassKg <= 0.01) {
    s.status = 'failed';
    s.reason =
      scenario.targets.requireOrbitStable && s.orbit.apoapsisM >= 150000
        ? 'orbit_eccentric'
        : 'fuel_exhausted';
    s.failureTime = s.time;
    if (s.orbit.altitudeM > 100000 && s.orbit.orbitalSpeedMs > 4000) {
      s.consequence = 'drifting_space';
    } else {
      s.consequence = 'falling';
    }
    return s;
  }

  // (g) Timeout check
  if (s.time - scenario.initialState.initialTimeS >= scenario.targets.maxTimeS) {
    s.status = 'failed';
    s.reason = 'timeout';
    s.failureTime = s.time;
    s.consequence = s.orbit.altitudeM > 100000 ? 'drifting_space' : 'falling';
    return s;
  }

  return s;
}

/**
 * Check whether current flight state satisfies scenario victory criteria
 */
export function checkScenarioSuccess(
  state: LiftoffState,
  scenario: LiftoffScenarioConfig
): boolean {
  const t = scenario.targets;

  if (t.minAltitudeM !== undefined && state.orbit.altitudeM < t.minAltitudeM) {
    return false;
  }
  if (t.minApoapsisM !== undefined && state.orbit.apoapsisM < t.minApoapsisM) {
    return false;
  }
  if (t.maxApoapsisM !== undefined && state.orbit.apoapsisM > t.maxApoapsisM) {
    return false;
  }
  if (t.minPeriapsisM !== undefined && state.orbit.periapsisM < t.minPeriapsisM) {
    return false;
  }
  if (t.maxEccentricity !== undefined && state.orbit.eccentricity > t.maxEccentricity) {
    return false;
  }
  if (t.targetPitchMinDeg !== undefined && state.pitchDeg < t.targetPitchMinDeg) {
    return false;
  }
  if (t.targetPitchMaxDeg !== undefined && state.pitchDeg > t.targetPitchMaxDeg) {
    return false;
  }
  if (t.requireStageIndex !== undefined && state.activeStageIndex < t.requireStageIndex) {
    return false;
  }
  if (t.requireTowerJettison && !state.towerJettisoned) {
    return false;
  }
  if (t.requireOrbitStable && !state.orbit.isOrbitStable) {
    return false;
  }

  // Scenario 1 extra check for sufficient speed
  if (scenario.id === 1 && state.orbit.surfaceSpeedMs < 200) {
    return false;
  }

  return true;
}

/** Pitch (deg) that drives vertical speed toward a gentle altitude-hold profile around targetAltM. */
export function circularizationPitchDeg(
  state: LiftoffState,
  vehicle: RocketVehicleConfig,
  throttle: number,
  targetAltM: number
): number {
  const alt = state.orbit.altitudeM;
  const r = EARTH_RADIUS_M + alt;
  const vz = state.orbit.verticalSpeedMs;
  const vh = state.orbit.horizontalSpeedMs;
  const stage = vehicle.stages[state.activeStageIndex];
  const thrust = state.thrustN > 0 ? state.thrustN : (stage?.thrustVacuumN ?? 0) * throttle;
  const accel = state.totalMassKg > 0 ? thrust / state.totalMassKg : 0;
  const desiredVz = clamp((targetAltM - alt) * 0.012, -60, 200);
  if (accel <= 0.05) return 0;
  const neededVerticalAccel = (desiredVz - vz) / 25 + EARTH_MU / (r * r) - (vh * vh) / r;
  const sinPitch = clamp(neededVerticalAccel / accel, -0.6, 0.6);
  return clamp((Math.asin(sinPitch) * 180) / Math.PI, -35, 25);
}

/**
 * Deterministic autopilot / demonstration controller
 * Uses identical control interface to automate ignition, gravity turn, Max-Q throttling, staging, and orbit insertion
 */
export function liftoffAutopilot(
  state: LiftoffState,
  scenario: LiftoffScenarioConfig,
  vehicleOverride?: RocketVehicleConfig
): LiftoffCommand {
  const vehicle = vehicleOverride ?? getRocketVehicle(scenario.vehicleId);
  const cmd = emptyLiftoffCommand(1.0, 'pitch_program');

  // 1. Pad release: throttle to 100% to build thrust (hold 2.6s water deluge in full launch mode), then release clamps
  if (!state.clampsReleased) {
    cmd.throttle = 1.0;
    cmd.sasMode = 'hold';
    cmd.targetPitchDeg = 90;
    const minHoldS = scenario.id === 4 ? 2.6 : 0;
    if (state.twr >= 1.12 && state.time - scenario.initialState.initialTimeS >= minHoldS) {
      cmd.triggerStage = true;
    }
    return cmd;
  }

  // 2. Automatic staging: trigger separation when current stage fuel <= 0.1 kg and upper stage exists
  const activeStage = state.stages[state.activeStageIndex];
  if (
    activeStage &&
    activeStage.fuelMassKg <= 0.1 &&
    state.activeStageIndex < state.stages.length - 1
  ) {
    cmd.triggerStage = true;
    return cmd;
  }

  // 3. Automatic LES jettison: trigger when altitude >= towerJettisonAltitudeM (92 km) and not yet jettisoned
  if (!state.towerJettisoned && state.orbit.altitudeM >= vehicle.towerJettisonAltitudeM) {
    cmd.jettisonTower = true;
  }

  // 4. Throttle management:
  //    - Throttle back to 82% in high dynamic pressure Max-Q zone (10 km ~ 16 km and q > 28 kPa) to reduce structural loads
  //    - Throttle down when G-load nears 3.9 G to simulate center engine cutoff limit
  if (
    state.orbit.altitudeM > 9500 &&
    state.orbit.altitudeM < 16500 &&
    state.dynamicPressurePa > 28000
  ) {
    cmd.throttle = 0.82;
  } else if (state.gLoad > 3.85) {
    cmd.throttle = clamp(3.8 / state.gLoad, 0.55, 1.0);
  } else {
    cmd.throttle = 1.0;
  }
  // Predictive G limit: cap throttle from stage thrust and current mass (avoids a one-step spike
  // when a light, nearly empty stage is at full throttle)
  const throttleStage = vehicle.stages[state.activeStageIndex];
  if (throttleStage && state.totalMassKg > 0) {
    const cap = (3.8 * STANDARD_GRAVITY_MS2 * state.totalMassKg) / throttleStage.thrustVacuumN;
    cmd.throttle = Math.min(cmd.throttle, Math.max(cap, throttleStage.minThrottle));
  }

  // 5. Per-scenario attitude guidance profiles
  if (scenario.id === 1) {
    if (state.orbit.altitudeM < LAUNCH_TOWER_HEIGHT_M) {
      cmd.sasMode = 'hold';
      cmd.targetPitchDeg = 90;
    } else {
      // Scenario 1: Merged Pad Liftoff & Gravity Turn smoothly through Max-Q to 35 km
      cmd.sasMode = 'pitch_program';
    }
  } else if (scenario.id === 4) {
    // Full launch (0m pad -> 185km orbit): Powered Explicit Guidance (PEG Kinematic Law)
    const alt = state.orbit.altitudeM;
    if (alt < LAUNCH_TOWER_HEIGHT_M) {
      cmd.sasMode = 'hold';
      cmd.targetPitchDeg = 90;
    } else if (alt < 32000) {
      cmd.sasMode = 'pitch_program';
    } else {
      cmd.sasMode = 'hold';
      const targetAlt = 184000;
      const altErr = targetAlt - alt;
      const desiredVertSpeed =
        altErr >= 0
          ? Math.sqrt(2 * 3.8 * altErr)
          : -Math.sqrt(2 * 1.5 * Math.abs(altErr));
      const vertSpeedErr = desiredVertSpeed - state.orbit.verticalSpeedMs;
      const basePitch = alt < 135000 ? 22 : 2;
      cmd.targetPitchDeg = clamp(basePitch + vertSpeedErr * 0.14, -5, 42);
    }
  } else if (scenario.id === 3 || state.orbit.altitudeM > 140000) {
    // Orbit circularization guidance: steer vertical speed toward an altitude-hold profile while thrust
    // goes into horizontal speed. Pitch comes from the vertical acceleration actually needed
    // (gravity minus centripetal relief), scaled by available thrust — so low-thrust stages such as
    // the ICPS pitch down as far as necessary instead of letting Apoapsis run away.
    cmd.sasMode = 'hold';
    cmd.targetPitchDeg = circularizationPitchDeg(state, vehicle, cmd.throttle, 182000);
  } else {
    cmd.sasMode = 'pitch_program';
  }

  return cmd;
}

/**
 * Extract compact telemetry sample for curves and debrief graphs
 */
export function sampleLiftoff(state: LiftoffState): LiftoffSample {
  const activeStage = state.stages[state.activeStageIndex];
  const stageFuelPct =
    activeStage && activeStage.maxFuelMassKg > 0
      ? (activeStage.fuelMassKg / activeStage.maxFuelMassKg) * 100
      : 0;

  return {
    time: Number(state.time.toFixed(2)),
    altitudeKm: Number((state.orbit.altitudeM / 1000).toFixed(3)),
    downrangeKm: Number((state.orbit.downrangeM / 1000).toFixed(3)),
    apoapsisKm: Number((state.orbit.apoapsisM / 1000).toFixed(3)),
    periapsisKm: Number((state.orbit.periapsisM / 1000).toFixed(3)),
    surfaceSpeedMs: Number(state.orbit.surfaceSpeedMs.toFixed(1)),
    orbitalSpeedMs: Number(state.orbit.orbitalSpeedMs.toFixed(1)),
    pitchDeg: Number(state.pitchDeg.toFixed(2)),
    progradeDeg: Number(state.orbit.surfaceProgradeDeg.toFixed(2)),
    dynamicPressureKpa: Number((state.dynamicPressurePa / 1000).toFixed(2)),
    gLoad: Number(state.gLoad.toFixed(2)),
    twr: Number(state.twr.toFixed(2)),
    mach: Number(state.mach.toFixed(2)),
    stageNumber: state.activeStageIndex + 1,
    stageFuelPct: Number(stageFuelPct.toFixed(1))
  };
}
