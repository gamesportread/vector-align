export interface SingleFrameLoopOptions {
  shouldAnimate: () => boolean;
  onFrame: (dtSeconds: number, nowMs: number) => void;
  requestFrame?: (cb: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}

export interface SingleFrameLoop {
  ensure: () => void;
  stop: () => void;
  dispose: () => void;
  isScheduled: () => boolean;
}

/**
 * Schedules at most one animation frame at a time, even when synchronous store
 * subscribers triggered inside `onFrame` call `ensure()` or `stop()`.
 */
export function createSingleFrameLoop({
  shouldAnimate,
  onFrame,
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}: SingleFrameLoopOptions): SingleFrameLoop {
  let frame: number | null = null;
  let last = now();
  let inTick = false;
  let disposed = false;

  const scheduleNext = () => {
    if (!disposed && !inTick && frame === null && shouldAnimate()) {
      frame = requestFrame(tick);
    }
  };

  const stop = () => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }
  };

  const tick = (timestamp: number) => {
    frame = null;
    if (disposed) return;

    const dt = Math.max(0, (timestamp - last) / 1000);
    last = timestamp;

    // Prevent synchronous store subscribers during onFrame from queueing a duplicate rAF.
    inTick = true;
    try {
      onFrame(dt, timestamp);
    } finally {
      inTick = false;
    }

    scheduleNext();
  };

  const ensure = () => {
    if (disposed || inTick || frame !== null || !shouldAnimate()) return;
    last = now();
    scheduleNext();
  };

  const dispose = () => {
    disposed = true;
    stop();
  };

  return {
    ensure,
    stop,
    dispose,
    isScheduled: () => frame !== null,
  };
}

export type HatchHotkeyAction = 'ignore' | 'consume' | 'toggle';

/**
 * Classifies a `keydown` event for the `1` nosecone hatch hotkey so repeated
 * key holds, modifier shortcuts (e.g. Cmd+1), and editable fields never
 * swallow browser hotkeys or bounce the hatch direction back.
 */
export function classifyHatchHotkey(e: {
  code: string;
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): HatchHotkeyAction {
  if (e.code !== 'Digit1' && e.code !== 'Numpad1' && e.key !== '1') {
    return 'ignore';
  }
  const el = e.target as { closest?: (selector: string) => unknown } | null;
  if (el?.closest?.('input,select,textarea,[contenteditable="true"]')) {
    return 'ignore';
  }
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return 'ignore';
  }
  return e.repeat ? 'consume' : 'toggle';
}

