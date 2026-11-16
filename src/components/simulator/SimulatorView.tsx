import { loc, makeT } from '../../i18n';
import { useEffect, useState } from 'react';
import { CircleHelp, Crosshair, DoorClosed, DoorOpen, Info, Layers3, Maximize2, Orbit, Settings2, X } from 'lucide-react';
import Scene from '../../Scene';
import { angleError, angularSpeed } from '../../sim/engine';
import type { ActiveAlert } from '../../sim/feedback';
import type { SimulationState } from '../../sim/types';
import { useSession } from '../../store';
import { formatTime } from '../../utils/formatters';
import { ConstraintToast } from './ConstraintToast';
import { TelemetryBar } from './TelemetryBar';
import { ControlsOverlay } from '../hud/ControlsOverlay';

function getInFlightGuidance(configId: number, flight: SimulationState, hatchState: string, t: (zh: string, en: string, vars?: Record<string, string | number>) => string): string {
  const z = flight.position[2];
  const vz = -flight.velocity[2];
  const lat = Math.hypot(flight.position[0], flight.position[1]);
  const latV = Math.hypot(flight.velocity[0], flight.velocity[1]);
  const angErr = angleError(flight);
  const angSpd = angularSpeed(flight);

  if (configId === 1) {
    if (z > 9.5) {
      return t(
        '🎯 Gliding to 8 m ring · 💡 Press [F] to brake as you approach 8 m',
        '🎯 Gliding to 8 m ring · 💡 Press [F] to brake as you approach 8 m'
      );
    } else if (z >= 7.65 && z <= 9.5) {
      if (Math.abs(vz) > 0.06) {
        return t(
          '⚠️ In the 8 m zone! Hold [F] to bring closing speed to 0 m/s!',
          '⚠️ In the 8 m zone! Hold [F] to bring closing speed to 0 m/s!'
        );
      } else {
        return t(
          '✨ Speed is zero! Hold steady for 1.5 s to complete mission!',
          '✨ Speed is zero! Hold steady for 1.5 s to complete mission!'
        );
      }
    } else if (z > 3) {
      return t(
        '💡 Passed 8 m ring! You can reverse with [R], or fly ahead to dock directly!',
        '💡 Passed 8 m ring! You can reverse with [R], or fly ahead to dock directly!'
      );
    } else {
      return t(
        '🎯 Approaching port! Stay centered to dock directly!',
        '🎯 Approaching port! Stay centered to dock directly!'
      );
    }
  } else if (configId === 2) {
    if (lat > 0.25) {
      return t(
        '🎯 Center on crosshair · 💡 Use W/S (up/down) & A/D (left/right) to steer',
        '🎯 Center on crosshair · 💡 Use W/S (up/down) & A/D (left/right) to steer'
      );
    } else if (latV > 0.04) {
      return t(
        '⚠️ Centered! Counter-tap directional keys to cancel drift speed!',
        '⚠️ Centered! Counter-tap directional keys to cancel drift speed!'
      );
    } else {
      return t(
        '✨ Perfectly centered! Hold steady for 1.5 s to complete!',
        '✨ Perfectly centered! Hold steady for 1.5 s to complete!'
      );
    }
  } else if (configId === 3) {
    if (angErr > 2.0) {
      return t(
        '🎯 Align nose to port · 💡 Use arrow keys ↑ ↓ ← → to rotate, Q/E to roll',
        '🎯 Align nose to port · 💡 Use arrow keys ↑ ↓ ← → to rotate, Q/E to roll'
      );
    } else if (angSpd > 0.5) {
      return t(
        '⚠️ Aligned! Counter-tap arrow keys to stop rotating!',
        '⚠️ Aligned! Counter-tap arrow keys to stop rotating!'
      );
    } else {
      return t(
        '✨ Attitude aligned! Hold steady for 1.5 s to complete!',
        '✨ Attitude aligned! Hold steady for 1.5 s to complete!'
      );
    }
  } else if (configId === 4) {
    if (z > 15) {
      return t(
        '🎯 50 m docking · 💡 Keep centered on crosshair, approach steadily',
        '🎯 50 m docking · 💡 Keep centered on crosshair, approach steadily'
      );
    } else if (z > 3) {
      if (vz > 0.35) {
        return t(
          '💡 Approaching · Closing fast (>0.35m/s), tap [F] to slow down',
          '💡 Approaching · Closing fast (>0.35m/s), tap [F] to slow down'
        );
      } else {
        return t(
          '💡 Approaching · Keep centered on green crosshair',
          '💡 Approaching · Keep centered on green crosshair'
        );
      }
    } else {
      if (hatchState !== 'open') {
        return t(
          '⚠️ Nosecone hatch closed! Press [1] to open visor and reveal the docking adapter (IDA)!',
          '⚠️ Nosecone hatch closed! Press [1] to open visor and reveal the docking adapter (IDA)!'
        );
      } else if (vz > 0.15) {
        return t(
          '⚠️ Final contact! Speed must be under 0.15 m/s, tap [F] to brake!',
          '⚠️ Final contact! Speed must be under 0.15 m/s, tap [F] to brake!'
        );
      } else {
        return t(
          '✨ Hatch ready & speed perfect (<0.15m/s)! Gently touch port to dock!',
          '✨ Hatch ready & speed perfect (<0.15m/s)! Gently touch port to dock!'
        );
      }
    }
  }
  return '';
}

