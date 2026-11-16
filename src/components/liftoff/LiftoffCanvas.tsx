import { makeT } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import {
  EARTH_RADIUS_M,
  KARMAN_LINE_ALTITUDE_M,
  type LiftoffSample,
  type LiftoffState,
  type RocketVehicleConfig
} from '../../sim/liftoff';
import type { Language } from '../../sim/types';
import { LiftoffScene3D } from './LiftoffScene3D';

export interface LiftoffCanvasProps {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
  samples: LiftoffSample[];
  viewMode: 'rocket' | 'map';
  paused?: boolean;
  showGuidance: boolean;
  language: Language;
  minimal?: boolean;
  showResultOverlay?: boolean;
  resultTitle?: string;
  resultDetail?: string;
  onRetry?: () => void;
  onNextLevel?: () => void;
  onOpenReview?: () => void;
}

const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: ((i * 73 + 19) % 100) / 100,
  y: ((i * 41 + 7) % 100) / 100,
  r: (i % 3) * 0.6 + 0.8,
  alpha: 0.35 + ((i * 17) % 65) / 100
}));

interface SequenceStep {
  id: string;
  zh: string;
  en: string;
  done: boolean;
  active: boolean;
}

export function getLaunchSequenceSteps(state: LiftoffState): SequenceStep[] {
  const alt = state.orbit.altitudeM;
  const igniting = state.throttle > 0.05 || state.clampsReleased;
  const liftedOff = state.clampsReleased;
  const towerCleared = liftedOff && alt >= 150;
  const pitchedOver = liftedOff && (alt >= 2500 || state.pitchDeg < 85);
  const passedMaxQ = liftedOff && (alt >= 16500 || (state.maxQRecordedPa > 12000 && alt > 12500));
  const staged = state.activeStageIndex >= 1;
  const fairingDropped = state.towerJettisoned || alt >= 95000;
  const inOrbit = state.orbit.isOrbitStable || state.status === 'success';

  const flags = [
    igniting,
    towerCleared,
    pitchedOver,
    passedMaxQ,
    staged,
    fairingDropped,
    inOrbit
  ];

  // Current active step is the first step not yet completed (or the last completed if all done)
  let activeIdx = flags.findIndex((f) => !f);
  if (activeIdx === -1) activeIdx = flags.length - 1;

  const meta = [
    { id: 'ignition', zh: '1. Ignition', en: '1. Ignition' },
    { id: 'liftoff', zh: '2. Liftoff', en: '2. Liftoff' },
    { id: 'pitch', zh: '3. Pitchover', en: '3. Pitchover' },
    { id: 'maxq', zh: '4. Max-Q', en: '4. Max-Q' },
    { id: 'staging', zh: '5. Staging', en: '5. Staging' },
    { id: 'fairing', zh: '6. Fairing', en: '6. Fairing' },
    { id: 'orbit', zh: '7. LEO Orbit', en: '7. LEO Orbit' }
  ];

  return meta.map((m, idx) => ({
    ...m,
    done: flags[idx],
    active: idx === activeIdx
  }));
}

