import { describe, expect, it } from 'vitest';
import { liftoffDriver } from '../../testing/liftoff-driver';
import { detectLiftoffSoundCues, type LiftoffSoundCue } from './liftoffSoundCues';

function collectCues(seconds: number, chunk = 0.1): LiftoffSoundCue[] {
  const cues: LiftoffSoundCue[] = [];
  let prev = liftoffDriver.snapshot().state;
  for (let t = 0; t < seconds; t += chunk) {
    const snap = liftoffDriver.advance(chunk);
    cues.push(...detectLiftoffSoundCues(prev, snap.state));
    prev = snap.state;
    if (!snap.running) break;
  }
  return cues;
}

describe('liftoff sound cues', () => {
  it('fires the launch sequence cues across the demo ascent missions', () => {
    const all = new Set<LiftoffSoundCue>();
    for (const id of [1, 2, 3, 4]) {
      liftoffDriver.load(id);
      liftoffDriver.start(true);
      for (const cue of collectCues(400)) all.add(cue);
    }
    for (const cue of [
      'ignition',
      'clamp_release',
      'max_q',
      'sonic_boom',
      'stage_separation',
      'tower_jettison',
      'success'
    ] as const) {
      expect(all.has(cue), cue).toBe(true);
    }
    expect(all.has('explosion')).toBe(false);
  });

  it('fires a crash cue on pad fallback and an explosion on premature staging', () => {
    liftoffDriver.load(1);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(0.2);
    liftoffDriver.triggerStage();
    expect(collectCues(0.5)).toContain('crash');

    liftoffDriver.load(2);
    liftoffDriver.start(false);
    liftoffDriver.setThrottle(1);
    liftoffDriver.advance(1);
    liftoffDriver.triggerStage();
    const cues = collectCues(0.5);
    expect(cues.some((c) => c === 'explosion' || c === 'crash')).toBe(true);
  });
});
