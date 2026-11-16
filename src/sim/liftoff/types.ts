import type { Language, Localized } from '../types';

export type Vec2 = [number, number];

/**
 * Liftoff mission failure causes
 * - pad_fallback: Thrust-to-weight ratio insufficient (< 1.0) when releasing clamps, falling back onto pad
 * - low_altitude_crash: Impacting ground at low altitude
 * - tower_collision: Tilting too early during initial ascent (altitude < 150m) and striking launch tower
 * - aero_stress: Excessive angle of attack during high-speed atmospheric flight (especially near Max-Q), causing structural failure
 * - over_g: Excessive acceleration load exceeding astronaut or structural limits (> 6.5 G)
 * - premature_staging: Triggering stage separation while current stage still has fuel (> 5%) and thrusting, causing recontact
 * - late_staging: Coasting too long after burnout without staging, leading to stall and falling
 * - suborbital_reentry: Failing to attain sufficient horizontal orbital velocity, falling back into atmosphere after apoapsis (< 70 km)
 * - orbit_eccentric: Excessive eccentricity or periapsis too low at burnout, failing to achieve stable circular parking orbit
 * - fuel_exhausted: Propellant depleted before mission objectives are met
 * - timeout: Exceeded maximum allowed flight time for scenario
 */
export type LiftoffFailure =
  | 'pad_fallback'
  | 'low_altitude_crash'
  | 'tower_collision'
  | 'aero_stress'
  | 'over_g'
  | 'premature_staging'
  | 'late_staging'
  | 'suborbital_reentry'
  | 'orbit_eccentric'
  | 'fuel_exhausted'
  | 'timeout';

/**
 * Consequence animation states:
 * - none: Normal flight
 * - exploding: Aerodynamic breakup or collision resulting in explosive disassembly and scattered debris
 * - falling: Engine flameout or thrust termination, descending under gravity
 * - crashed_pad: Crash onto launchpad surface concrete structure
 * - crashed_land: Crash onto terrestrial ground or coastal land away from the pad
 * - crashed_ocean: Crash into ocean surface
 * - drifting_space: High-altitude/orbital propellant exhaustion, drifting permanently in space
 */
export type LiftoffConsequence =
  | 'none'
  | 'exploding'
  | 'falling'
  | 'crashed_pad'
  | 'crashed_land'
  | 'crashed_ocean'
  | 'drifting_space';

/**
 * Stability Augmentation System (SAS) modes inspired by Kerbal Space Program:
 * - manual: Manual pitch rate control
 * - hold: Lock current pitch attitude (Attitude Hold)
 * - prograde: Align vehicle automatically with velocity vector (Surface / Orbital Prograde for gravity turn)
 * - pitch_program: Follow automated NASA pitch guidance profile curve
 */
export type SasMode = 'manual' | 'hold' | 'prograde' | 'pitch_program';

/**
 * Ascent phase state machine identifiers
 */
export type AscentPhase =
  | 'prelaunch'        // On launchpad, engines not yet ignited or building thrust
  | 'tower_clear'      // Liftoff, clearing launch tower vertically (0 ~ 150 m)
  | 'pitch_over'       // Initial pitch-over maneuver (150 m ~ 3 km)
  | 'gravity_turn'     // Transonic & Max-Q gravity turn (3 km ~ 40 km)
  | 'upper_atmosphere' // Clearing dense atmosphere & stage 1 separation prep (40 km ~ 70 km)
  | 'stage2_ascent'    // Stage 2 high-altitude acceleration & LES / fairing jettison (70 km ~ 160 km)
  | 'orbital_insertion'// Approaching apoapsis horizontal burn for orbital insertion (160 km ~ 200 km)
  | 'orbit_achieved';  // Second engine cutoff (SECO), stable Low Earth Orbit achieved

/**
 * Single rocket stage physical configuration (based on published NASA launch vehicle data)
 */
export interface RocketStageConfig {
  /** Stage sequence number (1: Stage 1, 2: Stage 2, 3: Stage 3) */
  stageNumber: number;
  /** Stage designation code, e.g. "S-IC", "S-II", "S-IVB" */
  code: string;
  /** Localized stage name */
  name: Localized;
  /** Engine model and configuration description */
  engineDesc: Localized;
  /** Structural dry mass (kg) — empty dry mass jettisoned after burnout */
  dryMassKg: number;
  /** Usable propellant mass (kg) */
  fuelMassKg: number;
  /** Sea-level total thrust (N) */
  thrustSeaLevelN: number;
  /** Vacuum total thrust (N) */
  thrustVacuumN: number;
  /** Sea-level specific impulse Isp (s) */
  ispSeaLevelS: number;
  /** Vacuum specific impulse Isp (s) */
  ispVacuumS: number;
  /** Frontal aerodynamic reference area (m²) for drag calculation */
  referenceAreaM2: number;
  /** Maximum engine gimbal deflection angle (degrees) */
  gimbalRangeDeg: number;
  /** Minimum throttle fraction (0.0 ~ 1.0) */
  minThrottle: number;
}

