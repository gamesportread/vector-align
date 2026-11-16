import { loc, makeT } from '../../i18n';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Crosshair,
  Flame,
  Gauge,
  Globe2,
  Layers3,
  Orbit,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Sparkles,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { FixedStepper } from '../../sim/engine';
import {
  clamp,
  createLiftoffState,
  emptyLiftoffCommand,
  getLiftoffScenarioForVehicle,
  getRocketVehicle,
  LIFTOFF_DT,
  LIFTOFF_GLOSSARY,
  liftoffAutopilot,
  sampleLiftoff,
  stepLiftoff,
  type LiftoffCommand,
  type LiftoffConsequence,
  type LiftoffFailure,
  type LiftoffSample,
  type LiftoffScenarioConfig,
  type LiftoffState,
  type RocketVehicleConfig,
  type RocketVehicleId,
  type SasMode
} from '../../sim/liftoff';
import { tone, useSession } from '../../store';
import { formatTime } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { KspNavball } from './KspNavball';
import { LiftoffReadoutTooltip } from './LiftoffReadoutTooltip';
import { LiftoffAudio } from './liftoffAudio';
import { LiftoffCanvas, getLaunchSequenceSteps } from './LiftoffCanvas';
import './liftoff.css';

function explainLiftoffFailure(
  reason: LiftoffFailure | undefined,
  t: (zh: string, en: string, vars?: Record<string, string | number>) => string
): { title: string; detail: string; tip: string } {
  switch (reason) {
    case 'pad_fallback':
      return {
        title: t('⚠️ Fell Back onto Launchpad', '⚠️ Fell Back onto Launchpad'),
        detail: t('The rocket had not cleared the launchpad when engine thrust was lost or insufficient (TWR < 1.0), plunging straight back onto the pad.', 'The rocket had not cleared the launchpad when engine thrust was lost or insufficient (TWR < 1.0), plunging straight back onto the pad.'),
        tip: t('💡 Tip: Push throttle to 100% via [Z] first, confirm TWR > 1.15, then press [Space] to liftoff!', '💡 Tip: Push throttle to 100% via [Z] first, confirm TWR > 1.15, then press [Space] to liftoff!')
      };
    case 'low_altitude_crash':
      return {
        title: t('⚠️ Low Altitude Flameout · Crashed', '⚠️ Low Altitude Flameout · Crashed'),
        detail: t('The rocket lifted off but lost thrust at low altitude, plummeting back down into the ground or ocean.', 'The rocket lifted off but lost thrust at low altitude, plummeting back down into the ground or ocean.'),
        tip: t('💡 Tip: Maintain full engine throttle after liftoff until stage burnout!', '💡 Tip: Maintain full engine throttle after liftoff until stage burnout!')
      };
    case 'tower_collision':
      return {
        title: t('⚠️ Early Pitch · Struck 150m Launch Tower', '⚠️ Early Pitch · Struck 150m Launch Tower'),
        detail: t('You tilted the rocket nose before clearing the 150-meter launch tower!', 'You tilted the rocket nose before clearing the 150-meter launch tower!'),
        tip: t('💡 Tip: Fly straight up (90°) until altitude exceeds 150 m, then gently pitch east!', '💡 Tip: Fly straight up (90°) until altitude exceeds 150 m, then gently pitch east!')
      };
    case 'aero_stress':
      return {
        title: t('⚠️ Max-Q Aero Breakup · Excessive Angle of Attack', '⚠️ Max-Q Aero Breakup · Excessive Angle of Attack'),
        detail: t('During high dynamic pressure (Max-Q), your nose deviated too far from the yellow Prograde vector, causing aerodynamic structural breakup!', 'During high dynamic pressure (Max-Q), your nose deviated too far from the yellow Prograde vector, causing aerodynamic structural breakup!'),
        tip: t('💡 Tip: Engage SAS [Prograde ◯] during Max-Q so the rocket flies at near-zero Angle of Attack!', '💡 Tip: Engage SAS [Prograde ◯] during Max-Q so the rocket flies at near-zero Angle of Attack!')
      };
    case 'premature_staging':
      return {
        title: t('⚠️ Premature Staging · Booster Rear-End Collision', '⚠️ Premature Staging · Booster Rear-End Collision'),
        detail: t('You triggered stage separation while the current stage still had fuel and active thrust, causing it to ram the upper stage!', 'You triggered stage separation while the current stage still had fuel and active thrust, causing it to ram the upper stage!'),
        tip: t('💡 Tip: Wait until the active stage fuel bar reaches 0% (MECO) before pressing [Space]!', '💡 Tip: Wait until the active stage fuel bar reaches 0% (MECO) before pressing [Space]!')
      };
    case 'late_staging':
      return {
        title: t('⚠️ Late Staging · Lost Ascent Momentum', '⚠️ Late Staging · Lost Ascent Momentum'),
        detail: t('Stage 1 burned out (MECO), but you waited too long to separate and ignite Stage 2!', 'Stage 1 burned out (MECO), but you waited too long to separate and ignite Stage 2!'),
        tip: t('💡 Tip: Press [Space] immediately when Stage 1 fuel hits 0%!', '💡 Tip: Press [Space] immediately when Stage 1 fuel hits 0%!')
      };
    case 'suborbital_reentry':
    case 'orbit_eccentric':
      return {
        title: t('⚠️ Suborbital Trajectory · Reentered Atmosphere', '⚠️ Suborbital Trajectory · Reentered Atmosphere'),
        detail: t('You reached space altitude, but horizontal speed was below ~7,790 m/s (Periapsis remained inside the atmosphere)!', 'You reached space altitude, but horizontal speed was below ~7,790 m/s (Periapsis remained inside the atmosphere)!'),
        tip: t('💡 Tip: Level the nose horizontally (0°–8°) near Apoapsis to build horizontal speed and raise Periapsis > 155 km!', '💡 Tip: Level the nose horizontally (0°–8°) near Apoapsis to build horizontal speed and raise Periapsis > 155 km!')
      };
    default:
      return {
        title: t('⚠️ Mission Timeout or Fuel Exhausted', '⚠️ Mission Timeout or Fuel Exhausted'),
        detail: t('Target ascent parameters were not reached within the time or fuel budget.', 'Target ascent parameters were not reached within the time or fuel budget.'),
        tip: t('💡 Tip: Click [Demo] to see how the autopilot executes the ascent profile!', '💡 Tip: Click [Demo] to see how the autopilot executes the ascent profile!')
      };
  }
}

