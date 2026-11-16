import type { RocketVehicleConfig } from './types';

/**
 * Launch vehicle physical parameters based on published NASA technical reports:
 * 1. Saturn V (AS-506 / Apollo 11):
 *    Source: NASA Marshall Space Flight Center "Saturn V Launch Vehicle Flight Evaluation Report - AS-506 Apollo 11" (MPR-SAT-FE-69-9)
 * 2. Space Launch System (SLS Block 1 / Artemis 1):
 *    Source: NASA Exploration Systems Development Directorate (ESDD) Artemis 1 Mission Report
 */
export const ROCKET_VEHICLES: Record<'saturn-v' | 'sls' | 'cz5' | 'cz2f', RocketVehicleConfig> = {
  'saturn-v': {
    id: 'saturn-v',
    name: {
      zh: 'Saturn V · Apollo Heavy Launch Vehicle',
      en: 'Saturn V · Apollo Heavy Launch Vehicle'
    },
    era: {
      zh: 'NASA Apollo Program (Apollo 11 · 1969)',
      en: 'NASA Apollo Program (Apollo 11 · 1969)'
    },
    description: {
      zh: 'Historic three-stage super heavy-lift launch vehicle standing 110.6 m tall with a liftoff mass near 2,950 tonnes. Powered by five F-1 kerolox engines on Stage 1 and high-efficiency J-2 hydrolox engines on Stages 2 and 3.',
      en: 'Historic three-stage super heavy-lift launch vehicle standing 110.6 m tall with a liftoff mass near 2,950 tonnes. Powered by five F-1 kerolox engines on Stage 1 and high-efficiency J-2 hydrolox engines on Stages 2 and 3.'
    },
    launchLatitudeDeg: 28.608, // Kennedy Space Center LC-39A (28.608° N)
    launchSite: {
      zh: 'Kennedy Space Center Launch Complex 39A (LC-39A)',
      en: 'Kennedy Space Center Launch Complex 39A (LC-39A)'
    },
    // Apollo Command/Service Module (CSM ~ 30,300 kg) + Lunar Module (LM ~ 15,100 kg) + adapter (~1,800 kg)
    payloadMassKg: 47200,
    // Launch Escape System (LES) mass ~4,000 kg, jettisoned after Stage 2 ignition at ~92 km
    launchEscapeTowerMassKg: 4000,
    towerJettisonAltitudeM: 92000,
    // Maximum aerodynamic bending threshold Q*alpha (kPa·deg): exceeding ~6.5° AoA at Max-Q (~35 kPa) triggers structural overstress
    maxQAlphaKpaDeg: 230,
    maxGLoad: 6.0,
    stages: [
      {
        stageNumber: 1,
        code: 'S-IC',
        name: {
          zh: 'Stage 1 · S-IC (5× F-1 Kerolox Engines)',
          en: 'Stage 1 · S-IC (5× F-1 Kerolox Engines)'
        },
        engineDesc: {
          zh: 'Five F-1 engines producing 34.5 MN sea-level thrust, burning 13 tonnes of RP-1/LOX per second to lift the stack out of the dense lower atmosphere.',
          en: 'Five F-1 engines producing 34.5 MN sea-level thrust, burning 13 tonnes of RP-1/LOX per second to lift the stack out of the dense lower atmosphere.'
        },
        dryMassKg: 130400,
        fuelMassKg: 2146000,
        thrustSeaLevelN: 34500000,
        thrustVacuumN: 39200000,
        ispSeaLevelS: 265,
        ispVacuumS: 304,
        referenceAreaM2: 80.1, // Cross-sectional area for 10.06 m diameter cylinder (pi * 5.03^2)
        gimbalRangeDeg: 5.5,
        minThrottle: 0.55
      },
      {
        stageNumber: 2,
        code: 'S-II',
        name: {
          zh: 'Stage 2 · S-II (5× J-2 Hydrolox Engines)',
          en: 'Stage 2 · S-II (5× J-2 Hydrolox Engines)'
        },
        engineDesc: {
          zh: 'Five J-2 cryogenic hydrogen/oxygen engines with 421 s vacuum specific impulse, accelerating the vehicle to near-orbital velocity at ~185 km altitude.',
          en: 'Five J-2 cryogenic hydrogen/oxygen engines with 421 s vacuum specific impulse, accelerating the vehicle to near-orbital velocity at ~185 km altitude.'
        },
        dryMassKg: 36200,
        fuelMassKg: 444000,
        thrustSeaLevelN: 2450000,
        thrustVacuumN: 5115000,
        ispSeaLevelS: 200,
        ispVacuumS: 421,
        referenceAreaM2: 80.1,
        gimbalRangeDeg: 7.0,
        minThrottle: 0.60
      },
      {
        stageNumber: 3,
        code: 'S-IVB',
        name: {
          zh: 'Stage 3 · S-IVB (1× J-2 Orbital Insertion Stage)',
          en: 'Stage 3 · S-IVB (1× J-2 Orbital Insertion Stage)'
        },
        engineDesc: {
          zh: 'Single restartable J-2 engine that completes circular orbit insertion at ~7.8 km/s in Low Earth Parking Orbit.',
          en: 'Single restartable J-2 engine that completes circular orbit insertion at ~7.8 km/s in Low Earth Parking Orbit.'
        },
        dryMassKg: 13300,
        fuelMassKg: 107100,
        thrustSeaLevelN: 480000,
        thrustVacuumN: 1023000,
        ispSeaLevelS: 200,
        ispVacuumS: 421,
        referenceAreaM2: 34.2, // 6.6 m diameter
        gimbalRangeDeg: 7.5,
        minThrottle: 0.50
      }
    ]
  },

  'sls': {
    id: 'sls',
    name: {
      zh: 'Space Launch System · Artemis I (SLS Block 1)',
      en: 'Space Launch System · Artemis I (SLS Block 1)'
    },
    era: {
      zh: 'NASA Artemis Program (Artemis I · 2022)',
      en: 'NASA Artemis Program (Artemis I · 2022)'
    },
    description: {
      zh: 'NASA’s super heavy-lift Moon rocket: 98 m tall, about 2,600 tonnes at liftoff. Two 5-segment solid rocket boosters and four RS-25 hydrolox engines lift Orion off the pad; the boosters drop away after about two minutes and the orange core stage keeps burning for eight.',
      en: 'NASA’s super heavy-lift Moon rocket: 98 m tall, about 2,600 tonnes at liftoff. Two 5-segment solid rocket boosters and four RS-25 hydrolox engines lift Orion off the pad; the boosters drop away after about two minutes and the orange core stage keeps burning for eight.'
    },
    launchLatitudeDeg: 28.627, // Kennedy Space Center LC-39B (28.627° N)
    launchSite: {
      zh: 'Kennedy Space Center Launch Complex 39B (LC-39B)',
      en: 'Kennedy Space Center Launch Complex 39B (LC-39B)'
    },
    // Orion crew module + European service module + spacecraft adapter (~26.5 t at launch, without LAS)
    payloadMassKg: 26500,
    // Launch Abort System (abort motor, attitude control motor, jettison motor + ogive fairing)
    launchEscapeTowerMassKg: 7400,
    towerJettisonAltitudeM: 90000,
    maxQAlphaKpaDeg: 235,
    maxGLoad: 5.0,
    // Parallel staging is modelled as three sequential phases sharing the core stage:
    //   1. Boost phase: 2 × SRB + 4 × RS-25 (core propellant burned during boost is counted here)
    //   2. Core phase: 4 × RS-25 alone after booster separation (~T+2 min) until MECO (~T+8 min)
    //   3. ICPS: single RL10B-2 for orbit insertion
    stages: [
      {
        stageNumber: 1,
        code: 'SRB+Core',
        name: {
          zh: 'Boost Phase · 2× 5-Segment SRB + 4× RS-25',
          en: 'Boost Phase · 2× 5-Segment SRB + 4× RS-25'
        },
        engineDesc: {
          zh: 'Twin 5-segment solid rocket boosters provide over 75% of liftoff thrust while the four RS-25 core engines burn alongside them. Solid motors cannot be shut down once lit.',
          en: 'Twin 5-segment solid rocket boosters provide over 75% of liftoff thrust while the four RS-25 core engines burn alongside them. Solid motors cannot be shut down once lit.'
        },
        // Spent booster casings jettisoned at separation (2 × ~98 t inert)
        dryMassKg: 196000,
        // 2 × 631 t solid propellant + ~263 t core LH2/LOX consumed during the boost phase
        fuelMassKg: 1525000,
        thrustSeaLevelN: 34000000,
        thrustVacuumN: 36500000,
        ispSeaLevelS: 275,
        ispVacuumS: 300,
        referenceAreaM2: 77.0, // 8.4 m core + two 3.71 m boosters
        gimbalRangeDeg: 6.0,
        minThrottle: 0.67
      },
      {
        stageNumber: 2,
        code: 'Core',
        name: {
          zh: 'Core Stage · 4× RS-25 Hydrolox Engines',
          en: 'Core Stage · 4× RS-25 Hydrolox Engines'
        },
        engineDesc: {
          zh: 'Four RS-25 engines (flown on the Space Shuttle) burn liquid hydrogen and oxygen at 452 s vacuum specific impulse, pushing the vehicle to near-orbital speed before main engine cutoff (MECO).',
          en: 'Four RS-25 engines (flown on the Space Shuttle) burn liquid hydrogen and oxygen at 452 s vacuum specific impulse, pushing the vehicle to near-orbital speed before main engine cutoff (MECO).'
        },
        dryMassKg: 85300,
        fuelMassKg: 724000,
        thrustSeaLevelN: 7440000,
        thrustVacuumN: 9120000,
        ispSeaLevelS: 366,
        ispVacuumS: 452,
        referenceAreaM2: 55.4, // 8.4 m diameter
        gimbalRangeDeg: 8.0,
        minThrottle: 0.67
      },
      {
        stageNumber: 3,
        code: 'ICPS',
        name: {
          zh: 'ICPS · 1× RL10B-2 Cryogenic Upper Stage',
          en: 'ICPS · 1× RL10B-2 Cryogenic Upper Stage'
        },
        engineDesc: {
          zh: 'The Interim Cryogenic Propulsion Stage fires a single high-expansion RL10B-2 engine (465.5 s Isp) to raise perigee and finish orbit insertion.',
          en: 'The Interim Cryogenic Propulsion Stage fires a single high-expansion RL10B-2 engine (465.5 s Isp) to raise perigee and finish orbit insertion.'
        },
        dryMassKg: 3490,
        fuelMassKg: 28600,
        thrustSeaLevelN: 60000,
        thrustVacuumN: 110100,
        ispSeaLevelS: 250,
        ispVacuumS: 465.5,
        referenceAreaM2: 19.6, // 5 m diameter
        gimbalRangeDeg: 8.0,
        minThrottle: 0.5
      }
    ]
  },
  // Retain cz5 / cz2f aliases falling back to saturn-v for backward compatibility
  get cz5() {
    return this['saturn-v'];
  },
  get cz2f() {
    return this['saturn-v'];
  }
};

export function getRocketVehicle(id: 'saturn-v' | 'sls' | 'cz5' | 'cz2f' = 'saturn-v'): RocketVehicleConfig {
  if (id === 'sls') return ROCKET_VEHICLES.sls;
  return ROCKET_VEHICLES[id] ?? ROCKET_VEHICLES['saturn-v'];
}
