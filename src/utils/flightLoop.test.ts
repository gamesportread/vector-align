import { describe, expect, it } from 'vitest';
import { advanceFrame, runtime, useSession } from '../store';
import { classifyHatchHotkey, createSingleFrameLoop } from './flightLoop';

function runLoopStepwise(clockStart: number, stepMs: number, maxTicks: number) {
  const queue = new Map<number, (now: number) => void>();
  let nextId = 1;
  let clock = clockStart;
  let scheduledTotal = 0;
  let publish = 0;

  const loop = createSingleFrameLoop({
    shouldAnimate: () => {
      const s = useSession.getState();
      return s.running || s.hatch.state === 'opening' || s.hatch.state === 'closing';
    },
    onFrame: (dt, now) => {
      advanceFrame(dt);
      if (now - publish > 80 && useSession.getState().flight !== runtime.state) {
        useSession.setState({ flight: runtime.state });
        publish = now;
      }
    },
    requestFrame: (cb) => {
      scheduledTotal += 1;
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      queue.delete(id);
    },
    now: () => clock,
  });

  const unsub = useSession.subscribe((state) => {
    if (state.running || state.hatch.state === 'opening' || state.hatch.state === 'closing') {
      loop.ensure();
    } else {
      loop.stop();
    }
  });

  const drain = () => {
    let ticks = 0;
    while (queue.size > 0 && ticks < maxTicks) {
      // Every active frame must have strictly 1 pending rAF callback (no 2^N explosion).
      expect(queue.size).toBe(1);
      const [[id, cb]] = [...queue.entries()];
      queue.delete(id);
      clock += stepMs;
      cb(clock);
      ticks += 1;
    }
    return ticks;
  };

  return {
    loop,
    queue,
    drain,
    getScheduledTotal: () => scheduledTotal,
    cleanup: () => {
      loop.dispose();
      unsub();
    },
  };
}

describe('createSingleFrameLoop & hatch single-rAF invariant', () => {
  it('closes hatch cleanly with strictly 1 pending rAF per frame when ready', () => {
    useSession.getState().select(1);
    useSession.setState({ running: false, hatch: { state: 'open', progress: 1 } });

    const harness = runLoopStepwise(1000, 50, 200);
    try {
      useSession.getState().toggleHatch();
      expect(useSession.getState().hatch.state).toBe('closing');
      expect(harness.queue.size).toBe(1);

      const ticks = harness.drain();

      expect(useSession.getState().hatch.state).toBe('closed');
      expect(useSession.getState().hatch.progress).toBe(0);
      expect(harness.queue.size).toBe(0);
      expect(harness.loop.isScheduled()).toBe(false);
      expect(ticks).toBeLessThanOrEqual(45);
      expect(harness.getScheduledTotal()).toBe(ticks);
    } finally {
      harness.cleanup();
    }
  });

  it('closes hatch while running=true without duplicating rAF on 80ms flight publishes', () => {
    useSession.getState().select(1);
    useSession.getState().start(false);
    const openHatch = { state: 'open' as const, progress: 1 };
    runtime.state.hatch = openHatch;
    useSession.setState({ hatch: openHatch });

    const harness = runLoopStepwise(1000, 50, 60);
    try {
      harness.loop.ensure();
      expect(harness.queue.size).toBe(1);

      useSession.getState().toggleHatch();
      expect(useSession.getState().hatch.state).toBe('closing');

      const ticks = harness.drain();

      expect(ticks).toBe(60);
      expect(harness.queue.size).toBe(1);
      expect(harness.getScheduledTotal()).toBe(61);
      expect(useSession.getState().hatch.state).toBe('closed');
      expect(useSession.getState().hatch.progress).toBe(0);
    } finally {
      useSession.setState({ running: false });
      harness.cleanup();
    }
  });

  it('re-schedules exactly once if a subscriber flips shouldAnimate back to true during onFrame', () => {
    let animate = true;
    const queue = new Map<number, (now: number) => void>();
    let nextId = 1;

    const loop = createSingleFrameLoop({
      shouldAnimate: () => animate,
      onFrame: () => {
        animate = false;
        loop.stop();
        animate = true;
        loop.ensure();
      },
      requestFrame: (cb) => {
        const id = nextId++;
        queue.set(id, cb);
        return id;
      },
      cancelFrame: (id) => {
        queue.delete(id);
      },
      now: () => 0,
    });

    loop.ensure();
    expect(queue.size).toBe(1);

    const [[id, cb]] = [...queue.entries()];
    queue.delete(id);
    cb(16);

    expect(queue.size).toBe(1);
    loop.dispose();
    expect(queue.size).toBe(0);
  });
});

describe('classifyHatchHotkey', () => {
  const baseEvent = {
    code: 'Digit1',
    key: '1',
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: null,
  };

  it('toggles on primary 1, numpad 1, or IME Digit1 events', () => {
    expect(classifyHatchHotkey(baseEvent)).toBe('toggle');
    expect(classifyHatchHotkey({ ...baseEvent, code: 'Numpad1', key: '1' })).toBe('toggle');
    expect(classifyHatchHotkey({ ...baseEvent, code: 'Unidentified', key: '1' })).toBe('toggle');
    // Chinese/Japanese IME sends key='Process' while code remains 'Digit1'
    expect(classifyHatchHotkey({ ...baseEvent, code: 'Digit1', key: 'Process' })).toBe('toggle');
  });

  it('consumes key repeats without bouncing hatch back open', () => {
    expect(classifyHatchHotkey({ ...baseEvent, repeat: true })).toBe('consume');
  });

  it('ignores modifier combinations, editable elements, and unrelated keys', () => {
    expect(classifyHatchHotkey({ ...baseEvent, metaKey: true })).toBe('ignore');
    expect(classifyHatchHotkey({ ...baseEvent, ctrlKey: true })).toBe('ignore');
    expect(classifyHatchHotkey({ ...baseEvent, altKey: true })).toBe('ignore');
    expect(classifyHatchHotkey({ ...baseEvent, code: 'Digit2', key: '2' })).toBe('ignore');

    const inputTarget = {
      closest: (selector: string) => selector.includes('input'),
    } as unknown as EventTarget;
    expect(classifyHatchHotkey({ ...baseEvent, target: inputTarget })).toBe('ignore');

    const buttonTarget = {
      closest: () => null,
    } as unknown as EventTarget;
    expect(classifyHatchHotkey({ ...baseEvent, target: buttonTarget })).toBe('toggle');
  });
});