export function LiftoffCanvas({
  state,
  vehicle,
  samples,
  viewMode,
  paused = false,
  showGuidance,
  language,
  minimal = false,
  showResultOverlay = true,
  resultTitle,
  resultDetail,
  onRetry,
  onNextLevel,
  onOpenReview
}: LiftoffCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const prevStageRef = useRef<number>(state.activeStageIndex);
  const sepTimestampRef = useRef<number>(-999);
  const [sepElapsed, setSepElapsed] = useState<number>(99);

  useEffect(() => {
    if (state.activeStageIndex !== prevStageRef.current) {
      prevStageRef.current = state.activeStageIndex;
      if (state.activeStageIndex > 0) {
        sepTimestampRef.current = state.time;
      } else {
        sepTimestampRef.current = -999;
      }
    }
    const elapsed = state.time - sepTimestampRef.current;
    setSepElapsed(elapsed >= 0 ? elapsed : 99);
  }, [state.activeStageIndex, state.time]);

  const t = makeT(language);

  // Full-screen Orbital Map View
  useEffect(() => {
    if (minimal || viewMode !== 'map') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(260, rect.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.save();
    ctx.scale(dpr, dpr);

    drawOrbitalMapView(ctx, w, h, state, samples, t);

    ctx.restore();
  }, [state, samples, viewMode, language, minimal]);

  const activeView = minimal ? 'rocket' : viewMode;
  const isPostFlight = state.status === 'success' || state.status === 'failed';

  return (
    <div className="liftoff-canvas-wrap">
      {activeView === 'rocket' ? (
        <LiftoffScene3D
          state={state}
          vehicle={vehicle}
          paused={paused}
          showGuidance={minimal ? false : showGuidance}
          sepElapsed={sepElapsed}
          language={language}
        />
      ) : (
        <canvas ref={canvasRef} className="liftoff-render-canvas" />
      )}

      {minimal && showResultOverlay && isPostFlight && (
        <div
          className={`liftoff-minimal-result ${state.status === 'success' ? 'is-success' : 'is-failed'}`}
          role="status"
        >
          <div className="liftoff-minimal-result-text">
            <strong>
              {resultTitle ??
                (state.status === 'success'
                  ? t('🎉 Ascent Mission Accomplished!', '🎉 Ascent Mission Accomplished!')
                  : t('LAUNCH FAILED', 'LAUNCH FAILED'))}
            </strong>
            {resultDetail && <p>{resultDetail}</p>}
          </div>
          <div className="liftoff-minimal-result-actions">
            {onOpenReview && (
              <button type="button" className="secondary-button" onClick={onOpenReview}>
                {state.status === 'success'
                  ? t('Flight debrief', 'Flight debrief')
                  : t('Diagnosis & Tips', 'Diagnosis & Tips')}
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                className={state.status === 'failed' ? 'primary-button' : 'secondary-button'}
                onClick={onRetry}
              >
                {state.status === 'failed'
                  ? t('Retry Launch', 'Retry Launch')
                  : t('Fly Again', 'Fly Again')}
              </button>
            )}
            {state.status === 'success' && onNextLevel && (
              <button type="button" className="primary-button" onClick={onNextLevel}>
                {t('Next mission', 'Next mission')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render KSP-style Earth orbital map view (supports full and PiP modes)
 */
function drawOrbitalMapView(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: LiftoffState,
  samples: LiftoffSample[],
  t: (zh: string, en: string, vars?: Record<string, string | number>) => string,
  compact = false
) {
  ctx.fillStyle = '#04080e';
  ctx.fillRect(0, 0, w, h);

  // Background stars
  const starCount = compact ? 30 : STARS.length;
  for (let i = 0; i < starCount; i++) {
    const st = STARS[i];
    ctx.fillStyle = `rgba(220, 235, 255, ${st.alpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(st.x * w, st.y * h, compact ? st.r * 0.7 : st.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Exaggerated altitude scale for clear visualization of 0-250 km orbital arc and 100 km Karman line
  const cx = w * 0.5;
  const cy = compact ? h * 0.64 : h * 0.56;
  const baseEarthPx = Math.min(w, h) * (compact ? 0.34 : 0.31);
  const altScalePxPerKm = (Math.min(w, h) * (compact ? 0.18 : 0.14)) / 200;

  const toCanvasPos = (posM: [number, number]): [number, number] => {
    const r = Math.hypot(posM[0], posM[1]);
    const altKm = (r - EARTH_RADIUS_M) / 1000;
    const angle = Math.atan2(posM[0], posM[1]) * 4.2;
    const radPx = baseEarthPx + altKm * altScalePxPerKm;
    return [cx + Math.sin(angle) * radPx, cy - Math.cos(angle) * radPx];
  };

  // 1. 100 km Karman line atmospheric boundary ring
  const karmanRadPx = baseEarthPx + (KARMAN_LINE_ALTITUDE_M / 1000) * altScalePxPerKm;
  ctx.strokeStyle = 'rgba(77, 196, 255, 0.35)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = compact ? 1 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, karmanRadPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!compact) {
    ctx.fillStyle = 'rgba(77, 196, 255, 0.75)';
    ctx.font = '11px monospace';
    ctx.fillText(t('100 km Karman Line', '100 km Karman Line'), cx - 72, cy - karmanRadPx - 6);
  }

  // 2. Earth blue sphere
  const earthGrad = ctx.createRadialGradient(cx - 12, cy - 12, baseEarthPx * 0.2, cx, cy, baseEarthPx);
  earthGrad.addColorStop(0, '#1e5785');
  earthGrad.addColorStop(1, '#0b253c');
  ctx.fillStyle = earthGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, baseEarthPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3b95d6';
  ctx.lineWidth = compact ? 1.5 : 2;
  ctx.stroke();

  // 3. Predicted orbit ellipse ring
  const apKm = Math.min(320, Math.max(0, state.orbit.apoapsisM / 1000));
  const peKm = Math.max(-120, Math.min(320, state.orbit.periapsisM / 1000));
  const apRadPx = baseEarthPx + apKm * altScalePxPerKm;
  const peRadPx = Math.max(baseEarthPx * 0.65, baseEarthPx + peKm * altScalePxPerKm);

  const ellipseCenterY = cy - (apRadPx - peRadPx) * 0.5;
  const ry = (apRadPx + peRadPx) * 0.5;
  ctx.strokeStyle = state.orbit.isOrbitStable
    ? 'rgba(184, 245, 102, 0.85)'
    : 'rgba(255, 184, 77, 0.72)';
  ctx.lineWidth = compact ? 1.5 : 2;
  ctx.beginPath();
  const rx = Math.sqrt(Math.max(60, apRadPx * peRadPx));
  ctx.ellipse(cx, ellipseCenterY, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Historical flight trajectory trail
  if (samples.length > 1) {
    ctx.strokeStyle = '#4de2d1';
    ctx.lineWidth = compact ? 2 : 2.5;
    ctx.beginPath();
    samples.forEach((smp, idx) => {
      const rM = EARTH_RADIUS_M + smp.altitudeKm * 1000;
      const ang = (smp.downrangeKm * 1000) / EARTH_RADIUS_M;
      const [px, py] = toCanvasPos([rM * Math.sin(ang), rM * Math.cos(ang)]);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // 5. Apoapsis (Ap) and Periapsis (Pe) markers
  const apY = cy - apRadPx;
  ctx.fillStyle = '#4de2d1';
  ctx.beginPath();
  ctx.arc(cx, apY, compact ? 3.5 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = compact ? 'bold 9.5px monospace' : 'bold 11px monospace';
  ctx.fillText(`Ap ${(state.orbit.apoapsisM / 1000).toFixed(1)}km`, cx + 6, apY + 3);

  if (!compact) {
    const peY = ellipseCenterY + ry;
    ctx.fillStyle = state.orbit.isOrbitStable ? '#b8f566' : '#ffb84d';
    ctx.beginPath();
    ctx.arc(cx, peY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`Pe ${(state.orbit.periapsisM / 1000).toFixed(1)} km`, cx + 8, Math.min(h - 6, peY + 14));
  }

  // 6. Current rocket real-time position icon
  const [rxPos, ryPos] = toCanvasPos(state.position);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(rxPos, ryPos, compact ? 4 : 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff9838';
  ctx.lineWidth = compact ? 1.5 : 2;
  ctx.stroke();

  if (compact) {
    ctx.fillStyle = 'rgba(4, 10, 14, 0.72)';
    ctx.fillRect(0, h - 20, w, 20);
    ctx.fillStyle = state.orbit.isOrbitStable ? '#b8f566' : '#dce8e1';
    ctx.font = '10px monospace';
    ctx.fillText(
      `ALT ${(state.orbit.altitudeM / 1000).toFixed(1)}km | Pe ${(state.orbit.periapsisM / 1000).toFixed(0)}km | ${state.orbit.orbitalSpeedMs.toFixed(0)}m/s`,
      6,
      h - 6
    );
  }
}
