import { loc, makeT } from '../../i18n';
import { useState } from 'react';
import { ArrowRight, Compass, Flame, LockKeyhole, Move, Orbit, RotateCcw, Sparkles } from 'lucide-react';
import { scenarios } from '../../sim/scenarios';
import { useSession } from '../../store';
import type { ScenarioConfig } from '../../sim/types';

export interface FreeFlightParams {
  distance: number;       // Port distance along Z (m): 5 ~ 100
  offset: number;         // Lateral position along X (m): -5 ~ +5
  speed: number;          // Closing speed along Z (m/s): 0 ~ 1.0 (Vz = -speed)
  driftSpeed: number;     // Lateral drift velocity along X (m/s): -0.3 ~ +0.3 (Vx = driftSpeed)
  pitch: number;          // Initial pitch angle (deg): -15 ~ +15 (attitude[0])
  yaw: number;            // Initial yaw angle (deg): -15 ~ +15 (attitude[1])
  roll: number;           // Initial roll angle (deg): -15 ~ +15 (attitude[2])
  fuel: number;           // Fuel budget (%): 10 ~ 100
}

export const DEFAULT_FREE_FLIGHT_PARAMS: FreeFlightParams = {
  distance: 50,
  offset: 0.6,
  speed: 0.35,
  driftSpeed: 0.0,
  pitch: 2,
  yaw: -3,
  roll: 2,
  fuel: 100,
};

export interface LabPreset {
  id: string;
  name: { zh: string; en: string };
  desc: { zh: string; en: string };
  params: FreeFlightParams;
}

export const LAB_PRESETS: LabPreset[] = [
  {
    id: 'baseline',
    name: { zh: 'Level 4 Baseline', en: 'Level 4 Baseline' },
    desc: { zh: 'Standard 50m final approach baseline', en: 'Standard 50m final approach baseline' },
    params: { distance: 50, offset: 0.6, speed: 0.35, driftSpeed: 0.0, pitch: 2, yaw: -3, roll: 2, fuel: 100 },
  },
  {
    id: 'drift',
    name: { zh: 'L2 Drift Challenge', en: 'L2 Drift Challenge' },
    desc: { zh: 'Lateral offset & drift rate cancellation', en: 'Lateral offset & drift rate cancellation' },
    params: { distance: 30, offset: 2.4, speed: 0.25, driftSpeed: 0.20, pitch: 0, yaw: 0, roll: 0, fuel: 85 },
  },
  {
    id: 'attitude',
    name: { zh: 'L3 Attitude Misalignment', en: 'L3 Attitude Misalignment' },
    desc: { zh: '3-axis attitude error recovery & braking', en: '3-axis attitude error recovery & braking' },
    params: { distance: 25, offset: 0.2, speed: 0.15, driftSpeed: 0.0, pitch: 12, yaw: -10, roll: 8, fuel: 85 },
  },
  {
    id: 'extreme',
    name: { zh: 'Extreme 6-DOF Stress', en: 'Extreme 6-DOF Stress' },
    desc: { zh: 'Combined drift, attitude error & tight fuel', en: 'Combined drift, attitude error & tight fuel' },
    params: { distance: 45, offset: -3.0, speed: 0.45, driftSpeed: -0.22, pitch: -12, yaw: 14, roll: -11, fuel: 65 },
  },
];

