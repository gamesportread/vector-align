import { describe, expect, it } from 'vitest';
import { HOME_MISSIONS } from '../data/homeMissions';
import { useSession } from '../store';

describe('Home Mission Selector Data & Store Interface', () => {
  it('contains the 4 core mission phases with complete youth-friendly specs', () => {
    expect(HOME_MISSIONS).toHaveLength(4);

    const [liftoff, docking, departure, landing] = HOME_MISSIONS;

    // 1 Liftoff
    expect(liftoff.num).toBe(1);
    expect(liftoff.titleZh).toBe('Liftoff');
    expect(liftoff.specs.timeZh).toContain('Ignition');
    expect(liftoff.specs.locationZh).toContain('Orbit');
    expect(liftoff.scienceTip.termZh).toBe('First Cosmic Velocity & Staging');
    expect(liftoff.isImplemented).toBe(true);
    expect(liftoff.historicalScenarios?.find((s) => s.id === 'saturn-v')?.isAvailable).toBe(true);

    // 2 Station Docking
    expect(docking.num).toBe(2);
    expect(docking.titleZh).toBe('Station Docking');
    expect(docking.specs.timeZh).toContain('Port Lock');
    expect(docking.specs.locationZh).toContain('Low Earth Orbit');
    expect(docking.scienceTip.termZh).toBe('6-DOF & Inertial Counter-Thrust');
    expect(docking.isImplemented).toBe(true);
    expect(docking.historicalScenarios?.find((s) => s.id === 'iss-standard')?.isAvailable).toBe(true);

    // 3 Station Departure
    expect(departure.num).toBe(3);
    expect(departure.titleZh).toBe('Station Departure');
    expect(departure.specs.stageZh).toContain('Spring Push-off');
    expect(departure.scienceTip.termZh).toBe('Departure Corridor & Spring Separation');
    expect(departure.isImplemented).toBe(true);
    expect(departure.historicalScenarios?.find((s) => s.id === 'iss-undock')?.isAvailable).toBe(true);

    // 4 Capsule Landing
    expect(landing.num).toBe(4);
    expect(landing.titleZh).toBe('Capsule Landing');
    expect(landing.specs.locationZh).toContain('Recovery');
    expect(landing.scienceTip.termZh).toBe('Blackout Zone & Landing Retro-Rockets');
    expect(landing.isImplemented).toBe(true);
    expect(landing.historicalScenarios?.find((s) => s.id === 'apollo-11-splashdown')?.isAvailable).toBe(true);
  });

  it('manages navigation between home screen and simulator via useSession', () => {
    // Initial state
    expect(useSession.getState().screen).toBe('home');

    // Enter simulator
    useSession.getState().setScreen('simulator');
    expect(useSession.getState().screen).toBe('simulator');

    // Return home
    useSession.getState().setScreen('home');
    expect(useSession.getState().screen).toBe('home');
  });

  it('provides explanation for each technical term suitable for teenagers', () => {
    for (const mission of HOME_MISSIONS) {
      expect(mission.scienceTip.explanationZh.length).toBeGreaterThan(20);
      expect(mission.specs.vehicleZh.length).toBeGreaterThan(5);
      expect(mission.summaryZh.length).toBeGreaterThan(30);
    }
  });

  it('validates 2 scenarios for mission 2 with distinct live/unmade status', () => {
    const docking = HOME_MISSIONS.find((m) => m.id === 2);
    expect(docking).toBeDefined();
    expect(docking?.historicalScenarios).toHaveLength(2);

    const [iss, gemini] = docking!.historicalScenarios!;
    expect(iss.isAvailable).toBe(true);
    expect(gemini.isAvailable).toBe(false);

    // Each scenario has descriptive copy for subtext
    for (const sc of docking!.historicalScenarios!) {
      expect(sc.descZh.length).toBeGreaterThan(10);
      expect(sc.titleZh.length).toBeGreaterThan(3);
    }
  });
});


