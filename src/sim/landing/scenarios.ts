import type { Localized as LocalizedText } from '../types';
import type { LandingScenarioConfig } from './types';

export interface LandingGlossaryItem {
  id: string;
  term: LocalizedText;
  short: LocalizedText;
  detail: LocalizedText;
}

export const LANDING_GLOSSARY: LandingGlossaryItem[] = [
  {
    id: 'ablative-heatshield',
    term: {
      zh: 'Blunt-Body Ablative Heat Shield',
      en: 'Blunt-Body Ablative Heat Shield'
    },
    short: {
      zh: 'A sacrificial thermal shield that melts and vaporizes layer by layer to carry away 2000°C reentry heat!',
      en: 'A sacrificial thermal shield that melts and vaporizes layer by layer to carry away 2000°C reentry heat!'
    },
    detail: {
      zh: 'A blunt bell shape pushes a detached bow shock wave ahead of the capsule, deflecting 90% of shock heating into the air. The remaining heat is absorbed as the ablative material chars and vaporizes away, keeping the cabin inside at a comfortable 25°C.',
      en: 'A blunt bell shape pushes a detached bow shock wave ahead of the capsule, deflecting 90% of shock heating into the air. The remaining heat is absorbed as the ablative material chars and vaporizes away, keeping the cabin inside at a comfortable 25°C.'
    }
  },
  {
    id: 'plasma-blackout',
    term: {
      zh: 'Plasma Radio Blackout Zone (80–38 km)',
      en: 'Plasma Radio Blackout Zone (80–38 km)'
    },
    short: {
      zh: 'The tense minutes when superheated ionized plasma wraps the capsule and blocks all radio signals!',
      en: 'The tense minutes when superheated ionized plasma wraps the capsule and blocks all radio signals!'
    },
    detail: {
      zh: 'Between 80 km and 38 km altitude, hypersonic shock heating ionizes surrounding air into a glowing plasma sheath. This conductive layer blocks all radio communication with Mission Control. The capsule must keep its heat shield pointed strictly into the airflow to survive.',
      en: 'Between 80 km and 38 km altitude, hypersonic shock heating ionizes surrounding air into a glowing plasma sheath. This conductive layer blocks all radio communication with Mission Control. The capsule must keep its heat shield pointed strictly into the airflow to survive.'
    }
  },
  {
    id: 'two-stage-chutes',
    term: {
      zh: 'Two-Stage Parachute System (Drogue & 1200 m² Main)',
      en: 'Two-Stage Parachute System (Drogue & 1200 m² Main)'
    },
    short: {
      zh: 'A small tough drogue chute brakes the capsule first before the giant 1200 m² main chute unfurls.',
      en: 'A small tough drogue chute brakes the capsule first before the giant 1200 m² main chute unfurls.'
    },
    detail: {
      zh: 'Opening a 1200 m² main parachute at 220 m/s would shred the canopy instantly! Instead, a rugged drogue chute deploys around 10 km to slow the capsule below 90 m/s, followed by the giant main parachute at 6 km.',
      en: 'Opening a 1200 m² main parachute at 220 m/s would shred the canopy instantly! Instead, a rugged drogue chute deploys around 10 km to slow the capsule below 90 m/s, followed by the giant main parachute at 6 km.'
    }
  },
  {
    id: 'retro-rockets',
    term: {
      zh: '1.5 m Soft-Landing Retro-Rockets',
      en: '1.5 m Soft-Landing Retro-Rockets'
    },
    short: {
      zh: 'Solid rockets that fire 1.5 meters above ground to cushion touchdown to a gentle bump!',
      en: 'Solid rockets that fire 1.5 meters above ground to cushion touchdown to a gentle bump!'
    },
    detail: {
      zh: 'Even under the main parachute, the 3-ton capsule descends at ~7.5 m/s (like jumping from a 3rd-floor window). After jettisoning the charred heat shield, four solid retro-rockets ignite 1.5 meters above ground, braking touchdown speed below 2 m/s!',
      en: 'Even under the main parachute, the 3-ton capsule descends at ~7.5 m/s (like jumping from a 3rd-floor window). After jettisoning the charred heat shield, four solid retro-rockets ignite 1.5 meters above ground, braking touchdown speed below 2 m/s!'
    }
  }
];

