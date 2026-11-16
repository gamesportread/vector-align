/**
 * Headless test driver for Rocket Liftoff missions
 * Enables deterministic verification in Vitest without WebGL/browser:
 * - Launch pad ignition and hold-down clamp release logic based on TWR
 * - Atmospheric transonic wave drag, Max-Q peak, and AoA Q*alpha structural failure criteria
 * - Multi-stage Tsiolkovsky variable-mass staging and launch escape tower jettison
 * - Keplerian orbital elements computation and autopilot completion of all missions
 */
import { FixedStepper } from '../sim/engine';
import {
  createLiftoffState,
  emptyLiftoffCommand,
  getLiftoffScenario,
  getRocketVehicle,
  LIFTOFF_DT,
  liftoffAutopilot,
  sampleLiftoff,
  stepLiftoff,
  type LiftoffCommand,
  type LiftoffSample,
  type LiftoffScenarioConfig,
  type LiftoffState,
  type SasMode
} from '../sim/liftoff';

interface LiftoffDriverSession {
  scenario: LiftoffScenarioConfig;
  state: LiftoffState;
  command: LiftoffCommand;
  running: boolean;
  demo: boolean;
  samples: LiftoffSample[];
  lastSampleTime: number;
  stepper: FixedStepper;
}

const session: LiftoffDriverSession = {
  scenario: getLiftoffScenario(1),
  state: createLiftoffState(getLiftoffScenario(1)),
  command: emptyLiftoffCommand(0, 'hold'),
  running: false,
  demo: false,
  samples: [],
  lastSampleTime: 0,
  stepper: new FixedStepper()
};

export const liftoffDriver = {
  /** Load scenario (1 ~ 5) or custom configuration */
  load(id: number, custom?: LiftoffScenarioConfig) {
    if (!Number.isInteger(id) || id < 1 || id > 5) {
      throw new RangeError('Liftoff mission ID must be 1–5');
    }
    const cfg = structuredClone(custom ?? getLiftoffScenario(id));
    session.scenario = cfg;
    session.state = createLiftoffState(cfg);
    session.command = emptyLiftoffCommand(cfg.initialState.throttle, cfg.initialState.sasMode);
    session.running = false;
    session.demo = false;
    session.samples = [];
    session.lastSampleTime = session.state.time;
    session.stepper.reset();
    return this.snapshot();
  },

  /** Start liftoff simulation (demo = true engages deterministic autopilot) */
  start(demo = false) {
    session.state = {
      ...createLiftoffState(session.scenario),
      status: 'flying'
    };
    session.command = emptyLiftoffCommand(
      session.scenario.initialState.throttle,
      session.scenario.initialState.sasMode
    );
    session.running = true;
    session.demo = demo;
    session.samples = [sampleLiftoff(session.state)];
    session.lastSampleTime = session.state.time;
    session.stepper.reset();
    return this.snapshot();
  },

  /** Set throttle setting (0.0 ~ 1.0) */
  setThrottle(throttle: number) {
    if (!Number.isFinite(throttle) || throttle < 0 || throttle > 1) {
      throw new RangeError('Throttle must be in [0, 1]');
    }
    session.command.throttle = throttle;
    return this.snapshot();
  },

  /** Set manual pitch input (-1.0 ~ 1.0) or target pitch angle */
  setPitch(pitchInput: number, targetPitchDeg?: number) {
    session.command.pitchInput = pitchInput;
    if (targetPitchDeg !== undefined) {
      session.command.targetPitchDeg = targetPitchDeg;
    }
    return this.snapshot();
  },

  /** Set SAS attitude mode */
  setSas(mode: SasMode, targetPitchDeg?: number) {
    session.command.sasMode = mode;
    if (targetPitchDeg !== undefined) {
      session.command.targetPitchDeg = targetPitchDeg;
    }
    return this.snapshot();
  },

  /** Trigger stage separation / launch clamp release */
  triggerStage() {
    session.command.triggerStage = true;
    return this.snapshot();
  },

  /** Trigger launch escape tower (LES) jettison */
  jettisonTower() {
    session.command.jettisonTower = true;
    return this.snapshot();
  },

  /** Advance simulation by specified duration (seconds) */
  advance(seconds: number, fps = 60) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) {
      throw new RangeError('Simulated duration must be between 0 and 3600 seconds');
    }
    const totalFrames = Math.round(seconds * fps);
    const frameDt = 1 / fps;
    const vehicle = getRocketVehicle(session.scenario.vehicleId);

    for (let f = 0; f < totalFrames; f++) {
      if (!session.running || (session.state.status !== 'flying' && session.state.status !== 'failed')) break;
      session.stepper.advance(frameDt, () => {
        if (session.state.status !== 'flying' && session.state.status !== 'failed') return;
        const cmd = session.demo
          ? liftoffAutopilot(session.state, session.scenario, vehicle)
          : session.command;

        session.state = stepLiftoff(session.state, cmd, session.scenario, LIFTOFF_DT, vehicle);

        // Consume single-pulse commands
        session.command.triggerStage = false;
        session.command.jettisonTower = false;

        if (session.state.time - session.lastSampleTime >= 1.0) {
          session.samples.push(sampleLiftoff(session.state));
          session.lastSampleTime = session.state.time;
        }

        if (session.state.status === 'success') {
          session.samples.push(sampleLiftoff(session.state));
          session.running = false;
        }
      });
    }
    return this.snapshot();
  },

  /** Get current readonly state snapshot */
  snapshot() {
    return structuredClone({
      scenario: session.scenario,
      state: session.state,
      command: session.command,
      running: session.running,
      demo: session.demo,
      samples: session.samples
    });
  }
};
