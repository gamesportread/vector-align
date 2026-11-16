import { describe, expect, it } from 'vitest';
import { landingDriver } from '../../testing/landing-driver';
import { RETRO_WINDOW_M } from './engine';

function fireRetroAt(heightM: number) {
  landingDriver.load(3);
  landingDriver.start(false);
  landingDriver.jettisonHeatshield();
  let snap = landingDriver.advance(1 / 60);
  while (snap.state.status === 'flying' && snap.state.altitudeM > heightM) {
    snap = landingDriver.advance(1 / 60);
  }
  landingDriver.triggerAction();
  return landingDriver.advance(20).state;
}

describe('Mission 04 · Capsule Landing Physics & Scenarios', () => {
  it('fails with heatshield_burnthrough if capsule tilts excessively during plasma blackout', () => {
    landingDriver.load(1);
    landingDriver.start(false);
    landingDriver.setAttitudeInput(1); // Force capsule to tilt away from hypersonic stream
    const failed = landingDriver.advance(5);

    expect(failed.state.status).toBe('failed');
    expect(failed.state.failReason).toBe('heatshield_burnthrough');
  });

  it('fails with chute_shred if parachute is deployed above safe subsonic speed (255 m/s)', () => {
    landingDriver.load(2);
    landingDriver.start(false);
    // Initial speed in Level 2 is 255 m/s (> 235 m/s limit)
    landingDriver.triggerAction();
    const failed = landingDriver.advance(0.1);

    expect(failed.state.status).toBe('failed');
    expect(failed.state.failReason).toBe('chute_shred');
  });

  it('fails with hard_impact if retro-rockets are not fired before grassland touchdown', () => {
    landingDriver.load(3);
    landingDriver.start(false);
    const failed = landingDriver.advance(10);

    expect(failed.state.status).toBe('failed');
    expect(failed.state.failReason).toBe('hard_impact');
  });

  it('completes all 4 Capsule Landing missions deterministically via landingAutopilot', () => {
    for (const id of [1, 2, 3, 4]) {
      landingDriver.load(id);
      landingDriver.start(true);
      const result = landingDriver.advance(id === 4 ? 1300 : 180);
      expect(result.state.status, `Landing Mission ${id} should succeed`).toBe('success');
      if (id === 3 || id === 4) {
        expect(result.state.altitudeM).toBe(0);
        expect(result.state.retroFired).toBe(true);
        expect(result.state.touchdownSpeedMs).toBeLessThanOrEqual(2.4);
      }
      if (id === 4) {
        let postBlackoutSamples = 0;
        let troposphericMainSamples = 0;
        for (let i = 1; i < result.samples.length; i++) {
          const prev = result.samples[i - 1];
          const curr = result.samples[i];
          expect(curr.altitudeKm).toBeLessThanOrEqual(prev.altitudeKm);
          expect(prev.altitudeKm - curr.altitudeKm).toBeLessThanOrEqual(0.55);
          if (curr.altitudeKm > 12.5 && curr.altitudeKm < 35.8) postBlackoutSamples++;
          if (curr.altitudeKm > 0.18 && curr.altitudeKm < 7.0) troposphericMainSamples++;
        }
        expect(postBlackoutSamples).toBeGreaterThan(20);
        expect(troposphericMainSamples).toBeGreaterThan(100);
      }
    }
  });

  it('soft-lands for any retro ignition inside the taught 1.0–2.5 m window', () => {
    for (const h of [RETRO_WINDOW_M.min, 1.5, 2.0, RETRO_WINDOW_M.max]) {
      const result = fireRetroAt(h);
      expect(result.status, `retro fired at ${h} m`).toBe('success');
      expect(result.touchdownSpeedMs).toBeLessThanOrEqual(2.4);
    }
    expect(fireRetroAt(0.5).failReason).toBe('hard_impact');
    expect(fireRetroAt(3.5).failReason).toBe('hard_impact');
    expect(fireRetroAt(4.4).failReason).toBe('retro_early');
  });
});
