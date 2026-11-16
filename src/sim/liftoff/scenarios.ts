import type { Localized } from '../types';
import type { LiftoffScenarioConfig, RocketVehicleId } from './types';

export interface LiftoffGlossaryItem {
  id: string;
  term: Localized;
  shortDesc: Localized;
  teenExplanation: Localized;
}

/**
 * Aerospace glossary for liftoff scenarios
 * Explains rocketry terminology with intuitive physical concepts
 */
export const LIFTOFF_GLOSSARY: LiftoffGlossaryItem[] = [
  {
    id: 'twr',
    term: {
      zh: 'Thrust-to-Weight Ratio (TWR)',
      en: 'Thrust-to-Weight Ratio (TWR)'
    },
    shortDesc: {
      zh: 'Engine thrust divided by the rocket’s weight under gravity',
      en: 'Engine thrust divided by the rocket’s weight under gravity'
    },
    teenExplanation: {
      zh: 'If TWR is below 1.0, the rocket cannot lift off at all! Fully fueled, Saturn V weighs 2,950 tonnes with a liftoff TWR of just 1.17, rising slowly at first. Burning 13 tonnes of fuel per second makes it much lighter, pushing TWR approaches 4.0!',
      en: 'If TWR is below 1.0, the rocket cannot lift off at all! Fully fueled, Saturn V weighs 2,950 tonnes with a liftoff TWR of just 1.17, rising slowly at first. Burning 13 tonnes of fuel per second makes it much lighter, pushing TWR approaches 4.0!'
    }
  },
  {
    id: 'max-q',
    term: {
      zh: 'Max-Q (Maximum Dynamic Pressure)',
      en: 'Max-Q (Maximum Dynamic Pressure)'
    },
    shortDesc: {
      zh: 'The point of maximum aerodynamic stress during atmospheric ascent',
      en: 'The point of maximum aerodynamic stress during atmospheric ascent'
    },
    teenExplanation: {
      zh: 'At low altitude air is thick but speed is low; high up speed is huge but air is thin. Around 13 km altitude above Mach 1, air density and speed combine for peak aerodynamic pressure (Max-Q). Turning too sharply here will snap the rocket in half!',
      en: 'At low altitude air is thick but speed is low; high up speed is huge but air is thin. Around 13 km altitude above Mach 1, air density and speed combine for peak aerodynamic pressure (Max-Q). Turning too sharply here will snap the rocket in half!'
    }
  },
  {
    id: 'gravity-turn',
    term: {
      zh: 'Gravity Turn',
      en: 'Gravity Turn'
    },
    shortDesc: {
      zh: 'Using gravity to naturally curve the trajectory from vertical to horizontal',
      en: 'Using gravity to naturally curve the trajectory from vertical to horizontal'
    },
    teenExplanation: {
      zh: 'Reaching orbit requires huge horizontal speed (7.8 km/s). Instead of flying straight up and making a sharp 90° turn, rockets tilt slightly east right after clearing the tower and follow their velocity vector (Prograde), letting gravity naturally bend the flight path horizontal.',
      en: 'Reaching orbit requires huge horizontal speed (7.8 km/s). Instead of flying straight up and making a sharp 90° turn, rockets tilt slightly east right after clearing the tower and follow their velocity vector (Prograde), letting gravity naturally bend the flight path horizontal.'
    }
  },
  {
    id: 'staging',
    term: {
      zh: 'Staging & Dry Mass',
      en: 'Staging & Dry Mass'
    },
    shortDesc: {
      zh: 'Jettisoning empty fuel tanks so the upper stage can accelerate faster',
      en: 'Jettisoning empty fuel tanks so the upper stage can accelerate faster'
    },
    teenExplanation: {
      zh: 'Carrying a 130-tonne empty metal tank all the way to space makes reaching orbital speed impossible. Once Stage 1 burns out (MECO), rockets discard the empty stage and ignite Stage 2 to shed dead weight.',
      en: 'Carrying a 130-tonne empty metal tank all the way to space makes reaching orbital speed impossible. Once Stage 1 burns out (MECO), rockets discard the empty stage and ignite Stage 2 to shed dead weight.'
    }
  },
  {
    id: 'ap-pe',
    term: {
      zh: 'Apoapsis (Ap), Periapsis (Pe) & First Cosmic Velocity',
      en: 'Apoapsis (Ap), Periapsis (Pe) & First Cosmic Velocity'
    },
    shortDesc: {
      zh: 'Highest and lowest points of an orbit; Periapsis must clear the atmosphere',
      en: 'Highest and lowest points of an orbit; Periapsis must clear the atmosphere'
    },
    teenExplanation: {
      zh: 'Flying high to 200 km is not enough—without horizontal speed, you just fall back down (Periapsis < 0). By accelerating horizontally near Apoapsis to ~7.8 km/s (First Cosmic Velocity), you raise Periapsis above 160 km so the ship falls around Earth forever!',
      en: 'Flying high to 200 km is not enough—without horizontal speed, you just fall back down (Periapsis < 0). By accelerating horizontally near Apoapsis to ~7.8 km/s (First Cosmic Velocity), you raise Periapsis above 160 km so the ship falls around Earth forever!'
    }
  }
];

