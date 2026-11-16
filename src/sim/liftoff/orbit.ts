import type { OrbitalElements, Vec2 } from './types';

/** Mean radius of Earth R_earth (m) — NASA WGS-84 mean spherical radius */
export const EARTH_RADIUS_M = 6371000;

/** Standard gravitational parameter of Earth mu = G * M_earth (m³/s²) */
export const EARTH_MU = 3.986004418e14;

/** Standard sea-level gravitational acceleration g0 (m/s²) */
export const STANDARD_GRAVITY_MS2 = 9.80665;

/** Earth sidereal rotation angular velocity Omega_earth (rad/s) */
export const EARTH_OMEGA_RAD_S = 7.2921159e-5;

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Compute the eastward linear speed gain from Earth's rotation at launch latitude (m/s)
 * Example: Kennedy Space Center (28.6°N) is approximately 408.5 m/s
 */
export function earthRotationSpeedAtLatitude(latitudeDeg: number): number {
  return EARTH_OMEGA_RAD_S * EARTH_RADIUS_M * Math.cos(latitudeDeg * DEG_TO_RAD);
}

/**
 * Compute local zenith radial unit vector u_r and due-east horizontal tangential unit vector u_theta for position [x, y]
 * Launchpad initial position [0, R_earth]:
 * - u_r = [0, 1] (zenith / vertically upward)
 * - u_theta = [1, 0] (due east / horizontal)
 */
export function localHorizonBasis(position: Vec2): {
  r: number;
  up: Vec2;
  east: Vec2;
} {
  const r = Math.hypot(position[0], position[1]) || EARTH_RADIUS_M;
  const up: Vec2 = [position[0] / r, position[1] / r];
  const east: Vec2 = [up[1], -up[0]];
  return { r, up, east };
}

/**
 * Compute Earth gravitational acceleration vector [gx, gy] (m/s²) at position
 */
export function gravityVector(position: Vec2): Vec2 {
  const r = Math.hypot(position[0], position[1]);
  if (r <= 1) return [0, -STANDARD_GRAVITY_MS2];
  const gMag = EARTH_MU / (r * r);
  return [(-position[0] / r) * gMag, (-position[1] / r) * gMag];
}

/**
 * Compute local tangential velocity vector of atmosphere co-rotating with Earth [vx_atm, vy_atm] (m/s)
 */
export function atmosphereVelocityAtPosition(position: Vec2, launchLatitudeDeg: number): Vec2 {
  const { r, east } = localHorizonBasis(position);
  const vRot = EARTH_OMEGA_RAD_S * r * Math.cos(launchLatitudeDeg * DEG_TO_RAD);
  return [east[0] * vRot, east[1] * vRot];
}

/**
 * Compute Keplerian orbital elements and apsis telemetry in real time
 * based on geocentric inertial position [x, y] and velocity [vx, vy]
 */
