import { loc, makeT } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { classifyHatchHotkey } from '../../utils/flightLoop';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crosshair,
  DoorClosed,
  DoorOpen,
  Layers,
  Layers3,
  MapPin,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target
} from 'lucide-react';
import {
  createDepartureState,
  DEPARTURE_DT,
  DEPARTURE_GLOSSARY,
  DEPARTURE_SCENARIOS,
  departureAutopilot,
  emptyDepartureCommand,
  getDepartureScenario,
  KEEP_OUT_ZONE_M,
  sampleDeparture,
  stepDeparture,
  stepNoseconeServo,
  toggleDepartureNosecone,
  type DepartureCommand,
  type DepartureSample,
  type DepartureState
} from '../../sim/departure';
import { FixedStepper } from '../../sim/engine';
import { hatchTone, tone, useSession } from '../../store';
import { formatTime } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { DepartureScene3D } from './DepartureScene3D';
import '../liftoff/liftoff.css';

export interface DepartureWorkspaceProps {
  initialActiveLevel?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onActiveLevelChange?: (level: number) => void;
}

export function DepartureWorkspace({
  initialActiveLevel = 1,
  onCloseMobile,
  onActiveLevelChange
}: DepartureWorkspaceProps) {
  const language = useSession((s) => s.language);
  const completedIds = useSession((s) => s.departureCompleted);
  const t = makeT(language);

  const [activeLevel, setActiveLevel] = useState<number>(initialActiveLevel);
  const [scenarioId, setScenarioId] = useState<number>(() => Math.max(1, initialActiveLevel));
  const [viewTab, setViewTab] = useState<'sim' | 'objective'>('sim');
  const scenario = getDepartureScenario(scenarioId);

  const [state, setState] = useState<DepartureState>(() =>
    createDepartureState(getDepartureScenario(Math.max(1, initialActiveLevel)))
  );
  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState(false);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'side' | 'pilot'>('orbit');
  const [showGuidance, setShowGuidance] = useState(true);
  const [timeWarp, setTimeWarp] = useState<1 | 2 | 4>(1);
  const [modalType, setModalType] = useState<'none' | 'glossary' | 'review'>('none');

  const runtimeRef = useRef({
    scenario: getDepartureScenario(Math.max(1, initialActiveLevel)),
    state: createDepartureState(getDepartureScenario(Math.max(1, initialActiveLevel))),
    command: emptyDepartureCommand(),
    heldKeys: new Set<string>(),
    running: false,
    demo: false,
    timeWarp: 1 as 1 | 2 | 4,
    samples: [] as DepartureSample[],
    lastSampleTime: 0,
    stepper: new FixedStepper()
  });

  const selectLevel = (id: number) => {
    onCloseMobile?.();
    onActiveLevelChange?.(id);
    if (id === 0) {
      runtimeRef.current.running = false;
      setRunning(false);
      setActiveLevel(0);
      setViewTab('sim');
      setModalType('none');
      return;
    }
    selectScenario(id);
    setActiveLevel(id);
    setViewTab('sim');
  };

  const prevSyncedLevelRef = useRef(initialActiveLevel);
  useEffect(() => {
    if (prevSyncedLevelRef.current === initialActiveLevel) return;
    prevSyncedLevelRef.current = initialActiveLevel;
    selectLevel(initialActiveLevel);
  }, [initialActiveLevel]);

  const selectScenario = (id: number) => {
    const cfg = getDepartureScenario(id);
    const init = createDepartureState(cfg);
    runtimeRef.current.scenario = cfg;
    runtimeRef.current.state = init;
    runtimeRef.current.command = emptyDepartureCommand();
    runtimeRef.current.heldKeys.clear();
    runtimeRef.current.running = false;
    runtimeRef.current.demo = false;
    runtimeRef.current.samples = [];
    runtimeRef.current.lastSampleTime = 0;
    runtimeRef.current.stepper.reset();

    setScenarioId(id);
    setState(init);
    setRunning(false);
    setDemo(false);
    setModalType('none');
  };

  const startFlight = (isDemo = false) => {
    tone(true);
    const cfg = runtimeRef.current.scenario;
    const prev = runtimeRef.current.state;
    const keepPreFlightHatch = !isDemo && prev.status === 'ready';
    const base = createDepartureState(cfg);
    const init: DepartureState = {
      ...base,
      status: 'flying',
      noseconeClosed: keepPreFlightHatch ? prev.noseconeClosed : base.noseconeClosed,
      noseconeProgress: keepPreFlightHatch ? prev.noseconeProgress : base.noseconeProgress
    };
    runtimeRef.current.state = init;
    runtimeRef.current.command = emptyDepartureCommand();
    runtimeRef.current.heldKeys.clear();
    runtimeRef.current.running = true;
    runtimeRef.current.demo = isDemo;
    runtimeRef.current.samples = [sampleDeparture(init)];
    runtimeRef.current.lastSampleTime = 0;
    runtimeRef.current.stepper.reset();

    setState(init);
    setRunning(true);
    setDemo(isDemo);
    setModalType('none');
  };

  const triggerReleaseLatches = () => {
    tone(true);
    if (!runtimeRef.current.running) {
      startFlight(false);
    }
    runtimeRef.current.command.releaseLatches = true;
  };

  const triggerToggleNosecone = () => {
    const nextState = toggleDepartureNosecone(runtimeRef.current.state);
    runtimeRef.current.state = nextState;
    runtimeRef.current.command.toggleNosecone = false;
    hatchTone(!nextState.noseconeClosed);
    setState({ ...nextState });
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let publish = 0;

    const rebuildContinuousCmd = (cmd: DepartureCommand, keys: Set<string>) => {
      cmd.translation = [0, 0, 0];
      cmd.rotation = [0, 0, 0];
      cmd.assistBrake = keys.has('KeyB') || keys.has('ShiftLeft') || keys.has('ShiftRight');

      if (keys.has('KeyA')) cmd.translation[0] -= 1;
      if (keys.has('KeyD')) cmd.translation[0] += 1;
      if (keys.has('KeyW')) cmd.translation[1] += 1;
      if (keys.has('KeyS')) cmd.translation[1] -= 1;
      if (keys.has('KeyR')) cmd.translation[2] -= 1;
      if (keys.has('KeyF')) cmd.translation[2] += 1;

      if (keys.has('ArrowUp')) cmd.rotation[0] -= 1;
      if (keys.has('ArrowDown')) cmd.rotation[0] += 1;
      if (keys.has('ArrowLeft')) cmd.rotation[1] -= 1;
      if (keys.has('ArrowRight')) cmd.rotation[1] += 1;
      if (keys.has('KeyQ')) cmd.rotation[2] += 1;
      if (keys.has('KeyE')) cmd.rotation[2] -= 1;
    };

    const loop = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const rt = runtimeRef.current;

      if (rt.running && rt.state.status === 'flying') {
        if (!rt.demo && rt.heldKeys.size > 0) {
          rebuildContinuousCmd(rt.command, rt.heldKeys);
        }
        const scaledDt = dtReal * rt.timeWarp;
        rt.stepper.advance(scaledDt, () => {
          if (rt.state.status !== 'flying') return;
          const activeCmd = rt.demo
            ? departureAutopilot(rt.state, rt.scenario)
            : rt.command;

          rt.state = stepDeparture(rt.state, activeCmd, rt.scenario, DEPARTURE_DT);
          rt.command.releaseLatches = false;
          rt.command.toggleNosecone = false;

          if (rt.state.time - rt.lastSampleTime >= 0.5) {
            rt.samples.push(sampleDeparture(rt.state));
            rt.lastSampleTime = rt.state.time;
          }

          if (rt.state.status === 'success' || rt.state.status === 'failed') {
            rt.running = false;
            setRunning(false);
            if (rt.state.status === 'success' && !rt.demo) {
              useSession.getState().markDepartureComplete(rt.scenario.id);
            }
            setState({ ...rt.state });
            setModalType('review');
          }
        });

        if (now - publish > 75) {
          setState({ ...rt.state });
          publish = now;
        }
      } else {
        const target = rt.state.noseconeClosed ? 1 : 0;
        if (rt.state.noseconeProgress !== target) {
          const nextProg = stepNoseconeServo(
            rt.state.noseconeProgress,
            rt.state.noseconeClosed,
            dtReal
          );
          rt.state = { ...rt.state, noseconeProgress: nextProg };
          if (nextProg === target || now - publish > 35) {
            setState({ ...rt.state });
            publish = now;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,select,textarea')) return;

      const rt = runtimeRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!rt.state.latchesReleased) {
          if (!e.repeat) triggerReleaseLatches();
        } else {
          rt.heldKeys.add('KeyB');
        }
        return;
      }
      const hatchAction = classifyHatchHotkey(e);
      if (hatchAction !== 'ignore') {
        e.preventDefault();
        if (hatchAction === 'toggle') triggerToggleNosecone();
        return;
      }
      if (
        [
          'KeyW',
          'KeyS',
          'KeyA',
          'KeyD',
          'KeyR',
          'KeyF',
          'KeyQ',
          'KeyE',
          'KeyB',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight'
        ].includes(e.code)
      ) {
        e.preventDefault();
        rt.heldKeys.add(e.code);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const rt = runtimeRef.current;
      if (e.code === 'Space') {
        rt.heldKeys.delete('KeyB');
      }
      if (rt.heldKeys.has(e.code)) {
        rt.heldKeys.delete(e.code);
        rt.command.translation = [0, 0, 0];
        rt.command.rotation = [0, 0, 0];
        rt.command.assistBrake = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeLevel]);

  const holdNudge = (axis: 'tx' | 'rot', idx: 0 | 1 | 2, val: number) => {
    const rt = runtimeRef.current;
    if (axis === 'tx') rt.command.translation[idx] = val;
    else rt.command.rotation[idx] = val;
  };

  const hatchClosing = state.noseconeClosed && state.noseconeProgress < 0.995;
  const hatchOpening = !state.noseconeClosed && state.noseconeProgress > 0.005;
  const hatchToolbarLabel = hatchClosing
    ? `${t('Closing', 'Closing')} ${(state.noseconeProgress * 100).toFixed(0)}%`
    : hatchOpening
    ? `${t('Opening', 'Opening')} ${((1 - state.noseconeProgress) * 100).toFixed(0)}%`
    : state.noseconeClosed
    ? t('Hatch: CLOSED [1]', 'Hatch: CLOSED [1]')
    : t('Hatch: OPEN [1]', 'Hatch: OPEN [1]');
  const hatchActionLabel = hatchClosing
    ? `${t('Closing', 'Closing')} ${(state.noseconeProgress * 100).toFixed(0)}%`
    : hatchOpening
    ? `${t('Opening', 'Opening')} ${((1 - state.noseconeProgress) * 100).toFixed(0)}%`
    : state.noseconeClosed
    ? t('Open Hatch [1]', 'Open Hatch [1]')
    : t('Close Hatch [1]', 'Close Hatch [1]');

  const failLabel = (reason?: string) => {
    switch (reason) {
      case 'plume_contamination':
        return t(
          '⚠️ Plume Keep-Out Violation! Fired axial thrusters within 5 m of the station, contaminating optics and solar panels!',
          '⚠️ Plume Keep-Out Violation! Fired axial thrusters within 5 m of the station, contaminating optics and solar panels!'
        );
      case 'corridor_breach':
        return t(
          '⚠️ Departure Corridor Breach! Drifted outside the safety cone toward the solar arrays!',
          '⚠️ Departure Corridor Breach! Drifted outside the safety cone toward the solar arrays!'
        );
      case 'station_collision':
        return t(
          '⚠️ Station Collision! Moved forward into the docking structure.',
          '⚠️ Station Collision! Moved forward into the docking structure.'
        );
      case 'attitude_lost':
        return t(
          '⚠️ Attitude Lock Lost! Nose lidar lost lock on the station target (> 25°).',
          '⚠️ Attitude Lock Lost! Nose lidar lost lock on the station target (> 25°).'
        );
      default:
        return t('⚠️ Departure timed out or exceeded speed limit.', '⚠️ Departure timed out or exceeded speed limit.');
    }
  };

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
                        <span>{t('Release Latches / Attitude Damp', 'Release Latches / Attitude Damp')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>F / R</kbd>
                        <span>{t('Back Up Aft / Forward Brake (Past 5 m)', 'Back Up Aft / Forward Brake (Past 5 m)')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>W / S · A / D</kbd>
                        <span>{t('Corridor Vertical / Lateral Centering', 'Corridor Vertical / Lateral Centering')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>↑↓←→ · Q/E</kbd>
                        <span>{t('Lidar Nose Alignment Pitch/Yaw/Roll', 'Lidar Nose Alignment Pitch/Yaw/Roll')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>1</kbd>
                        <span>{t('Close Reentry Nosecone Hatch', 'Close Reentry Nosecone Hatch')}</span>
                      </div>
                      <div className="liftoff-key-item">
                        <kbd>B</kbd>
                        <span>{t('Hold for Attitude Damping Assist', 'Hold for Attitude Damping Assist')}</span>
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
                        <span>{t('Departure Science Glossary', 'Departure Science Glossary')}</span>
                      </button>
                    </div>
                  </article>
                </div>
              </section>
            ) : (
              <div className="mission-view liftoff-mission-view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

            <section className="simulator" aria-label={t('Station Departure Simulator', 'Station Departure Simulator')}>
              <div className="scene-toolbar">
                <div className="view-switch">
                  {(['orbit', 'side', 'pilot'] as const).map((v, idx) => (
                    <button
                      key={v}
                      className={cameraMode === v ? 'active' : ''}
                      onClick={() => setCameraMode(v)}
                    >
                      {[<Orbit size={15} key="o" />, <Layers3 size={15} key="s" />, <Crosshair size={15} key="p" />][idx]}
                      {[t('Orbit View', 'Orbit View'), t('Corridor Side', 'Corridor Side'), t('Nose Lidar', 'Nose Lidar')][idx]}
                    </button>
                  ))}
                </div>

                <div className="scene-tools">
                  <div className="time-warp-group">
                    <span className="time-warp-label">{t('Warp', 'Warp')}</span>
                    {([1, 2, 4] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`time-warp-btn ${timeWarp === w ? 'active' : ''}`}
                        onClick={() => {
                          runtimeRef.current.timeWarp = w;
                          setTimeWarp(w);
                        }}
                      >
                        {w}×
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={`hatch-btn ${state.noseconeClosed ? 'enabled' : ''}`}
                    onClick={triggerToggleNosecone}
                    aria-pressed={state.noseconeClosed}
                    title={t('Click to toggle hatch (Shortcut: 1)', 'Click to toggle hatch (Shortcut: 1)')}
                  >
                    {state.noseconeClosed ? <DoorClosed size={15} /> : <DoorOpen size={15} />}
                    <span>{hatchToolbarLabel}</span>
                  </button>

                  <button
                    className={showGuidance ? 'enabled' : ''}
                    onClick={() => setShowGuidance((v) => !v)}
                  >
                    <Crosshair size={15} />
                    <span>{t('Corridor Rings', 'Corridor Rings')}</span>
                  </button>
                </div>
              </div>

              <div className="scene-container">
                <DepartureScene3D
                  state={state}
                  scenarioId={scenario.id}
                  cameraMode={cameraMode}
                  showGuidance={showGuidance}
                  language={language}
                />

                <div className="scene-top-left">
                  <span className="scene-tag">
                    {state.inKeepOutZone
                      ? t('⚠️ 0–5m PLUME KEEP-OUT ZONE (NO F/R BURN)', '⚠️ 0–5m PLUME KEEP-OUT ZONE (NO F/R BURN)')
                      : t('✅ CLEAR OF 5m ZONE · DEPARTURE CORRIDOR', '✅ CLEAR OF 5m ZONE · DEPARTURE CORRIDOR')}
                  </span>
                  <span className="scene-subtag">
                    {t('Corridor Radius ±{0}m · Offset {1}m', 'Corridor Radius ±{0}m · Offset {1}m', { 0: state.corridorRadiusM.toFixed(2), 1: state.lateralOffsetM.toFixed(2) })}
                  </span>
                </div>

                <div className="scene-top-right">
                  <span className="mission-clock">T+ {formatTime(state.time)}</span>
                </div>

                {cameraMode === 'pilot' && (
                  <div className="scene-bottom-left">
                    <span className="axis-symbol">⌖</span>
                    <span>{t('NOSE LIDAR CAMERA', 'NOSE LIDAR CAMERA')}</span>
                  </div>
                )}
              </div>

              {/* Bottom telemetry and controls deck */}
              <div className="liftoff-cockpit-deck">
                <div className="liftoff-telemetry-grid">
                  <div className="metric">
                    <span>{t('Port Distance', 'Port Distance')}</span>
                    <strong>{state.position[2].toFixed(2)} m</strong>
                    <small>
                      {state.position[2] < KEEP_OUT_ZONE_M
                        ? t('Inside 5m Keep-Out', 'Inside 5m Keep-Out')
                        : t('Corridor Clear', 'Corridor Clear')}
                    </small>
                  </div>
                  <div className="metric">
                    <span>{t('Separation Speed', 'Separation Speed')}</span>
                    <strong>{state.velocity[2].toFixed(2)} m/s</strong>
                    <small>{t('+ Away from Station', '+ Away from Station')}</small>
                  </div>
                  <div className="metric">
                    <span>{t('Corridor Offset', 'Corridor Offset')}</span>
                    <strong>{state.lateralOffsetM.toFixed(2)} m</strong>
                    <small>{t('Drift {0} m/s', 'Drift {0} m/s', { 0: state.lateralSpeedMs.toFixed(2) })}</small>
                  </div>
                  <div className="metric">
                    <span>{t('Lidar Attitude Err', 'Lidar Attitude Err')}</span>
                    <strong>{state.attitudeErrorDeg.toFixed(1)}°</strong>
                    <small>{t('Target ≤ 2.0°', 'Target ≤ 2.0°')}</small>
                  </div>
                </div>

                <div className="liftoff-action-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {!running && state.status === 'ready' && (
                    <button className="primary-button" onClick={() => startFlight(false)}>
                      <Play size={15} />
                      <span>{t('Start Departure', 'Start Departure')}</span>
                    </button>
                  )}

                  {running && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        runtimeRef.current.running = false;
                        setRunning(false);
                      }}
                    >
                      <Pause size={15} />
                      <span>{t('Pause', 'Pause')}</span>
                    </button>
                  )}

                  <button
                    className={`stage-fire-btn ${!state.latchesReleased ? 'ready-pulse' : ''}`}
                    onClick={triggerReleaseLatches}
                    disabled={state.latchesReleased}
                  >
                    <span>
                      {state.latchesReleased
                        ? t('✅ Latches Released', '✅ Latches Released')
                        : t('🔓 [Space] Release Latches & Spring Push', '🔓 [Space] Release Latches & Spring Push')}
                    </span>
                  </button>

                  <button
                    className="secondary-button"
                    onMouseDown={() => holdNudge('tx', 2, 1)}
                    onMouseUp={() => holdNudge('tx', 2, 0)}
                    onClick={() => {
                      if (!runtimeRef.current.running) startFlight(false);
                    }}
                  >
                    <span>{t('Back Up [F]', 'Back Up [F]')}</span>
                  </button>

                  <button
                    className="secondary-button"
                    onMouseDown={() => holdNudge('tx', 2, -1)}
                    onMouseUp={() => holdNudge('tx', 2, 0)}
                  >
                    <span>{t('Brake [R]', 'Brake [R]')}</span>
                  </button>

                  <button
                    className="secondary-button"
                    onMouseDown={() => {
                      runtimeRef.current.command.assistBrake = true;
                    }}
                    onMouseUp={() => {
                      runtimeRef.current.command.assistBrake = false;
                    }}
                  >
                    <span>{t('Damp Drift & Attitude [B]', 'Damp Drift & Attitude [B]')}</span>
                  </button>

                  <button
                    type="button"
                    className={`hatch-btn ${state.noseconeClosed ? 'enabled' : ''}`}
                    onClick={triggerToggleNosecone}
                    aria-pressed={state.noseconeClosed}
                  >
                    {state.noseconeClosed ? <DoorClosed size={15} /> : <DoorOpen size={15} />}
                    <span>{hatchActionLabel}</span>
                  </button>

                  <button className="secondary-button" onClick={() => startFlight(true)}>
                    <span>{t('Watch Demo', 'Watch Demo')}</span>
                  </button>

                  <button className="secondary-button" onClick={() => selectScenario(scenario.id)}>
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
          title={t('Station Departure Science Glossary', 'Station Departure Science Glossary')}
          onClose={() => setModalType('none')}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {DEPARTURE_GLOSSARY.map((item) => (
              <div
                key={item.id}
                className="modal-dark-card"
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(14, 22, 34, 0.94)',
                  border: '1px solid rgba(184, 245, 102, 0.2)'
                }}
              >
                <h4 style={{ margin: '0 0 6px', color: '#b8f566' }}>{loc(language, item.term)}</h4>
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
              ? t('🎉 Station Departure Complete!', '🎉 Station Departure Complete!')
              : t('⚠️ Departure Debrief', '⚠️ Departure Debrief')
          }
          onClose={() => setModalType('none')}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            {state.status === 'success' ? (
              <p style={{ color: '#166534', fontSize: 15, fontWeight: 600, margin: 0 }}>
                {t('Excellent! You followed real orbital undocking protocol and completed [{0}]!', 'Excellent! You followed real orbital undocking protocol and completed [{0}]!', { 0: loc(language, scenario.title) })}
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.4)'
                }}
              >
                <ShieldAlert size={20} color="#f87171" />
                <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>{failLabel(state.failReason)}</span>
              </div>
            )}

            <div
              className="modal-dark-card"
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(14, 24, 34, 0.94)',
                border: '1px solid rgba(77, 226, 209, 0.25)'
              }}
            >
              <strong style={{ color: '#4de2d1', fontSize: 13 }}>
                💡 {loc(language, scenario.scienceTerm.term)}
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.65, color: '#c4d6cc' }}>
                {loc(language, scenario.scienceTerm.explanation)}
              </p>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="secondary-button" onClick={() => selectScenario(scenario.id)}>
                <span>{t('Retry Mission', 'Retry Mission')}</span>
              </button>
              {state.status === 'success' && scenario.id < 4 && (
                <button
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