export const liftoffScenarios: LiftoffScenarioConfig[] = [
  {
    id: 1,
    vehicleId: 'saturn-v',
    title: {
      zh: '起飞与重力转弯 · 最大动压爬升',
      en: 'Liftoff & Gravity Turn · Max-Q Ascent'
    },
    subtitle: {
      zh: '目标：100%油门点火释放固定臂，越过发射塔后东倾并平滑穿过 Max-Q 爬升至 35 km',
      en: 'Goal: Full throttle ignition, release clamps, pitch east & fly smoothly through Max-Q to 35 km'
    },
    objective: {
      zh: '推满油门至 100%（TWR > 1.15），按空格释放牵制臂垂直越过 150 米发射塔，随后向东俯仰并紧跟顺向矢量穿过 13 km 最大动压区（Max-Q）爬升至 35 km！',
      en: 'Throttle to 100% (TWR > 1.15), press Space to release clamps, clear the 150 m tower, then pitch east and track Prograde smoothly through Max-Q (~13 km) to 35 km!'
    },
    hint: {
      zh: '按 Z 加满油门后按 Space 释放固定臂！越过 150 m 后启用 SAS [程序俯仰] 或用 D / → 向东平滑压低仰角，穿过 11–16 km Max-Q 时保持小迎角（< 6°）。',
      en: 'Press Z for 100% throttle then Space to release clamps! Above 150 m engage SAS [Prograde/Program] or gently tap D / → east, keeping AoA tight (< 6°) through 11–16 km Max-Q.'
    },
    passCriteria: {
      zh: '高度 ≥ 35.0 km · 俯仰角 22°–65° · 安全穿过 Max-Q 无气动解体',
      en: 'Altitude ≥ 35.0 km · Pitch angle 22°–65° · Survive Max-Q without aero breakup'
    },
    brief: {
      zh: '欢迎来到 LC-39A 发射台！先建立 TWR > 1.0 释放牵制臂安全离台；越过发射塔后立刻开启温和的向东程序转弯，在 13 km 附近超声速最大动压（Max-Q）区让箭体如标枪般贴合速度矢量，依靠重力自然弯曲弹道冲出稠密大气。',
      en: 'Welcome to Launch Complex 39A! Build TWR > 1.0 before releasing clamps, clear the tower vertically, then initiate a smooth eastward gravity turn—staying aligned with your velocity vector through Max-Q (~13 km) as gravity bends your path toward the horizon.'
    },
    lesson: {
      zh: '火箭起飞先看推重比（TWR > 1），穿过稠密大气时必须保持近零迎角顺向飞行（重力转弯），否则 Max-Q 横向气动力会折断箭体。',
      en: 'Liftoff requires TWR > 1.0, and atmospheric ascent relies on a zero-AoA Gravity Turn so Max-Q aerodynamic loads never snap the rocket.'
    },
    scienceTerm: {
      term: LIFTOFF_GLOSSARY[1].term,
      explanation: LIFTOFF_GLOSSARY[1].teenExplanation
    },
    initialState: {
      altitudeM: 0,
      downrangeM: 0,
      verticalSpeedMs: 0,
      horizontalSpeedMs: 0,
      pitchDeg: 90,
      activeStageIndex: 0,
      stageFuelFractions: [1.0, 1.0, 1.0],
      clampsReleased: false,
      towerJettisoned: false,
      throttle: 0,
      sasMode: 'hold',
      initialTimeS: 0
    },
    targets: {
      minAltitudeM: 35000,
      targetPitchMinDeg: 22,
      targetPitchMaxDeg: 65,
      maxTimeS: 220
    }
  },

  {
    id: 2,
    vehicleId: 'saturn-v',
    title: {
      zh: 'Staging · Drop Dead Weight',
      en: 'Staging · Drop Dead Weight'
    },
    subtitle: {
      zh: 'Goal: Separate Stage 1 at MECO, ignite Stage 2, jettison LES > 92 km & push Apoapsis > 165 km',
      en: 'Goal: Separate Stage 1 at MECO, ignite Stage 2, jettison LES > 92 km & push Apoapsis > 165 km'
    },
    objective: {
      zh: 'Wait for Stage 1 fuel depletion (MECO), press Space to stage and ignite Stage 2 (S-II), jettison the Launch Escape Tower above 92 km, and push Apoapsis (Ap) above 165 km!',
      en: 'Wait for Stage 1 fuel depletion (MECO), press Space to stage and ignite Stage 2 (S-II), jettison the Launch Escape Tower above 92 km, and push Apoapsis (Ap) above 165 km!'
    },
    hint: {
      zh: 'Watch the Stage 1 fuel bar! Do not stage while fuel remains. As soon as fuel hits 0% (MECO), press Space to stage. Above 92 km, jettison the Launch Escape Tower!',
      en: 'Watch the Stage 1 fuel bar! Do not stage while fuel remains. As soon as fuel hits 0% (MECO), press Space to stage. Above 92 km, jettison the Launch Escape Tower!'
    },
    passCriteria: {
      zh: 'Stage 2 (S-II) active · Escape tower jettisoned · Predicted Apoapsis (Ap) ≥ 165 km',
      en: 'Stage 2 (S-II) active · Escape tower jettisoned · Predicted Apoapsis (Ap) ≥ 165 km'
    },
    brief: {
      zh: 'At 58 km altitude, Stage 1 has only 8% fuel left! Once empty, its 130-tonne tank becomes dead weight. Stage promptly at Main Engine Cutoff (MECO), ignite Stage 2’s five J-2 engines, and jettison the Launch Escape System!',
      en: 'At 58 km altitude, Stage 1 has only 8% fuel left! Once empty, its 130-tonne tank becomes dead weight. Stage promptly at Main Engine Cutoff (MECO), ignite Stage 2’s five J-2 engines, and jettison the Launch Escape System!'
    },
    lesson: {
      zh: 'Why multi-stage rockets? Structural dead weight kills acceleration. Shedding the 130-tonne empty S-IC stage and 4-tonne escape tower lets the high-efficiency upper stage push Apoapsis into space!',
      en: 'Why multi-stage rockets? Structural dead weight kills acceleration. Shedding the 130-tonne empty S-IC stage and 4-tonne escape tower lets the high-efficiency upper stage push Apoapsis into space!'
    },
    scienceTerm: {
      term: LIFTOFF_GLOSSARY[3].term,
      explanation: LIFTOFF_GLOSSARY[3].teenExplanation
    },
    initialState: {
      altitudeM: 58000,
      downrangeM: 76000,
      verticalSpeedMs: 1180,
      horizontalSpeedMs: 1850,
      pitchDeg: 32,
      activeStageIndex: 0,
      stageFuelFractions: [0.08, 1.0, 1.0],
      clampsReleased: true,
      towerJettisoned: false,
      throttle: 1.0,
      sasMode: 'pitch_program',
      initialTimeS: 148
    },
    targets: {
      minApoapsisM: 165000,
      requireStageIndex: 1,
      requireTowerJettison: true,
      maxTimeS: 260
    }
  },

  {
    id: 3,
    vehicleId: 'saturn-v',
    title: {
      zh: 'Orbit Insertion · First Cosmic Velocity',
      en: 'Orbit Insertion · First Cosmic Velocity'
    },
    subtitle: {
      zh: 'Final Mission: Accelerate horizontally near Apoapsis to ~7.8 km/s and raise Periapsis > 155 km!',
      en: 'Final Mission: Accelerate horizontally near Apoapsis to ~7.8 km/s and raise Periapsis > 155 km!'
    },
    objective: {
      zh: 'Stage into S-IVB, level the nose horizontally (0°–10° pitch) near Apoapsis, and accelerate east to ~7,790 m/s until Periapsis (Pe) ≥ 155 km and Apoapsis (Ap) ≥ 175 km!',
      en: 'Stage into S-IVB, level the nose horizontally (0°–10° pitch) near Apoapsis, and accelerate east to ~7,790 m/s until Periapsis (Pe) ≥ 155 km and Apoapsis (Ap) ≥ 175 km!'
    },
    hint: {
      zh: 'Once Apoapsis (Ap) nears 185 km, pitch down nearly flat (0°–5°) to build horizontal speed! As orbital velocity hits ~7.8 km/s, Periapsis (Pe) will climb from negative to > 155 km!',
      en: 'Once Apoapsis (Ap) nears 185 km, pitch down nearly flat (0°–5°) to build horizontal speed! As orbital velocity hits ~7.8 km/s, Periapsis (Pe) will climb from negative to > 155 km!'
    },
    passCriteria: {
      zh: 'Stable LEO: Periapsis (Pe) ≥ 155 km · Apoapsis (Ap) ≥ 175 km · Eccentricity e < 0.03',
      en: 'Stable LEO: Periapsis (Pe) ≥ 155 km · Apoapsis (Ap) ≥ 175 km · Eccentricity e < 0.03'
    },
    brief: {
      zh: 'Final push to orbit! Reaching 185 km altitude alone is suborbital—without horizontal speed, you fall right back down! Stage to S-IVB, level out near Apoapsis, and hit 7.8 km/s orbital speed to raise Periapsis safely into space!',
      en: 'Final push to orbit! Reaching 185 km altitude alone is suborbital—without horizontal speed, you fall right back down! Stage to S-IVB, level out near Apoapsis, and hit 7.8 km/s orbital speed to raise Periapsis safely into space!'
    },
    lesson: {
      zh: 'Orbiting means flying sideways so fast that your downward fall matches Earth’s curvature. Burning horizontally near Apoapsis raises Periapsis on the opposite side of Earth to circularize the orbit.',
      en: 'Orbiting means flying sideways so fast that your downward fall matches Earth’s curvature. Burning horizontally near Apoapsis raises Periapsis on the opposite side of Earth to circularize the orbit.'
    },
    scienceTerm: {
      term: LIFTOFF_GLOSSARY[4].term,
      explanation: LIFTOFF_GLOSSARY[4].teenExplanation
    },
    initialState: {
      altitudeM: 162000,
      downrangeM: 680000,
      verticalSpeedMs: 310,
      horizontalSpeedMs: 5650,
      pitchDeg: 14,
      activeStageIndex: 1,
      stageFuelFractions: [0.0, 0.12, 1.0],
      clampsReleased: true,
      towerJettisoned: true,
      throttle: 1.0,
      sasMode: 'pitch_program',
      initialTimeS: 465
    },
    targets: {
      minApoapsisM: 175000,
      maxApoapsisM: 280000,
      minPeriapsisM: 155000,
      maxEccentricity: 0.03,
      requireOrbitStable: true,
      maxTimeS: 300
    }
  }
];

