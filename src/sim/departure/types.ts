import type { Localized as LocalizedText, Vec3 } from '../types';

export type DepartureStatus = 'ready' | 'flying' | 'success' | 'failed';

export type DepartureFailReason =
  | 'plume_contamination' // Firing forward/aft thrusters within 0-5m Keep-Out Zone, contaminating ISS solar arrays/optics
  | 'corridor_breach' // Lateral deviation exceeding safe departure cone corridor
  | 'station_collision' // Insufficient retreat speed causing recontact collision with station
  | 'attitude_lost' // Excessive attitude angle error losing optical/LiDAR tracking of ISS
  | 'overspeed' // Departure speed exceeded corridor velocity limit
  | 'timeout';

export interface DepartureCommand {
  /** 3-axis translation thrust input [-1, 1]: x lateral (A/D), y vertical (S/W), z forward/back (R=-1 towards ISS, F=+1 back away from ISS) */
  translation: Vec3;
  /** 3-axis attitude rotation input [-1, 1]: pitch(↑/↓), yaw(←/→), roll(Q/E) */
  rotation: Vec3;
  /** Single-pulse trigger: release docking latches and initiate spring push-off (Space) */
  releaseLatches: boolean;
  /** Single-pulse trigger: toggle nosecone hatch cover (Key 1) */
  toggleNosecone: boolean;
  /** Attitude and lateral drift damping assist brake (Key B / Shift) */
  assistBrake: boolean;
}

export interface DepartureState {
  /** Mission elapsed time (s) */
  time: number;
  status: DepartureStatus;
  failReason?: DepartureFailReason;
  /** Spacecraft position relative to station docking port [x, y, z] (m), z >= 0.35 along departure axis */
  position: Vec3;
  /** Spacecraft relative velocity [vx, vy, vz] (m/s), vz > 0 retreating away from station */
  velocity: Vec3;
  /** Spacecraft attitude Euler angle error [pitchDeg, yawDeg, rollDeg] (°), [0,0,0] boresight facing docking port */
  attitudeDeg: Vec3;
  /** Spacecraft angular rate [wx, wy, wz] (°/s) */
  angularVelDeg: Vec3;
  /** Docking latches released and initial spring push-off completed */
  latchesReleased: boolean;
  /** Nosecone hatch closed (1 = closed for reentry protection, 0 = open exposing docking mechanism) */
  noseconeClosed: boolean;
  /** Nosecone transition progress (0 = fully open, 1 = fully closed) */
  noseconeProgress: number;
  /** Remaining propellant budget (%) */
  fuelPct: number;
  /** Maximum allowable lateral corridor radius at current axial distance (m) */
  corridorRadiusM: number;
  /** Current lateral offset distance hypot(x, y) (m) */
  lateralOffsetM: number;
  /** Current lateral drift speed hypot(vx, vy) (m/s) */
  lateralSpeedMs: number;
  /** Current total attitude error angle (°) */
  attitudeErrorDeg: number;
  /** Whether vehicle is inside 0 ~ 5m Plume Keep-Out Zone */
  inKeepOutZone: boolean;
  /** Consecutive duration holding mission completion criteria (s) */
  holdTimerS: number;
  /** Active thrust vector applied this frame (for 3D RCS plume visual effects) */
  activeThrust: Vec3;
  /** Active torque vector applied this frame */
  activeTorque: Vec3;
}

export interface DepartureSample {
  time: number;
  distanceM: number;
  backSpeedMs: number;
  lateralOffsetM: number;
  attitudeErrorDeg: number;
  fuelPct: number;
}

export interface DepartureScenarioConfig {
  id: number;
  code: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  brief: LocalizedText;
  objective: LocalizedText;
  passCriteria: LocalizedText;
  hint: LocalizedText;
  scienceTerm: {
    term: LocalizedText;
    explanation: LocalizedText;
  };
  maxTimeS: number;
  initialState: {
    position: Vec3;
    velocity: Vec3;
    attitudeDeg: Vec3;
    angularVelDeg: Vec3;
    latchesReleased: boolean;
    noseconeClosed: boolean;
  };
}
