import type { Localized as LocalizedText } from '../types';
import type { DepartureScenarioConfig } from './types';

export interface DepartureGlossaryItem {
  id: string;
  term: LocalizedText;
  short: LocalizedText;
  detail: LocalizedText;
}

export const DEPARTURE_GLOSSARY: DepartureGlossaryItem[] = [
  {
    id: 'spring-pushoff',
    term: {
      zh: 'Mechanical Spring Push-off',
      en: 'Mechanical Spring Push-off'
    },
    short: {
      zh: 'Gently pushes the multi-ton spacecraft away from the station using mechanical springs instead of thrusters!',
      en: 'Gently pushes the multi-ton spacecraft away from the station using mechanical springs instead of thrusters!'
    },
    detail: {
      zh: 'Firing thrusters right at the docking port would scorch the station’s solar arrays and optical sensors. Instead, when the 12 docking latches release, compressed springs gently push the spacecraft away at ~0.15 m/s across the 5-meter plume keep-out zone.',
      en: 'Firing thrusters right at the docking port would scorch the station’s solar arrays and optical sensors. Instead, when the 12 docking latches release, compressed springs gently push the spacecraft away at ~0.15 m/s across the 5-meter plume keep-out zone.'
    }
  },
  {
    id: 'plume-keepout',
    term: {
      zh: 'Plume Keep-Out Zone (0–5 m)',
      en: 'Plume Keep-Out Zone (0–5 m)'
    },
    short: {
      zh: 'The 5-meter safety zone in front of the docking port where axial thruster firing is forbidden.',
      en: 'The 5-meter safety zone in front of the docking port where axial thruster firing is forbidden.'
    },
    detail: {
      zh: 'Rocket exhaust expands into a wide cone in vacuum called a plume. Firing fore/aft thrusters within 5 meters of the station contaminates optical reflectors and stresses station structures. Always coast past 5 m before firing separation burns!',
      en: 'Rocket exhaust expands into a wide cone in vacuum called a plume. Firing fore/aft thrusters within 5 meters of the station contaminates optical reflectors and stresses station structures. Always coast past 5 m before firing separation burns!'
    }
  },
  {
    id: 'departure-corridor',
    term: {
      zh: 'Safety Departure Corridor',
      en: 'Safety Departure Corridor'
    },
    short: {
      zh: 'An imaginary conical safety tunnel ahead of the station that keeps the ship clear of giant solar wings.',
      en: 'An imaginary conical safety tunnel ahead of the station that keeps the ship clear of giant solar wings.'
    },
    detail: {
      zh: 'Space stations have massive solar wings and radiators extending tens of meters. During undocking, the spacecraft must stay centered inside a conical departure corridor to guarantee clearance from station structures.',
      en: 'Space stations have massive solar wings and radiators extending tens of meters. During undocking, the spacecraft must stay centered inside a conical departure corridor to guarantee clearance from station structures.'
    }
  },
  {
    id: 'nosecone-reentry-prep',
    term: {
      zh: 'Nosecone Closure for Reentry Prep',
      en: 'Nosecone Closure for Reentry Prep'
    },
    short: {
      zh: 'Closing the nosecone visor after clearing the station to protect the docking ring during reentry!',
      en: 'Closing the nosecone visor after clearing the station to protect the docking ring during reentry!'
    },
    detail: {
      zh: 'The docking mechanism contains delicate latches and sensors. Once safely past 30 meters from the station, the crew closes the aerodynamic nosecone hatch to shield the docking port for atmospheric reentry.',
      en: 'The docking mechanism contains delicate latches and sensors. Once safely past 30 meters from the station, the crew closes the aerodynamic nosecone hatch to shield the docking port for atmospheric reentry.'
    }
  }
];