function formatLiftoffConsequence(
  consequence: LiftoffConsequence | undefined,
  t: (zh: string, en: string, vars?: Record<string, string | number>) => string
): string {
  switch (consequence) {
    case 'exploding':
      return t('💥 Aerial Structural Breakup · Tracking debris', '💥 Aerial Structural Breakup · Tracking debris');
    case 'falling':
      return t('⚠️ Thrust Lost · Rocket in gravity dive', '⚠️ Thrust Lost · Rocket in gravity dive');
    case 'crashed_pad':
      return t('💥 Impacted on launchpad ground', '💥 Impacted on launchpad ground');
    case 'crashed_land':
      return t('💥 Crashed on land surface', '💥 Crashed on land surface');
    case 'crashed_ocean':
      return t('🌊 Crashed into ocean surface with waves', '🌊 Crashed into ocean surface with waves');
    case 'drifting_space':
      return t('🛰️ Stranded in vacuum · Drifting forever', '🛰️ Stranded in vacuum · Drifting forever');
    default:
      return t('⚠️ Failure simulation in progress...', '⚠️ Failure simulation in progress...');
  }
}

interface FlightGuidance {
  key: string;
  vars?: Record<string, string | number>;
  detail?: string;
}

const PITCH_ON_TARGET_HINT = '✨ Pitch angle great! Climb through the cloud deck!';
const VECTOR_GUIDANCE: readonly (FlightGuidance & { durationMs: number })[] = [
  { key: PITCH_ON_TARGET_HINT, durationMs: 1500 },
  { key: 'The dashed blue line shows NASA’s recommended thrust direction.', durationMs: 4000 },
  {
    key: 'The yellow line shows the rocket’s overall velocity direction, which can differ from its thrust direction.',
    detail: 'Prograde means thrusting along the current velocity direction.',
    durationMs: 5500
  }
];

const TIME_WARPS = [1, 2, 4, 10] as const;
type TimeWarp = typeof TIME_WARPS[number];

function LiftoffToolbarButton({
  icon: Icon,
  label,
  className,
  pressed,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={className} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Icon size={15} aria-hidden="true" />
      <span className="liftoff-toolbar-label">{label}</span>
    </button>
  );
}

function getLiftoffInFlightGuidance(
  scenarioId: number,
  state: LiftoffState
): FlightGuidance {
  const altKm = state.orbit.altitudeM / 1000;
  const activeStage = state.stages[state.activeStageIndex];
  const fuelPct =
    activeStage && activeStage.maxFuelMassKg > 0
      ? (activeStage.fuelMassKg / activeStage.maxFuelMassKg) * 100
      : 0;

  if (!state.clampsReleased) {
    if (state.twr < 1.05) {
      return { key: '🔥 Step 1: Press [Z] (or drag throttle to 100%) to ignite the main engines!' };
    }
    return { key: '🚀 Water deluge active, TWR (>1.0)! Press [Space] (or click STAGE) to release clamps!' };
  }

  if (state.orbit.altitudeM < 150) {
    return { key: '🗼 Clearing 150m launch tower · Hold 90° vertical!' };
  }

  if (activeStage && fuelPct <= 0.1 && state.activeStageIndex < state.stages.length - 1) {
    return { key: '⚡ Stage {0} depleted (MECO)! Press [Space] NOW to stage and ignite next stage!', vars: { 0: state.activeStageIndex + 1 } };
  }

  if ((scenarioId === 1 || (scenarioId === 4 && altKm < 35)) && altKm < 8 && state.activeStageIndex === 0) {
    if (state.pitchDeg > 82) {
      return { key: '🎯 Tower cleared! Press [D] / [→] (or engage Auto Turn) to tilt pitch to ~70°!' };
    }
    return { key: PITCH_ON_TARGET_HINT };
  }

  if (scenarioId === 1 || (scenarioId === 4 && altKm < 35 && state.activeStageIndex === 0)) {
    if (altKm >= 10 && altKm <= 17) {
      return { key: '🌪️ Passing through Max-Q! Keep SAS on [Prograde ◯] and avoid sharp turns!' };
    }
    return { key: '🎯 Gravity turn climb · Follow Prograde!' };
  }

  if (scenarioId === 2 || (scenarioId === 4 && state.orbit.apoapsisM < 168000)) {
    if (state.activeStageIndex === 0) {
      return { key: '⏳ Stage 1 fuel {0}% · Stand by to press [Space] the moment fuel hits 0%!', vars: { 0: fuelPct.toFixed(1) } };
    }
    if (!state.towerJettisoned && altKm >= 92) {
      return { key: '🗼 Above 92 km dense atmosphere! Press [J] (or click Jettison LES) to drop escape tower & fairing!' };
    }
    return { key: '🔥 Stage 2 burning! Push predicted Apoapsis (Ap) toward 185 km (current Ap {0} km)!', vars: { 0: (state.orbit.apoapsisM / 1000).toFixed(1) } };
  }

  // Scenario 3 or final phase of Scenario 4: Orbital Insertion
  return { key: '🌍 Orbital insertion! Level nose (0°–10°) and accelerate to 7,797 m/s until Periapsis (Pe {0} km) > 155 km!', vars: { 0: (state.orbit.periapsisM / 1000).toFixed(1) } };
}

export interface LiftoffWorkspaceHandle {
  openBriefing: () => void;
}

function createEntryState(scenario: LiftoffScenarioConfig, vehicle: RocketVehicleConfig): LiftoffState {
  const startsRunning = scenario.id >= 2;
  const state = createLiftoffState(scenario, vehicle, startsRunning ? Math.random() : 0);
  if (startsRunning) state.status = 'flying';
  return state;
}

function formatSignedKm(meters: number): string {
  const km = (meters / 1000).toFixed(1);
  return km.startsWith('-') ? `−${km.slice(1)}` : km;
}

function createFlightCommand(state: LiftoffState): LiftoffCommand {
  return {
    ...emptyLiftoffCommand(state.throttle, state.sasMode),
    targetPitchDeg: state.pitchDeg
  };
}