export type RocketVehicleId = 'saturn-v' | 'sls' | 'cz5' | 'cz2f';

/**
 * Full rocket stack launch vehicle configuration
 */
export interface RocketVehicleConfig {
  id: RocketVehicleId;
  name: Localized;
  era: Localized;
  description: Localized;
  /** Launch pad latitude (degrees), used to calculate Earth rotation speed boost */
  launchLatitudeDeg: number;
  /** Launch site name */
  launchSite: Localized;
  /** Payload mass at top of vehicle (kg), e.g. Apollo CSM + LM */
  payloadMassKg: number;
  /** Launch Escape System (LES) tower mass (kg), jettisoned after clearing dense atmosphere (~90-100 km) */
  launchEscapeTowerMassKg: number;
  /** Recommended tower jettison altitude (m) */
  towerJettisonAltitudeM: number;
  /** Max allowable aerodynamic load Q*alpha threshold (kPa·deg) before structural failure */
  maxQAlphaKpaDeg: number;
  /** Maximum allowable axial G-load */
  maxGLoad: number;
  /** Multi-stage rocket parameters in order (Stage 1, Stage 2, Stage 3) */
  stages: RocketStageConfig[];
}

/**
 * Real-time atmospheric sample state
 */
export interface AtmosphereSample {
  /** Altitude above sea level (m) */
  altitudeM: number;
  /** Atmospheric pressure (Pa) */
  pressurePa: number;
  /** Ratio to sea-level standard pressure (0 ~ 1) */
  pressureRatio: number;
  /** Air density (kg/m³) */
  densityKgM3: number;
  /** Atmospheric temperature (K) */
  temperatureK: number;
  /** Local speed of sound (m/s) */
  speedOfSoundMs: number;
}

/**
 * Real-time Keplerian orbital elements and apsis telemetry
 */
export interface OrbitalElements {
  /** Current altitude above sea level (m) */
  altitudeM: number;
  /** Downrange distance traveled eastward along surface (m) */
  downrangeM: number;
  /** Apoapsis altitude (m) — highest point in orbit */
  apoapsisM: number;
  /** Periapsis altitude (m) — lowest point in orbit (< 0 means suborbital / intersects Earth) */
  periapsisM: number;
  /** Orbital eccentricity (0 for circular, < 1 for elliptical) */
  eccentricity: number;
  /** Specific mechanical energy (J/kg) */
  specificEnergy: number;
  /** Estimated time to apoapsis (s) */
  timeToApoapsisS: number;
  /** Circular orbital velocity at current altitude (m/s) */
  circularVelocityMs: number;
  /** Total inertial orbital speed (m/s) */
  orbitalSpeedMs: number;
  /** Atmospheric relative surface speed (m/s) */
  surfaceSpeedMs: number;
  /** Local radial vertical speed (m/s, upward positive) */
  verticalSpeedMs: number;
  /** Local tangential horizontal speed eastward (m/s, eastward positive) */
  horizontalSpeedMs: number;
  /** Surface-relative flight path angle (degrees, 90° = vertical, 0° = horizontal) */
  surfaceProgradeDeg: number;
  /** Inertial orbital flight path angle (degrees, 90° = vertical, 0° = horizontal) */
  orbitalProgradeDeg: number;
  /** Whether orbit satisfies stable Low Earth Orbit criteria (Pe >= 150 km and Ap >= 170 km) */
  isOrbitStable: boolean;
}

/**
 * Pilot / autopilot flight command input
 */
export interface LiftoffCommand {
  /** Throttle fraction (0.0 ~ 1.0): Shift/Ctrl to adjust, Z key for 100% full throttle, X key for 0% cutoff */
  throttle: number;
  /** Pitch control input (-1.0 pitch down eastward ~ +1.0 pitch up vertical) */
  pitchInput: number;
  /** SAS attitude mode */
  sasMode: SasMode;
  /** Target locked pitch angle (degrees, 90° vertical, 0° horizontal), effective when sasMode === 'hold' */
  targetPitchDeg?: number;
  /** Pulse action: press spacebar to trigger stage separation / release launch pad hold-down clamps */
  triggerStage: boolean;
  /** Pulse action: jettison launch escape tower (LES) */
  jettisonTower: boolean;
}

/**
 * Rocket stage runtime state
 */
export interface StageRuntimeState {
  stageNumber: number;
  code: string;
  dryMassKg: number;
  fuelMassKg: number;
  maxFuelMassKg: number;
  separated: boolean;
}

/**
 * Complete liftoff simulation instantaneous physics state
 */
