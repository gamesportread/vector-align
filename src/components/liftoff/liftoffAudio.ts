import type { LiftoffState } from '../../sim/liftoff';
import { sharedAudioContext, useSession } from '../../store';
import { detectLiftoffSoundCues, type LiftoffSoundCue } from './liftoffSoundCues';

/**
 * Procedural launch soundscape (Web Audio, no sample files):
 * - continuous engine rumble + crackle scaled by thrust and thinning atmosphere
 * - aerodynamic wind roar scaled by dynamic pressure
 * - one-shot cues for ignition, clamp release, staging, LES jettison, Max-Q, success and failure
 * Render-only: reads sim state, never mutates it.
 */

const MASTER_LEVEL = 0.9;
const MAX_Q_REF_PA = 35000;

function noiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'brown' | 'crackle'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') {
      d[i] = w;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      // Sparse sharp pops over a low bed: the characteristic rocket-exhaust crackle
      const pop = Math.random() < 0.0018 ? (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4) : 0;
      last = pop !== 0 ? pop : last * 0.82;
      d[i] = last + w * 0.08;
    }
  }
  return buf;
}

interface Layer {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class LiftoffAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private out?: AudioNode;
  private rumble?: Layer;
  private crackle?: Layer;
  private wind?: Layer;
  private white?: AudioBuffer;
  private prev?: LiftoffState;
  private muted = useSession.getState().muted;
  private unsubscribe = useSession.subscribe((s) => {
    if (s.muted !== this.muted) {
      this.muted = s.muted;
      if (!s.muted) this.unlock();
    }
  });

  /** Create / resume the audio graph. Call from a user gesture (click / key press). */
  unlock(): void {
    if (this.muted) return;
    try {
      if (!this.ctx) this.build(sharedAudioContext());
      void this.ctx?.resume();
    } catch {
      /* Audio is optional. */
    }
  }

  /** Re-baseline transition detection so a fresh run does not fire stale cues. */
  reset(initial?: LiftoffState): void {
    this.prev = initial;
  }

  /**
   * Per-frame update.
   * @param refThrustN loudest reference thrust (stage 1 sea-level) used to normalize engine volume
   */
  update(state: LiftoffState, running: boolean, refThrustN: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.rumble || !this.crackle || !this.wind) {
      this.prev = state;
      return;
    }
    try {
      this.mix(ctx.currentTime, state, running, refThrustN);
    } catch {
      /* Audio is optional. */
    }