export interface SimulatorViewProps {
  constraintAlert: ActiveAlert | null;
  onOpenBriefing?: () => void;
}

export function SimulatorView({ constraintAlert, onOpenBriefing }: SimulatorViewProps) {
  const language = useSession((s) => s.language);
  const config = useSession((s) => s.config);
  const flight = useSession((s) => s.flight);
  const running = useSession((s) => s.running);
  const demo = useSession((s) => s.demo);
  const camera = useSession((s) => s.camera);
  const guidance = useSession((s) => s.guidance);
  const quality = useSession((s) => s.quality);
  const save = useSession((s) => s.save);
  const hatch = useSession((s) => s.hatch);
  const toggleHatch = useSession((s) => s.toggleHatch);

  const [hatchTipDismissed, setHatchTipDismissed] = useState(false);
  const [showHatchDetail, setShowHatchDetail] = useState(false);

  useEffect(() => {
    if (flight.status === 'ready') {
      setHatchTipDismissed(false);
      setShowHatchDetail(false);
    }
  }, [flight.status]);

  const t = makeT(language);

  const handleToggleFullscreen = () => {
    // Fullscreen the entire .simulator container
    const el = document.querySelector('.simulator');
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el?.requestFullscreen?.().catch(() => {});
    }
  };

  const handleToggleQuality = () => {
    useSession.setState({ quality: quality === 'high' ? 'low' : 'high' });
    save();
  };

  return (
    <section className="simulator" aria-label={t('Docking simulator', 'Docking simulator')}>
      {/* Top viewport toolbar */}
      <div className="scene-toolbar">
        <div className="view-switch">
          {(['orbit', 'pilot', 'side'] as const).map((v, i) => (
            <button
              key={v}
              className={camera === v ? 'active' : ''}
              onClick={() => useSession.setState({ camera: v })}
            >
              {[<Orbit size={15} key="o" />, <Crosshair size={15} key="c" />, <Layers3 size={15} key="l" />][i]}
              {[t('Orbit view', 'Orbit view'), t('Docking view', 'Docking view'), t('Side view', 'Side view')][i]}
            </button>
          ))}
        </div>

        <div className="scene-tools">
          <button
            className={`hatch-btn ${hatch.state === 'open' ? 'enabled' : ''}`}
            onClick={toggleHatch}
            title={t(
              'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!\nInternational Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!',
              'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!\nInternational Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!'
            )}
            aria-label={t('Hatch control', 'Hatch control')}
          >
            {hatch.state === 'open' || hatch.state === 'opening' ? <DoorOpen size={16} /> : <DoorClosed size={16} />}
            <span>
              {hatch.state === 'open'
                ? t('Hatch: OPEN [1]', 'Hatch: OPEN [1]')
                : hatch.state === 'closed'
                ? t('Hatch: CLOSED [1]', 'Hatch: CLOSED [1]')
                : hatch.state === 'opening'
                ? `${t('Opening', 'Opening')} ${(hatch.progress * 100).toFixed(0)}%`
                : `${t('Closing', 'Closing')} ${(hatch.progress * 100).toFixed(0)}%`}
            </span>
          </button>

          <button
            className={guidance ? 'enabled' : ''}
            onClick={() => useSession.setState({ guidance: !guidance })}
            aria-label={t('Toggle guidance', 'Toggle guidance')}
          >
            <Crosshair size={16} />
            <span>{t('Guide', 'Guide')}</span>
          </button>

          <button
            onClick={handleToggleQuality}
            aria-label={t('Toggle quality', 'Toggle quality')}
          >
            <Settings2 size={16} />
            <span>{quality === 'high' ? t('HD', 'HD') : t('LITE', 'LITE')}</span>
          </button>

          <button
            aria-label={t('Fullscreen', 'Fullscreen')}
            onClick={handleToggleFullscreen}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* 3D rendering and HUD container */}
      <div className="scene-container">
        <Scene />

        {/* Degree-of-freedom constraint toast */}
        <ConstraintToast alert={constraintAlert} />

        {/* HUD Overlay */}
        <ControlsOverlay />

        <div className="scene-top-left">
          <span className="scene-tag">
            {demo ? t('DEMONSTRATION · 4×', 'DEMONSTRATION · 4×') : t('LOW EARTH ORBIT · TRAINING', 'LOW EARTH ORBIT · TRAINING')}
          </span>
          <span className="scene-subtag">{t('TARGET / HARMONY FORWARD', 'TARGET / HARMONY FORWARD')}</span>
        </div>

        <div className="scene-top-right">
          <span className="mission-clock">{t('T+ ', 'T+ ')}{formatTime(flight.time)}</span>
        </div>

        {flight.status === 'failed' && (
          <div className="scene-failure-overlay">
            <div className="failure-banner">
              <span className="failure-title">
                {flight.reason === 'hatch_closed'
                  ? t('⚠️ HATCH CLOSED · PORT BLOCKED BY NOSE CONE', '⚠️ HATCH CLOSED · PORT BLOCKED BY NOSE CONE')
                  : flight.reason === 'collision'
                  ? t('⚠️ COLLISION TUMBLE · DRIFTING IN SPACE', '⚠️ COLLISION TUMBLE · DRIFTING IN SPACE')
                  : flight.reason === 'escape'
                  ? t('⚠️ EXITED BOUNDARY · DRIFTING IN SPACE', '⚠️ EXITED BOUNDARY · DRIFTING IN SPACE')
                  : t('⚠️ DOCKING FAILED · DRIFTING IN SPACE', '⚠️ DOCKING FAILED · DRIFTING IN SPACE')}
              </span>
              <div className="failure-actions">
                <button
                  className="btn-debrief"
                  onClick={() => {
                    useSession.getState().pause();
                    useSession.setState({ panel: 'review' });
                  }}
                >
                  {t('View Debrief', 'View Debrief')}
                </button>
                <button
                  className="btn-retry"
                  onClick={() => {
                    useSession.getState().start();
                  }}
                >
                  {t('Retry', 'Retry')} (R)
                </button>
              </div>
            </div>
          </div>
        )}

        {camera === 'pilot' && (
          <div className="reticle">
            <span />
            <i />
            <b />
          </div>
        )}

        {/* In-flight guidance HUD */}
        {running && flight.status === 'flying' && (
          <div className="scene-hud-guide">
            <span className="hud-guide-text">
              {getInFlightGuidance(config.id, flight, hatch.state, t)}
            </span>
          </div>
        )}

        {/* Nosecone tip banner */}
        {running && flight.status === 'flying' && hatch.state === 'closed' && !hatchTipDismissed && (
          <div
            className={`hatch-tip-banner ${showHatchDetail ? 'expanded' : 'compact'}`}
            onClick={toggleHatch}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleHatch();
              }
            }}
            title={t('Click to open nosecone hatch', 'Click to open nosecone hatch')}
          >
            <div className="hatch-tip-header-row">
              <div className="hatch-tip-title">
                {t(
                  '💡 Docking Tip: Press [1] (or tap here) to open the nosecone hatch!',
                  '💡 Docking Tip: Press [1] (or tap here) to open the nosecone hatch!'
                )}
              </div>
              <div className="hatch-tip-actions">
                <button
                  type="button"
                  className="hatch-tip-info-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHatchDetail((v) => !v);
                  }}
                  title={t('Toggle explanation', 'Toggle explanation')}
                  aria-label={t('Info', 'Info')}
                >
                  <Info size={12} />
                  <span>{showHatchDetail ? t('Hide', 'Hide') : t('Info', 'Info')}</span>
                </button>
                <button
                  type="button"
                  className="hatch-tip-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHatchTipDismissed(true);
                  }}
                  title={t('Dismiss tip', 'Dismiss tip')}
                  aria-label={t('Dismiss', 'Dismiss')}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <div className="hatch-tip-desc">
              <p style={{ margin: '0 0 4px' }}>
                {t(
                  'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!',
                  'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!'
                )}
              </p>
              <p style={{ margin: 0 }}>
                {t(
                  'International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!',
                  'International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!'
                )}
              </p>
            </div>
          </div>
        )}

        {camera === 'pilot' && (
          <div className="scene-bottom-left">
            <span className="axis-symbol">⌖</span>
            <span>{t('SHIP NOSE CAMERA', 'SHIP NOSE CAMERA')}</span>
          </div>
        )}

        <div className="scene-scale">
          <span>10 m</span>
          <i />
        </div>
      </div>

      {/* Telemetry and actions */}
      <TelemetryBar onOpenBriefing={onOpenBriefing} />
    </section>
  );
}
