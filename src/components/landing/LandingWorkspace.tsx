import { loc, makeT } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  Eye,
  Flame,
  Layers,
  MapPin,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target
} from 'lucide-react';
import { FixedStepper } from '../../sim/engine';
import {
  createLandingState,
  emptyLandingCommand,
  getLandingScenario,
  LANDING_DT,
  LANDING_GLOSSARY,
  LANDING_SCENARIOS,
  landingAutopilot,
  RETRO_WINDOW_M,
  sampleLanding,
  stepLanding,
  type LandingCommand,
  type LandingSample,
  type LandingState
} from '../../sim/landing';
import {
  chuteDeployTone,
  impactTone,
  lockTone,
  retroIgniteTone,
  tone,
  useSession
} from '../../store';
import { formatTime } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { LandingScene3D, type LandingCameraPreset } from './LandingScene3D';
import { LandingTelemetryChart } from './LandingTelemetryChart';
import '../liftoff/liftoff.css';

type LandingWarp = 1 | 2 | 4 | 16 | 32;

export interface LandingWorkspaceProps {
  initialActiveLevel?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onActiveLevelChange?: (level: number) => void;
}

function getLandingGuidance(
  scenarioId: number,
  state: LandingState,
  t: (zh: string, en: string, vars?: Record<string, string | number>) => string
): string {
  if (state.status === 'ready') {
    return t(
      'Press [Start Descent] or [Space] to begin atmospheric reentry.',
      'Press [Start Descent] or [Space] to begin atmospheric reentry.'
    );
  }
  if (state.status === 'success') {
    return t(
      '✨ Safe Recovery Achieved! Review telemetry or advance to the next mission.',
      '✨ Safe Recovery Achieved! Review telemetry or advance to the next mission.'
    );
  }
  if (state.status === 'failed') {
    return t(
      '⚠️ Recovery aborted. Press [R] or click Retry Mission to fly again.',
      '⚠️ Recovery aborted. Press [R] or click Retry Mission to fly again.'
    );
  }

  if (state.inBlackout || (scenarioId === 1 && state.altitudeM > 36000)) {
    if (Math.abs(state.attitudeDeviationDeg) > 4.5) {
      return t(
        '🔥 Blackout Warning! Deviation {0}° — tap [A]/[D] or enable [T] SAS to center heat shield!',
        '🔥 Blackout Warning! Deviation {0}° — tap [A]/[D] or enable [T] SAS to center heat shield!',
        { 0: state.attitudeDeviationDeg.toFixed(1) }
      );
    }
    if (state.gLoad > 5.8) {
      return t(
        '⚠️ Peak G-Load {0} G! Hold [W] to increase aerodynamic lift and ease deceleration.',
        '⚠️ Peak G-Load {0} G! Hold [W] to increase aerodynamic lift and ease deceleration.',
        { 0: state.gLoad.toFixed(1) }
      );
    }
    return t(
      '☄️ In Plasma Blackout · Keep deviation ≤5° down to 36 km (now {0} km).',
      '☄️ In Plasma Blackout · Keep deviation ≤5° down to 36 km (now {0} km).',
      { 0: (state.altitudeM / 1000).toFixed(1) }
    );
  }

  if (state.chuteState === 'stowed') {
    if (state.speedMs <= 225 && state.altitudeM <= 14500) {
      return t(
        '✅ Subsonic Drogue Window! Press [Space] NOW to deploy drogue chutes!',
        '✅ Subsonic Drogue Window! Press [Space] NOW to deploy drogue chutes!'
      );
    }
    return t(
      '⏳ Braking through upper atmosphere · Wait until ≤225 m/s before deploying Drogue (now {0} m/s).',
      '⏳ Braking through upper atmosphere · Wait until ≤225 m/s before deploying Drogue (now {0} m/s).',
      { 0: state.speedMs.toFixed(0) }
    );
  }

  if (state.chuteState === 'drogue') {
    if (state.speedMs <= 95 && state.chuteProgress >= 0.7) {
      return t(
        '✅ Main Canopy Window! Press [Space] NOW to deploy triple 1200 m² Ring-Sail chutes!',
        '✅ Main Canopy Window! Press [Space] NOW to deploy triple 1200 m² Ring-Sail chutes!'
      );
    }
    return t(
      '🪂 Drogue chutes stabilizing capsule · Wait for ≤95 m/s to open Main Canopy (now {0} m/s).',
      '🪂 Drogue chutes stabilizing capsule · Wait for ≤95 m/s to open Main Canopy (now {0} m/s).',
      { 0: state.speedMs.toFixed(0) }
    );
  }

  if (!state.heatshieldJettisoned) {
    return t(
      '🛡️ Under Main Canopy! Press [J] NOW to drop the charred heat shield and arm 1.5 m retro-rockets!',
      '🛡️ Under Main Canopy! Press [J] NOW to drop the charred heat shield and arm 1.5 m retro-rockets!'
    );
  }

  if (!state.retroFired) {
    if (state.altitudeM <= RETRO_WINDOW_M.max && state.altitudeM >= RETRO_WINDOW_M.min) {
      return t(
        '🔥 ALT {0} m — 1.5 m RETRO WINDOW! PRESS [Space] NOW!',
        '🔥 ALT {0} m — 1.5 m RETRO WINDOW! PRESS [Space] NOW!',
        { 0: state.altitudeM.toFixed(1) }
      );
    }
    return t(
      '🎯 Shield jettisoned! Steer over target [A]/[D] and press [Space] at 1.0–2.5 m (now {0} m).',
      '🎯 Shield jettisoned! Steer over target [A]/[D] and press [Space] at 1.0–2.5 m (now {0} m).',
      { 0: state.altitudeM.toFixed(1) }
    );
  }

  return t(
    '🔥 Solid Retro-Rockets Firing! Bracing for soft touchdown...',
    '🔥 Solid Retro-Rockets Firing! Bracing for soft touchdown...'
  );
}

