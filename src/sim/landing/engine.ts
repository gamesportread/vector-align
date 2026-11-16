import { clamp } from '../engine';
import type {
  LandingCommand,
  LandingSample,
  LandingScenarioConfig,
  LandingState
} from './types';

export const LANDING_DT = 1 / 60;
export const BLACKOUT_TOP_M = 80000;
export const BLACKOUT_BOTTOM_M = 38000;
/** Retro-rocket ignition window the curriculum teaches (m above ground) */
export const RETRO_WINDOW_M = { min: 1.0, max: 2.5 } as const;
const RETRO_BURN_S = 1.15;
const RETRO_DECEL = 30;
const RETRO_FLOOR_MS = 1.25;

export function emptyLandingCommand(): LandingCommand {
  return {
    attitudeInput: 0,
    liftTrimInput: 0,
    triggerAction: false,
    jettisonHeatshield: false,
    sasEnabled: false
  };
}

export function createLandingState(scenario: LandingScenarioConfig): LandingState {
  const init = scenario.initialState;
  const inBlackout = init.altitudeM >= BLACKOUT_BOTTOM_M && init.altitudeM <= BLACKOUT_TOP_M;
  const initTemp = inBlackout ? 1680 : init.altitudeM > 15000 ? 420 : 65;
  const initG = inBlackout ? 3.4 : 1.0;
  return {
    time: 0,
    status: 'ready',
    altitudeM: init.altitudeM,
    lateralOffsetM: 0,
    lateralSpeedMs: 0,
    speedMs: init.speedMs,
    descentRateMs: init.descentRateMs,
    attitudeDeviationDeg: init.attitudeDeviationDeg,
    angularVelDeg: 0,
    liftTrim: 0.2,
    gLoad: initG,
    maxGRecorded: initG,
    heatshieldTempC: initTemp,
    heatshieldIntegrityPct: 100,
    inBlackout,
    chuteState: init.chuteState,
    chuteProgress: init.chuteState === 'stowed' ? 0 : 1,
    heatshieldJettisoned: init.heatshieldJettisoned,
    heatshieldSepElapsedS: init.heatshieldJettisoned ? 10 : -1,
    retroFired: false,
    retroBurnLeftS: 0
  };
}

export function sampleLanding(state: LandingState): LandingSample {
  return {
    time: Number(state.time.toFixed(2)),
    altitudeKm: Number((state.altitudeM / 1000).toFixed(3)),
    speedMs: Number(state.speedMs.toFixed(1)),
    gLoad: Number(state.gLoad.toFixed(2)),
    tempC: Math.round(state.heatshieldTempC)
  };
}

