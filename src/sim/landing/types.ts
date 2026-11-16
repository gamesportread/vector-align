import type { Localized as LocalizedText } from '../types';

export type LandingStatus = 'ready' | 'flying' | 'success' | 'failed';

export type ChuteState = 'stowed' | 'drogue' | 'main';

export type LandingFailReason =
  | 'heatshield_burnthrough' // Excessive attitude angle error in blackout zone, 2000°C plasma burns through thin sidewalls
  | 'excessive_g_load' // Reentry angle-of-attack loss of control leading to excessive G-load (> 8.5G)
  | 'chute_shred' // Deployment speed too high, supersonic/transonic dynamic pressure shreds parachutes
  | 'chute_too_late' // Dropped below safe altitude without deploying parachutes, impacting ground at high speed
  | 'retro_early' // Fired landing retro-rockets too high (> 4.5m), burns out early resulting in hard fall
  | 'hard_impact' // Failed to fire retro-rockets or touchdown descent rate too high (> 3.2 m/s), damaging capsule
  | 'timeout';

export interface LandingCommand {
  /** Attitude trim / crosswind roll control input [-1, 1] (A/D or ←/→) */
  attitudeInput: number;
  /** Lift trim bank angle input [-1, 1] (W/S or ↑/↓, used to modulate peak G-load during reentry) */
  liftTrimInput: number;
  /** Single-pulse trigger: deploy drogue -> deploy main -> fire landing retro-rockets at 1.5m (Space) */
  triggerAction: boolean;
  /** Single-pulse trigger: jettison ablated heat shield to expose landing thrusters and crush core (Key J / Key 1) */
  jettisonHeatshield: boolean;
  /** Automatic attitude damping / SAS assist (Key T / SAS) */
  sasEnabled: boolean;
}

export interface LandingState {
  time: number;
  status: LandingStatus;
  failReason?: LandingFailReason;
  /** Altitude above sea level (m), 0 is touchdown surface */
  altitudeM: number;
  /** Horizontal cross-range target center offset (m) */
  lateralOffsetM: number;
  /** Horizontal lateral drift speed (m/s) */
  lateralSpeedMs: number;
  /** Total resultant velocity (m/s) */
  speedMs: number;
  /** Vertical descent rate (m/s, positive downwards toward ground) */
  descentRateMs: number;
  /** Capsule attitude angle error relative to wind streamline (°), 0° = heat shield facing airstream */
  attitudeDeviationDeg: number;
  /** Attitude angular velocity (°/s) */
  angularVelDeg: number;
  /** Lift trim coefficient [-1, 1] */
  liftTrim: number;
  /** Current perceived acceleration (G) */
  gLoad: number;
  /** Peak G-load recorded during flight (G) */
  maxGRecorded: number;
  /** Heat shield surface temperature (°C) */
  heatshieldTempC: number;
  /** Heat shield structural integrity (%) */
  heatshieldIntegrityPct: number;
  /** Whether vehicle is inside 38km~80km plasma radio blackout zone */
  inBlackout: boolean;
  /** Parachute deployment state: stowed -> drogue parachute -> 1200m² main canopy */
  chuteState: ChuteState;
  /** Parachute canopy inflation animation progress (0 ~ 1) */
  chuteProgress: number;
  /** Whether charred heat shield has been jettisoned (exposing landing retro-rockets) */
  heatshieldJettisoned: boolean;
  /** Elapsed seconds since heat shield separation (for 3D separation animation) */
  heatshieldSepElapsedS: number;
  /** Whether landing solid retro-rockets have ignited */
  retroFired: boolean;
  /** Retro-rocket remaining burn time (s) */
  retroBurnLeftS: number;
  /** Vertical descent rate at moment of touchdown (m/s) */
  touchdownSpeedMs?: number;
}

export interface LandingSample {
  time: number;
  altitudeKm: number;
  speedMs: number;
  gLoad: number;
  tempC: number;
}

export interface LandingScenarioConfig {
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
    altitudeM: number;
    speedMs: number;
    descentRateMs: number;
    attitudeDeviationDeg: number;
    chuteState: ChuteState;
    heatshieldJettisoned: boolean;
  };
}
