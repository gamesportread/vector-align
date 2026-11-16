import type { LiftoffState } from '../../sim/liftoff';

/** Discrete one-shot sound cues derived from consecutive liftoff sim states. */
export type LiftoffSoundCue =
  | 'ignition'
  | 'clamp_release'
  | 'engine_cutoff'
  | 'stage_separation'
  | 'tower_jettison'
  | 'max_q'
  | 'sonic_boom'
  | 'success'
  | 'explosion'
  | 'crash';

/**
 * Pure transition detector: compares two sim states and returns the one-shot cues that
 * should fire. Kept free of Web Audio so it can be verified headlessly.
 */
export function detectLiftoffSoundCues(prev: LiftoffState, next: LiftoffState): LiftoffSoundCue[] {
  const cues: LiftoffSoundCue[] = [];
  const prevSeparated = prev.stages.filter((s) => s.separated).length;
  const nextSeparated = next.stages.filter((s) => s.separated).length;

  if (next.status === 'flying') {
    if (prev.thrustN <= 0 && next.thrustN > 0) cues.push('ignition');
    if (prev.thrustN > 0 && next.thrustN <= 0 && nextSeparated === prevSeparated) {
      cues.push('engine_cutoff');
    }
    if (!prev.clampsReleased && next.clampsReleased) cues.push('clamp_release');
    if (nextSeparated > prevSeparated) cues.push('stage_separation');
    if (!prev.towerJettisoned && next.towerJettisoned) cues.push('tower_jettison');
    if (!prev.passedMaxQ && next.passedMaxQ) cues.push('max_q');
    if (prev.mach < 1 && next.mach >= 1) cues.push('sonic_boom');
  }

  if (prev.status !== 'success' && next.status === 'success') cues.push('success');

  if (prev.status === 'flying' && next.status === 'failed') {
    cues.push(next.consequence === 'exploding' ? 'explosion' : 'crash');
  } else if (
    prev.status === 'failed' &&
    next.status === 'failed' &&
    prev.consequence !== next.consequence &&
    (next.consequence === 'crashed_pad' || next.consequence === 'crashed_land' || next.consequence === 'crashed_ocean')
  ) {
    cues.push('crash');
  }

  return cues;
}