export function LandingWorkspace({
  initialActiveLevel = 1,
  onCloseMobile,
  onActiveLevelChange
}: LandingWorkspaceProps) {
  const language = useSession((s) => s.language);
  const completedIds = useSession((s) => s.landingCompleted);
  const t = makeT(language);

  const [activeLevel, setActiveLevel] = useState<number>(initialActiveLevel);
  const [scenarioId, setScenarioId] = useState<number>(() => Math.max(1, initialActiveLevel));
  const [viewTab, setViewTab] = useState<'sim' | 'objective'>('sim');
  const scenario = getLandingScenario(scenarioId);

  const [state, setState] = useState<LandingState>(() =>
    createLandingState(getLandingScenario(Math.max(1, initialActiveLevel)))
  );
  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState(false);
  const [timeWarp, setTimeWarp] = useState<LandingWarp>(1);
  const [sasEnabled, setSasEnabled] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<LandingCameraPreset>('chase');
  const [showGuidance, setShowGuidance] = useState(true);
  const [modalType, setModalType] = useState<'none' | 'glossary' | 'review'>('none');
  const [samples, setSamples] = useState<LandingSample[]>([]);
  const [minIntegrityPct, setMinIntegrityPct] = useState<number>(100);

  const runtimeRef = useRef({
    scenario: getLandingScenario(Math.max(1, initialActiveLevel)),
    state: createLandingState(getLandingScenario(Math.max(1, initialActiveLevel))),
    command: emptyLandingCommand(),
    heldKeys: new Set<string>(),
    running: false,
    demo: false,
    timeWarp: 1 as LandingWarp,
    autoCruiseEngaged: false,
    manualCruiseWarpOverride: false,
    samples: [] as LandingSample[],
    lastSampleTime: 0,
    minIntegrityPct: 100,
    stepper: new FixedStepper()
  });

  const pauseFlight = () => {
    runtimeRef.current.running = false;
    runtimeRef.current.heldKeys.clear();
    runtimeRef.current.command.attitudeInput = 0;
    runtimeRef.current.command.liftTrimInput = 0;
    setRunning(false);
  };

  const resumeFlight = () => {
    if (runtimeRef.current.state.status !== 'flying') return;
    runtimeRef.current.running = true;
    setRunning(true);
  };

  const loadScenario = (id: number) => {
    const cfg = getLandingScenario(id);
    const init = createLandingState(cfg);
    runtimeRef.current.scenario = cfg;
    runtimeRef.current.state = init;
    runtimeRef.current.command = emptyLandingCommand();
    runtimeRef.current.heldKeys.clear();
    runtimeRef.current.running = false;
    runtimeRef.current.demo = false;
    runtimeRef.current.timeWarp = 1;
    runtimeRef.current.autoCruiseEngaged = false;
    runtimeRef.current.manualCruiseWarpOverride = false;
    runtimeRef.current.samples = [sampleLanding(init)];
    runtimeRef.current.lastSampleTime = 0;
    runtimeRef.current.minIntegrityPct = init.heatshieldIntegrityPct;
    runtimeRef.current.stepper.reset();

    setScenarioId(id);
    setState(init);
    setSamples([sampleLanding(init)]);
    setMinIntegrityPct(init.heatshieldIntegrityPct);
    setRunning(false);
    setDemo(false);
    setTimeWarp(1);
    setSasEnabled(false);
    setCameraPreset('chase');
    setViewTab('sim');
    setModalType('none');
  };

  const selectLevel = (id: number) => {
    onCloseMobile?.();
    onActiveLevelChange?.(id);
    if (id === 0) {
      pauseFlight();
      setActiveLevel(0);
      setViewTab('sim');
      setModalType('none');
      return;
    }
    loadScenario(id);
    setActiveLevel(id);
  };

  const prevSyncedLevelRef = useRef(initialActiveLevel);
  useEffect(() => {
    if (prevSyncedLevelRef.current === initialActiveLevel) return;
    prevSyncedLevelRef.current = initialActiveLevel;
    selectLevel(initialActiveLevel);
  }, [initialActiveLevel]);

  const startFlight = (isDemo = false) => {
    tone(true);
    const cfg = runtimeRef.current.scenario;
    const init: LandingState = {
      ...createLandingState(cfg),
      status: 'flying'
    };
    const firstSample = sampleLanding(init);
    runtimeRef.current.state = init;
    runtimeRef.current.command = emptyLandingCommand();
    runtimeRef.current.command.sasEnabled = sasEnabled;
    runtimeRef.current.heldKeys.clear();
    runtimeRef.current.running = true;
    runtimeRef.current.demo = isDemo;
    runtimeRef.current.timeWarp = 1;
    runtimeRef.current.autoCruiseEngaged = false;
    runtimeRef.current.manualCruiseWarpOverride = false;
    runtimeRef.current.samples = [firstSample];
    runtimeRef.current.lastSampleTime = 0;
    runtimeRef.current.minIntegrityPct = init.heatshieldIntegrityPct;
    runtimeRef.current.stepper.reset();

    setState(init);
    setSamples([firstSample]);
    setMinIntegrityPct(init.heatshieldIntegrityPct);
    setRunning(true);
    setDemo(isDemo);
    setTimeWarp(1);
    setModalType('none');
  };

  const ensureFlying = () => {
    const rt = runtimeRef.current;
    if (rt.running) return true;
    if (rt.state.status === 'flying') {
      resumeFlight();
      return false;
    }
    startFlight(false);
    return true;
  };

  const handleTriggerAction = () => {
    if (ensureFlying()) {
      runtimeRef.current.command.triggerAction = true;
    }
  };

  const handleJettisonShield = () => {
    if (ensureFlying()) {
      runtimeRef.current.command.jettisonHeatshield = true;
    }
  };

  const holdControl = (field: 'attitudeInput' | 'liftTrimInput', value: number) => ({
    style: { touchAction: 'none', userSelect: 'none' } as const,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onPointerDown: () => {
      ensureFlying();
      runtimeRef.current.command[field] = value;
    },
    onPointerUp: () => {
      runtimeRef.current.command[field] = 0;
    },
    onPointerLeave: () => {
      runtimeRef.current.command[field] = 0;
    },
    onPointerCancel: () => {
      runtimeRef.current.command[field] = 0;
    }
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let publish = 0;

    const loop = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const rt = runtimeRef.current;

      if (rt.running && rt.state.status === 'flying') {
        if (!rt.demo && rt.heldKeys.size > 0) {
          let att = 0;
          let lift = 0;
          if (rt.heldKeys.has('KeyA') || rt.heldKeys.has('ArrowLeft')) att -= 1;
          if (rt.heldKeys.has('KeyD') || rt.heldKeys.has('ArrowRight')) att += 1;
          if (rt.heldKeys.has('KeyW') || rt.heldKeys.has('ArrowUp')) lift += 1;
          if (rt.heldKeys.has('KeyS') || rt.heldKeys.has('ArrowDown')) lift -= 1;
          rt.command.attitudeInput = att;
          rt.command.liftTrimInput = lift;
        }

        const altBefore = rt.state.altitudeM;
        const steadyMainCruise =
          rt.state.chuteState === 'main' &&
          rt.state.chuteProgress >= 0.99 &&
          rt.state.speedMs <= 9.0 &&
          rt.state.heatshieldJettisoned &&
          rt.state.heatshieldSepElapsedS >= 1.8 &&
          altBefore > 240;

        if (steadyMainCruise && !rt.manualCruiseWarpOverride && !rt.autoCruiseEngaged) {
          rt.autoCruiseEngaged = true;
          rt.timeWarp = 32;
          setTimeWarp(32);
        } else if (
          rt.autoCruiseEngaged &&
          altBefore <= 240 &&
          altBefore > 120 &&
          rt.timeWarp > 4
        ) {
          rt.timeWarp = 4;
          setTimeWarp(4);
        } else if (rt.autoCruiseEngaged && altBefore <= 120 && rt.timeWarp !== 1) {
          rt.autoCruiseEngaged = false;
          rt.timeWarp = 1;
          setTimeWarp(1);
        }

        const finalApproach = altBefore < 85;
        rt.stepper.advance(dtReal, () => {
          const steps = finalApproach ? 1 : rt.timeWarp;
          for (let w = 0; w < steps; w++) {
            if (rt.state.status !== 'flying') break;
            const activeCmd: LandingCommand = rt.demo ? landingAutopilot(rt.state) : rt.command;

            const prevChute = rt.state.chuteState;
            const prevShield = rt.state.heatshieldJettisoned;
            const prevRetro = rt.state.retroFired;

            rt.state = stepLanding(rt.state, activeCmd, rt.scenario, LANDING_DT);
            rt.command.triggerAction = false;
            rt.command.jettisonHeatshield = false;

            rt.minIntegrityPct = Math.min(rt.minIntegrityPct, rt.state.heatshieldIntegrityPct);

            if (prevChute === 'stowed' && rt.state.chuteState === 'drogue') {
              chuteDeployTone(false);
            } else if (prevChute === 'drogue' && rt.state.chuteState === 'main') {
              chuteDeployTone(true);
            }
            if (!prevShield && rt.state.heatshieldJettisoned) {
              lockTone();
            }
            if (!prevRetro && rt.state.retroFired) {
              retroIgniteTone();
            }

            const sampleInterval =
              rt.state.chuteState === 'main' &&
              rt.state.speedMs <= 9.0 &&
              rt.state.altitudeM >= 250 &&
              rt.state.time > 180
                ? 2.5
                : 0.45;
            if (rt.state.time - rt.lastSampleTime >= sampleInterval) {
              rt.samples.push(sampleLanding(rt.state));
              rt.lastSampleTime = rt.state.time;
            }

            if (rt.state.status === 'success' || rt.state.status === 'failed') {
              rt.running = false;
              rt.samples.push(sampleLanding(rt.state));
              setRunning(false);
              setSamples([...rt.samples]);
              setMinIntegrityPct(rt.minIntegrityPct);

              if (rt.state.status === 'success') {
                tone(true);
                if (!rt.demo) {
                  useSession.getState().markLandingComplete(rt.scenario.id);
                }
              } else if (
                rt.state.failReason === 'hard_impact' ||
                rt.state.failReason === 'heatshield_burnthrough' ||
                rt.state.failReason === 'chute_too_late'
              ) {
                impactTone();
              } else {
                tone(false);
              }

              setState({ ...rt.state });
              setModalType('review');
              break;
            }

            if (rt.autoCruiseEngaged && rt.state.altitudeM <= 240 && rt.timeWarp > 4) break;
            if (rt.autoCruiseEngaged && rt.state.altitudeM <= 120 && rt.timeWarp !== 1) break;
            if (rt.state.altitudeM < 85 && steps > 1) break;
          }
        });

        if (now - publish > (finalApproach ? 30 : 75)) {
          setState({ ...rt.state });
          publish = now;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,select,textarea')) return;

      const rt = runtimeRef.current;
      if (e.repeat && ['Space', 'KeyJ', 'Digit1', 'KeyT', 'KeyR'].includes(e.code)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyR') {
        e.preventDefault();
        startFlight(false);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerAction();
        return;
      }
      if (e.code === 'KeyJ' || e.code === 'Digit1' || e.key === '1') {
        e.preventDefault();
        handleJettisonShield();
        return;
      }
      if (e.code === 'KeyT') {
        e.preventDefault();
        const nextSas = !rt.command.sasEnabled;
        rt.command.sasEnabled = nextSas;
        setSasEnabled(nextSas);
        return;
      }
      if (
        ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
          e.code
        )
      ) {
        e.preventDefault();
        rt.heldKeys.add(e.code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const rt = runtimeRef.current;
      if (rt.heldKeys.has(e.code)) {
        rt.heldKeys.delete(e.code);
        rt.command.attitudeInput = 0;
        rt.command.liftTrimInput = 0;
      }
    };

    const onBlur = () => {
      const rt = runtimeRef.current;
      rt.heldKeys.clear();
      rt.command.attitudeInput = 0;
      rt.command.liftTrimInput = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [activeLevel]);

  const actionButtonLabel = () => {
    if (state.chuteState === 'stowed') {
      return state.speedMs <= 235 && state.altitudeM <= 14500
        ? t('🪂 [Space] Deploy Drogue Chute NOW!', '🪂 [Space] Deploy Drogue Chute NOW!')
        : t('⏳ [Space] Drogue Chute (Wait ≤235 m/s)', '⏳ [Space] Drogue Chute (Wait ≤235 m/s)');
    }
    if (state.chuteState === 'drogue') {
      return state.speedMs <= 105
        ? t('🪂 [Space] Deploy 1200 m² Main Chute NOW!', '🪂 [Space] Deploy 1200 m² Main Chute NOW!')
        : t('⏳ [Space] Main Chute (Wait ≤105 m/s)', '⏳ [Space] Main Chute (Wait ≤105 m/s)');
    }
    if (!state.retroFired) {
      return state.heatshieldJettisoned &&
        state.altitudeM <= RETRO_WINDOW_M.max &&
        state.altitudeM >= RETRO_WINDOW_M.min
        ? t('🔥 [Space] 1.5 m Window: FIRE RETROS NOW!', '🔥 [Space] 1.5 m Window: FIRE RETROS NOW!')
        : t('🔥 [Space] Fire Retro-Rockets (At 1.0–2.5 m)', '🔥 [Space] Fire Retro-Rockets (At 1.0–2.5 m)');
    }
    return t('✅ Retro-Rockets Fired', '✅ Retro-Rockets Fired');
  };

  const failLabel = (reason?: string) => {
    switch (reason) {
      case 'heatshield_burnthrough':
        return t('⚠️ Heat Shield Burn-Through! Excessive attitude deviation exposed the thin side hull to 2000°C plasma!', '⚠️ Heat Shield Burn-Through! Excessive attitude deviation exposed the thin side hull to 2000°C plasma!');
      case 'excessive_g_load':
        return t('⚠️ Excessive Reentry G-Load (> 8.5 G)! Increase aerodynamic lift trim with [W].', '⚠️ Excessive Reentry G-Load (> 8.5 G)! Increase aerodynamic lift trim with [W].');
      case 'chute_shred':
        return t('⚠️ Parachute Shredded! Deployed at excessive airspeed. Wait for the safe subsonic window!', '⚠️ Parachute Shredded! Deployed at excessive airspeed. Wait for the safe subsonic window!');
      case 'chute_too_late':
        return t('⚠️ Parachute Deployed Too Late! Failed to open main chute before low altitude.', '⚠️ Parachute Deployed Too Late! Failed to open main chute before low altitude.');
      case 'retro_early':
        return t('⚠️ Retro-Rockets Fired Too High! Solid rockets burned out in mid-air above 4 m!', '⚠️ Retro-Rockets Fired Too High! Solid rockets burned out in mid-air above 4 m!');
      case 'hard_impact':
        return t('⚠️ Hard Impact (> 2.4 m/s)! Remember to drop the heat shield [J] and fire retro-rockets [Space] at 1.0–2.5 m!', '⚠️ Hard Impact (> 2.4 m/s)! Remember to drop the heat shield [J] and fire retro-rockets [Space] at 1.0–2.5 m!');
      default:
        return t('⚠️ Mission timed out.', '⚠️ Mission timed out.');
    }
  };

  const failTip = (reason?: string) => {
    switch (reason) {
      case 'heatshield_burnthrough':
        return t('Use [A]/[D] or press [T] for SAS Trim Assist to keep heat-shield deviation inside ±5° during blackout.', 'Use [A]/[D] or press [T] for SAS Trim Assist to keep heat-shield deviation inside ±5° during blackout.');
      case 'excessive_g_load':
        return t('Hold [W] (or Lift + button) above 25 km to raise aerodynamic lift and soften peak deceleration.', 'Hold [W] (or Lift + button) above 25 km to raise aerodynamic lift and soften peak deceleration.');
      case 'chute_shred':
        return t('Wait until airspeed drops to ≤225 m/s before triggering Drogue, and ≤95 m/s before Main Canopy.', 'Wait until airspeed drops to ≤225 m/s before triggering Drogue, and ≤95 m/s before Main Canopy.');
      case 'chute_too_late':
        return t('Deploy the Main Canopy immediately once speed drops below 95 m/s above 2.5 km altitude.', 'Deploy the Main Canopy immediately once speed drops below 95 m/s above 2.5 km altitude.');
      case 'retro_early':
        return t('First drop the heat shield [J], then wait for the hovering green gate ring at 1.0–2.5 m before pressing [Space].', 'First drop the heat shield [J], then wait for the hovering green gate ring at 1.0–2.5 m before pressing [Space].');
      case 'hard_impact':
        return t('Always press [J] under the main canopy to jettison the heat shield, then trigger [Space] inside 1.0–2.5 m.', 'Always press [J] under the main canopy to jettison the heat shield, then trigger [Space] inside 1.0–2.5 m.');
      default:
        return t('Click [Watch Demo] to observe the complete reentry and landing timeline.', 'Click [Watch Demo] to observe the complete reentry and landing timeline.');
    }
  };

  const sequenceSteps = [
    {
      id: 'blackout',
      label: t('Blackout', 'Blackout'),
      done: !state.inBlackout && state.altitudeM < 36000,
      active: state.inBlackout || state.altitudeM >= 36000
    },
    {
      id: 'drogue',
      label: t('Drogue', 'Drogue'),
      done: state.chuteState === 'drogue' || state.chuteState === 'main',
      active: state.altitudeM < 36000 && state.chuteState === 'stowed'
    },
    {
      id: 'main',
      label: t('Main Chute', 'Main Chute'),
      done: state.chuteState === 'main',
      active: state.chuteState === 'drogue'
    },
    {
      id: 'shield',
      label: t('Shield Drop', 'Shield Drop'),
      done: state.heatshieldJettisoned,
      active: state.chuteState === 'main' && !state.heatshieldJettisoned
    },
    {
      id: 'retro',
      label: t('1.5m Retro', '1.5m Retro'),
      done: state.retroFired,
      active: state.heatshieldJettisoned && !state.retroFired
    }
  ];

  const isInRetroGate =
    state.heatshieldJettisoned &&
    !state.retroFired &&
    state.altitudeM <= RETRO_WINDOW_M.max &&
    state.altitudeM >= RETRO_WINDOW_M.min;

  return (
    <div className="liftoff-shell liftoff-no-sidebar">
      <main className="liftoff-main">
        <header className="liftoff-stage-header">
              <h1 className="liftoff-stage-title">
                <span className="title-number">0{scenario.id}</span>
                {loc(language, scenario.title)}
              </h1>

              <div className="liftoff-view-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'sim'}
                  className={`liftoff-view-tab ${viewTab === 'sim' ? 'active' : ''}`}
                  onClick={() => setViewTab('sim')}
                >
                  {t('3D Scene', '3D Scene')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'objective'}
                  className={`liftoff-view-tab ${viewTab === 'objective' ? 'active' : ''}`}
                  onClick={() => setViewTab('objective')}
                >
                  {t('Objective & Controls', 'Objective & Controls')}
                </button>
              </div>
            </header>

            {viewTab === 'objective' ? (
              <section className="liftoff-objective-panel">
                <div className="liftoff-objective-grid">
                  <article className="liftoff-objective-card">
                    <div className="liftoff-objective-badge">
                      <Target size={15} />
                      <span>{t('OBJECTIVE', 'OBJECTIVE')}</span>
                    </div>
                    <p className="liftoff-objective-lead">{loc(language, scenario.subtitle)}</p>
                    <p>{loc(language, scenario.brief)}</p>
                    <p className="liftoff-objective-focus">{loc(language, scenario.objective)}</p>
                  </article>

                  <article className="liftoff-objective-card">
                    <h3>{t('PASS CRITERIA', 'PASS CRITERIA')}</h3>
                    <p className="liftoff-objective-criteria">{loc(language, scenario.passCriteria)}</p>

                    <div className="liftoff-objective-science">
                      <div className="liftoff-objective-badge is-science">
                        <Sparkles size={14} />
                        <span>{t('FLIGHT PRINCIPLE', 'FLIGHT PRINCIPLE')}</span>
                      </div>
                      <p className="liftoff-science-term">
                        {t('💡 Core Science Concept: ', '💡 Core Science Concept: ')}
                        <strong>{loc(language, scenario.scienceTerm.term)}</strong>
                      </p>
                      <p>{loc(language, scenario.scienceTerm.explanation)}</p>
                    </div>
                  </article>

                  <article className="liftoff-objective-card is-wide">
                    <h3>{t('CONTROLS & HOW-TO', 'CONTROLS & HOW-TO')}</h3>
                    <p>{loc(language, scenario.hint)}</p>

                    <div className="liftoff-key-legend">
                      <div className="liftoff-key-item">
                        <kbd>Space</kbd>
                        <span>{t('Deploy Drogue / Main Chute / Fire 1.5 m Retros', 'Deploy Drogue / Main Chute / Fire 1.5 m Retros')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>A / D · ← / →</kbd>
                        <span>{t('Heat Shield Attitude Trim / Crosswind Steer', 'Heat Shield Attitude Trim / Crosswind Steer')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>W / S · ↑ / ↓</kbd>
                        <span>{t('Aerodynamic Lift Trim (Reduce Peak G-Load)', 'Aerodynamic Lift Trim (Reduce Peak G-Load)')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>J / 1</kbd>
                        <span>{t('Jettison Charred Heat Shield', 'Jettison Charred Heat Shield')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>T</kbd>
                        <span>{t('Toggle SAS Trim Assist', 'Toggle SAS Trim Assist')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>R</kbd>
                        <span>{t('Quick Restart Mission', 'Quick Restart Mission')}</span>
                      </div>
                    </div>

                    <div className="liftoff-objective-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setViewTab('sim')}
                      >
                        {t('3D Scene', '3D Scene')}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setModalType('glossary')}
                      >
                        <BookOpen size={15} />
                        <span>{t('Reentry & Landing Glossary', 'Reentry & Landing Glossary')}</span>
                      </button>
                    </div>
                  </article>
                </div>
              </section>
            ) : (
              <div className="mission-view liftoff-mission-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <section
                  className="simulator"
                  aria-label={t('Capsule Landing Simulator', 'Capsule Landing Simulator')}
                  style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                >
                  <div className="scene-toolbar">
                    <div className="view-switch">
                      {(['chase', 'chute', 'pad'] as const).map((preset, idx) => (
                        <button
                          key={preset}
                          type="button"
                          className={cameraPreset === preset ? 'active' : ''}
                          onClick={() => setCameraPreset(preset)}
                        >
                          {[<Orbit size={14} key="c" />, <Eye size={14} key="h" />, <Crosshair size={14} key="p" />][idx]}
                          <span>
                            {[
                              t('Capsule Chase', 'Capsule Chase'),
                              t('Canopy Wide', 'Canopy Wide'),
                              t('Recovery Pad', 'Recovery Pad')
                            ][idx]}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="scene-tools">
                      <button
                        type="button"
                        className={sasEnabled ? 'enabled' : ''}
                        onClick={() => {
                          const next = !sasEnabled;
                          runtimeRef.current.command.sasEnabled = next;
                          setSasEnabled(next);
                        }}
                      >
                        <span>
                          {sasEnabled
                            ? t('SAS: ON [T]', 'SAS: ON [T]')
                            : t('SAS: OFF [T]', 'SAS: OFF [T]')}
                        </span>
                      </button>

                      <div className="time-warp-group">
                        <span className="time-warp-label">{t('Warp', 'Warp')}</span>
                        {([1, 2, 4, 16, 32] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            className={`time-warp-btn ${timeWarp === w ? 'active' : ''}`}
                            onClick={() => {
                              const rt = runtimeRef.current;
                              rt.timeWarp = w;
                              if (
                                rt.state.chuteState === 'main' &&
                                rt.state.heatshieldJettisoned
                              ) {
                                rt.manualCruiseWarpOverride = true;
                                rt.autoCruiseEngaged = false;
                              }
                              setTimeWarp(w);
                            }}
                          >
                            {w}×
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        className={`hatch-btn ${state.heatshieldJettisoned ? 'enabled' : ''}`}
                        onClick={handleJettisonShield}
                      >
                        <span>
                          {state.heatshieldJettisoned
                            ? t('Heat Shield: DROPPED [J]', 'Heat Shield: DROPPED [J]')
                            : t('Heat Shield: ATTACHED [J]', 'Heat Shield: ATTACHED [J]')}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={showGuidance ? 'enabled' : ''}
                        onClick={() => setShowGuidance((v) => !v)}
                      >
                        <span>{t('Guide', 'Guide')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Flight sequence step strip */}
                  <div className="landing-sequence-bar">
                    {sequenceSteps.map((step, idx) => (
                      <div
                        key={step.id}
                        className={`landing-seq-step ${step.done ? 'done' : step.active ? 'active' : ''}`}
                      >
                        <span className="seq-index">{idx + 1}</span>
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="scene-container">
                    <LandingScene3D
                      state={state}
                      command={runtimeRef.current.command}
                      scenarioId={scenario.id}
                      cameraPreset={cameraPreset}
                      language={language}
                      running={running}
                    />

                    <div className="scene-top-left">
                      <span className="scene-tag">
                        {state.inBlackout
                          ? t('🔥 80–38km PLASMA RADIO BLACKOUT ZONE', '🔥 80–38km PLASMA RADIO BLACKOUT ZONE')
                          : isInRetroGate
                          ? t('🔥 1.0–2.5m RETRO GATE ACTIVE!', '🔥 1.0–2.5m RETRO GATE ACTIVE!')
                          : state.altitudeM > 1000
                          ? t('🪂 TROPOSPHERE PARACHUTE DESCENT', '🪂 TROPOSPHERE PARACHUTE DESCENT')
                          : t('🌾 TOUCHDOWN ZONE · 1.5m RETRO FINAL', '🌾 TOUCHDOWN ZONE · 1.5m RETRO FINAL')}
                      </span>
                      <span className="scene-subtag">
                        {t('Chute: {0} · Shield Integrity {1}%', 'Chute: {0} · Shield Integrity {1}%', {
                          0: state.chuteState.toUpperCase(),
                          1: state.heatshieldIntegrityPct.toFixed(0)
                        })}
                      </span>
                    </div>

                    <div className="scene-top-right">
                      <span className="mission-clock">T+ {formatTime(state.time)}</span>
                    </div>

                    {showGuidance && state.status === 'flying' && (
                      <div className={`landing-hud-guidance ${isInRetroGate ? 'is-urgent' : ''}`}>
                        {getLandingGuidance(scenario.id, state, t)}
                      </div>
                    )}
                  </div>

                  <div className="liftoff-cockpit-deck">
                    <div className="liftoff-telemetry-grid landing-telemetry-grid">
                      <div className="metric">
                        <span>{t('Altitude', 'Altitude')}</span>
                        <strong>
                          {state.altitudeM >= 1000
                            ? `${(state.altitudeM / 1000).toFixed(2)} km`
                            : `${state.altitudeM.toFixed(1)} m`}
                        </strong>
                        <small>
                          {state.altitudeM < 50
                            ? t('🎯 Fire Retro at 1.0–2.5 m!', '🎯 Fire Retro at 1.0–2.5 m!')
                            : t('Above Ground Altitude', 'Above Ground Altitude')}
                        </small>
                      </div>
                      <div className="metric">
                        <span>{t('Descent Speed', 'Descent Speed')}</span>
                        <strong>{state.speedMs.toFixed(1)} m/s</strong>
                        <small>{t('Vertical {0} m/s', 'Vertical {0} m/s', { 0: state.descentRateMs.toFixed(1) })}</small>
                      </div>
                      <div className="metric">
                        <span>{t('Shield Temp & Angle', 'Shield Temp & Angle')}</span>
                        <strong>
                          {Math.round(state.heatshieldTempC)}°C · {state.attitudeDeviationDeg.toFixed(1)}°
                        </strong>
                        <small>{t('Integrity {0}%', 'Integrity {0}%', { 0: state.heatshieldIntegrityPct.toFixed(0) })}</small>
                      </div>
                      <div className="metric">
                        <span>{t('G-Load', 'G-Load')}</span>
                        <strong>{state.gLoad.toFixed(1)} G</strong>
                        <small>{t('Peak {0} G', 'Peak {0} G', { 0: state.maxGRecorded.toFixed(1) })}</small>
                      </div>
                      <div className="metric">
                        <span>{t('Pad Offset', 'Pad Offset')}</span>
                        <strong>{state.lateralOffsetM.toFixed(1)} m</strong>
                        <small>{t('Lift Trim {0}', 'Lift Trim {0}', { 0: state.liftTrim.toFixed(2) })}</small>
                      </div>
                    </div>

                    <div className="liftoff-action-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {!running && state.status === 'ready' && (
                        <button type="button" className="primary-button" onClick={() => startFlight(false)}>
                          <Play size={15} />
                          <span>{t('Start Descent', 'Start Descent')}</span>
                        </button>
                      )}

                      {running && (
                        <button type="button" className="secondary-button" onClick={pauseFlight}>
                          <Pause size={15} />
                          <span>{t('Pause', 'Pause')}</span>
                        </button>
                      )}

                      {!running && state.status === 'flying' && (
                        <button type="button" className="primary-button" onClick={resumeFlight}>
                          <Play size={15} />
                          <span>{t('Resume', 'Resume')}</span>
                        </button>
                      )}

                      {!running && (state.status === 'failed' || state.status === 'success') && (
                        <button type="button" className="primary-button" onClick={() => startFlight(false)}>
                          <RotateCcw size={15} />
                          <span>{t('Retry (R)', 'Retry (R)')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="stage-fire-btn ready-pulse"
                        onClick={handleTriggerAction}
                      >
                        <span>{actionButtonLabel()}</span>
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleJettisonShield}
                        disabled={state.heatshieldJettisoned}
                      >
                        <span>
                          {state.heatshieldJettisoned
                            ? t('✅ Shield Jettisoned', '✅ Shield Jettisoned')
                            : t('🛡️ [J] Drop Heat Shield', '🛡️ [J] Drop Heat Shield')}
                        </span>
                      </button>

                      <button type="button" className="secondary-button" {...holdControl('attitudeInput', -1)}>
                        <span>{t('Tilt Left [A]', 'Tilt Left [A]')}</span>
                      </button>

                      <button type="button" className="secondary-button" {...holdControl('attitudeInput', 1)}>
                        <span>{t('Tilt Right [D]', 'Tilt Right [D]')}</span>
                      </button>

                      <button type="button" className="secondary-button" {...holdControl('liftTrimInput', 1)}>
                        <span>{t('Lift + [W]', 'Lift + [W]')}</span>
                      </button>

                      <button type="button" className="secondary-button" {...holdControl('liftTrimInput', -1)}>
                        <span>{t('Lift - [S]', 'Lift - [S]')}</span>
                      </button>

                      <button type="button" className="secondary-button" onClick={() => startFlight(true)}>
                        <span>{t('Watch Demo', 'Watch Demo')}</span>
                      </button>

                      <button type="button" className="secondary-button" onClick={() => loadScenario(scenario.id)}>
                        <RotateCcw size={15} />
                        <span>{t('Reset', 'Reset')}</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}
      </main>

      {modalType === 'glossary' && (
        <Modal
          title={t('Capsule Reentry & Landing Glossary', 'Capsule Reentry & Landing Glossary')}
          onClose={() => setModalType('none')}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {LANDING_GLOSSARY.map((item) => (
              <div
                key={item.id}
                className="modal-dark-card"
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(14, 22, 34, 0.94)',
                  border: '1px solid rgba(255, 184, 77, 0.25)'
                }}
              >
                <h4 style={{ margin: '0 0 6px', color: '#ffb84d' }}>{loc(language, item.term)}</h4>
                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 13, color: '#eef6f1' }}>
                  {loc(language, item.short)}
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: '#b8ccc2' }}>
                  {loc(language, item.detail)}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modalType === 'review' && (
        <Modal
          title={
            state.status === 'success'
              ? t('🎉 Welcome Home! Capsule Mission Complete!', '🎉 Welcome Home! Capsule Mission Complete!')
              : t('⚠️ Reentry & Landing Debrief', '⚠️ Reentry & Landing Debrief')
          }
          onClose={() => setModalType('none')}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {state.status === 'success' ? (
              <p style={{ color: '#166534', fontSize: 15, fontWeight: 600, margin: 0 }}>
                {state.touchdownSpeedMs !== undefined
                  ? t('Awesome! You completed [{0}] with a gentle touchdown speed of {1} m/s!', 'Awesome! You completed [{0}] with a gentle touchdown speed of {1} m/s!', {
                      0: loc(language, scenario.title),
                      1: state.touchdownSpeedMs
                    })
                  : t('Awesome! You completed [{0}]!', 'Awesome! You completed [{0}]!', {
                      0: loc(language, scenario.title)
                    })}
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  padding: 12,
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.4)'
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <ShieldAlert size={20} color="#f87171" />
                  <span style={{ fontSize: 13.5, lineHeight: 1.55 }}>{failLabel(state.failReason)}</span>
                </div>
                <p style={{ margin: '2px 0 0 30px', fontSize: 12.5, color: '#9a3412' }}>
                  {failTip(state.failReason)}
                </p>
              </div>
            )}

            <div className="debrief-metrics-grid">
              <div className={`debrief-metric-card ${state.maxGRecorded <= 8.5 ? 'is-pass' : 'is-fail'}`}>
                <div className="metric-header">
                  <span className="metric-title">{t('Peak G-Load', 'Peak G-Load')}</span>
                  <span className={`metric-badge ${state.maxGRecorded <= 8.5 ? 'badge-pass' : 'badge-fail'}`}>
                    {state.maxGRecorded <= 8.5 ? '✓ Nominal' : '✕ Exceeded'}
                  </span>
                </div>
                <div className="metric-values">
                  <strong className="metric-actual">{state.maxGRecorded.toFixed(1)} G</strong>
                  <small className="metric-target">{t('Target', 'Target')}: ≤ 8.5 G</small>
                </div>
              </div>

              <div className={`debrief-metric-card ${minIntegrityPct >= 70 ? 'is-pass' : 'is-fail'}`}>
                <div className="metric-header">
                  <span className="metric-title">{t('Shield Integrity', 'Shield Integrity')}</span>
                  <span className={`metric-badge ${minIntegrityPct >= 70 ? 'badge-pass' : 'badge-fail'}`}>
                    {minIntegrityPct >= 70 ? '✓ Nominal' : '✕ Damaged'}
                  </span>
                </div>
                <div className="metric-values">
                  <strong className="metric-actual">{minIntegrityPct.toFixed(0)}%</strong>
                  <small className="metric-target">{t('Target', 'Target')}: ≥ 70%</small>
                </div>
              </div>

              <div className={`debrief-metric-card ${state.status === 'success' ? 'is-pass' : 'is-fail'}`}>
                <div className="metric-header">
                  <span className="metric-title">{t('Descent Speed', 'Descent Speed')}</span>
                  <span className={`metric-badge ${state.status === 'success' ? 'badge-pass' : 'badge-fail'}`}>
                    {state.status === 'success' ? '✓ Safe' : '✕ Check'}
                  </span>
                </div>
                <div className="metric-values">
                  <strong className="metric-actual">
                    {(state.touchdownSpeedMs ?? state.descentRateMs).toFixed(1)} m/s
                  </strong>
                  <small className="metric-target">
                    {scenario.id >= 3 ? '≤ 2.4 m/s' : scenario.id === 2 ? '≤ 8.5 m/s' : '≤ 36 km'}
                  </small>
                </div>
              </div>
            </div>

            <LandingTelemetryChart samples={samples} language={language} />

            <div
              className="modal-dark-card"
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(14, 24, 34, 0.94)',
                border: '1px solid rgba(255, 184, 77, 0.25)'
              }}
            >
              <strong style={{ color: '#ffb84d', fontSize: 13 }}>
                💡 {loc(language, scenario.scienceTerm.term)}
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.65, color: '#c4d6cc' }}>
                {loc(language, scenario.scienceTerm.explanation)}
              </p>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="secondary-button" onClick={() => loadScenario(scenario.id)}>
                <span>{t('Reset', 'Reset')}</span>
              </button>
              <button type="button" className="secondary-button" onClick={() => startFlight(false)}>
                <span>{t('Retry Mission', 'Retry Mission')}</span>
              </button>
              {state.status === 'success' && scenario.id < 4 && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => selectLevel(scenario.id + 1)}
                >
                  <span>{t('Next Mission', 'Next Mission')}</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
