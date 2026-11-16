import type { AtmosphereSample } from './types';

/** Sea-level standard atmospheric pressure (Pa) */
export const SEA_LEVEL_PRESSURE_PA = 101325;

/** Sea-level standard air density (kg/m³) */
export const SEA_LEVEL_DENSITY_KG_M3 = 1.225;

/** Kármán line (internationally recognized boundary between atmosphere and outer space, 100 km) */
export const KARMAN_LINE_ALTITUDE_M = 100000;

/** Outer atmosphere cutoff altitude where aerodynamic effects become negligible (140 km) */
export const ATMOSPHERE_CUTOFF_ALTITUDE_M = 140000;

/**
 * Atmospheric sampler based on the NASA Earth Atmosphere Model / US Standard Atmosphere 1976.
 * Computes temperature, pressure, density, and local speed of sound at a given altitude h (m).
 */
export function sampleAtmosphere(altitudeM: number): AtmosphereSample {
  const h = Math.max(0, altitudeM);

  if (h >= ATMOSPHERE_CUTOFF_ALTITUDE_M) {
    return {
      altitudeM: h,
      pressurePa: 0,
      pressureRatio: 0,
      densityKgM3: 0,
      temperatureK: 186.8,
      speedOfSoundMs: 274.0
    };
  }

  let temperatureK: number;
  let pressurePa: number;

  if (h <= 11000) {
    // Troposphere (0 ~ 11 km): temperature drops linearly with altitude (-6.5 K/km)
    temperatureK = 288.15 - 0.0065 * h;
    pressurePa = SEA_LEVEL_PRESSURE_PA * Math.pow(temperatureK / 288.15, 5.25588);
  } else if (h <= 25000) {
    // Lower Stratosphere (11 ~ 25 km): isothermal at ~216.65 K (-56.5°C)
    temperatureK = 216.65;
    pressurePa = 22632.1 * Math.exp(-0.00015769 * (h - 11000));
  } else if (h <= 47000) {
    // Upper Stratosphere (25 ~ 47 km): ozone absorbs UV, temperature rises
    temperatureK = 216.65 + 0.0028 * (h - 25000);
    pressurePa = 2488.6 * Math.pow(temperatureK / 216.65, -12.2011);
  } else {
    // Mesosphere & Lower Thermosphere transition (47 ~ 140 km)
    temperatureK = Math.max(186.8, 278.25 - 0.002 * (h - 47000));
    const p47 = 110.91;
    pressurePa = p47 * Math.exp(-(h - 47000) / 6850);
  }

  // Smoothly decay to vacuum (0) between 100 km and 140 km
  if (h > KARMAN_LINE_ALTITUDE_M) {
    const fade = 1 - (h - KARMAN_LINE_ALTITUDE_M) / (ATMOSPHERE_CUTOFF_ALTITUDE_M - KARMAN_LINE_ALTITUDE_M);
    pressurePa *= fade * fade;
  }

  // Ideal gas equation rho = P / (R_specific * T), dry air specific gas constant R = 287.053 J/(kg·K)
  const densityKgM3 = pressurePa / (287.053 * temperatureK);

  // Local speed of sound a = sqrt(gamma * R * T), diatomic gas adiabatic index gamma = 1.4
  const speedOfSoundMs = Math.sqrt(1.4 * 287.053 * temperatureK);

  return {
    altitudeM: h,
    pressurePa,
    pressureRatio: Math.min(1, Math.max(0, pressurePa / SEA_LEVEL_PRESSURE_PA)),
    densityKgM3,
    temperatureK,
    speedOfSoundMs
  };
}

/**
 * Compute transonic wave drag coefficient C_d(Mach, AoA)
 * - Modeled after aerodynamic curves for launch vehicles:
 *   1. Subsonic (Mach < 0.8): base pressure and skin friction drag C_d0 ≈ 0.24
 *   2. Transonic sound barrier (0.8 <= Mach <= 1.3): shock wave formation causes a steep wave drag bump, peaking near 0.56
 *   3. Supersonic and hypersonic (Mach > 1.3): gradually tapers off to ~0.28 following Prandtl-Glauert compressibility rules
 *   4. Angle-of-attack induced drag: cross-flow exposure scales drag by sin²(alpha)
 */
export function computeDragCoefficient(mach: number, aoaDeg: number): number {
  const m = Math.max(0, mach);
  let cdZeroAoA: number;

  if (m < 0.8) {
    cdZeroAoA = 0.24 + 0.04 * (m / 0.8) ** 2;
  } else if (m <= 1.15) {
    // Transonic shock wave peak
    const t = (m - 0.8) / 0.35;
    cdZeroAoA = 0.28 + 0.28 * Math.sin(t * (Math.PI / 2));
  } else {
    // Supersonic wave drag decay
    cdZeroAoA = 0.27 + 0.29 / Math.pow(1 + 0.65 * (m - 1.15), 0.85);
  }

  const aoaRad = (Math.abs(aoaDeg) * Math.PI) / 180;
  const inducedCd = 2.4 * Math.sin(aoaRad) * Math.sin(aoaRad);

  return cdZeroAoA + inducedCd;
}

/**
 * Compute dynamic pressure q = 0.5 * rho * v_surf^2 (Pa)
 */
export function computeDynamicPressure(densityKgM3: number, surfaceSpeedMs: number): number {
  return 0.5 * densityKgM3 * surfaceSpeedMs * surfaceSpeedMs;
}