/**
 * Full mission launch sequence (id = 4):
 * From Pad 39A ignition water sound suppression at 0 m to Low Earth Orbit insertion:
 * Ignition thrust buildup -> Hold-down clamp release -> Tower clear -> Pitch-over -> Transonic Max-Q -> Stage 1/2 separation -> Escape tower / fairing jettison -> Upper stage burn -> 185 km circular orbit insertion
 */
export const fullLaunchScenario: LiftoffScenarioConfig = {
  id: 4,
  vehicleId: 'saturn-v',
  title: {
    zh: 'Full Launch Sequence · Pad to 185 km Orbit',
    en: 'Full Launch Sequence · Pad to 185 km Orbit'
  },
  subtitle: {
    zh: 'Complete Launch: Water Deluge Ignition → Tower Clear → Gravity Turn → Max-Q → Staging & Fairing Sep → 7.8 km/s LEO Insertion',
    en: 'Complete Launch: Water Deluge Ignition → Tower Clear → Gravity Turn → Max-Q → Staging & Fairing Sep → 7.8 km/s LEO Insertion'
  },
  objective: {
    zh: 'Execute the complete launch sequence from 0 m on the pad through Tower Clear, Gravity Turn, Max-Q, Multi-Stage Separation, LES/Fairing Jettison, and 7.8 km/s circular LEO insertion!',
    en: 'Execute the complete launch sequence from 0 m on the pad through Tower Clear, Gravity Turn, Max-Q, Multi-Stage Separation, LES/Fairing Jettison, and 7.8 km/s circular LEO insertion!'
  },
  hint: {
    zh: 'Engage [Auto Turn] or click [Demo] to experience the full continuous launch sequence from ignition water deluge to orbital insertion!',
    en: 'Engage [Auto Turn] or click [Demo] to experience the full continuous launch sequence from ignition water deluge to orbital insertion!'
  },
  passCriteria: {
    zh: 'Full pad-to-orbit ascent · Multi-stage separation & LES jettison · Periapsis Pe ≥ 155 km · Apoapsis Ap ≥ 175 km',
    en: 'Full pad-to-orbit ascent · Multi-stage separation & LES jettison · Periapsis Pe ≥ 155 km · Apoapsis Ap ≥ 175 km'
  },
  brief: {
    zh: 'Experience the complete, uninterrupted rocket launch sequence from Pad Water Deluge and Main Engine Ignition through Tower Clear, Cloud Deck penetration, Max-Q, Stage & Fairing Separation, all the way to 7.8 km/s Low Earth Orbit!',
    en: 'Experience the complete, uninterrupted rocket launch sequence from Pad Water Deluge and Main Engine Ignition through Tower Clear, Cloud Deck penetration, Max-Q, Stage & Fairing Separation, all the way to 7.8 km/s Low Earth Orbit!'
  },
  lesson: {
    zh: 'A real orbital launch is a tightly choreographed chain of physics milestones: thrust buildup before hold-down release, zero-AoA gravity turn through Max-Q, shedding stage/fairing dead weight, and horizontal circularization at Apoapsis.',
    en: 'A real orbital launch is a tightly choreographed chain of physics milestones: thrust buildup before hold-down release, zero-AoA gravity turn through Max-Q, shedding stage/fairing dead weight, and horizontal circularization at Apoapsis.'
  },
  scienceTerm: {
    term: LIFTOFF_GLOSSARY[4].term,
    explanation: LIFTOFF_GLOSSARY[4].teenExplanation
  },
  initialState: {
    altitudeM: 0,
    downrangeM: 0,
    verticalSpeedMs: 0,
    horizontalSpeedMs: 0,
    pitchDeg: 90,
    activeStageIndex: 0,
    stageFuelFractions: [1.0, 1.0, 1.0],
    clampsReleased: false,
    towerJettisoned: false,
    throttle: 1.0,
    sasMode: 'pitch_program',
    initialTimeS: 0
  },
  targets: {
    minApoapsisM: 175000,
    maxApoapsisM: 290000,
    minPeriapsisM: 155000,
    maxEccentricity: 0.035,
    requireTowerJettison: true,
    requireOrbitStable: true,
    maxTimeS: 920
  }
};

