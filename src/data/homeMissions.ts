export interface HistoricalScenario {
  id: string;
  titleZh: string;
  titleEn: string;
  eraZh: string;
  eraEn: string;
  descZh: string;
  descEn: string;
  statusZh: string;
  statusEn: string;
  isAvailable: boolean;
}

export interface ScienceTip {
  termZh: string;
  termEn: string;
  explanationZh: string;
  explanationEn: string;
}

export interface MissionSpecs {
  timeZh: string;
  timeEn: string;
  stageZh: string;
  stageEn: string;
  locationZh: string;
  locationEn: string;
  vehicleZh: string;
  vehicleEn: string;
}

export interface HomeMissionItem {
  id: number;
  key: 'liftoff' | 'docking' | 'departure' | 'landing';
  num: number;
  titleZh: string;
  titleEn: string;
  taglineZh: string;
  taglineEn: string;
  badgeZh?: string;
  badgeEn?: string;
  image: string;
  isImplemented: boolean;
  specs: MissionSpecs;
  summaryZh: string;
  summaryEn: string;
  scienceTip: ScienceTip;
  historicalScenarios?: HistoricalScenario[];
}

export const HOME_MISSIONS: HomeMissionItem[] = [
  {
    id: 1,
    key: 'liftoff',
    num: 1,
    titleZh: 'Liftoff',
    titleEn: 'Liftoff',
    taglineZh: 'Powered Ascent to Orbit',
    taglineEn: 'Powered Ascent to Orbit',
    badgeZh: 'Ready',
    badgeEn: 'Ready',
    image: '/images/home/toon/liftoff.jpg',
    isImplemented: true,
    specs: {
      timeZh: 'T - 00:00:00 Ignition to Orbit Insertion (~580s)',
    timeEn: 'T - 00:00:00 Ignition to Orbit Insertion (~580s)',
      stageZh: 'Pad Ignition ➔ Atmospheric Penetration ➔ Stage Separation ➔ Orbit Insertion',
    stageEn: 'Pad Ignition ➔ Atmospheric Penetration ➔ Stage Separation ➔ Orbit Insertion',
      locationZh: 'Kennedy Space Center LC-39A ➔ Low Earth Parking Orbit (Altitude ~200 km)',
    locationEn: 'Kennedy Space Center LC-39A ➔ Low Earth Parking Orbit (Altitude ~200 km)',
      vehicleZh: 'Heavy Crew Launch Vehicle + Spacecraft Stack',
    vehicleEn: 'Heavy Crew Launch Vehicle + Spacecraft Stack'
    },
    summaryZh: 'Engines roar to life with thousands of tons of thrust, breaking free from Earth’s gravity! Astronauts endure multi-G acceleration, shed spent stages, and pierce through the dense atmosphere to reach nearly 8 km/s orbital speed.',
    summaryEn:
      'Engines roar to life with thousands of tons of thrust, breaking free from Earth’s gravity! Astronauts endure multi-G acceleration, shed spent stages, and pierce through the dense atmosphere to reach nearly 8 km/s orbital speed.',
    scienceTip: {
      termZh: 'First Cosmic Velocity & Staging',
    termEn: 'First Cosmic Velocity & Staging',
      explanationZh: 'Orbiting is not about zero gravity; it is about extreme speed (~7.9 km/s)! The curve of the craft matches the curvature of Earth. Rockets drop empty fuel tanks in stages so the remaining vehicle becomes light enough to reach orbital velocity.',
    explanationEn:
        'Orbiting is not about zero gravity; it is about extreme speed (~7.9 km/s)! The curve of the craft matches the curvature of Earth. Rockets drop empty fuel tanks in stages so the remaining vehicle becomes light enough to reach orbital velocity.'
    },
    historicalScenarios: [
      {
        id: 'saturn-v',
        titleZh: 'Saturn V Apollo Launch',
    titleEn: 'Saturn V Apollo Launch',
        eraZh: 'Apollo Program 1969',
    eraEn: 'Apollo Program 1969',
        descZh: 'Command the colossal 3-stage moon rocket from pad ignition, gravity turn & Max-Q, stage separation to 7.8 km/s orbital insertion!',
    descEn: 'Command the colossal 3-stage moon rocket from pad ignition, gravity turn & Max-Q, stage separation to 7.8 km/s orbital insertion!',
        statusZh: 'Available',
    statusEn: 'Available',
        isAvailable: true
      },
      {
        id: 'sls-artemis-1',
        titleZh: 'SLS · Artemis I Moon Rocket Launch',
    titleEn: 'SLS · Artemis I Moon Rocket Launch',
        eraZh: 'NASA Artemis Program 2022',
    eraEn: 'NASA Artemis Program 2022',
        descZh: 'NASA’s most powerful operational moon rocket, generating 39.1 MN thrust with four RS-25 engines and twin 5-segment SRBs to send Orion toward lunar orbit.',
    descEn: 'NASA’s most powerful operational moon rocket, generating 39.1 MN thrust with four RS-25 engines and twin 5-segment SRBs to send Orion toward lunar orbit.',
        statusZh: 'Available',
    statusEn: 'Available',
        isAvailable: true
      }
    ]
  },
  {
    id: 2,
    key: 'docking',
    num: 2,
    titleZh: 'Station Docking',
    titleEn: 'Station Docking',
    taglineZh: 'Precision Orbital Rendezvous',
    taglineEn: 'Precision Orbital Rendezvous',
    badgeZh: 'Ready',
    badgeEn: 'Ready',
    image: '/images/home/toon/docking.jpg',
    isImplemented: true,
    specs: {
      timeZh: 'Flight Day 2 · Final 50m to Port Lock (~15 min)',
    timeEn: 'Flight Day 2 · Final 50m to Port Lock (~15 min)',
      stageZh: 'Attitude Alignment ➔ 8m Hold Point Braking ➔ Drift Cancellation ➔ Soft Contact',
    stageEn: 'Attitude Alignment ➔ 8m Hold Point Braking ➔ Drift Cancellation ➔ Soft Contact',
      locationZh: 'Low Earth Orbit (LEO), Altitude ~400-420 km (90 min orbital period)',
    locationEn: 'Low Earth Orbit (LEO), Altitude ~400-420 km (90 min orbital period)',
      vehicleZh: 'Crew Spacecraft (with 6-DOF RCS) ➔ Station Docking Port',
    vehicleEn: 'Crew Spacecraft (with 6-DOF RCS) ➔ Station Docking Port'
    },
    summaryZh: 'Traveling at 7.7 km/s above Earth, two massive spacecraft must touch at mere centimetres per second! Take manual control of thrusters in weightless vacuum, manage inertia, align the docking rings, and secure the latch.',
    summaryEn:
      'Traveling at 7.7 km/s above Earth, two massive spacecraft must touch at mere centimetres per second! Take manual control of thrusters in weightless vacuum, manage inertia, align the docking rings, and secure the latch.',
    scienceTip: {
      termZh: '6-DOF & Inertial Counter-Thrust',
    termEn: '6-DOF & Inertial Counter-Thrust',
      explanationZh: 'There is no friction or air in orbit! When you fire a thruster, the ship keeps moving forever unless you fire in reverse to brake. 6 Degrees of Freedom (6-DOF) means the ship can move along 3 axes and rotate around 3 axes.',
    explanationEn:
        'There is no friction or air in orbit! When you fire a thruster, the ship keeps moving forever unless you fire in reverse to brake. 6 Degrees of Freedom (6-DOF) means the ship can move along 3 axes and rotate around 3 axes.'
    },
    historicalScenarios: [
      {
        id: 'iss-standard',
        titleZh: 'ISS Standard Autonomous & Manual Docking',
    titleEn: 'ISS Standard Autonomous & Manual Docking',
        eraZh: 'Active Simulator',
    eraEn: 'Active Simulator',
        descZh: 'Master braking, drift cancellation, attitude alignment, and full 50-meter docking.',
    descEn: 'Master braking, drift cancellation, attitude alignment, and full 50-meter docking.',
        statusZh: 'Available',
    statusEn: 'Available',
        isAvailable: true
      },
      {
        id: 'gemini-8-agena',
        titleZh: 'Gemini VIII & Agena Target Vehicle',
    titleEn: 'Gemini VIII & Agena Target Vehicle',
        eraZh: 'NASA Gemini Program 1966',
    eraEn: 'NASA Gemini Program 1966',
        descZh: 'Commanded by Neil Armstrong, Gemini VIII executed the first successful docking of two spacecraft in orbit in history.',
    descEn: 'Commanded by Neil Armstrong, Gemini VIII executed the first successful docking of two spacecraft in orbit in history.',
        statusZh: 'Coming Soon',
    statusEn: 'Coming Soon',
        isAvailable: false
      }
    ]
  },
  {
    id: 3,
    key: 'departure',
    num: 3,
    titleZh: 'Station Departure',
    titleEn: 'Station Departure',
    taglineZh: 'Undocking & Safe Departure',
    taglineEn: 'Undocking & Safe Departure',
    badgeZh: 'Ready',
    badgeEn: 'Ready',
    image: '/images/home/toon/departure.jpg',
    isImplemented: true,
    specs: {
      timeZh: 'Mission Completion · Departure Corridor T + 00:00 ~ T + 00:45',
    timeEn: 'Mission Completion · Departure Corridor T + 00:00 ~ T + 00:45',
      stageZh: 'Hatch Seal Check ➔ Latches Release ➔ Spring Push-off ➔ Separation Burns',
    stageEn: 'Hatch Seal Check ➔ Latches Release ➔ Spring Push-off ➔ Separation Burns',
      locationZh: 'Station Forward Safety Departure Cone (Altitude ~420 km)',
    locationEn: 'Station Forward Safety Departure Cone (Altitude ~420 km)',
      vehicleZh: 'Crew Return Vehicle Stack',
    vehicleEn: 'Crew Return Vehicle Stack'
    },
    summaryZh: 'Mission accomplished, the crew prepares to return. Engines cannot fire immediately near the station because plumes could damage fragile solar arrays. Spring pushers separate the crafts gently before backwards separation burns begin.',
    summaryEn:
      'Mission accomplished, the crew prepares to return. Engines cannot fire immediately near the station because plumes could damage fragile solar arrays. Spring pushers separate the crafts gently before backwards separation burns begin.',
    scienceTip: {
      termZh: 'Departure Corridor & Spring Separation',
    termEn: 'Departure Corridor & Spring Separation',
      explanationZh: 'Rocket thruster plumes can erode solar panels and optical sensors. Mechanical springs push the vehicle a few metres away before thrusters safely fire inside a designated safety corridor.',
    explanationEn:
        'Rocket thruster plumes can erode solar panels and optical sensors. Mechanical springs push the vehicle a few metres away before thrusters safely fire inside a designated safety corridor.'
    },
    historicalScenarios: [
      {
        id: 'iss-undock',
        titleZh: 'ISS Radial Departure Corridor',
    titleEn: 'ISS Radial Departure Corridor',
        eraZh: 'Standard ISS Undocking Protocol',
    eraEn: 'Standard ISS Undocking Protocol',
        descZh: 'Master gentle spring push-off, 0–5 m plume keep-out glide, corridor centering, and nosecone closure.',
    descEn: 'Master gentle spring push-off, 0–5 m plume keep-out glide, corridor centering, and nosecone closure.',
        statusZh: 'Available',
    statusEn: 'Available',
        isAvailable: true
      }
    ]
  },
  {
    id: 4,
    key: 'landing',
    num: 4,
    titleZh: 'Capsule Landing',
    titleEn: 'Capsule Landing',
    taglineZh: 'Atmospheric Reentry & Touchdown',
    taglineEn: 'Atmospheric Reentry & Touchdown',
    badgeZh: 'Ready',
    badgeEn: 'Ready',
    image: '/images/home/toon/landing.jpg',
    isImplemented: true,
    specs: {
      timeZh: '90m Post-Deorbit · Plasma Blackout to 1s Pre-Touchdown',
    timeEn: '90m Post-Deorbit · Plasma Blackout to 1s Pre-Touchdown',
      stageZh: 'Module Jettison ➔ Thermal Ablation Braking ➔ Blackout ➔ Parachutes ➔ Retro-Rockets',
    stageEn: 'Module Jettison ➔ Thermal Ablation Braking ➔ Blackout ➔ Parachutes ➔ Retro-Rockets',
      locationZh: 'Pacific Ocean Splashdown Zone / Kennedy Space Center Recovery (100 km to Splashdown)',
    locationEn: 'Pacific Ocean Splashdown Zone / Kennedy Space Center Recovery (100 km to Splashdown)',
      vehicleZh: 'Crew Reentry Capsule (3-ton bell shape, 2000°C heat shield)',
    vehicleEn: 'Crew Reentry Capsule (3-ton bell shape, 2000°C heat shield)'
    },
    summaryZh: 'The capsule plunges into Earth’s atmosphere like a shooting star, enduring thousands of degrees of friction heat. After surviving the blackout zone, giant parachutes blossom in the sky for a safe, cushioned touchdown.',
    summaryEn:
      'The capsule plunges into Earth’s atmosphere like a shooting star, enduring thousands of degrees of friction heat. After surviving the blackout zone, giant parachutes blossom in the sky for a safe, cushioned touchdown.',
    scienceTip: {
      termZh: 'Blackout Zone & Landing Retro-Rockets',
    termEn: 'Blackout Zone & Landing Retro-Rockets',
      explanationZh: 'At hypersonic speeds, superheated air forms a glowing plasma sheath that completely blocks radio waves, causing a tense few minutes called the blackout zone. A metre above ground, soft-landing retro-rockets ignite to cushion the impact.',
    explanationEn:
        'At hypersonic speeds, superheated air forms a glowing plasma sheath that completely blocks radio waves, causing a tense few minutes called the blackout zone. A metre above ground, soft-landing retro-rockets ignite to cushion the impact.'
    },
    historicalScenarios: [
      {
        id: 'apollo-11-splashdown',
        titleZh: 'Apollo 11 Pacific Splashdown Recovery',
    titleEn: 'Apollo 11 Pacific Splashdown Recovery',
        eraZh: 'NASA Apollo 11 Reentry Protocol',
    eraEn: 'NASA Apollo 11 Reentry Protocol',
        descZh: 'Experience 2000°C blackout attitude control, drogue and main parachute deployment, and gentle splashdown in the Pacific Ocean.',
    descEn: 'Experience 2000°C blackout attitude control, drogue and main parachute deployment, and gentle splashdown in the Pacific Ocean.',
        statusZh: 'Available',
    statusEn: 'Available',
        isAvailable: true
      }
    ]
  }
];