export const DEPARTURE_SCENARIOS: DepartureScenarioConfig[] = [
  {
    id: 1,
    code: 'DEP-01',
    title: {
      zh: 'Latch Release · Spring Push-off Glide',
      en: 'Latch Release · Spring Push-off Glide'
    },
    subtitle: {
      zh: 'Level 1: Release latches, coast silently past the 5 m keep-out zone, and hold at 12 m',
      en: 'Level 1: Release latches, coast silently past the 5 m keep-out zone, and hold at 12 m'
    },
    brief: {
      zh: 'Docked to the station! Never fire F/R thrusters within 5 m! Press [Space] to release latches and let springs push you out. Coast past the 5 m line, then tap [R] to brake and hold steady at the 12 m ring.',
      en: 'Docked to the station! Never fire F/R thrusters within 5 m! Press [Space] to release latches and let springs push you out. Coast past the 5 m line, then tap [R] to brake and hold steady at the 12 m ring.'
    },
    objective: {
      zh: 'Press [Space] for spring push-off without firing F/R inside 0–5 m; stop within 11–14 m (speed <= 0.06 m/s) for 1.5 s.',
      en: 'Press [Space] for spring push-off without firing F/R inside 0–5 m; stop within 11–14 m (speed <= 0.06 m/s) for 1.5 s.'
    },
    passCriteria: {
      zh: 'Dist 11.0–14.0 m · Speed ≤ 0.06 m/s · No Plume Contamination',
      en: 'Dist 11.0–14.0 m · Speed ≤ 0.06 m/s · No Plume Contamination'
    },
    hint: {
      zh: 'Press [Space] to undock ➔ Coast past 5.0 m keep-out line ➔ Use [F] to back up and [R] to brake at 12 m!',
      en: 'Press [Space] to undock ➔ Coast past 5.0 m keep-out line ➔ Use [F] to back up and [R] to brake at 12 m!'
    },
    scienceTerm: {
      term: {
        zh: 'Spring Push-off & Plume Keep-Out Zone',
      en: 'Spring Push-off & Plume Keep-Out Zone'
      },
      explanation: {
        zh: 'Thruster exhaust plumes can damage station solar panels and optics within 5 meters. Compressed springs push the ship gently across the 5 m keep-out zone before thrusters may fire.',
      en: 'Thruster exhaust plumes can damage station solar panels and optics within 5 meters. Compressed springs push the ship gently across the 5 m keep-out zone before thrusters may fire.'
      }
    },
    maxTimeS: 160,
    initialState: {
      position: [0, 0, 0.35],
      velocity: [0, 0, 0],
      attitudeDeg: [0, 0, 0],
      angularVelDeg: [0, 0, 0],
      latchesReleased: false,
      noseconeClosed: false
    }
  },
  {
    id: 2,
    code: 'DEP-02',
    title: {
      zh: 'Corridor Centering · Cancel Lateral Drift',
      en: 'Corridor Centering · Cancel Lateral Drift'
    },
    subtitle: {
      zh: 'Level 2: Cancel lateral drift after undocking and stay centered inside the departure cone',
      en: 'Level 2: Cancel lateral drift after undocking and stay centered inside the departure cone'
    },
    brief: {
      zh: 'Just past the 5 m line, an uneven spring push caused a lateral drift toward the solar array hazard zone! Use A/D (left/right) and W/S (up/down) to recenter inside the corridor and back past 18 m!',
      en: 'Just past the 5 m line, an uneven spring push caused a lateral drift toward the solar array hazard zone! Use A/D (left/right) and W/S (up/down) to recenter inside the corridor and back past 18 m!'
    },
    objective: {
      zh: 'Use W/S/A/D to bring lateral offset <= 0.25 m and lateral speed <= 0.04 m/s while backing past 18 m.',
      en: 'Use W/S/A/D to bring lateral offset <= 0.25 m and lateral speed <= 0.04 m/s while backing past 18 m.'
    },
    passCriteria: {
      zh: 'Dist ≥ 18 m · Offset ≤ 0.25 m · Lateral Speed ≤ 0.04 m/s',
      en: 'Dist ≥ 18 m · Offset ≤ 0.25 m · Lateral Speed ≤ 0.04 m/s'
    },
    hint: {
      zh: 'Tap [A] (left) and [W] (up) to return to the crosshair center, then counter-tap to zero lateral speed!',
      en: 'Tap [A] (left) and [W] (up) to return to the crosshair center, then counter-tap to zero lateral speed!'
    },
    scienceTerm: {
      term: {
        zh: 'Safety Departure Corridor',
      en: 'Safety Departure Corridor'
      },
      explanation: {
        zh: 'Massive solar arrays flank the station. Backing out requires staying strictly inside a conical safety corridor along the docking axis.',
      en: 'Massive solar arrays flank the station. Backing out requires staying strictly inside a conical safety corridor along the docking axis.'
      }
    },
    maxTimeS: 160,
    initialState: {
      position: [0.48, -0.36, 5.8],
      velocity: [0.14, -0.11, 0.22],
      attitudeDeg: [0, 0, 0],
      angularVelDeg: [0, 0, 0],
      latchesReleased: true,
      noseconeClosed: false
    }
  },
  {
    id: 3,
    code: 'DEP-03',
    title: {
      zh: 'Attitude Watch · Lidar Lock While Backing',
      en: 'Attitude Watch · Lidar Lock While Backing'
    },
    subtitle: {
      zh: 'Level 3: Counter rotational disturbance while backing out so nose lidar stays locked on station',
      en: 'Level 3: Counter rotational disturbance while backing out so nose lidar stays locked on station'
    },
    brief: {
      zh: 'A torque disturbance tilted the ship! Safety rules require the nose lidar to stay pointed at the station port while backing away. Use Arrow keys and Q/E to align attitude within 2.0° and back past 24 m!',
      en: 'A torque disturbance tilted the ship! Safety rules require the nose lidar to stay pointed at the station port while backing away. Use Arrow keys and Q/E to align attitude within 2.0° and back past 24 m!'
    },
    objective: {
      zh: 'Align attitude error <= 2.0° and angular speed <= 0.4°/s while backing past 24 m.',
      en: 'Align attitude error <= 2.0° and angular speed <= 0.4°/s while backing past 24 m.'
    },
    passCriteria: {
      zh: 'Dist ≥ 24 m · Attitude Err ≤ 2.0° · Angular Rate ≤ 0.4°/s',
      en: 'Dist ≥ 24 m · Attitude Err ≤ 2.0° · Angular Rate ≤ 0.4°/s'
    },
    hint: {
      zh: 'Use Arrow keys (pitch/yaw) and Q/E (roll) to zero attitude angles, or hold [B] for attitude damping!',
      en: 'Use Arrow keys (pitch/yaw) and Q/E (roll) to zero attitude angles, or hold [B] for attitude damping!'
    },
    scienceTerm: {
      term: {
        zh: ' Optical & Lidar Station-Keeping',
      en: ' Optical & Lidar Station-Keeping'
      },
      explanation: {
        zh: 'Why back away instead of turning around immediately? Because the docking camera and laser rangefinder are on the nose! Backing out keeps sensors locked onto the station.',
      en: 'Why back away instead of turning around immediately? Because the docking camera and laser rangefinder are on the nose! Backing out keeps sensors locked onto the station.'
      }
    },
    maxTimeS: 160,
    initialState: {
      position: [0.12, -0.08, 12.5],
      velocity: [0.02, -0.02, 0.28],
      attitudeDeg: [6.5, -5.8, 4.2],
      angularVelDeg: [0.8, -0.6, 0.5],
      latchesReleased: true,
      noseconeClosed: false
    }
  },
  {
    id: 4,
    code: 'DEP-04',
    title: {
      zh: 'Full Departure · Corridor Exit & Visor Close',
      en: 'Full Departure · Corridor Exit & Visor Close'
    },
    subtitle: {
      zh: 'Level 4: Complete undocking from latch release and 5 m coast to 32 m exit and nosecone closure',
      en: 'Level 4: Complete undocking from latch release and 5 m coast to 32 m exit and nosecone closure'
    },
    brief: {
      zh: 'Full undocking mission! 1) Press [Space] to unlatch and coast past 5 m without thrusters; 2) Tap [F] to accelerate backward while keeping centered and aligned; 3) Past 32 m, press [1] to close the nosecone hatch for reentry!',
      en: 'Full undocking mission! 1) Press [Space] to unlatch and coast past 5 m without thrusters; 2) Tap [F] to accelerate backward while keeping centered and aligned; 3) Past 32 m, press [1] to close the nosecone hatch for reentry!'
    },
    objective: {
      zh: 'Coast past 5 m cleanly, back out to >= 32 m inside the corridor, press [1] to close nosecone hatch with attitude <= 2.5° and offset <= 0.6 m.',
      en: 'Coast past 5 m cleanly, back out to >= 32 m inside the corridor, press [1] to close nosecone hatch with attitude <= 2.5° and offset <= 0.6 m.'
    },
    passCriteria: {
      zh: 'Dist ≥ 32 m · Nosecone CLOSED [1] · Att ≤ 2.5° · Offset ≤ 0.6 m',
      en: 'Dist ≥ 32 m · Nosecone CLOSED [1] · Att ≤ 2.5° · Offset ≤ 0.6 m'
    },
    hint: {
      zh: '1) [Space] to unlatch ➔ 2) Past 5 m, tap [F] to back up & stay centered ➔ 3) Past 32 m, press [1] to close nosecone!',
      en: '1) [Space] to unlatch ➔ 2) Past 5 m, tap [F] to back up & stay centered ➔ 3) Past 32 m, press [1] to close nosecone!'
    },
    scienceTerm: {
      term: {
        zh: 'Corridor Exit & Reentry Nosecone Closure',
      en: 'Corridor Exit & Reentry Nosecone Closure'
      },
      explanation: {
        zh: 'Once past 30 m, the spacecraft clears the close-proximity zone. The crew closes the nosecone hatch to shield the delicate docking ring before fiery atmospheric reentry.',
      en: 'Once past 30 m, the spacecraft clears the close-proximity zone. The crew closes the nosecone hatch to shield the delicate docking ring before fiery atmospheric reentry.'
      }
    },
    maxTimeS: 220,
    initialState: {
      position: [0, 0, 0.35],
      velocity: [0, 0, 0],
      attitudeDeg: [0, 0, 0],
      angularVelDeg: [0, 0, 0],
      latchesReleased: false,
      noseconeClosed: false
    }
  }
];

export function getDepartureScenario(id: number): DepartureScenarioConfig {
  return DEPARTURE_SCENARIOS.find((s) => s.id === id) ?? DEPARTURE_SCENARIOS[0];
}