export interface LiftoffState {
  /** Mission Elapsed Time MET (s) */
  time: number;
  /** Elapsed flight time since clamps released or scenario start (s), used for rotating-Earth downrange */
  airborneTimeS?: number;
  /** Mission run status */
  status: 'ready' | 'flying' | 'success' | 'failed';
  /** Failure cause (only present when status === 'failed') */
  reason?: LiftoffFailure;
  /** Mission elapsed time when failure occurred MET (s) */
  failureTime?: number;
  /** Failure consequence animation state */
  consequence?: LiftoffConsequence;
  /** Peak altitude recorded during flight (m) */
  maxAltitudeM: number;
  /** Current ascent phase */
  phase: AscentPhase;
  /** Geocentric inertial 2D launch plane position [x, y] (m), launchpad initially at [0, R_earth] */
  position: Vec2;
  /** Geocentric inertial velocity vector [vx, vy] (m/s) */
  velocity: Vec2;
  /** Vehicle pitch attitude relative to local horizon (degrees, 90° = vertical, 0° = horizontal east) */
  pitchDeg: number;
  /** Pitch angular rate (deg/s) */
  pitchRateDegS: number;
  /** Seed for the ascent wind profile, fixed for the flight. */
  windSeed: number;
  /** Eastward atmospheric wind at the rocket (m/s). */
  windEastMs: number;
  /** Active stage index (1, 2, 3) */
  activeStageIndex: number;
  /** Stage fuel and separation runtime state list */
  stages: StageRuntimeState[];
  /** Launch pad hold-down clamps released */
  clampsReleased: boolean;
  /** Launch escape tower (LES) jettisoned */
  towerJettisoned: boolean;
  /** Current throttle setting (0 ~ 1) */
  throttle: number;
  /** Current SAS mode */
  sasMode: SasMode;
  /** Current total stack mass (kg) */
  totalMassKg: number;
  /** Current effective engine thrust (N) */
  thrustN: number;
  /** Current effective specific impulse Isp (s) */
  effectiveIspS: number;
  /** Current thrust-to-weight ratio (TWR) */
  twr: number;
  /** Perceived acceleration load on crew/vehicle (G) */
  gLoad: number;
  /** Current dynamic pressure q (Pa) */
  dynamicPressurePa: number;
  /** Peak dynamic pressure recorded during flight Max-Q (Pa) */
  maxQRecordedPa: number;
  /** Whether vehicle has passed peak Max-Q */
  passedMaxQ: boolean;
  /** Current Mach number */
  mach: number;
  /** Current angle of attack alpha (degrees) */
  aoaDeg: number;
  /** Current aerodynamic bending stress indicator Q * |alpha| (kPa·deg) */
  qAlphaKpaDeg: number;
  /** Current aerodynamic drag force (N) */
  dragForceN: number;
  /** Real-time Keplerian orbital elements and apsis telemetry */
  orbit: OrbitalElements;
  /** Coast timer after Stage 1 burnout (MECO) before separation (s) */
  stagingCoastTimerS: number;
  /** Target hold timer (s) */
  holdTimerS: number;
}

/**
 * Liftoff scenario configuration
 */
export interface LiftoffScenarioConfig {
  id: number;
  vehicleId: RocketVehicleId;
  title: Localized;
  subtitle: Localized;
  objective: Localized;
  hint: Localized;
  passCriteria: Localized;
  brief: Localized;
  lesson: Localized;
  scienceTerm: {
    term: Localized;
    explanation: Localized;
  };
  /** Initial scenario entry state configuration */
  initialState: {
    altitudeM: number;
    downrangeM: number;
    verticalSpeedMs: number;
    horizontalSpeedMs: number;
    pitchDeg: number;
    activeStageIndex: number;
    stageFuelFractions: number[];
    clampsReleased: boolean;
    towerJettisoned: boolean;
    throttle: number;
    sasMode: SasMode;
    initialTimeS: number;
  };
  /** Scenario victory targets */
  targets: {
    minAltitudeM?: number;
    minApoapsisM?: number;
    maxApoapsisM?: number;
    minPeriapsisM?: number;
    maxEccentricity?: number;
    targetPitchMinDeg?: number;
    targetPitchMaxDeg?: number;
    requireStageIndex?: number;
    requireTowerJettison?: boolean;
    requireOrbitStable?: boolean;
    maxTimeS: number;
  };
}

/**
 * Liftoff telemetry sample (for debrief graphs: altitude-time, speed-time, Max-Q dynamic pressure, G-load curves)
 */
export interface LiftoffSample {
  time: number;
  altitudeKm: number;
  downrangeKm: number;
  apoapsisKm: number;
  periapsisKm: number;
  surfaceSpeedMs: number;
  orbitalSpeedMs: number;
  pitchDeg: number;
  progradeDeg: number;
  dynamicPressureKpa: number;
  gLoad: number;
  twr: number;
  mach: number;
  stageNumber: number;
  stageFuelPct: number;
}

/**
 * Liftoff key flight events (for mission timeline and debrief report)
 */
export interface LiftoffEvent {
  time: number;
  type:
    | 'ignition'
    | 'liftoff'
    | 'tower_clear'
    | 'pitch_over'
    | 'supersonic'
    | 'max_q'
    | 'meco'
    | 'stage_separation'
    | 'les_jettison'
    | 'karman_line'
    | 'seco_orbit'
    | 'warning'
    | 'failed';
  label: Localized;
  reason?: LiftoffFailure;
}