export function computeOrbitalElements(
  position: Vec2,
  inertialVelocity: Vec2,
  launchLatitudeDeg = 28.608,
  airborneTimeS = 0
): OrbitalElements {
  const { r, up, east } = localHorizonBasis(position);
  const altitudeM = r - EARTH_RADIUS_M;

  // Surface-relative downrange arc length eastward along Earth's rotating surface (m)
  const centralAngleRad = Math.atan2(position[0], position[1]);
  const earthRotAngleRad = EARTH_OMEGA_RAD_S * Math.cos(launchLatitudeDeg * DEG_TO_RAD) * airborneTimeS;
  const downrangeM = EARTH_RADIUS_M * (centralAngleRad - earthRotAngleRad);

  // Atmospheric co-rotation velocity and surface-relative velocity vector
  const vAtm = atmosphereVelocityAtPosition(position, launchLatitudeDeg);
  const vSurf: Vec2 = [inertialVelocity[0] - vAtm[0], inertialVelocity[1] - vAtm[1]];

  const orbitalSpeedMs = Math.hypot(inertialVelocity[0], inertialVelocity[1]);
  const surfaceSpeedMs = Math.hypot(vSurf[0], vSurf[1]);

  // Radial vertical speed and horizontal eastward speed
  const verticalSpeedMs = vSurf[0] * up[0] + vSurf[1] * up[1];
  const horizontalSpeedSurfMs = vSurf[0] * east[0] + vSurf[1] * east[1];
  const horizontalSpeedInertMs = inertialVelocity[0] * east[0] + inertialVelocity[1] * east[1];
  const verticalSpeedInertMs = inertialVelocity[0] * up[0] + inertialVelocity[1] * up[1];

  // Flight path angle (Prograde Pitch Angle): defaults to vertical 90° at low speed (< 0.5 m/s)
  const surfaceProgradeDeg =
    surfaceSpeedMs > 0.5
      ? Math.atan2(verticalSpeedMs, Math.max(1e-6, horizontalSpeedSurfMs)) * RAD_TO_DEG
      : 90;

  const orbitalProgradeDeg =
    orbitalSpeedMs > 0.5
      ? Math.atan2(verticalSpeedInertMs, Math.max(1e-6, horizontalSpeedInertMs)) * RAD_TO_DEG
      : 90;

  // Circular orbital velocity at current altitude v_c = sqrt(mu / r)
  const circularVelocityMs = Math.sqrt(EARTH_MU / r);

  // Specific mechanical energy epsilon = v^2 / 2 - mu / r
  const vSq = orbitalSpeedMs * orbitalSpeedMs;
  const specificEnergy = 0.5 * vSq - EARTH_MU / r;

  // Eccentricity vector e_vec = ((v^2 - mu/r) * r_vec - (r_vec . v_vec) * v_vec) / mu
  const rDotV = position[0] * inertialVelocity[0] + position[1] * inertialVelocity[1];
  const coeffR = vSq - EARTH_MU / r;
  const ex = (coeffR * position[0] - rDotV * inertialVelocity[0]) / EARTH_MU;
  const ey = (coeffR * position[1] - rDotV * inertialVelocity[1]) / EARTH_MU;
  const eccentricity = Math.hypot(ex, ey);

  let apoapsisM: number;
  let periapsisM: number;
  let timeToApoapsisS = 0;

  if (specificEnergy < -1e-3) {
    // Elliptic or suborbital trajectory (a > 0)
    const semiMajorAxis = -EARTH_MU / (2 * specificEnergy);
    const rAp = semiMajorAxis * (1 + eccentricity);
    const rPe = semiMajorAxis * (1 - eccentricity);

    apoapsisM = Math.max(altitudeM, rAp - EARTH_RADIUS_M);
    periapsisM = rPe - EARTH_RADIUS_M;

    if (eccentricity > 1e-5) {
      const meanMotion = Math.sqrt(EARTH_MU / Math.pow(semiMajorAxis, 3));
      const cosE = Math.max(-1, Math.min(1, (1 - r / semiMajorAxis) / eccentricity));
      const sinE = Math.max(
        -1,
        Math.min(1, rDotV / (eccentricity * Math.sqrt(EARTH_MU * semiMajorAxis)))
      );
      const E = Math.atan2(sinE, cosE);
      const M = E - eccentricity * Math.sin(E);
      // Apoapsis occurs at mean anomaly M = pi
      const deltaM = Math.PI - M;
      timeToApoapsisS = Math.max(0, deltaM / meanMotion);
    }
  } else {
    // Hyperbolic or parabolic escape trajectory (epsilon >= 0)
    const hMag = Math.abs(position[0] * inertialVelocity[1] - position[1] * inertialVelocity[0]);
    const rPe = (hMag * hMag) / (EARTH_MU * (1 + eccentricity));
    apoapsisM = 999999000;
    periapsisM = rPe - EARTH_RADIUS_M;
    timeToApoapsisS = 0;
  }

  // Stable Low Earth Orbit (LEO) criteria: periapsis >= 150 km and apoapsis >= 170 km (free of atmospheric drag)
  const isOrbitStable = periapsisM >= 150000 && apoapsisM >= 170000;

  return {
    altitudeM,
    downrangeM,
    apoapsisM,
    periapsisM,
    eccentricity,
    specificEnergy,
    timeToApoapsisS,
    circularVelocityMs,
    orbitalSpeedMs,
    surfaceSpeedMs,
    verticalSpeedMs,
    horizontalSpeedMs: horizontalSpeedInertMs,
    surfaceProgradeDeg,
    orbitalProgradeDeg,
    isOrbitStable
  };
}