export function buildFreeFlightScenario(params: FreeFlightParams): ScenarioConfig {
  const base = structuredClone(scenarios[3]);
  const formatSign = (n: number, unit = '') => `${n > 0 ? '+' : ''}${n}${unit}`;
  return {
    ...base,
    position: [params.offset, 0, params.distance],
    velocity: [params.driftSpeed, 0, -params.speed],
    attitude: [params.pitch, params.yaw, params.roll],
    fuel: params.fuel,
    subtitle: {
      zh: 'Free Flight Lab · 6-DOF Custom Exercise',
      en: 'Free Flight Lab · 6-DOF Custom Exercise',
    },
    brief: {
      zh: 'Initial setup: Dist {0}m · Lateral {1} (drift {2}) · Attitude [P: {3}, Y: {4}, R: {5}] · Reserve {6}%.',
      en: 'Initial setup: Dist {0}m · Lateral {1} (drift {2}) · Attitude [P: {3}, Y: {4}, R: {5}] · Reserve {6}%.',
      vars: { 0: params.distance, 1: formatSign(params.offset, 'm'), 2: formatSign(params.driftSpeed, 'm/s'), 3: formatSign(params.pitch, '°'), 4: formatSign(params.yaw, '°'), 5: formatSign(params.roll, '°'), 6: params.fuel },
    },
  };
}

export function computeEulerAngleError(pitch: number, yaw: number, roll: number): number {
  const d2r = Math.PI / 360;
  const c1 = Math.cos(pitch * d2r), c2 = Math.cos(yaw * d2r), c3 = Math.cos(roll * d2r);
  const s1 = Math.sin(pitch * d2r), s2 = Math.sin(yaw * d2r), s3 = Math.sin(roll * d2r);
  const qw = Math.abs(c1 * c2 * c3 - s1 * s2 * s3);
  return 2 * Math.acos(Math.min(1, Math.max(0, qw))) * 180 / Math.PI;
}

