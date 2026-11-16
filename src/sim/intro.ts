// Tutorial "one-dimensional straight track" minigame: single forward/back axis with the same physics as full missions.
import { ACCELERATION, clamp, DT } from './engine';

export const TRACK = {
  start: 13, // Start point: 13 m from docking port
  speed: -0.65, // Initial speed: approaching ISS at 0.65 m/s (same as mission 1)
  target: 8, // Target ring position: 8 m
  tolerance: 0.35, // Position tolerance: +/- 0.35 m counted as inside ring
  speedTolerance: 0.06, // Speed tolerance: speed < 0.06 m/s counted as stopped
  hold: 1.5, // Hold duration: 1.5 s stable hold required
  contact: 0.35, // Contact position where spacecraft touches station
  far: 17 // Drifts out of frame
} as const;

export type TrackStatus = 'flying' | 'success' | 'crash' | 'lost';
export interface TrackState { x: number; v: number; hold: number; time: number; thrust: number; status: TrackStatus }
/** Autopilot mode: manual = player input, coast = no braking, auto = demo braking */
export type TrackPilot = 'manual' | 'coast' | 'auto';

export const createTrack = (): TrackState => ({ x: TRACK.start, v: TRACK.speed, hold: 0, time: 0, thrust: 0, status: 'flying' });

export const inRing = (s: TrackState) => Math.abs(s.x - TRACK.target) <= TRACK.tolerance;
export const isStopped = (s: TrackState) => Math.abs(s.v) <= TRACK.speedTolerance;

/** Demo autopilot: uses the same braking rules as mission "Watch Demo". */
export function autoThrust(s: TrackState) {
  const desired = clamp((TRACK.target - s.x) * 0.14, -0.65, 0.65);
  return clamp((desired - s.v) * 1.8 / ACCELERATION);
}

/** thrust: -1 = forward thrust toward station (R key), +1 = retrograde braking thrust (F key), 0 = release. */
export function trackStep(s: TrackState, thrust: number, dt = DT): TrackState {
  if (s.status !== 'flying') return s;
  const t = clamp(thrust);
  const v = s.v + t * ACCELERATION * dt;
  const x = s.x + v * dt;
  const next: TrackState = { x, v, hold: s.hold, time: s.time + dt, thrust: t, status: 'flying' };
  if (x <= TRACK.contact) return { ...next, x: TRACK.contact, status: 'crash' };
  if (x >= TRACK.far) return { ...next, status: 'lost' };
  next.hold = inRing(next) && isStopped(next) ? s.hold + dt : 0;
  if (next.hold >= TRACK.hold) next.status = 'success';
  return next;
}

export function pilotThrust(pilot: TrackPilot, s: TrackState, manual: number) {
  return pilot === 'manual' ? manual : pilot === 'auto' ? autoThrust(s) : 0;
}

/** Headless test helper: runs simulation for specified seconds with fixed step. */
export function runTrack(pilot: TrackPilot, seconds: number, manual: (s: TrackState) => number = () => 0) {
  let s = createTrack();
  for (let i = 0; i < Math.round(seconds / DT) && s.status === 'flying'; i++) s = trackStep(s, pilotThrust(pilot, s, manual(s)));
  return s;
}
