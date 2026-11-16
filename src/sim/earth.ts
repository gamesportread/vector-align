// Real-world dimensions of Earth and ISS orbit (in meters). Shared across 3D scenes and diagrams for consistent scale.
export const EARTH_RADIUS_M = 6_371_000; // Mean Earth radius
export const ISS_ALTITUDE_M = 420_000; // Typical ISS orbital altitude (varies ~370–460 km)
export const HARMONY_LENGTH_M = 7.2; // Harmony node module length (NASA)
export const HARMONY_DIAMETER_M = 4.4; // Harmony node module diameter (NASA)

/** Depression angle of the horizon below the horizontal seen from the ISS (degrees). */
export const horizonDipDeg = (r = EARTH_RADIUS_M, h = ISS_ALTITUDE_M) => Math.acos(r / (r + h)) * 180 / Math.PI;
/** Line-of-sight distance from ISS to the horizon (meters). */
export const horizonDistanceM = (r = EARTH_RADIUS_M, h = ISS_ALTITUDE_M) => Math.sqrt((r + h) ** 2 - r ** 2);
/** Height of the space station above the surface when Earth is scaled to radius (same units). */
export const scaledAltitude = (radius: number) => radius * ISS_ALTITUDE_M / EARTH_RADIUS_M;
