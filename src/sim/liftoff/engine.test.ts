import { describe, expect, it } from 'vitest';
import { liftoffDriver } from '../../testing/liftoff-driver';
import {
  computeDragCoefficient,
  computeOrbitalElements,
  createLiftoffState,
  EARTH_RADIUS_M,
  emptyLiftoffCommand,
  getLiftoffScenario,
  getLiftoffScenarioForVehicle,
  getRocketVehicle,
  KARMAN_LINE_ALTITUDE_M,
  LIFTOFF_DT,
  LIFTOFF_GLOSSARY,
  liftoffScenarios,
  sampleAtmosphere,
  SEA_LEVEL_DENSITY_KG_M3,
  SEA_LEVEL_PRESSURE_PA,
  stepLiftoff
} from './index';

describe('Liftoff Physics Engine & NASA Saturn V Architecture', () => {
  it('applies reproducible gusts and counters their pitch deflection in hold mode', () => {
    const base = getLiftoffScenario(1);
    const scenario = {
      ...base,
      initialState: {
        ...base.initialState,
        altitudeM: 1900,
        verticalSpeedMs: 125,
        horizontalSpeedMs: 15,
        pitchDeg: 85,
        clampsReleased: true
      }
    };
    const start = (seed: number) => ({
      ...createLiftoffState(scenario, undefined, seed),
      status: 'flying' as const
    });
    const manualCommand = emptyLiftoffCommand(0.75, 'manual');
    const holdCommand = { ...emptyLiftoffCommand(0.75, 'hold'), targetPitchDeg: 85 };
    let manual = stepLiftoff(start(0.25), manualCommand, scenario);
    let hold = stepLiftoff(start(0.25), holdCommand, scenario);
    expect(manual.windEastMs).toBe(hold.windEastMs);
    expect(manual.windEastMs).not.toBe(stepLiftoff(start(0.75), manualCommand, scenario).windEastMs);
    let manualDeflection = 0;
    let holdDeflection = 0;
    for (let elapsed = 0; elapsed < 5; elapsed += LIFTOFF_DT) {
      manual = stepLiftoff(manual, manualCommand, scenario);
      hold = stepLiftoff(hold, holdCommand, scenario);
      manualDeflection = Math.max(manualDeflection, Math.abs(manual.pitchDeg - 85));
      holdDeflection = Math.max(holdDeflection, Math.abs(hold.pitchDeg - 85));
    }
    expect(manual.status).toBe('flying');
    expect(hold.status).toBe('flying');
    expect(manualDeflection).toBeGreaterThan(0.5);
    expect(holdDeflection).toBeLessThan(0.1);
  });

  it('models US Standard Atmosphere 1976 pressure, density, and transonic wave drag accurately', () => {
    const seaLevel = sampleAtmosphere(0);
    expect(seaLevel.pressurePa).toBeCloseTo(SEA_LEVEL_PRESSURE_PA, 0);
    expect(seaLevel.densityKgM3).toBeCloseTo(SEA_LEVEL_DENSITY_KG_M3, 2);
    expect(seaLevel.speedOfSoundMs).toBeCloseTo(340.3, 0);

    // 13 km Max-Q altitude: density is roughly ~21% of sea level
    const alt13km = sampleAtmosphere(13000);
    expect(alt13km.pressureRatio).toBeGreaterThan(0.14);
    expect(alt13km.pressureRatio).toBeLessThan(0.22);

    // Above Karman line (100 km -> 140 km cutoff)
    const karman = sampleAtmosphere(KARMAN_LINE_ALTITUDE_M);
    expect(karman.densityKgM3).toBeLessThan(1e-5);
    const vacuum = sampleAtmosphere(150000);
    expect(vacuum.pressurePa).toBe(0);
    expect(vacuum.densityKgM3).toBe(0);

    // Transonic wave-drag bump around Mach 1.05 > subsonic Mach 0.3
    const cdSubsonic = computeDragCoefficient(0.3, 0);
    const cdTransonic = computeDragCoefficient(1.08, 0);
    const cdHighAoA = computeDragCoefficient(1.08, 12);
    expect(cdTransonic).toBeGreaterThan(cdSubsonic * 1.8);
    expect(cdHighAoA).toBeGreaterThan(cdTransonic);
  });

  it('computes real-time Keplerian orbital elements (Apoapsis, Periapsis, First Cosmic Velocity)', () => {
    // 185 km circular Low Earth Parking Orbit (NASA Apollo 11 standard 100-nmi parking orbit)
    const rOrbit = EARTH_RADIUS_M + 185000;
    const vCircular = Math.sqrt(3.986004418e14 / rOrbit); // ~7,793 m/s
    const orbit = computeOrbitalElements([0, rOrbit], [vCircular, 0]);

    expect(orbit.altitudeM).toBeCloseTo(185000, 0);
    expect(orbit.circularVelocityMs).toBeCloseTo(7797.4, 0);
    expect(orbit.apoapsisM).toBeCloseTo(185000, -2);
    expect(orbit.periapsisM).toBeCloseTo(185000, -2);
    expect(orbit.eccentricity).toBeLessThan(0.001);
    expect(orbit.isOrbitStable).toBe(true);
  });

  it('matches NASA Saturn V (AS-506) liftoff mass and Thrust-to-Weight Ratio (TWR ~ 1.20)', () => {
    const saturnV = getRocketVehicle('saturn-v');
    expect(saturnV.stages).toHaveLength(3);

    const snap = liftoffDriver.load(1);
    // Total mass ~ 2,928 tonnes
    expect(snap.state.totalMassKg).toBeGreaterThan(2900000);
    expect(snap.state.totalMassKg).toBeLessThan(2960000);

    // Start and set 100% throttle on pad before releasing clamps
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    const ignited = liftoffDriver.advance(0.5);
    expect(ignited.state.twr).toBeGreaterThan(1.15);
    expect(ignited.state.twr).toBeLessThan(1.25);
  });

  it('detects failure modes: pad_fallback, tower_collision, aero_stress, and premature_staging', () => {
    // 1. Pad fallback when releasing clamps with insufficient throttle (TWR < 1.0)
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(0.2);
    liftoffDriver.triggerStage();
    const padFail = liftoffDriver.advance(0.2);
    expect(padFail.state.status).toBe('failed');
    expect(padFail.state.reason).toBe('pad_fallback');

    // 2. Tower collision when pitching sharply (< 78 deg) below 150m launch tower height
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.2);
    liftoffDriver.triggerStage(); // liftoff
    liftoffDriver.setSas('manual');
    liftoffDriver.setPitch(-1.0); // yank nose down immediately next to tower
    const towerFail = liftoffDriver.advance(4.0);
    expect(towerFail.state.status).toBe('failed');
    expect(towerFail.state.reason).toBe('tower_collision');

    // 3. Aerodynamic breakup (aero_stress) when pitching violently perpendicular to airflow at Max-Q
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.5);
    liftoffDriver.triggerStage(); // liftoff
    liftoffDriver.setSas('pitch_program');
    liftoffDriver.advance(55); // climb to high dynamic pressure altitude
    liftoffDriver.setSas('manual');
    liftoffDriver.setPitch(-1.0); // force huge Angle of Attack during Max-Q
    const aeroFail = liftoffDriver.advance(15.0);
    expect(aeroFail.state.status).toBe('failed');
    expect(aeroFail.state.reason).toBe('aero_stress');

    // 4. Premature staging when pressing Space while Stage 1 still has plenty of fuel
    liftoffDriver.load(2);
    liftoffDriver.start(false);
    liftoffDriver.triggerStage();
    const stageFail = liftoffDriver.advance(0.1);
    expect(stageFail.state.status).toBe('failed');
    expect(stageFail.state.reason).toBe('premature_staging');
  });

  it('completes all 4 training missions deterministically via liftoffAutopilot', () => {
    // Mission 1: Merged Pad Liftoff & Gravity Turn through Max-Q to 35 km
    liftoffDriver.load(1);
    liftoffDriver.start(true);
    const m1 = liftoffDriver.advance(150);
    expect(m1.state.status).toBe('success');
    expect(m1.state.orbit.altitudeM).toBeGreaterThanOrEqual(35000);
    expect(m1.state.maxQRecordedPa).toBeGreaterThan(25000); // experienced realistic ~30-35 kPa Max-Q
    expect(m1.state.pitchDeg).toBeGreaterThanOrEqual(22);
    expect(m1.state.pitchDeg).toBeLessThanOrEqual(65);

    // Mission 2: Stage 1-2 Separation (MECO -> S-II ignition) & LES Jettison to Ap >= 165 km
    liftoffDriver.load(2);
    liftoffDriver.start(true);
    const m2 = liftoffDriver.advance(200);
    expect(m2.state.status).toBe('success');
    expect(m2.state.activeStageIndex).toBe(1);
    expect(m2.state.towerJettisoned).toBe(true);
    expect(m2.state.orbit.apoapsisM).toBeGreaterThanOrEqual(165000);

    // Mission 3: Orbital Insertion to 185 km Circular Parking Orbit (First Cosmic Velocity ~7.8 km/s)
    liftoffDriver.load(3);
    liftoffDriver.start(true);
    const m3 = liftoffDriver.advance(240);
    expect(m3.state.status).toBe('success');
    expect(m3.state.orbit.isOrbitStable).toBe(true);
    expect(m3.state.orbit.periapsisM).toBeGreaterThanOrEqual(155000);
    expect(m3.state.orbit.apoapsisM).toBeGreaterThanOrEqual(175000);
    expect(m3.state.orbit.orbitalSpeedMs).toBeGreaterThan(7750);

    // Mission 4: Full Continuous Launch Sequence from 0 m Launchpad to 185 km Circular Orbit
    liftoffDriver.load(4);
    liftoffDriver.start(true);
    const m4 = liftoffDriver.advance(780);
    expect(m4.state.status).toBe('success');
    expect(m4.state.orbit.isOrbitStable).toBe(true);
    expect(m4.state.towerJettisoned).toBe(true);
    expect(m4.state.activeStageIndex).toBeGreaterThanOrEqual(1);
    expect(m4.state.orbit.periapsisM).toBeGreaterThanOrEqual(155000);
  });

  it('provides youth-friendly explanations for all technical terms in scenarios and glossary', () => {
    expect(LIFTOFF_GLOSSARY.length).toBeGreaterThanOrEqual(5);
    for (const item of LIFTOFF_GLOSSARY) {
      expect(item.teenExplanation.zh.length).toBeGreaterThan(40);
      expect(item.teenExplanation.en.length).toBeGreaterThan(40);
    }
    expect(liftoffScenarios).toHaveLength(3);
    for (const sc of liftoffScenarios) {
      expect(sc.scienceTerm.explanation.zh.length).toBeGreaterThan(40);
    }
  });

  it('accurately distinguishes pad fallback vs low altitude crash vs suborbital reentry', () => {
    // Case 1: Pad fallback - flameout before clearing launch tower (<160m), even after prolonged time
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.5);
    liftoffDriver.triggerStage(); // liftoff
    liftoffDriver.advance(1.5); // reached ~15m
    liftoffDriver.setThrottle(0); // cut engine immediately near pad
    const padCrash = liftoffDriver.advance(6.0); // drop back down
    expect(padCrash.state.status).toBe('failed');
    expect(padCrash.state.reason).toBe('pad_fallback');
    expect(padCrash.state.consequence).toBe('crashed_pad');
    expect(padCrash.state.maxAltitudeM).toBeLessThan(160);

    // Case 2: Low altitude crash - lifts off to ~800m then engine cuts off
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.5);
    liftoffDriver.triggerStage();
    liftoffDriver.advance(16.0); // climbs past launch tower (> 160m)
    expect(liftoffDriver.snapshot().state.orbit.altitudeM).toBeGreaterThan(160);
    liftoffDriver.setThrottle(0); // flameout in lower atmosphere
    const lowAltCrash = liftoffDriver.advance(25.0); // free-falls down
    expect(lowAltCrash.state.status).toBe('failed');
    expect(lowAltCrash.state.reason).toBe('low_altitude_crash');
    // Case 3: Land crash (downrange inland west or between pad apron and Atlantic shoreline) shows crashed_land, not crashed_ocean
    expect(lowAltCrash.state.reason).not.toBe('suborbital_reentry');
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.5);
    liftoffDriver.triggerStage();
    liftoffDriver.advance(12.0); // climb vertically
    liftoffDriver.setSas('manual');
    liftoffDriver.setPitch(1.0); // pitch slightly west (inland Florida)
    liftoffDriver.advance(14.0);
    liftoffDriver.setThrottle(0);
    const landCrash = liftoffDriver.advance(60.0);
    expect(landCrash.state.status).toBe('failed');
    expect(landCrash.state.orbit.downrangeM).toBeLessThan(-350);
    expect(landCrash.state.consequence).toBe('crashed_land');
  });

  it('falls back onto the pad when throttled below TWR 1 before clearing the tower, then holds a static wreck', () => {
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1.0);
    liftoffDriver.advance(0.5);
    liftoffDriver.triggerStage(); // liftoff
    const climbing = liftoffDriver.advance(3.0);
    expect(climbing.state.status).toBe('flying');
    expect(climbing.state.orbit.altitudeM).toBeGreaterThan(5);

    liftoffDriver.setThrottle(0.55); // engines still lit, but TWR < 1
    expect(liftoffDriver.advance(0.2).state.twr).toBeLessThan(1);
    const impact = liftoffDriver.advance(12.0);
    expect(impact.state.status).toBe('failed');
    expect(impact.state.reason).toBe('pad_fallback');
    expect(impact.state.consequence).toBe('crashed_pad');
    expect(impact.state.maxAltitudeM).toBeLessThan(160);

    // Aftermath clock keeps running (drives the topple / fire animation) while the wreck stays put
    const later = liftoffDriver.advance(4.0);
    expect(later.state.time).toBeGreaterThan(impact.state.time + 3.9);
    expect(later.state.orbit.altitudeM).toBeCloseTo(0, 3);
    expect(later.state.consequence).toBe('crashed_pad');

    // Retry from the crash returns a fresh, flyable rocket on the pad
    liftoffDriver.start(false);
    const retry = liftoffDriver.snapshot().state;
    expect(retry.status).toBe('flying');
    expect(retry.consequence).toBe('none');
    expect(retry.clampsReleased).toBe(false);
  });

  it('continues physics deduction and consequences after failure', () => {
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(0.2);
    liftoffDriver.triggerStage(); // triggers pad fallback
    const initialFail = liftoffDriver.advance(0.1);
    expect(initialFail.state.status).toBe('failed');
    expect(initialFail.state.failureTime).toBeDefined();

    // Advancing simulator during failed state continues evolving the physics aftermath
    const aftermath = liftoffDriver.advance(2.0);
    expect(aftermath.state.status).toBe('failed');
    expect(aftermath.state.consequence).toBe('crashed_pad');
    expect(aftermath.state.throttle).toBe(0);
    expect(aftermath.state.thrustN).toBe(0);
  });

  it('configures Space Launch System (SLS Block 1) heavy-lift rocket with KSC launch site', () => {
    const sls = getRocketVehicle('sls');
    expect(sls.id).toBe('sls');
    expect(sls.name.en).toContain('Space Launch System');
    expect(sls.launchLatitudeDeg).toBeCloseTo(28.627, 2); // LC-39B
    expect(sls.launchSite.en).toContain('Kennedy Space Center');
    // Boost phase (2 × SRB + 4 × RS-25) → core stage alone → ICPS
    expect(sls.stages.map((s) => s.code)).toEqual(['SRB+Core', 'Core', 'ICPS']);
    expect(sls.stages[0].thrustSeaLevelN).toBeGreaterThan(30000000);
    const liftoffMassT =
      (sls.payloadMassKg + sls.launchEscapeTowerMassKg + sls.stages.reduce((m, s) => m + s.dryMassKg + s.fuelMassKg, 0)) / 1000;
    expect(liftoffMassT).toBeGreaterThan(2550); // NASA: ~2,610 t
    expect(liftoffMassT).toBeLessThan(2660);
  });

  it('flies all 4 missions with SLS (boosters → core → ICPS) via liftoffAutopilot', () => {
    const run = (id: number, seconds: number) => {
      liftoffDriver.load(id, getLiftoffScenarioForVehicle(id, 'sls'));
      liftoffDriver.start(true);
      return liftoffDriver.advance(seconds).state;
    };
    expect(run(1, 150).status).toBe('success');
    const m2 = run(2, 260);
    expect(m2.status).toBe('success');
    expect(m2.activeStageIndex).toBe(1); // boosters gone, core flying alone
    expect(m2.towerJettisoned).toBe(true);
    const m3 = run(3, 640);
    expect(m3.status).toBe('success');
    expect(m3.activeStageIndex).toBe(2); // ICPS perigee raise
    expect(m3.orbit.periapsisM).toBeGreaterThanOrEqual(155000);
    const m4 = run(4, 900);
    expect(m4.status).toBe('success');
    expect(m4.orbit.isOrbitStable).toBe(true);
    expect(m4.activeStageIndex).toBeGreaterThanOrEqual(1);
  });
});