export function getLiftoffScenario(id: number): LiftoffScenarioConfig {
  if (id === 4) return fullLaunchScenario;
  return liftoffScenarios.find((s) => s.id === id) ?? liftoffScenarios[0];
}

type ScenarioText = Pick<
  LiftoffScenarioConfig,
  'subtitle' | 'objective' | 'hint' | 'passCriteria' | 'brief' | 'lesson' | 'scienceTerm'
>;

interface LiftoffScenarioOverride extends Partial<ScenarioText> {
  initialState?: Partial<LiftoffScenarioConfig['initialState']>;
  targets?: Partial<LiftoffScenarioConfig['targets']>;
}

const same = (text: string): Localized => ({ zh: text, en: text });

/**
 * Vehicle-specific adjustments layered on top of the shared 4-level curriculum.
 * SLS flies the same lessons, but its hardware (boosters, core stage, ICPS, Orion LAS)
 * and the Artemis I timeline differ from Saturn V.
 */
const VEHICLE_SCENARIO_OVERRIDES: Partial<Record<RocketVehicleId, Record<number, LiftoffScenarioOverride>>> = {
  sls: {
    1: {
      brief: same(
        'Welcome to Launch Complex 39B! Command the 2,600-tonne Space Launch System. The four RS-25 engines start first; once thrust builds and TWR > 1.0, release the hold-down posts to light the twin solid rocket boosters, clear the Mobile Launcher tower vertically, and execute a smooth eastward gravity turn through Max-Q.'
      ),
      scienceTerm: {
        term: LIFTOFF_GLOSSARY[0].term,
        explanation: same(
          'If TWR is below 1.0, the rocket cannot lift off at all! Fully fueled, SLS weighs about 2,600 tonnes, and its boosters plus RS-25s give a liftoff TWR near 1.3 — it clears the tower in about 7 seconds. Keep Angle of Attack tight through Max-Q (~13 km) as gravity bends your trajectory toward orbit.'
        )
      },
      lesson: same(
        'Solid rocket boosters cannot be throttled or shut down once lit — that is why the RS-25s are checked first and the boosters ignite only at release. Fly zero-AoA along the Prograde vector through Max-Q.'
      )
    },
    2: {
      subtitle: same('Goal: Drop the burned-out boosters, fly on the core stage, jettison the LAS > 90 km & push Apoapsis > 165 km'),
      objective: same(
        'Wait for the solid rocket boosters to burn out, press Space to separate them, keep flying on the four RS-25 core engines, jettison the Launch Abort System above 90 km, and push Apoapsis (Ap) above 165 km!'
      ),
      hint: same(
        'Watch the boost-phase fuel bar! Separating while the boosters still burn smashes them into the core stage. At 0%, press Space. Above 90 km, jettison the Launch Abort System!'
      ),
      passCriteria: same('Core stage flying alone · Launch Abort System jettisoned · Predicted Apoapsis (Ap) ≥ 165 km'),
      brief: same(
        'About two minutes after liftoff the twin boosters are almost empty. Their 98-tonne steel casings are dead weight once the propellant is gone. Separate them at burnout, let the orange core stage carry on alone, and jettison the Launch Abort System once Orion is above the dense atmosphere.'
      ),
      lesson: same(
        'Parallel staging: the boosters and core burn together, then the boosters fall away while the core keeps firing. Right after separation the core’s thrust-to-weight is barely above 1.0 — SLS climbs slowly until it burns off more propellant.'
      )
    },
    3: {
      subtitle: same('Goal: Finish the core burn, separate, and fly the ICPS perigee raise until Periapsis > 155 km'),
      objective: same(
        'Ride the core stage to Main Engine Cutoff (MECO), press Space to separate it, then fly the ICPS’s single RL10 engine: keep the nose near the horizon and burn until Periapsis (Pe) ≥ 155 km. Like Artemis I, an elliptical orbit is fine!'
      ),
      hint: same(
        'The ICPS pushes with only 110 kN, so the burn takes a few minutes. Hold the nose near (or slightly below) the horizon and watch Periapsis climb.'
      ),
      passCriteria: same('Periapsis Pe ≥ 155 km · Apoapsis Ap 175–2,500 km (elliptical parking orbit, as on Artemis I)'),
      brief: same(
        'Eight minutes in, the core stage is nearly empty at 158 km — fast, but its orbit still dips back into the atmosphere. After MECO the core separates and the Interim Cryogenic Propulsion Stage performs the perigee raise maneuver, lifting the low point of the orbit clear of the air, just as it did on Artemis I.'
      ),
      lesson: same(
        'High efficiency beats high thrust in space: the RL10B-2’s 465 s specific impulse lets 28 tonnes of propellant add about 3 km/s — enough to circularize and, on a real Artemis flight, send Orion to the Moon.'
      ),
      initialState: {
        altitudeM: 158000,
        downrangeM: 1450000,
        verticalSpeedMs: 140,
        horizontalSpeedMs: 6550,
        pitchDeg: 6,
        activeStageIndex: 1,
        stageFuelFractions: [0.0, 0.035, 1.0],
        throttle: 0.67,
        initialTimeS: 455
      },
      targets: {
        maxApoapsisM: 2500000,
        maxEccentricity: 0.2,
        maxTimeS: 620
      }
    },
    4: {
      objective: same(
        'Fly the complete Artemis I ascent: RS-25 start, booster ignition and liftoff, gravity turn through Max-Q, booster separation, Launch Abort System jettison, core stage MECO, and ICPS orbit insertion at 7.8 km/s!'
      ),
      passCriteria: same(
        'Full pad-to-orbit ascent · Booster separation & LAS jettison · Periapsis Pe ≥ 155 km · Apoapsis Ap ≥ 175 km'
      )
    }
  }
};

/** Scenario with any vehicle-specific starting state, targets and text applied. */
export function getLiftoffScenarioForVehicle(id: number, vehicleId: RocketVehicleId): LiftoffScenarioConfig {
  const base = structuredClone(getLiftoffScenario(id));
  base.vehicleId = vehicleId;
  const o = VEHICLE_SCENARIO_OVERRIDES[vehicleId]?.[id];
  if (!o) return base;
  const { initialState, targets, ...text } = o;
  return {
    ...base,
    ...text,
    initialState: { ...base.initialState, ...initialState },
    targets: { ...base.targets, ...targets }
  };
}