    const prev = this.prev;
    this.prev = state;
    if (!prev || state.time < prev.time || this.muted) return;
    for (const cue of detectLiftoffSoundCues(prev, state)) this.play(cue);
  }

  private mix(now: number, state: LiftoffState, running: boolean, refThrustN: number): void {
    if (!this.master || !this.rumble || !this.crackle || !this.wind) return;
    const active = running && !this.muted && (state.status === 'flying' || state.status === 'failed');
    this.master.gain.setTargetAtTime(active ? MASTER_LEVEL : 0, now, active ? 0.08 : 0.15);

    const alt = Math.max(0, state.orbit.altitudeM);
    const air = Math.exp(-alt / 9000);
    const thrust = refThrustN > 0 ? Math.min(1.4, Math.max(0, state.thrustN) / refThrustN) : 0;
    const loud = Math.sqrt(thrust);
    // Near the pad, sound reflects off the flame trench and is loudest
    const padBoost = alt < 300 ? 1.25 : 1;

    // Structure-borne rumble persists in vacuum; airborne crackle fades with altitude
    const rumbleGain = loud * (0.3 + 0.55 * air) * padBoost;
    this.rumble.gain.gain.setTargetAtTime(rumbleGain, now, 0.12);
    this.rumble.filter.frequency.setTargetAtTime(110 + 260 * air * loud, now, 0.2);

    const crackleGain = loud * air * 0.32 * padBoost;
    this.crackle.gain.gain.setTargetAtTime(crackleGain, now, 0.12);

    const q = Math.min(1.5, state.dynamicPressurePa / MAX_Q_REF_PA);
    this.wind.gain.gain.setTargetAtTime(0.32 * q, now, 0.25);
    this.wind.filter.frequency.setTargetAtTime(350 + 900 * Math.min(1, state.mach / 3), now, 0.3);
  }

  dispose(): void {
    this.unsubscribe();
    try {
      for (const layer of [this.rumble, this.crackle, this.wind]) layer?.src.stop();
      this.master?.disconnect();
    } catch {
      /* Already stopped. */
    }
    this.ctx = undefined;
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.out = comp;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.white = noiseBuffer(ctx, 2, 'white');
    this.rumble = this.layer(noiseBuffer(ctx, 4, 'brown'), 'lowpass', 300, 0.7);
    this.crackle = this.layer(noiseBuffer(ctx, 3, 'crackle'), 'highpass', 700, 0.5);
    this.wind = this.layer(noiseBuffer(ctx, 3, 'white'), 'bandpass', 500, 0.6);
  }

  private layer(buffer: AudioBuffer, type: BiquadFilterType, freq: number, q: number): Layer {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master!);
    src.start();
    return { src, filter, gain };
  }

  /** Filtered white-noise burst with an exponential envelope and optional cutoff sweep. */
  private burst(
    type: BiquadFilterType,
    f0: number,
    f1: number,
    peak: number,
    attack: number,
    dur: number,
    delay = 0
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.white!;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Pitched tone with a frequency glide. */
  private toneSweep(
    wave: OscillatorType,
    f0: number,
    f1: number,
    peak: number,
    dur: number,
    delay = 0
  ): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private play(cue: LiftoffSoundCue): void {
    try {
      switch (cue) {
        case 'ignition':
          this.toneSweep('sine', 70, 38, 0.25, 0.6);
          this.burst('lowpass', 300, 2200, 0.35, 0.35, 1.4);
          break;
        case 'clamp_release':
          this.toneSweep('triangle', 210, 70, 0.22, 0.18);
          this.toneSweep('square', 1400, 600, 0.04, 0.05);
          this.burst('highpass', 2500, 1200, 0.12, 0.005, 0.12);
          this.toneSweep('triangle', 160, 60, 0.16, 0.16, 0.09);
          break;
        case 'engine_cutoff':
          this.burst('lowpass', 1800, 120, 0.22, 0.01, 0.9);
          break;
        case 'stage_separation':
          // Pyrotechnic bolts, then ullage/retro motor hiss
          this.burst('bandpass', 1600, 400, 0.5, 0.003, 0.25);
          this.toneSweep('sine', 90, 30, 0.35, 0.4);
          this.burst('bandpass', 900, 500, 0.3, 0.003, 0.2, 0.07);
          this.burst('highpass', 3000, 1500, 0.14, 0.15, 1.1, 0.15);
          break;
        case 'tower_jettison':
          this.burst('bandpass', 1400, 500, 0.4, 0.003, 0.2);
          this.burst('bandpass', 600, 2400, 0.28, 0.1, 1.6, 0.05);
          break;
        case 'max_q':
          this.toneSweep('sine', 880, 880, 0.08, 0.14);
          this.toneSweep('sine', 880, 880, 0.08, 0.14, 0.2);
          break;
        case 'sonic_boom':
          this.toneSweep('sine', 60, 32, 0.3, 0.25);
          this.toneSweep('sine', 60, 32, 0.24, 0.25, 0.18);
          break;
        case 'success':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
            this.toneSweep('triangle', f, f, 0.09, 0.45, i * 0.13)
          );
          break;
        case 'explosion':
          this.toneSweep('sine', 80, 22, 0.6, 1.6);
          this.burst('lowpass', 4000, 90, 0.75, 0.01, 2.8);
          this.burst('bandpass', 1200, 300, 0.35, 0.02, 1.2, 0.25);
          break;
        case 'crash':
          this.toneSweep('triangle', 140, 30, 0.4, 0.5);
          this.burst('lowpass', 2000, 120, 0.45, 0.01, 1.2);
          break;
      }
    } catch {
      /* Audio is optional. */
    }
  }
}
