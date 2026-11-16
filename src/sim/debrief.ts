import type { FlightRecord, Language, Failure, ScenarioConfig } from './types';
import { angleError, lateralError } from './engine';

export interface DebriefMetricItem {
  id: string;
  name: string;
  valueText: string;
  limitText: string;
  passed: boolean;
  comment: string;
}

export interface DebriefAnalysis {
  isSuccess: boolean;
  scenarioId: number;
  reason?: Failure;
  badgeTitle: string;
  badgeType: 'success' | 'collision' | 'overspeed' | 'drift' | 'alignment' | 'fuel' | 'escape' | 'timeout' | 'hatch' | 'hatch_closed';
  headline: string;
  causeExplanation: string;
  physicsInsight: string;
  pilotTips: string[];
  metrics: DebriefMetricItem[];
}

export function analyzeFlight(record: FlightRecord, _language?: Language): DebriefAnalysis {
  const cfg = record.config;
  const res = record.result;
  const isSuccess = res?.status === 'success';
  const reason = res?.reason;
  const samples = record.samples;
  const finalSample = samples[samples.length - 1];

  const finalDistance = res ? res.position[2] : finalSample ? finalSample.distance : 0;
  const finalSpeed = res ? Math.hypot(...res.velocity) : finalSample ? finalSample.speed : 0;
  const finalLateral = res ? lateralError(res) : finalSample ? finalSample.lateral : 0;
  const finalAngle = res ? angleError(res) : finalSample ? finalSample.angle : 0;

  // 1. Metric evaluation table
  const metrics: DebriefMetricItem[] = [];
  const isDirectDock = cfg.id === 1 && isSuccess && finalDistance <= 0.36;

  // Metric A: Final distance / Hold position
  if (cfg.id === 1) {
    const distDiff = Math.abs(finalDistance - cfg.targetZ);
    const distPass = isDirectDock || distDiff <= cfg.positionTolerance;
    metrics.push({
      id: 'distance',
      name: isDirectDock ? 'Port Distance (Direct Dock)' : 'Hold Point Distance',
      valueText: `${finalDistance.toFixed(2)} m`,
      limitText: isDirectDock ? '≤ 0.35 m (Direct Dock)' : `${cfg.targetZ.toFixed(2)} m (±${cfg.positionTolerance} m)`,
      passed: distPass,
      comment: isDirectDock
        ? 'Direct docking capture success'
        : distPass
        ? 'Stopped accurately within yellow ring'
        : finalDistance < cfg.targetZ
        ? 'Overshot past hold point'
        : 'Not yet reached hold ring'
    });
  } else {
    const distPass = cfg.id === 4 ? finalDistance <= 0.35 : Math.abs(finalDistance - cfg.targetZ) <= cfg.positionTolerance;
    metrics.push({
      id: 'distance',
      name: 'Port Distance',
      valueText: `${finalDistance.toFixed(2)} m`,
      limitText: cfg.id === 4 ? '≤ 0.35 m' : `${cfg.targetZ.toFixed(2)} m`,
      passed: distPass,
      comment: distPass ? 'Inside capture envelope' : 'Outside capture envelope'
    });
  }

  // Metric B: Contact / Relative speed
  const speedPass = isDirectDock ? true : finalSpeed <= cfg.speedTolerance;
  metrics.push({
    id: 'speed',
    name: isDirectDock ? 'Contact Speed' : 'Relative Speed',
    valueText: `${finalSpeed.toFixed(2)} m/s`,
    limitText: isDirectDock ? 'Latched firmly' : `≤ ${cfg.speedTolerance.toFixed(2)} m/s`,
    passed: speedPass,
    comment: speedPass
      ? (isDirectDock ? 'Latches engaged, securely fixed' : 'Safe approach speed')
      : finalSpeed > cfg.speedTolerance * 3
      ? 'Severe overspeed! Dangerous impact'
      : 'Exceeded safe speed limit'
  });

  // Metric C: Lateral offset
  const lateralPass = finalLateral <= cfg.positionTolerance;
  metrics.push({
    id: 'lateral',
    name: 'Lateral Offset',
    valueText: `${finalLateral.toFixed(2)} m`,
    limitText: `≤ ${cfg.positionTolerance.toFixed(2)} m`,
    passed: lateralPass,
    comment: lateralPass
      ? 'Aligned with centerline'
      : 'Drifted sideways, off-center'
  });

  // Metric D: Attitude angle error
  const anglePass = finalAngle <= cfg.angleTolerance;
  metrics.push({
    id: 'angle',
    name: 'Attitude Angle Error',
    valueText: `${finalAngle.toFixed(1)}°`,
    limitText: `≤ ${cfg.angleTolerance.toFixed(1)}°`,
    passed: anglePass,
    comment: anglePass
      ? 'Ports parallel & aligned'
      : 'Ports tilted, outside latch angle'
  });

  // Metric E: Nose cone hatch state
  if (cfg.id === 4 || reason === 'hatch' || reason === 'hatch_closed') {
    const isHatchOpen = res?.hatch?.state === 'open';
    metrics.push({
      id: 'hatch',
      name: 'Nose Cone Hatch',
      valueText: isHatchOpen ? 'Open (Ready to dock)' : 'Closed (Blocked)',
      limitText: 'Must be fully open',
      passed: isHatchOpen,
      comment: isHatchOpen ? 'Port exposed, mechanical latches ready' : 'Hatch closed, blocking hard capture'
    });
  }

  // 2. Cause analysis and diagnostic debrief
  if (isSuccess) {
    return {
      isSuccess: true,
      scenarioId: cfg.id,
      badgeTitle: isDirectDock
        ? 'Special Pass · Direct Docking Accomplished!'
        : 'Mission Accomplished',
      badgeType: 'success',
      headline: isDirectDock
        ? 'You didn’t stop at the 8 m hold point, but docked directly with the station!'
        : 'Mission accomplished.',
      causeExplanation: isDirectDock
        ? 'The ship glided along the centerline into the docking port, triggering mechanical latching! Mission 1 trains hold-point stopping, but directly docking is equally considered a successful pass.'
        : 'Textbook flight execution! All critical parameters remained strictly within capture limits.',
      physicsInsight: isDirectDock
        ? 'Real missions pause at 8 m for safety checks, but direct contact on centerline also docks. You’ve already grasped the final mission goal!'
        : 'You mastered momentum control in space—cancelling kinetic energy through counter-thrust to conquer inertia.',
      pilotTips: isDirectDock
        ? [
            'Awesome! You basically experienced the core goal of Mission 4 in advance.',
            'Next, try missions 2 and 3 to practice handling sideways drift and attitude rotation.'
          ]
        : [
            'Keep this habit: gentle micro-bursts and early braking.',
            'In multi-DOF missions, stabilize attitude before translating.'
          ],
      metrics
    };
  }

  // Failure analysis
  if (reason === 'collision') {
    const isMissedHold = cfg.id === 1 && finalDistance < cfg.targetZ;
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'collision',
      badgeTitle: isMissedHold
        ? 'Missed Hold Point · Station Impact'
        : 'Collision Impact',
      badgeType: 'collision',
      headline: isMissedHold
        ? 'Overshot the 8m hold point and crashed into the station!'
        : 'Contacted station structure, triggering collision cutoff!',
      causeExplanation: isMissedHold
        ? `The ship passed the hold ring at ${finalSpeed.toFixed(2)} m/s without stopping and contacted the forward station structure.`
        : 'The spacecraft strayed outside the safe approach corridor or failed to slow down before contacting the docking rim.',
      physicsInsight:
        'There is zero friction in space! On Earth things glide to a stop; in space, releasing controls keeps you coasting at constant speed forever. Stopping requires deliberate counter-thrust!',
      pilotTips: [
        'Brake earlier with Key F: start counter-thrusting 3-4 m before reaching the hold ring.',
        'Watch closing speed: brake continuously until speed reaches 0.00 m/s (turns green).',
        'Hold steady for 1.5 seconds: once stopped inside the ring, release controls to complete!'
      ],
      metrics
    };
  }

  if (reason === 'overspeed') {
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'overspeed',
      badgeTitle: 'Dangerous Contact Overspeed',
      badgeType: 'overspeed',
      headline: `Contact speed (${finalSpeed.toFixed(2)} m/s) exceeded safety limit!`,
      causeExplanation:
        `Docking mechanism capture tolerance is ≤ ${cfg.speedTolerance.toFixed(2)} m/s. Higher speed damages latches and causes bounce.`,
      physicsInsight:
        'Momentum dictates that higher speed generates destructive impact force. Final contact must be gentle and creeping.',
      pilotTips: [
        'Keep speed below 0.10 m/s inside the last 3 metres.',
        'Tap counter-thrust (Key F) for fine speed bleeding before contact.',
        'Never hold forward thrust in the final closing stretch.'
      ],
      metrics
    };
  }

  if (reason === 'drift') {
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'drift',
      badgeTitle: 'Excessive Lateral Drift',
      badgeType: 'drift',
      headline: 'Spacecraft drifted sideways off the centerline!',
      causeExplanation:
        `Lateral offset was ${finalLateral.toFixed(2)} m at contact (limit is ≤ ${cfg.positionTolerance} m). Missed docking capture aperture.`,
      physicsInsight:
        'Pointing at the port does not mean flying towards it! Sideways velocity causes you to slide laterally while moving forward.',
      pilotTips: [
        'Watch crosshairs: use A / D (left/right) and W / S (up/down) to align reticle with target marker.',
        'Cancel sideways velocity: tap opposite keys when near center to stop sliding.',
        'Center first, close second: align early while far from the station.'
      ],
      metrics
    };
  }

  if (reason === 'alignment') {
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'alignment',
      badgeTitle: 'Attitude Misaligned',
      badgeType: 'alignment',
      headline: `Attitude error was ${finalAngle.toFixed(1)}° (limit ≤ ${cfg.angleTolerance}°)`,
      causeExplanation:
        'Docking flanges must be strictly parallel. Angular tilt causes single-side contact collision.',
      physicsInsight:
        'Rotational thrusters change angular velocity. After turning into alignment, counter-thrust is required to stop rotating.',
      pilotTips: [
        'Use rotation mode / arrow keys to gently reduce pitch and yaw angles.',
        'Tap counter-rotation immediately when aligned to cancel spin rate.',
        'Verify angle is below 2.0° and motionless before moving forward.'
      ],
      metrics
    };
  }

  if (reason === 'fuel') {
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'fuel',
      badgeTitle: 'Fuel Exhausted',
      badgeType: 'fuel',
      headline: 'Fuel depleted: spacecraft lost translation and attitude authority!',
      causeExplanation:
        'Continuous thruster firing exhausted fuel reserves. Real spacecraft propellant is strictly limited.',
      physicsInsight:
        'Space flight relies on impulse coasting: fire briefly, coast on inertia for free, then fire briefly to brake.',
      pilotTips: [
        'Tap in short pulses; avoid holding thruster buttons continuously.',
        'Release keys after gaining speed and glide on inertia.',
        'Avoid alternating over-corrections to preserve fuel reserves.'
      ],
      metrics
    };
  }

  if (reason === 'hatch' || reason === 'hatch_closed') {
    return {
      isSuccess: false,
      scenarioId: cfg.id,
      reason: 'hatch_closed',
      badgeTitle: 'Hatch Closed · Docking Blocked',
      badgeType: 'hatch_closed',
      headline: 'Nose cone hatch closed: docking port blocked!',
      causeExplanation:
        'Hatch not opened! The docking adapter (IDA) was blocked by the nose cone shield, preventing hard capture. Next time, press "1" to open the hatch before the final 8 meters.',
      physicsInsight:
        'On SpaceX Crew Dragon, the nose cone acts as a protective shield during launch and re-entry to protect sensitive docking mechanisms (IDA) and forward thrusters from extreme aerodynamic heat. In orbit, it must open prior to docking so the mechanism can lock onto the space station.',
      pilotTips: [
        'Press key [1] (or tap the on-screen Hatch button) to open or close the nose cone.',
        'Open the hatch early before entering the final 8 meters to ensure the docking port is ready.',
        'Check the HUD status: ensure it shows "Open (Ready to dock)" before final gentle approach.'
      ],
      metrics
    };
  }

  // Default other reasons (escape / timeout / unknown)
  return {
    isSuccess: false,
    scenarioId: cfg.id,
    reason: reason ?? 'timeout',
    badgeTitle: reason === 'escape' ? 'Exited Training Zone' : 'Training Timeout',
    badgeType: reason === 'escape' ? 'escape' : 'timeout',
    headline: reason === 'escape'
      ? 'Craft drifted beyond the safe training envelope!'
      : 'Exceeded maximum allowed mission time limit.',
    causeExplanation: reason === 'escape'
      ? 'Craft drifted too far down or laterally, leaving the guidance corridor. Beyond the boundary, thrust cuts out and it floats freely.'
      : 'Monitor velocity vector heading and counter-thrust back towards centerline.',
    physicsInsight:
      'Newton’s First Law of Inertia: with no friction in space, objects maintain constant motion. Downward velocity must be stopped with counter-thrust, or you drift forever.',
    pilotTips: [
      'Restart and keep close track of distance and speed gauges.',
      'Press Spacebar for emergency assisted braking.'
    ],
    metrics
  };
}

export function generateDebrief(
  cfg: ScenarioConfig,
  reason: Failure | undefined,
  finalDistance: number,
  finalSpeed: number,
  finalLateral: number,
  finalAngle: number,
  _t?: (zh: string, en: string) => string
): DebriefAnalysis {
  const record: FlightRecord = {
    scenario: cfg.id,
    demo: false,
    config: cfg,
    date: new Date().toISOString(),
    samples: [
      {
        time: 10,
        distance: finalDistance,
        speed: finalSpeed,
        lateral: finalLateral,
        angle: finalAngle,
        fuel: 80,
        position: [finalLateral, 0, finalDistance]
      }
    ],
    events: [],
    result: {
      position: [finalLateral, 0, finalDistance],
      velocity: [0, 0, -finalSpeed],
      orientation: [0, 0, 0, 1],
      angularVelocity: [0, 0, 0],
      fuel: 80,
      time: 10,
      hold: 0,
      status: reason ? 'failed' : 'success',
      reason,
      thrust: [0, 0, 0],
      torque: [0, 0, 0]
    }
  };
  return analyzeFlight(record, 'en');
}