export function stepLanding(
  state: LandingState,
  cmd: LandingCommand,
  scenario: LandingScenarioConfig,
  dt = LANDING_DT
): LandingState {
  if (state.status !== 'flying') return state;

  const next: LandingState = { ...state };
  next.time += dt;

  // 1. Process heat shield jettison command (Key J / 1)
  if (cmd.jettisonHeatshield && !next.heatshieldJettisoned && next.altitudeM < 8500) {
    next.heatshieldJettisoned = true;
    next.heatshieldSepElapsedS = 0;
  }
  if (next.heatshieldJettisoned && next.heatshieldSepElapsedS >= 0) {
    next.heatshieldSepElapsedS += dt;
  }

  // 2. Process Space action trigger: deploy drogue -> deploy main -> ignite 1.5m landing retro-rockets
  if (cmd.triggerAction) {
    if (next.chuteState === 'stowed') {
      if (next.speedMs > 235 || next.altitudeM > 14500) {
        next.status = 'failed';
        next.failReason = 'chute_shred';
        return next;
      }
      next.chuteState = 'drogue';
      next.chuteProgress = 0.05;
    } else if (next.chuteState === 'drogue') {
      if (next.speedMs > 105) {
        next.status = 'failed';
        next.failReason = 'chute_shred';
        return next;
      }
      next.chuteState = 'main';
      next.chuteProgress = 0.05;
    } else if (next.chuteState === 'main' && !next.retroFired && next.altitudeM < 35) {
      if (next.altitudeM > 4.2) {
        next.status = 'failed';
        next.failReason = 'retro_early';
        return next;
      }
      if (next.heatshieldJettisoned) {
        next.retroFired = true;
        next.retroBurnLeftS = RETRO_BURN_S;
      }
    }
  }

  if (next.chuteState !== 'stowed' && next.chuteProgress < 1) {
    next.chuteProgress = Math.min(1, next.chuteProgress + dt * 0.65);
  }

  // 3. Attitude and lift trim dynamics
  const liftInput = clamp(cmd.liftTrimInput, -1, 1);
  next.liftTrim = clamp(next.liftTrim + liftInput * 0.85 * dt, -1, 1);

  // High-altitude atmospheric turbulence vs pilot attitude control / SAS damping
  const turbAmplitude = next.altitudeM > 20000 ? 3.2 : next.altitudeM > 1000 ? 1.1 : 0.4;
  const turbTorque =
    Math.sin(next.time * 1.55 + scenario.id) * turbAmplitude +
    Math.cos(next.time * 2.4) * (turbAmplitude * 0.45);

  let controlTorque = clamp(cmd.attitudeInput, -1, 1) * 14.0;
  if (cmd.sasEnabled && Math.abs(cmd.attitudeInput) < 0.05) {
    controlTorque = clamp(
      -next.attitudeDeviationDeg * 3.8 - next.angularVelDeg * 2.2 - turbTorque * 0.85,
      -14,
      14
    );
  }

  next.angularVelDeg += (turbTorque + controlTorque - next.angularVelDeg * 1.65) * dt;
  next.attitudeDeviationDeg += next.angularVelDeg * dt;

  // Low-altitude crosswind and lateral drift control
  if (next.altitudeM < 500) {
    const windAccel = 0.35 * Math.sin(next.time * 0.7);
    const steerAccel = clamp(cmd.attitudeInput, -1, 1) * 1.6;
    next.lateralSpeedMs += (windAccel + steerAccel - next.lateralSpeedMs * 1.2) * dt;
    next.lateralOffsetM += next.lateralSpeedMs * dt;
  }

  // 4. Staged aerodynamic deceleration, aerothermal heating, and parachute/retro-rocket dynamics
  next.inBlackout =
    next.altitudeM >= BLACKOUT_BOTTOM_M && next.altitudeM <= BLACKOUT_TOP_M;

  if (next.altitudeM > 15000) {
    // Hypersonic reentry -> post-blackout stratospheric aerodynamic braking (50 km -> 15 km)
    const hyperDescent = Math.max(185, 920 - next.liftTrim * 160);
    const attPenaltyG = Math.max(0, Math.abs(next.attitudeDeviationDeg) - 3.0) * 0.12;
    const blackoutTemp =
      1450 + (next.speedMs / 5200) * 620 + Math.abs(next.attitudeDeviationDeg) * 35;
    const hyperG = 3.1 + (next.speedMs / 5500) * 1.6 - next.liftTrim * 1.8;

    let targetTemp: number;
    if (next.altitudeM >= BLACKOUT_BOTTOM_M) {
      const decelRate = 95 + (1 - next.liftTrim * 0.28) * 32;
      next.speedMs = Math.max(245, next.speedMs - decelRate * dt);
      next.descentRateMs += (hyperDescent - next.descentRateMs) * 1.5 * dt;
      next.gLoad = Math.max(1.0, hyperG + attPenaltyG);
      targetTemp = blackoutTemp;
    } else {
      // Smooth continuous transition from 38 km blackout exit to 15 km subsonic entry
      const stratNorm = clamp(
        (next.altitudeM - 15000) / (BLACKOUT_BOTTOM_M - 15000),
        0,
        1
      );
      const guidedDecel =
        1.45 *
        (Math.max(0, next.speedMs - 245) / Math.max(2200, next.altitudeM - 13200)) *
        next.descentRateMs;
      const decelRate = guidedDecel * 0.85 + 24 * Math.pow(stratNorm, 2);
      next.speedMs = Math.max(250, next.speedMs - decelRate * dt);

      const tropDescent = next.speedMs * 0.72;
      const targetDescent =
        tropDescent + (hyperDescent - tropDescent) * Math.pow(stratNorm, 0.72);
      next.descentRateMs += (targetDescent - next.descentRateMs) * 1.5 * dt;
      next.gLoad = Math.max(
        1.0,
        1.35 + (hyperG - 1.35) * Math.pow(stratNorm, 0.7) + attPenaltyG
      );
      targetTemp = 65 + (blackoutTemp - 65) * Math.pow(stratNorm, 2.2);
    }

    next.altitudeM = Math.max(0, next.altitudeM - next.descentRateMs * dt);
    next.heatshieldTempC += (targetTemp - next.heatshieldTempC) * 2.0 * dt;

    if (Math.abs(next.attitudeDeviationDeg) > 6.0) {
      const damageRate = (Math.abs(next.attitudeDeviationDeg) - 6.0) * 8.5;
      next.heatshieldIntegrityPct = Math.max(
        0,
        next.heatshieldIntegrityPct - damageRate * dt
      );
    }

    if (next.heatshieldIntegrityPct <= 0 || Math.abs(next.attitudeDeviationDeg) > 13.5) {
      next.status = 'failed';
      next.failReason = 'heatshield_burnthrough';
      return next;
    }
    if (next.gLoad > 8.5) {
      next.status = 'failed';
      next.failReason = 'excessive_g_load';
      return next;
    }
  } else if (next.altitudeM > 120) {
    // 15 km ~ 120 m: Continuous tropospheric aerodynamic & parachute deceleration phase
    next.heatshieldTempC = Math.max(35, next.heatshieldTempC - 60 * dt);

    if (next.chuteState === 'stowed') {
      // Thicker air decelerates capsule below 235 m/s safe drogue deployment limit
      const targetSpd = 180 + Math.max(0, next.altitudeM - 11000) * 0.015;
      next.speedMs += (targetSpd - next.speedMs) * 0.45 * dt;
      next.descentRateMs += (next.speedMs * 0.72 - next.descentRateMs) * 4.5 * dt;
      next.gLoad += (1.35 - next.gLoad) * 4.5 * dt;

      if (next.altitudeM < 3200) {
        next.status = 'failed';
        next.failReason = 'chute_too_late';
        return next;
      }
    } else if (next.chuteState === 'drogue') {
      // Drogue chute decelerates progressively with atmospheric density to safe main-chute speed
      const rhoRatio = Math.exp(-Math.max(0, next.altitudeM) / 9200);
      const targetSpd = 61 / Math.sqrt(rhoRatio);
      next.speedMs += (targetSpd - next.speedMs) * 0.85 * dt;
      next.descentRateMs += (next.speedMs * 0.88 - next.descentRateMs) * 4.5 * dt;
      const targetG = 2.4 * (1 - next.chuteProgress * 0.5);
      next.gLoad += (targetG - next.gLoad) * 6.0 * dt;

      if (next.altitudeM < 1800) {
        next.status = 'failed';
        next.failReason = 'chute_too_late';
        return next;
      }
    } else if (next.chuteState === 'main') {
      // 1200 m² main parachute stabilizes continuous descent to 7.6 m/s down to ground
      const targetSpd = 7.6;
      next.speedMs += (targetSpd - next.speedMs) * 1.4 * dt;
      next.descentRateMs += (next.speedMs - next.descentRateMs) * 4.5 * dt;
      const targetG = 1.0 + Math.max(0, (next.speedMs - 7.6) * 0.04);
      next.gLoad += (targetG - next.gLoad) * 6.0 * dt;
    }

    next.altitudeM = Math.max(0, next.altitudeM - next.descentRateMs * dt);
  } else {
    // 120 m ~ 0 m: Terminal touchdown phase
    next.heatshieldTempC = 32;
    if (next.chuteState !== 'main') {
      next.status = 'failed';
      next.failReason = 'chute_too_late';
      return next;
    }

    if (next.retroFired && next.retroBurnLeftS > 0) {
      const burnDt = Math.min(dt, next.retroBurnLeftS);
      next.retroBurnLeftS = Math.max(0, next.retroBurnLeftS - dt);
      // 4 solid retro-rockets brake 7.6 m/s to 1.25 m/s in ~0.2 s, then tail-off thrust holds that
      // rate, so any ignition between ~1.0 m and ~2.5 m ends in a soft touchdown (<= 2.4 m/s)
      next.descentRateMs = Math.max(RETRO_FLOOR_MS, next.descentRateMs - RETRO_DECEL * burnDt);
      next.speedMs = Math.hypot(next.descentRateMs, next.lateralSpeedMs);
      next.gLoad = next.descentRateMs > RETRO_FLOOR_MS ? 1 + RETRO_DECEL / 9.81 : 1.0;
    } else {
      // Premature retro-fire burns out before touchdown, allowing gravity to re-accelerate the capsule
      if (next.retroFired && next.retroBurnLeftS <= 0 && next.altitudeM > 0.35) {
        next.descentRateMs = Math.min(7.6, next.descentRateMs + 4.5 * dt);
      }
      next.speedMs = Math.hypot(next.descentRateMs, next.lateralSpeedMs);
      next.gLoad = 1.0;
    }

    next.altitudeM = Math.max(0, next.altitudeM - next.descentRateMs * dt);
  }

  next.maxGRecorded = Math.max(next.maxGRecorded, next.gLoad);

  // 5. Scenario victory and touchdown evaluation
  if (scenario.id === 1) {
    if (
      next.altitudeM <= 36000 &&
      next.heatshieldIntegrityPct >= 70 &&
      Math.abs(next.attitudeDeviationDeg) <= 6.0
    ) {
      next.status = 'success';
      return next;
    }
  } else if (scenario.id === 2) {
    if (
      next.chuteState === 'main' &&
      next.chuteProgress >= 0.95 &&
      next.descentRateMs <= 8.5 &&
      next.altitudeM >= 2500
    ) {
      next.status = 'success';
      return next;
    }
  } else if (scenario.id === 3 || scenario.id === 4) {
    if (next.altitudeM <= 0) {
      next.touchdownSpeedMs = Number(next.descentRateMs.toFixed(2));
      if (
        next.heatshieldJettisoned &&
        next.retroFired &&
        next.descentRateMs <= 2.4
      ) {
        next.status = 'success';
      } else {
        next.status = 'failed';
        next.failReason = 'hard_impact';
      }
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
 * Deterministic landing autopilot (Autopilot for Demo & Headless Verification)
 */
export function landingAutopilot(state: LandingState): LandingCommand {
  const cmd = emptyLandingCommand();
  cmd.sasEnabled = true;

  // 1. Attitude trim and crosswind correction
  if (state.altitudeM < 500) {
    cmd.attitudeInput = clamp(
      -state.lateralOffsetM * 0.45 - state.lateralSpeedMs * 0.95,
      -1,
      1
    );
  } else {
    cmd.attitudeInput = clamp(
      -state.attitudeDeviationDeg * 0.55 - state.angularVelDeg * 0.35,
      -1,
      1
    );
  }

  // 2. High-altitude lift trim keeps peak G-load within comfortable limits
  if (state.altitudeM > 15000) {
    cmd.liftTrimInput = state.liftTrim < 0.65 ? 1 : 0;
  }

  // 3. 10km drogue -> 6km main chute -> jettison heat shield -> ignite retro-rockets at 1.8m
  if (
    state.chuteState === 'stowed' &&
    state.altitudeM <= 11500 &&
    state.speedMs <= 222
  ) {
    cmd.triggerAction = true;
  } else if (
    state.chuteState === 'drogue' &&
    state.chuteProgress >= 0.8 &&
    state.speedMs <= 92
  ) {
    cmd.triggerAction = true;
  } else if (state.chuteState === 'main') {
    if (!state.heatshieldJettisoned && state.chuteProgress >= 0.95 && state.altitudeM <= 8400) {
      cmd.jettisonHeatshield = true;
    }
    if (
      state.heatshieldJettisoned &&
      !state.retroFired &&
      state.altitudeM <= 1.85 &&
      state.altitudeM >= 1.1
    ) {
      cmd.triggerAction = true;
    }
  }

  return cmd;
}