export interface LiftoffWorkspaceProps {
  ref?: Ref<LiftoffWorkspaceHandle>;
  initialVehicleId?: RocketVehicleId;
  initialActiveLevel?: number;
  isOpenMobile?: boolean;
  onToggleMobile?: () => void;
  onCloseMobile?: () => void;
  onActiveLevelChange?: (level: number) => void;
}

export function LiftoffWorkspace({
  ref,
  initialVehicleId = 'saturn-v',
  initialActiveLevel = 1,
  onCloseMobile,
  onActiveLevelChange
}: LiftoffWorkspaceProps) {
  const language = useSession((s) => s.language);
  const t = makeT(language);

  const [vehicleId, setVehicleId] = useState<RocketVehicleId>(initialVehicleId);
  const [activeLevel, setActiveLevel] = useState<number>(initialActiveLevel);
  const [mobileConsoleTab, setMobileConsoleTab] = useState<'propulsion' | 'attitude'>('propulsion');
  const [scenario, setScenario] = useState<LiftoffScenarioConfig>(() =>
    getLiftoffScenarioForVehicle(Math.max(1, initialActiveLevel), initialVehicleId)
  );
  const [state, setState] = useState<LiftoffState>(() =>
    createEntryState(scenario, getRocketVehicle(initialVehicleId))
  );
  const [running, setRunning] = useState(() => state.status === 'flying');
  const [demo, setDemo] = useState(false);
  const [timeWarp, setTimeWarp] = useState<TimeWarp>(1);
  const [viewMode, setViewMode] = useState<'rocket' | 'map'>('rocket');
  const [vectorGuidanceIndex, setVectorGuidanceIndex] = useState<number | null>(null);
  const [showGuidance, setShowGuidance] = useState(true);
  const [modalType, setModalType] = useState<'none' | 'brief' | 'review' | 'glossary'>('none');
  useImperativeHandle(ref, () => ({ openBriefing: () => setModalType('brief') }), []);
  const closeModal = useCallback(() => setModalType('none'), []);
  const returnToBriefing = useCallback(() => setModalType('brief'), []);
  const [samples, setSamples] = useState<LiftoffSample[]>(() => [sampleLiftoff(state)]);
  const [failureCardVisible, setFailureCardVisible] = useState(true);
  const failureTimerRef = useRef<number | null>(null);
  const audioRef = useRef<LiftoffAudio | null>(null);

  useEffect(() => {
    const audio = new LiftoffAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const vehicle = getRocketVehicle(vehicleId);

  // Mutable runtime ref for 60Hz animation loop
  const runtimeRef = useRef<{
    state: LiftoffState;
    command: LiftoffCommand;
    scenario: LiftoffScenarioConfig;
    vehicleId: RocketVehicleId;
    running: boolean;
    demo: boolean;
    timeWarp: number;
    stepper: FixedStepper;
    samples: LiftoffSample[];
    lastSampleTime: number;
  }>({
    state,
    command: createFlightCommand(state),
    scenario,
    vehicleId: initialVehicleId,
    running,
    demo: false,
    timeWarp: 1,
    stepper: new FixedStepper(),
    samples: [sampleLiftoff(state)],
    lastSampleTime: state.time
  });

  const loadScenario = (id: number, nextVehId: RocketVehicleId = vehicleId) => {
    setVectorGuidanceIndex(null);
    if (failureTimerRef.current) {
      clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
    setFailureCardVisible(true);

    if (id === 0) {
      runtimeRef.current.running = false;
      runtimeRef.current.vehicleId = nextVehId;
      runtimeRef.current.scenario = getLiftoffScenarioForVehicle(1, nextVehId);
      setVehicleId(nextVehId);
      setRunning(false);
      setDemo(false);
      setModalType('none');
      setActiveLevel(0);
      return;
    }

    const sc: LiftoffScenarioConfig = getLiftoffScenarioForVehicle(id, nextVehId);
    const veh = getRocketVehicle(nextVehId);
    const initSt = createEntryState(sc, veh);
    const startsRunning = initSt.status === 'flying';
    audioRef.current?.reset(initSt);
    if (startsRunning) audioRef.current?.unlock();

    runtimeRef.current = {
      state: initSt,
      command: createFlightCommand(initSt),
      scenario: sc,
      vehicleId: nextVehId,
      running: startsRunning,
      demo: false,
      timeWarp: 1,
      stepper: new FixedStepper(),
      samples: [sampleLiftoff(initSt)],
      lastSampleTime: initSt.time
    };

    setVehicleId(nextVehId);
    setScenario(sc);
    setState(initSt);
    setSamples([sampleLiftoff(initSt)]);
    setRunning(startsRunning);
    setDemo(false);
    setTimeWarp(1);
    setActiveLevel(id);
    setModalType('none');
  };

  const selectLevel = (id: number, nextVehId: RocketVehicleId = vehicleId) => {
    onCloseMobile?.();
    onActiveLevelChange?.(id);
    loadScenario(id, nextVehId);
  };

  const prevSyncedPropsRef = useRef({
    level: initialActiveLevel,
    vehicle: initialVehicleId
  });

  useEffect(() => {
    const prev = prevSyncedPropsRef.current;
    if (prev.level === initialActiveLevel && prev.vehicle === initialVehicleId) {
      return;
    }
    prevSyncedPropsRef.current = {
      level: initialActiveLevel,
      vehicle: initialVehicleId
    };
    loadScenario(initialActiveLevel, initialVehicleId);
  }, [initialActiveLevel, initialVehicleId]);

  const startFlight = (isDemo = false) => {
    const sc = runtimeRef.current.scenario;
    const veh = getRocketVehicle(runtimeRef.current.vehicleId);
    const freshState: LiftoffState = {
      ...createLiftoffState(sc, veh, isDemo ? 0 : Math.random()),
      status: 'flying'
    };
    const initialThrottle =
      !isDemo && !sc.initialState.clampsReleased ? 1.0 : sc.initialState.throttle;
    freshState.throttle = initialThrottle;
    const freshCmd = createFlightCommand(freshState);

    // On pad launch, start demo at 1x real-time so water deluge, 2.6s ignition hold-down,
    // clamp release, swing-arm retraction, and tower clear play out realistically
    const initWarp: TimeWarp = isDemo ? (sc.initialState.clampsReleased ? 4 : 1) : 1;

    runtimeRef.current.state = freshState;
    runtimeRef.current.command = freshCmd;
    runtimeRef.current.running = true;
    runtimeRef.current.demo = isDemo;
    runtimeRef.current.timeWarp = initWarp;
    runtimeRef.current.stepper.reset();
    runtimeRef.current.samples = [sampleLiftoff(freshState)];
    runtimeRef.current.lastSampleTime = freshState.time;

    if (failureTimerRef.current) {
      clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
    setFailureCardVisible(true);

    setState(freshState);
    setSamples(runtimeRef.current.samples);
    setRunning(true);
    setDemo(isDemo);
    setTimeWarp(initWarp);
    setVectorGuidanceIndex(null);
    setModalType('none');
    audioRef.current?.reset(freshState);
    audioRef.current?.unlock();
  };

  const pauseFlight = () => {
    const rt = runtimeRef.current;
    rt.running = false;
    rt.stepper.reset();
    setRunning(false);
    setState({ ...rt.state });
    setSamples([...rt.samples]);
  };

  const resumeFlight = () => {
    if (runtimeRef.current.state.status === 'flying' || runtimeRef.current.state.status === 'failed') {
      runtimeRef.current.running = true;
      runtimeRef.current.stepper.reset();
      setRunning(true);
      setModalType('none');
    }
  };

  const handleSetThrottle = (val: number) => {
    const clamped = clamp(val, 0, 1);
    if (!runtimeRef.current.running && runtimeRef.current.state.status === 'ready') {
      startFlight(false);
    }
    const rt = runtimeRef.current;
    rt.command.throttle = clamped;
    if (rt.running) {
      rt.state.throttle = clamped;
      setState((prev) => ({ ...prev, throttle: clamped }));
    }
  };

  const handleTriggerStage = () => {
    if (
      runtimeRef.current.state.status === 'success' ||
      runtimeRef.current.state.status === 'failed'
    ) {
      return;
    }
    if (!runtimeRef.current.running && runtimeRef.current.state.status === 'ready') {
      startFlight(false);
      runtimeRef.current.command.throttle = 1.0;
    }
    runtimeRef.current.command.triggerStage = true;
    audioRef.current?.unlock();
  };

  const handleJettisonTower = () => {
    runtimeRef.current.command.jettisonTower = true;
  };

  const handleSetSas = (mode: SasMode) => {
    runtimeRef.current.command.sasMode = mode;
    runtimeRef.current.command.targetPitchDeg = runtimeRef.current.state.pitchDeg;
    if (runtimeRef.current.running || runtimeRef.current.state.status === 'ready') {
      setState((prev) => ({ ...prev, sasMode: mode }));
    }
    tone(true);
  };

  const handleSteerPitch = (dir: number) => {
    runtimeRef.current.command.pitchInput = dir;
    if (dir === 0 && runtimeRef.current.command.sasMode === 'hold') {
      runtimeRef.current.command.targetPitchDeg = runtimeRef.current.state.pitchDeg;
    }
  };

  // 60Hz Fixed-Step Simulation Loop
  useEffect(() => {
    let frameId = 0;
    let lastNow = performance.now();
    let lastPublish = 0;

    const tick = (now: number) => {
      const dtWall = (now - lastNow) / 1000;
      lastNow = now;

      const rt = runtimeRef.current;
      if (rt.running && (rt.state.status === 'flying' || rt.state.status === 'failed')) {
        const veh = getRocketVehicle(rt.vehicleId);
        // Smoothly step up timeWarp in Demo mode once clear of the launch tower (400m)
        if (rt.demo && rt.timeWarp === 1 && rt.state.orbit.altitudeM > 400) {
          rt.timeWarp = 2;
          setTimeWarp(2);
        } else if (rt.demo && rt.timeWarp === 2 && rt.state.orbit.altitudeM > 18000) {
          rt.timeWarp = 4;
          setTimeWarp(4);
        }

        rt.stepper.advance(dtWall, () => {
          for (let w = 0; w < rt.timeWarp; w++) {
            if (rt.state.status !== 'flying' && rt.state.status !== 'failed') break;
            const cmd = rt.demo ? liftoffAutopilot(rt.state, rt.scenario, veh) : rt.command;
            const wasFlying = rt.state.status === 'flying';
            rt.state = stepLiftoff(rt.state, cmd, rt.scenario, LIFTOFF_DT, veh);
            rt.command.triggerStage = false;
            rt.command.jettisonTower = false;

            if (rt.state.time - rt.lastSampleTime >= 1.0) {
              rt.samples.push(sampleLiftoff(rt.state));
              rt.lastSampleTime = rt.state.time;
            }

            if (rt.state.status === 'success') {
              rt.samples.push(sampleLiftoff(rt.state));
              rt.running = false;
              setRunning(false);
              setState({ ...rt.state });
              setSamples([...rt.samples]);
              setModalType('review');
              break;
            } else if (rt.state.status === 'failed' && wasFlying) {
              // On failure event: play audio, sample telemetry, start 3s auto-collapse timer
              rt.samples.push(sampleLiftoff(rt.state));
              setFailureCardVisible(true);
              if (failureTimerRef.current) clearTimeout(failureTimerRef.current);
              failureTimerRef.current = window.setTimeout(() => {
                setFailureCardVisible(false);
              }, 3000);
              // Keep rt.running true to let consequence dynamics continue simulation
            }
          }
        });

        if (now - lastPublish > 65) {
          setState({ ...rt.state });
          setSamples([...rt.samples]);
          lastPublish = now;
        }
      }

      audioRef.current?.update(
        rt.state,
        rt.running,
        getRocketVehicle(rt.vehicleId).stages[0]?.thrustSeaLevelN ?? 0
      );

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Keyboard Controls for KSP Liftoff
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (modalType !== 'none' || target?.closest('input,select,textarea')) return;

      const rt = runtimeRef.current;

      if (e.code === 'KeyR') {
        e.preventDefault();
        startFlight(false);
        return;
      }

      if (e.code === 'KeyZ') {
        e.preventDefault();
        handleSetThrottle(1.0);
        return;
      }

      if (e.code === 'KeyX') {
        e.preventDefault();
        handleSetThrottle(0.0);
        return;
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleSetThrottle(rt.command.throttle + 0.08);
        return;
      }

      if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        handleSetThrottle(rt.command.throttle - 0.08);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerStage();
        return;
      }

      if (e.code === 'KeyJ' || e.code === 'Digit1') {
        e.preventDefault();
        handleJettisonTower();
        return;
      }

      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSteerPitch(1);
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        e.preventDefault();
        handleSteerPitch(-1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === 'KeyA' ||
        e.code === 'ArrowLeft' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowRight'
      ) {
        handleSteerPitch(0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [modalType]);

  const isFirstAscent = activeLevel === 1;
  const flightGuidance = state.status === 'flying'
    ? getLiftoffInFlightGuidance(scenario.id, state)
    : null;
  const canShowVectorGuidance =
    isFirstAscent && flightGuidance !== null && viewMode === 'rocket' && showGuidance && modalType === 'none';
  const advanceVectorGuidance =
    running && canShowVectorGuidance && (vectorGuidanceIndex !== null || flightGuidance?.key === PITCH_ON_TARGET_HINT);

  useEffect(() => {
    if (!advanceVectorGuidance) return;
    if (vectorGuidanceIndex === null) {
      setVectorGuidanceIndex(0);
      return;
    }
    const guidance = VECTOR_GUIDANCE[vectorGuidanceIndex];
    if (!guidance) return;
    // Leave room for both tips before the flight ends at maximum warp.
    const durationMs = timeWarp === 10 ? guidance.durationMs * 0.7 : guidance.durationMs;
    const timer = window.setTimeout(() => setVectorGuidanceIndex(vectorGuidanceIndex + 1), durationMs);
    return () => window.clearTimeout(timer);
  }, [advanceVectorGuidance, timeWarp, vectorGuidanceIndex]);

  const vectorGuidance = canShowVectorGuidance && vectorGuidanceIndex !== null
    ? VECTOR_GUIDANCE[vectorGuidanceIndex]
    : undefined;
  const pitchHintAlreadyShown =
    vectorGuidanceIndex === VECTOR_GUIDANCE.length && flightGuidance?.key === PITCH_ON_TARGET_HINT;
  const hudGuidance = vectorGuidance ?? (pitchHintAlreadyShown ? null : flightGuidance);
  const activeStageRuntime = state.stages[state.activeStageIndex];
  const isMecoReady =
    state.clampsReleased &&
    activeStageRuntime &&
    activeStageRuntime.fuelMassKg <= 0.1 &&
    state.activeStageIndex < state.stages.length - 1;

  const isPadLaunchReady = !state.clampsReleased && state.twr >= 1.1;
  const applyTimeWarp = (warp: TimeWarp) => {
    runtimeRef.current.timeWarp = warp;
    setTimeWarp(warp);
  };
  const warpLabel = t('Warp', 'Warp');
  const warpTitle = t('Physics Time Warp', 'Physics Time Warp');
  const velocityCueLabel = t('Current Velocity Cue', 'Current Velocity Cue');
  const flightEnded = state.status === 'ready' || state.status === 'failed' || state.status === 'success';
  const launchLabel = state.status === 'ready' ? t('Launch', 'Launch')
    : flightEnded ? t('Fly Again', 'Fly Again')
    : running ? t('Pause', 'Pause') : t('Resume', 'Resume');
  const paused = !running && state.status === 'flying';
  const mapView = viewMode === 'map';
  const apsides = [
    {
      label: 'Ap',
      name: t('Apoapsis', 'Apoapsis'),
      value: state.orbit.apoapsisM,
      explanation: t('Apoapsis (Ap) is the farthest point from Earth on the predicted orbit.', 'Apoapsis (Ap) is the farthest point from Earth on the predicted orbit.')
    },
    {
      label: 'Pe',
      name: t('Periapsis', 'Periapsis'),
      value: state.orbit.periapsisM,
      explanation: t('Periapsis (Pe) is the closest point to Earth on the predicted orbit.', 'Periapsis (Pe) is the closest point to Earth on the predicted orbit.')
    }
  ];
  const liveSceneLabel = t('Live Scene', 'Live Scene');
  const mapLabel = t('Orbit Map', 'Orbit Map');
  const ViewIcon = mapView ? Rocket : Globe2;
  const toolbarRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    let frame = 0;
    let mounted = true;
    const fit = () => {
      const width = toolbar.clientWidth;
      for (const layout of ['full', 'dropdown', 'icons'] as const) {
        toolbar.dataset.layout = layout;
        if (toolbar.scrollWidth <= width) return;
      }
      toolbar.dataset.layout = 'wrap';
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fit();
      });
    });
    observer.observe(toolbar, { box: 'border-box' });
    Array.from(toolbar.children).forEach((child) => observer.observe(child, { box: 'border-box' }));
    void document.fonts.ready.then(() => { if (mounted) fit(); });
    return () => {
      mounted = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [language, launchLabel]);

  return (
    <div className="liftoff-shell liftoff-no-sidebar">
      {/* Main Content Area */}
      <main className="liftoff-main">
            <section className="simulator liftoff-simulator" aria-label={t('Rocket Liftoff Simulator', 'Rocket Liftoff Simulator')}>
              <div className="scene-toolbar liftoff-scene-toolbar" ref={toolbarRef}>
                <div className="liftoff-flight-actions">
                  <button
                    type="button"
                    className="liftoff-view-toggle"
                    aria-label={mapView ? liveSceneLabel : mapLabel}
                    onClick={() => setViewMode(mapView ? 'rocket' : 'map')}
                  >
                    <ViewIcon size={15} aria-hidden="true" />
                    <span className="liftoff-toolbar-label liftoff-view-toggle-labels" aria-hidden="true">
                      <span hidden={!mapView}>{liveSceneLabel}</span>
                      <span hidden={mapView}>{mapLabel}</span>
                    </span>
                  </button>
                  <LiftoffToolbarButton
                    className="primary"
                    icon={running && !flightEnded ? Pause : Play}
                    label={launchLabel}
                    onClick={flightEnded ? () => startFlight(false) : running ? pauseFlight : resumeFlight}
                  />

                  <LiftoffToolbarButton icon={Sparkles} label={t('Demo', 'Demo')} onClick={() => startFlight(true)} />
                  <LiftoffToolbarButton icon={RotateCcw} label={t('Reset', 'Reset')} onClick={() => selectLevel(scenario.id)} />
                </div>

                <div className="liftoff-sequence-bar" aria-label={t('Launch Sequence Timeline', 'Launch Sequence Timeline')}>
                  {getLaunchSequenceSteps(state).map((step, idx, arr) => (
                    <div
                      key={step.id}
                      className={`seq-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}
                    >
                      <span className="seq-dot" />
                      <span className="seq-label">{t(step.zh, step.en)}</span>
                      {idx < arr.length - 1 && <span className="seq-line" />}
                    </div>
                  ))}
                </div>

                <div className="scene-tools">
                  <span className="mission-clock liftoff-toolbar-clock">{formatTime(state.time)}</span>
                  <div className="time-warp-group liftoff-warp-buttons" role="group" aria-label={warpTitle}>
                    <span className="time-warp-label">{warpLabel}</span>
                    {TIME_WARPS.map((warp) => (
                      <button
                        key={warp}
                        type="button"
                        className={`time-warp-btn ${timeWarp === warp ? 'active' : ''}`}
                        aria-pressed={timeWarp === warp}
                        onClick={() => applyTimeWarp(warp)}
                      >
                        {warp}×
                      </button>
                    ))}
                  </div>
                  <label className="time-warp-group liftoff-warp-select">
                    <span className="time-warp-label">{warpLabel}</span>
                    <select
                      aria-label={warpTitle}
                      value={timeWarp}
                      onChange={(e) => {
                        const warp = TIME_WARPS.find((option) => String(option) === e.target.value);
                        if (warp !== undefined) applyTimeWarp(warp);
                      }}
                    >
                      {TIME_WARPS.map((warp) => <option key={warp} value={warp}>{warp}×</option>)}
                    </select>
                  </label>
                  <LiftoffToolbarButton
                    icon={Crosshair}
                    className={`liftoff-velocity-toggle ${showGuidance ? 'enabled' : ''}`}
                    label={velocityCueLabel}
                    pressed={showGuidance}
                    onClick={() => setShowGuidance((value) => !value)}
                  />
                </div>
              </div>

              <div className="scene-container" data-paused={paused || undefined}>
                <LiftoffCanvas
                  state={state}
                  vehicle={vehicle}
                  samples={samples}
                  viewMode={viewMode}
                  paused={paused}
                  showGuidance={showGuidance}
                  language={language}
                />

                <div className="scene-top-left">
                  <span className="scene-tag">
                    {demo
                      ? t('AUTOPILOT DEMO', 'AUTOPILOT DEMO')
                      : `${loc(language, vehicle.name).split('·')[0]} · ${state.phase.toUpperCase()}`}
                  </span>
                  <span className="scene-subtag">{loc(language, vehicle.launchSite)}</span>
                </div>

                {/* Real-time Dynamic Flight Guidance HUD */}
                {hudGuidance && (
                  <div className="scene-hud-guide">
                    <span className="hud-guide-text">
                      {t(hudGuidance.key, hudGuidance.key, hudGuidance.vars)}
                      {hudGuidance.detail && (
                        <><br />{t(hudGuidance.detail, hudGuidance.detail)}</>
                      )}
                    </span>
                  </div>
                )}

                {/* Failure Banner */}
                {state.status === 'failed' && failureCardVisible && (
                  <div className="scene-failure-overlay">
                    <div className="liftoff-failure-card">
                      <div className="liftoff-failure-header">
                        <span className="liftoff-failure-title">
                          {explainLiftoffFailure(state.reason, t).title}
                        </span>
                        <span className="liftoff-failure-autoclose">
                          ⏱️ {t('Auto-minimizing in 3s', 'Auto-minimizing in 3s')}
                        </span>
                      </div>
                      <p className="liftoff-failure-detail">
                        {explainLiftoffFailure(state.reason, t).detail}
                      </p>
                      <div className="liftoff-failure-tip">
                        <span>{explainLiftoffFailure(state.reason, t).tip}</span>
                      </div>
                      <div className="liftoff-failure-actions">
                        <button className="liftoff-btn-review" onClick={() => setModalType('review')}>
                          🔍 {t('Diagnosis & Tips', 'Diagnosis & Tips')}
                        </button>
                        <button className="liftoff-btn-observe" onClick={() => setFailureCardVisible(false)}>
                          👁️ {t('Watch Consequence', 'Watch Consequence')}
                        </button>
                        <button className="liftoff-btn-retry" onClick={() => startFlight(false)}>
                          🚀 {t('Retry Launch', 'Retry Launch')} (R)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Minimized Failure Status Capsule */}
                {state.status === 'failed' && !failureCardVisible && (
                  <div className="liftoff-consequence-pill">
                    <span className="consequence-text">
                      {formatLiftoffConsequence(state.consequence, t)}
                    </span>
                    <button
                      type="button"
                      className="consequence-pill-btn"
                      onClick={() => setFailureCardVisible(true)}
                    >
                      {t('View Reason', 'View Reason')}
                    </button>
                    <button
                      type="button"
                      className="consequence-pill-btn consequence-pill-retry"
                      onClick={() => startFlight(false)}
                    >
                      🚀 {t('Retry', 'Retry')}
                    </button>
                  </div>
                )}
              </div>

            </section>

            {/* Mobile Console Tab Switcher */}
            <div className="mobile-console-switcher" role="tablist" aria-label={t('Console Switcher', 'Console Switcher')}>
              <button
                type="button"
                role="tab"
                aria-selected={mobileConsoleTab === 'propulsion'}
                className={mobileConsoleTab === 'propulsion' ? 'active' : ''}
                onClick={() => setMobileConsoleTab('propulsion')}
              >
                <Flame size={12} />
                <span>{t('Propulsion & Staging', 'Propulsion & Staging')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileConsoleTab === 'attitude'}
                className={mobileConsoleTab === 'attitude' ? 'active' : ''}
                onClick={() => setMobileConsoleTab('attitude')}
              >
                <Compass size={12} />
                <span>{t('Navball & Steering', 'Navball & Steering')}</span>
              </button>
            </div>

            {/* Dual Console: Staging & Throttle Left, Navball & Attitude Right */}
            <div className={`liftoff-lower-console show-${mobileConsoleTab}`}>
              {/* Left Panel: Throttle (Level 1) or Multi-Stage Propulsion & Staging (Level 2+) */}
              <div className="liftoff-propulsion-panels" data-testid="ksp-propulsion-panel">
                <section className="ksp-panel liftoff-parameters-panel" data-testid="liftoff-parameters-panel">
                  <div className="ksp-panel-header">
                    <h3>
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <path d="M7 16v-3m5 3V8m5 8v-5" />
                      </svg>
                      <span>{t('Flight Parameters', 'Flight Parameters')}</span>
                    </h3>
                  </div>
                  <dl className="liftoff-ascent-metrics">
                    <div>
                      <dt>{t('Altitude', 'Altitude')}</dt>
                      <dd>{(state.orbit.altitudeM / 1000).toFixed(2)} km</dd>
                    </div>
                    <div>
                      <dt>{t('Orbital Speed', 'Orbital Speed')}</dt>
                      <dd>{state.orbit.orbitalSpeedMs.toFixed(0)} m/s</dd>
                    </div>
                    {apsides.map(({ label, name, value, explanation }) => {
                      const readout = `${formatSignedKm(value)} km`;
                      return (
                        <div key={label} className={`liftoff-apsis-metric${value < 0 ? ' is-below-surface' : ''}`}>
                          <dt><span className="liftoff-apsis-tag">{label}</span>{name}</dt>
                          <dd>
                            {isFirstAscent
                              ? <LiftoffReadoutTooltip explanation={explanation}>{readout}</LiftoffReadoutTooltip>
                              : readout}
                          </dd>
                        </div>
                      );
                    })}
                    <div>
                      <dt>{t('TWR', 'TWR')}</dt>
                      <dd>{state.twr.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>{t('G-Load', 'G-Load')}</dt>
                      <dd>{state.gLoad.toFixed(1)} G</dd>
                    </div>
                  </dl>
                </section>
                <div className="ksp-panel">
                  <div className="ksp-panel-header">
                    <h3>
                      <Flame size={16} color="var(--lime)" />
                      <span>{t('Multi-Stage Propulsion & Staging', 'Multi-Stage Propulsion & Staging')}</span>
                    </h3>
                  </div>

                  <div className="ksp-propulsion-body">
                    {/* Propellant stage stack */}
                    <div className="ksp-stage-stack">
                      {[...state.stages].reverse().map((st) => {
                        const idx = st.stageNumber - 1;
                        const isActive = idx === state.activeStageIndex;
                        const pct =
                          st.maxFuelMassKg > 0 ? (st.fuelMassKg / st.maxFuelMassKg) * 100 : 0;
                        return (
                          <div
                            key={st.code}
                            className={`ksp-stage-card ${
                              isActive ? 'active-stage' : st.separated ? 'separated-stage' : ''
                            }`}
                          >
                            <div className="stage-card-top">
                              <strong>
                                {t('Stage {0}', 'Stage {0}', { 0: st.stageNumber })} · {st.code}
                              </strong>
                              <span
                                className={`stage-badge ${
                                  st.separated
                                    ? ''
                                    : isActive && pct <= 0.1
                                    ? 'meco'
                                    : isActive
                                    ? 'burning'
                                    : ''
                                }`}
                              >
                                {st.separated
                                  ? t('SEPARATED', 'SEPARATED')
                                  : isActive && pct <= 0.1
                                  ? t('MECO · PRESS SPACE!', 'MECO · PRESS SPACE!')
                                  : isActive
                                  ? t('ACTIVE', 'ACTIVE')
                                  : t('STANDBY', 'STANDBY')}
                              </span>
                            </div>
                            <div className="stage-fuel-track">
                              <div className="stage-fuel-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="stage-card-meta">
                              <span>
                                {t('Fuel:', 'Fuel:')} {(st.fuelMassKg / 1000).toFixed(1)}t /{' '}
                                {(st.maxFuelMassKg / 1000).toFixed(0)}t
                              </span>
                              <span>{(st.dryMassKg / 1000).toFixed(1)}t</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Throttle and stage controls */}
                    <div className="ksp-throttle-col">
                      <div className="throttle-box">
                        <div className="throttle-header">
                          <span>
                            <Gauge size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                            {t('Throttle', 'Throttle')}
                          </span>
                          <strong>{(state.throttle * 100).toFixed(0)}%</strong>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(state.throttle * 100)}
                          onChange={(e) => handleSetThrottle(Number(e.target.value) / 100)}
                          className="throttle-slider"
                          aria-label={t('Throttle slider', 'Throttle slider')}
                        />
                        <div className="throttle-quick-btns">
                          <button type="button" onClick={() => handleSetThrottle(0.0)}>
                            🛑 {t('Cut [X]', 'Cut [X]')}
                          </button>
                          <button type="button" onClick={() => handleSetThrottle(1.0)}>
                            🔥 {t('100% [Z]', '100% [Z]')}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`ksp-stage-trigger-btn ${
                          isMecoReady || isPadLaunchReady ? 'ready-highlight' : ''
                        }`}
                        onClick={handleTriggerStage}
                      >
                        <Zap size={16} />
                        <span>
                          {!state.clampsReleased
                            ? t('STAGE · RELEASE CLAMPS [Space]', 'STAGE · RELEASE CLAMPS [Space]')
                            : t('STAGE · SEPARATION [Space]', 'STAGE · SEPARATION [Space]')}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="ksp-les-btn"
                        disabled={state.towerJettisoned || !state.clampsReleased}
                        onClick={handleJettisonTower}
                      >
                        <Layers3 size={14} />
                        <span>
                          {state.towerJettisoned
                            ? t('LES Jettisoned (-4.0t)', 'LES Jettisoned (-4.0t)')
                            : t('Jettison LES Tower [J]', 'Jettison LES Tower [J]')}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: KSP Navball & Attitude Controls */}
                <KspNavball
                  state={state}
                  vehicle={vehicle}
                  language={language}
                  onSetSas={handleSetSas}
                  onSteerPitch={handleSteerPitch}
                />
              </div>
      </main>

      {/* Modal 1: Mission Briefing & Physics Guide */}
      {modalType === 'brief' && (
        <Modal
          title={t('Ascent Mission Briefing', 'Ascent Mission Briefing')}
          onClose={closeModal}
          className="liftoff-briefing"
        >
          <div className="liftoff-briefing-content">
            <h3 style={{ margin: 0 }}>
              {scenario.id === 4 ? '★' : `0${scenario.id}`} · {loc(language, scenario.title)}
            </h3>
            <div className="intro-card">
              <strong>{t('OBJECTIVE', 'OBJECTIVE')}</strong>
              <p>{loc(language, scenario.objective)}</p>
            </div>

            <div className="intro-card">
              <strong>{t('PASS CRITERIA', 'PASS CRITERIA')}</strong>
              <p>{loc(language, scenario.passCriteria)}</p>
            </div>

            <div className="intro-card">
              <strong>{t('CONTROLS & HOW-TO', 'CONTROLS & HOW-TO')}</strong>
              <p>{loc(language, scenario.hint)}</p>
              <div className="liftoff-key-legend-title">
                {t('KSP-Style Liftoff Keyboard Controls', 'KSP-Style Liftoff Keyboard Controls')}
              </div>
              <div className="liftoff-key-legend">
                <div className="liftoff-key-item">
                  <kbd>Space</kbd>
                  <span>
                    {t(
                      'Release Launch Clamps / Trigger Stage Separation',
                      'Release Launch Clamps / Trigger Stage Separation'
                    )}
                  </span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>Z / X</kbd>
                  <span>{t('Full Throttle / Cut Engine', 'Full Throttle / Cut Engine')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>W / S</kbd>
                  <span>{t('Throttle Up / Down', 'Throttle Up / Down')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>A / D</kbd>
                  <span>{t('Pitch Up / Pitch East', 'Pitch Up / Pitch East')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>R</kbd>
                  <span>{t('Reset mission', 'Reset mission')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>J</kbd>
                  <span>{t('Jettison Escape Tower', 'Jettison Escape Tower')}</span>
                </div>
              </div>
            </div>

            <div className="zero-science-box">
              <div className="zero-science-title">
                <Sparkles size={15} />
                <span>{loc(language, scenario.scienceTerm.term)}</span>
              </div>
              <p className="zero-science-body">{loc(language, scenario.scienceTerm.explanation)}</p>
            </div>

            <div className="intro-card">
              <strong>{t('🕹️ Flight Instructor Tips', '🕹️ Flight Instructor Tips')}</strong>
              <p>{loc(language, scenario.lesson)}</p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModalType('glossary')}
              >
                <BookOpen size={15} />
                <span>{t('Open Rocket Glossary', 'Open Rocket Glossary')}</span>
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => startFlight(false)}
              >
                <Rocket size={15} />
                <span>{t('Launch Now', 'Launch Now')}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal 2: Flight Debrief Report */}
      {modalType === 'review' && (
        <Modal
          title={
            state.status === 'success'
              ? t('🎉 Ascent Mission Accomplished!', '🎉 Ascent Mission Accomplished!')
              : t('📋 Ascent Flight Debrief', '📋 Ascent Flight Debrief')
          }
          onClose={() => setModalType('none')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state.status === 'success' ? (
              <div className="intro-card" style={{ borderColor: 'rgba(184, 245, 102, 0.45)' }}>
                <strong style={{ color: 'var(--lime)' }}>
                  {demo
                    ? t('✨ Autopilot demo complete! Now try flying it yourself!', '✨ Autopilot demo complete! Now try flying it yourself!')
                    : t('🏆 Outstanding! You mastered the rocket physics of this stage!', '🏆 Outstanding! You mastered the rocket physics of this stage!')}
                </strong>
                <p>{loc(language, scenario.lesson)}</p>
              </div>
            ) : (
              <div className="intro-card" style={{ borderColor: 'rgba(255, 92, 92, 0.45)' }}>
                <strong style={{ color: '#ff7b7b' }}>
                  {explainLiftoffFailure(state.reason, t).title}
                </strong>
                <p>{explainLiftoffFailure(state.reason, t).detail}</p>
                <p style={{ marginTop: 6, color: 'var(--lime)' }}>
                  {explainLiftoffFailure(state.reason, t).tip}
                </p>
              </div>
            )}

            {!isFirstAscent && (
              <div className="zero-specs-grid">
                <div className="zero-spec-cell">
                  <span className="zero-spec-label">{t('ALTITUDE / APOAPSIS', 'ALTITUDE / APOAPSIS')}</span>
                  <span className="zero-spec-val">
                    {(state.orbit.altitudeM / 1000).toFixed(1)} km / Ap {(state.orbit.apoapsisM / 1000).toFixed(1)} km
                  </span>
                </div>
                <div className="zero-spec-cell">
                  <span className="zero-spec-label">{t('PERIAPSIS / ORBIT SPEED', 'PERIAPSIS / ORBIT SPEED')}</span>
                  <span className="zero-spec-val">
                    Pe {(state.orbit.periapsisM / 1000).toFixed(1)} km / {state.orbit.orbitalSpeedMs.toFixed(0)} m/s
                  </span>
                </div>
                <div className="zero-spec-cell">
                  <span className="zero-spec-label">{t('PEAK MAX-Q EXPERIENCED', 'PEAK MAX-Q EXPERIENCED')}</span>
                  <span className="zero-spec-val">
                    {(state.maxQRecordedPa / 1000).toFixed(1)} kPa
                  </span>
                </div>
                <div className="zero-spec-cell">
                  <span className="zero-spec-label">{t('ACTIVE STAGE / G-LOAD', 'ACTIVE STAGE / G-LOAD')}</span>
                  <span className="zero-spec-val">
                    {t('Stage {0}', 'Stage {0}', { 0: state.activeStageIndex + 1 })} · {state.gLoad.toFixed(2)} G
                  </span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => startFlight(false)}
              >
                <RotateCcw size={15} />
                <span>{t('Fly Again', 'Fly Again')}</span>
              </button>

              {state.status === 'success' && scenario.id < 4 && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => selectLevel(scenario.id + 1)}
                >
                  <span>
                    {scenario.id === 3
                      ? t('Full Launch', 'Full Launch')
                      : t('Next: Mission 0{0}', 'Next: Mission 0{0}', { 0: scenario.id + 1 })}
                  </span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal 3: Rocket Science Glossary */}
      {modalType === 'glossary' && (
        <Modal
          title={t('📖 Teen Rocket Science Glossary', '📖 Teen Rocket Science Glossary')}
          onClose={returnToBriefing}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {LIFTOFF_GLOSSARY.map((item) => (
              <div key={item.id} className="intro-card">
                <strong style={{ color: 'var(--lime)' }}>{loc(language, item.term)}</strong>
                <small style={{ display: 'block', color: '#9cb0a4', marginBottom: 4 }}>
                  {loc(language, item.shortDesc)}
                </small>
                <p style={{ margin: 0 }}>{loc(language, item.teenExplanation)}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