export const LANDING_SCENARIOS: LandingScenarioConfig[] = [
  {
    id: 1,
    code: 'LND-01',
    title: {
      zh: 'Plasma Blackout · Heat Shield Attitude Guard',
      en: 'Plasma Blackout · Heat Shield Attitude Guard'
    },
    subtitle: {
      zh: 'Level 1: Keep the heat shield aligned against turbulence and survive the 80–36 km blackout zone',
      en: 'Level 1: Keep the heat shield aligned against turbulence and survive the 80–36 km blackout zone'
    },
    brief: {
      zh: 'Plunging at 5200 m/s inside a 2000°C plasma fireball! Turbulence is tilting the capsule. Use A/D (or Left/Right arrows) to keep heat-shield deviation within 5° and use W/S to manage G-load until you exit blackout below 36 km!',
      en: 'Plunging at 5200 m/s inside a 2000°C plasma fireball! Turbulence is tilting the capsule. Use A/D (or Left/Right arrows) to keep heat-shield deviation within 5° and use W/S to manage G-load until you exit blackout below 36 km!'
    },
    objective: {
      zh: 'Keep heat-shield deviation <= 6.0° with A/D and G-load <= 6.5 G with W/S until descending below 36 km.',
      en: 'Keep heat-shield deviation <= 6.0° with A/D and G-load <= 6.5 G with W/S until descending below 36 km.'
    },
    passCriteria: {
      zh: 'Alt ≤ 36 km · Shield Integrity ≥ 70% · Deviation ≤ 6.0°',
      en: 'Alt ≤ 36 km · Shield Integrity ≥ 70% · Deviation ≤ 6.0°'
    },
    hint: {
      zh: 'Use [A]/[D] to center the heat shield at 0°, press [W] to increase lift and reduce G-load, or press [T] for SAS!',
      en: 'Use [A]/[D] to center the heat shield at 0°, press [W] to increase lift and reduce G-load, or press [T] for SAS!'
    },
    scienceTerm: {
      term: {
        zh: 'Blackout Zone & Ablative Shield',
      en: 'Blackout Zone & Ablative Shield'
      },
      explanation: {
        zh: 'Superheated ionized plasma blocks radio waves from 80 to 38 km. The ablative shield melts layer by layer to carry heat away, so it must stay pointed directly into the hypersonic stream.',
      en: 'Superheated ionized plasma blocks radio waves from 80 to 38 km. The ablative shield melts layer by layer to carry heat away, so it must stay pointed directly into the hypersonic stream.'
      }
    },
    maxTimeS: 120,
    initialState: {
      altitudeM: 66000,
      speedMs: 5200,
      descentRateMs: 920,
      attitudeDeviationDeg: 3.2,
      chuteState: 'stowed',
      heatshieldJettisoned: false
    }
  },
  {
    id: 2,
    code: 'LND-02',
    title: {
      zh: 'Sky Blossom · Drogue & Main Chute Sequence',
      en: 'Sky Blossom · Drogue & Main Chute Sequence'
    },
    subtitle: {
      zh: 'Level 2: Hit the subsonic deployment windows for the drogue chute and 1200 m² main parachute',
      en: 'Level 2: Hit the subsonic deployment windows for the drogue chute and 1200 m² main parachute'
    },
    brief: {
      zh: 'Out of blackout at 12.5 km! Do NOT deploy chutes above 235 m/s or they will shred! Wait until speed drops <= 225 m/s (~10 km) and press [Space] for the Drogue chute; once speed <= 95 m/s (~6 km), press [Space] for the Main chute!',
      en: 'Out of blackout at 12.5 km! Do NOT deploy chutes above 235 m/s or they will shred! Wait until speed drops <= 225 m/s (~10 km) and press [Space] for the Drogue chute; once speed <= 95 m/s (~6 km), press [Space] for the Main chute!'
    },
    objective: {
      zh: 'Press [Space] at speed <= 225 m/s for Drogue chute, then press [Space] at speed <= 95 m/s for Main chute to slow descent <= 8.5 m/s.',
      en: 'Press [Space] at speed <= 225 m/s for Drogue chute, then press [Space] at speed <= 95 m/s for Main chute to slow descent <= 8.5 m/s.'
    },
    passCriteria: {
      zh: 'Main Chute Full · Descent ≤ 8.5 m/s · Alt ≥ 2.5 km',
      en: 'Main Chute Full · Descent ≤ 8.5 m/s · Alt ≥ 2.5 km'
    },
    hint: {
      zh: 'Watch speed: below 225 m/s press [Space] for Drogue ➔ below 95 m/s press [Space] again for Main Chute!',
      en: 'Watch speed: below 225 m/s press [Space] for Drogue ➔ below 95 m/s press [Space] again for Main Chute!'
    },
    scienceTerm: {
      term: {
        zh: 'Two-Stage Parachute Braking',
      en: 'Two-Stage Parachute Braking'
      },
      explanation: {
        zh: 'The 1200 m² main canopy is the size of three basketball courts. Deploying it at high speed would tear it apart, so a smaller drogue chute brakes the capsule first.',
      en: 'The 1200 m² main canopy is the size of three basketball courts. Deploying it at high speed would tear it apart, so a smaller drogue chute brakes the capsule first.'
      }
    },
    maxTimeS: 120,
    initialState: {
      altitudeM: 12200,
      speedMs: 255,
      descentRateMs: 185,
      attitudeDeviationDeg: 1.0,
      chuteState: 'stowed',
      heatshieldJettisoned: false
    }
  },
  {
    id: 3,
    code: 'LND-03',
    title: {
      zh: 'Retro Cushion · 1.5 m Pre-Touchdown Ignition',
      en: 'Retro Cushion · 1.5 m Pre-Touchdown Ignition'
    },
    subtitle: {
      zh: 'Level 3: Jettison the charred heat shield and fire retro-rockets 1.0–2.5 m above ground',
      en: 'Level 3: Jettison the charred heat shield and fire retro-rockets 1.0–2.5 m above ground'
    },
    brief: {
      zh: 'Descending under the main chute at 7.6 m/s (48 m altitude). First press [J] (or [1]) to drop the charred heat shield and expose the retro-rockets; then watch the altimeter and press [Space] at 1.0–2.5 m to fire retro-rockets for a soft touchdown!',
      en: 'Descending under the main chute at 7.6 m/s (48 m altitude). First press [J] (or [1]) to drop the charred heat shield and expose the retro-rockets; then watch the altimeter and press [Space] at 1.0–2.5 m to fire retro-rockets for a soft touchdown!'
    },
    objective: {
      zh: 'Press [J] to drop heat shield, counter crosswind with A/D, and press [Space] between 1.0–2.5 m altitude so touchdown speed <= 2.4 m/s.',
      en: 'Press [J] to drop heat shield, counter crosswind with A/D, and press [Space] between 1.0–2.5 m altitude so touchdown speed <= 2.4 m/s.'
    },
    passCriteria: {
      zh: 'Shield Dropped [J] · Retro at 1.0–2.5 m · Touchdown ≤ 2.4 m/s',
      en: 'Shield Dropped [J] · Retro at 1.0–2.5 m · Touchdown ≤ 2.4 m/s'
    },
    hint: {
      zh: '1) Press [J] immediately to drop the heat shield ➔ 2) When altitude enters 2.4 m–1.0 m, press [Space] to fire retros!',
      en: '1) Press [J] immediately to drop the heat shield ➔ 2) When altitude enters 2.4 m–1.0 m, press [Space] to fire retros!'
    },
    scienceTerm: {
      term: {
        zh: '1.5 m Soft-Landing Retro-Rockets',
      en: '1.5 m Soft-Landing Retro-Rockets'
      },
      explanation: {
        zh: 'Parachute descent is still 7.6 m/s (like a 3rd-floor jump). Firing four solid retro-rockets 1.5 m above ground brakes the capsule to ~1.5 m/s in 0.3 seconds!',
      en: 'Parachute descent is still 7.6 m/s (like a 3rd-floor jump). Firing four solid retro-rockets 1.5 m above ground brakes the capsule to ~1.5 m/s in 0.3 seconds!'
      }
    },
    maxTimeS: 60,
    initialState: {
      altitudeM: 48,
      speedMs: 7.6,
      descentRateMs: 7.6,
      attitudeDeviationDeg: 0.5,
      chuteState: 'main',
      heatshieldJettisoned: false
    }
  },
  {
    id: 4,
    code: 'LND-04',
    title: {
      zh: 'Heroic Return · Full Atmospheric Reentry to Safe Touchdown',
      en: 'Heroic Return · Full Atmospheric Reentry to Safe Touchdown'
    },
    subtitle: {
      zh: 'Level 4: Complete return from 50 km plasma blackout, dual chutes, shield drop, to 1.5 m retro touchdown',
      en: 'Level 4: Complete return from 50 km plasma blackout, dual chutes, shield drop, to 1.5 m retro touchdown'
    },
    brief: {
      zh: 'Full return mission! 1) Hold attitude through blackout; 2) Press [Space] at <=225 m/s for Drogue and <=95 m/s for Main chute; 3) Press [J] to drop the heat shield; 4) Press [Space] at 1.0–2.5 m for soft retro touchdown!',
      en: 'Full return mission! 1) Hold attitude through blackout; 2) Press [Space] at <=225 m/s for Drogue and <=95 m/s for Main chute; 3) Press [J] to drop the heat shield; 4) Press [Space] at 1.0–2.5 m for soft retro touchdown!'
    },
    objective: {
      zh: 'Survive blackout, deploy drogue & main chutes, drop heat shield [J], and fire retro-rockets [Space] at 1.0–2.5 m for touchdown <= 2.4 m/s.',
      en: 'Survive blackout, deploy drogue & main chutes, drop heat shield [J], and fire retro-rockets [Space] at 1.0–2.5 m for touchdown <= 2.4 m/s.'
    },
    passCriteria: {
      zh: 'Safe Touchdown (0 m) · Impact Speed ≤ 2.4 m/s · Capsule Intact',
      en: 'Safe Touchdown (0 m) · Impact Speed ≤ 2.4 m/s · Capsule Intact'
    },
    hint: {
      zh: '1) Hold shield in blackout ➔ 2) [Space] <=225 m/s (Drogue) ➔ 3) [Space] <=95 m/s (Main) + [J] (Drop Shield) ➔ 4) [Space] at ~1.8 m!',
      en: '1) Hold shield in blackout ➔ 2) [Space] <=225 m/s (Drogue) ➔ 3) [Space] <=95 m/s (Main) + [J] (Drop Shield) ➔ 4) [Space] at ~1.8 m!'
    },
    scienceTerm: {
      term: {
        zh: 'Four Stages of Crewed Capsule Return',
      en: 'Four Stages of Crewed Capsule Return'
      },
      explanation: {
        zh: 'From hypersonic fireball to a 1.5 m/s safe touchdown, four braking stages—ablative aero-braking, drogue chute, 1200 m² main canopy, and 1.5 m retro-rockets—safely dissipate orbital energy!',
      en: 'From hypersonic fireball to a 1.5 m/s safe touchdown, four braking stages—ablative aero-braking, drogue chute, 1200 m² main canopy, and 1.5 m retro-rockets—safely dissipate orbital energy!'
      }
    },
    maxTimeS: 1500,
    initialState: {
      altitudeM: 50000,
      speedMs: 3600,
      descentRateMs: 780,
      attitudeDeviationDeg: 2.4,
      chuteState: 'stowed',
      heatshieldJettisoned: false
    }
  }
];

export function getLandingScenario(id: number): LandingScenarioConfig {
  return LANDING_SCENARIOS.find((s) => s.id === id) ?? LANDING_SCENARIOS[0];
}