export function FreeFlightModal({ onStart }: { onStart: () => void }) {
  const { language: lang, completed, select } = useSession();
  const t = makeT(lang);

  const [params, setParams] = useState<FreeFlightParams>({ ...DEFAULT_FREE_FLIGHT_PARAMS });
  const [activePreset, setActivePreset] = useState<string>('baseline');

  const isCompleted = completed.includes(4);

  const updateParam = <K extends keyof FreeFlightParams>(key: K, value: FreeFlightParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
    setActivePreset('custom');
  };

  const applyPreset = (preset: LabPreset) => {
    setParams({ ...preset.params });
    setActivePreset(preset.id);
  };

  const totalAngle = computeEulerAngleError(params.pitch, params.yaw, params.roll).toFixed(1);
  const totalSpeed = Math.hypot(params.driftSpeed, params.speed).toFixed(2);

  const formatSign = (val: number, decimals = 1, unit = '') => {
    const formatted = val.toFixed(decimals);
    const num = Number(formatted);
    return `${num > 0 ? '+' : ''}${formatted} ${unit}`.trim();
  };

  const handleLaunch = () => {
    const custom = buildFreeFlightScenario(params);
    select(4, custom);
    onStart();
  };

  return (
    <div className="free-flight-modal">
      <p className="lab-lead">
        {t('Configure initial position, closing speed, lateral drift and 3-axis attitude to synthesize lessons from missions 1–3.',
           'Configure initial position, closing speed, lateral drift and 3-axis attitude to synthesize lessons from missions 1–3.')}
      </p>

      {/* Preset Bar */}
      <div className="lab-presets-bar">
        <span className="eyebrow"><Sparkles size={13} /> {t('PRESETS', 'PRESETS')}</span>
        <div className="lab-presets">
          {LAB_PRESETS.map(p => (
            <button
              key={p.id}
              className={`lab-preset-btn ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => applyPreset(p)}
              title={loc(lang, p.desc)}
            >
              {loc(lang, p.name)}
            </button>
          ))}
          <button
            className={`lab-preset-btn reset-btn ${activePreset === 'custom' ? 'active' : ''}`}
            onClick={() => { setParams({ ...DEFAULT_FREE_FLIGHT_PARAMS }); setActivePreset('baseline'); }}
            title={t('Reset to defaults', 'Reset to defaults')}
          >
            <RotateCcw size={12} /> {t('Reset', 'Reset')}
          </button>
        </div>
      </div>

      {/* Section 1: Translation & Lateral Motion */}
      <div className="lab-group">
        <div className="lab-group-header">
          <span className="lab-group-title"><Move size={14} /> {t('Translation & Relative Motion (M1 & M2)', 'Translation & Relative Motion (M1 & M2)')}</span>
          <span className="lab-group-badge">{t('Total Speed', 'Total Speed')}: {totalSpeed} m/s</span>
        </div>
        <div className="lab-grid">
          <label className="slider-field">
            <span>{t('Starting Distance', 'Starting Distance')} <strong>{params.distance} m</strong></span>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={params.distance}
              onChange={e => updateParam('distance', Number(e.target.value))}
            />
          </label>

          <label className="slider-field">
            <span>{t('Closing Speed', 'Closing Speed')} <strong>{params.speed.toFixed(2)} m/s</strong></span>
            <input
              type="range"
              min={0}
              max={1.0}
              step={0.05}
              value={params.speed}
              onChange={e => updateParam('speed', Number(e.target.value))}
            />
          </label>

          <label className="slider-field">
            <span>{t('Lateral Offset', 'Lateral Offset')} <strong>{formatSign(params.offset, 1, 'm')}</strong></span>
            <input
              type="range"
              min={-5.0}
              max={5.0}
              step={0.1}
              value={params.offset}
              onChange={e => updateParam('offset', Number(e.target.value))}
            />
          </label>

          <label className="slider-field highlight-field">
            <span>{t('Lateral Drift Speed', 'Lateral Drift Speed')} <strong>{formatSign(params.driftSpeed, 2, 'm/s')}</strong></span>
            <input
              type="range"
              min={-0.30}
              max={0.30}
              step={0.02}
              value={params.driftSpeed}
              onChange={e => updateParam('driftSpeed', Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {/* Section 2: Attitude Angles */}
      <div className="lab-group">
        <div className="lab-group-header">
          <span className="lab-group-title"><Compass size={14} /> {t('Initial Attitude Misalignment (M3 Training)', 'Initial Attitude Misalignment (M3 Training)')}</span>
          <span className="lab-group-badge">{t('Total Angle Error', 'Total Angle Error')}: {totalAngle}°</span>
        </div>
        <div className="lab-grid lab-grid-3">
          <label className="slider-field highlight-field">
            <span>{t('Pitch (Up/Down)', 'Pitch (Up/Down)')} <strong>{formatSign(params.pitch, 0, '°')}</strong></span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={params.pitch}
              onChange={e => updateParam('pitch', Number(e.target.value))}
            />
          </label>

          <label className="slider-field highlight-field">
            <span>{t('Yaw (Left/Right)', 'Yaw (Left/Right)')} <strong>{formatSign(params.yaw, 0, '°')}</strong></span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={params.yaw}
              onChange={e => updateParam('yaw', Number(e.target.value))}
            />
          </label>

          <label className="slider-field highlight-field">
            <span>{t('Roll (Clockwise/Counter-clockwise)', 'Roll (Clockwise/Counter-clockwise)')} <strong>{formatSign(params.roll, 0, '°')}</strong></span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={params.roll}
              onChange={e => updateParam('roll', Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {/* Section 3: Budget & Launch */}
      <div className="lab-group">
        <div className="lab-group-header">
          <span className="lab-group-title"><Flame size={14} /> {t('Thruster Fuel Budget', 'Thruster Fuel Budget')}</span>
          <span className="lab-group-badge">{params.fuel}%</span>
        </div>
        <label className="slider-field">
          <span>{t('Fuel Reserve', 'Fuel Reserve')} <strong>{params.fuel} %</strong></span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={params.fuel}
            onChange={e => updateParam('fuel', Number(e.target.value))}
          />
        </label>
      </div>

      <button className="primary-button lab-launch-btn" onClick={handleLaunch}>
        <Orbit size={17} />
        <span>{t('Load Experiment & Take Control', 'Load Experiment & Take Control')}</span>
      </button>
    </div>
  );
}
