import { makeT } from '../../i18n';
import { Compass, Flame, ShieldAlert } from 'lucide-react';
import type { Language } from '../../sim/types';
import type { LiftoffState, RocketVehicleConfig, SasMode } from '../../sim/liftoff';

export interface KspNavballProps {
  state: LiftoffState;
  vehicle: RocketVehicleConfig;
  language: Language;
  onSetSas: (mode: SasMode) => void;
  onSteerPitch: (dir: number) => void;
}

export function KspNavball({
  state,
  vehicle,
  language,
  onSetSas,
  onSteerPitch
}: KspNavballProps) {
  const t = makeT(language);

  // Navball pitch mapping: pitch = 90° zenith (blue), pitch = 0° horizon
  const pitch = state.pitchDeg;
  const prograde =
    state.orbit.altitudeM < 70000
      ? state.orbit.surfaceProgradeDeg
      : state.orbit.orbitalProgradeDeg;

  // Horizon offset relative to center (cx=76, cy=76):
  // When pitch = 0°, horizon passes through center (offset = 0)
  // When pitch = 90°, full sky, horizon is +62px below center
  const horizonOffsetY = (pitch / 90) * 62;
  const progradeOffsetY = ((pitch - prograde) / 90) * 62;

  const qAlphaPct = Math.min(100, (state.qAlphaKpaDeg / vehicle.maxQAlphaKpaDeg) * 100);
  const stressColor =
    qAlphaPct > 75 ? '#ff5c5c' : qAlphaPct > 40 ? '#ffb84d' : '#b8f566';
  const stressTextColor =
    qAlphaPct > 75 ? '#d62f1f' : qAlphaPct > 40 ? '#b96a00' : '#2f7d32';

  const sasOptions: { mode: SasMode; labelZh: string; labelEn: string; tipZh: string }[] = [
    {
      mode: 'hold',
      labelZh: 'Hold Pitch',
      labelEn: 'Hold Pitch',
      tipZh: 'Hold current pitch angle'
    },
    {
      mode: 'prograde',
      labelZh: 'Prograde ◯',
      labelEn: 'Prograde ◯',
      tipZh: 'Follow yellow velocity circle (Zero AoA at Max-Q)'
    },
    {
      mode: 'pitch_program',
      labelZh: 'Auto Turn',
      labelEn: 'Auto Turn',
      tipZh: 'Pitch down along standard NASA flight profile'
    },
    {
      mode: 'manual',
      labelZh: 'Manual',
      labelEn: 'Manual',
      tipZh: 'Full manual gimbal steering'
    }
  ];

  return (
    <div className="ksp-panel liftoff-navball-panel" data-testid="ksp-navball-panel">
      <div className="ksp-panel-header">
        <h3>
          <Compass size={16} color="var(--lime)" />
          <span>{t('Attitude Navball & Steering', 'Attitude Navball & Steering')}</span>
        </h3>
        <span className="ksp-panel-sub">
          {t('Pitch {0}° · Prograde {1}°', 'Pitch {0}° · Prograde {1}°', { 0: pitch.toFixed(1), 1: prograde.toFixed(1) })}
        </span>
      </div>

      <div className="ksp-navball-layout">
        {/* Left: KSP Navball SVG */}
        <div className="navball-svg-wrap" title={t('Blue = Sky (90° Up), Brown = Ground (0° Horizon), Yellow circle = Prograde velocity vector', 'Blue = Sky (90° Up), Brown = Ground (0° Horizon), Yellow circle = Prograde velocity vector')}>
          <svg viewBox="0 0 152 152" width="152" height="152" aria-label="Navball">
            <defs>
              <clipPath id="navball-clip">
                <circle cx="76" cy="76" r="72" />
              </clipPath>
              <radialGradient id="navball-gloss" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="70%" stopColor="rgba(0,0,0,0.0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
              </radialGradient>
            </defs>

            <g clipPath="url(#navball-clip)">
              {/* Sky background */}
              <rect x="0" y="0" width="152" height="152" fill="#1b5e91" />

              {/* Ground hemisphere */}
              <rect
                x="-20"
                y={76 + horizonOffsetY}
                width="192"
                height="200"
                fill="#7c4728"
              />

              {/* Horizon line */}
              <line
                x1="0"
                y1={76 + horizonOffsetY}
                x2="152"
                y2={76 + horizonOffsetY}
                stroke="#ffffff"
                strokeWidth="2"
              />

              {/* Pitch Ladder */}
              {[90, 75, 60, 45, 30, 15, -15].map((deg) => {
                const y = 76 + ((pitch - deg) / 90) * 62;
                if (y < 6 || y > 146) return null;
                const isMajor = deg % 30 === 0;
                return (
                  <g key={deg}>
                    {deg === 90 ? (
                      <circle cx="76" cy={y} r="4" fill="none" stroke="#d9f0ff" strokeWidth="1.5" />
                    ) : (
                      <path
                        d={isMajor ? `M 52 ${y} H 64 M 88 ${y} H 100` : `M 62 ${y} H 90`}
                        stroke="rgba(255,255,255,0.75)"
                        strokeWidth={isMajor ? 1.5 : 1}
                      />
                    )}
                    {isMajor && (
                      <text
                        x="76"
                        y={deg === 90 ? Math.max(10, y - 18) : y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="rgba(255,255,255,0.88)"
                      fontSize="11"
                        fontFamily="monospace"
                      >
                        {deg}°
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Prograde vector marker */}
              {Math.abs(progradeOffsetY) < 70 && (
                <g transform={`translate(76, ${76 + progradeOffsetY})`}>
                  <circle
                    cx="0"
                    cy="0"
                    r="8"
                    fill="none"
                    stroke="#ffe14d"
                    strokeWidth="2.2"
                  />
                  <circle cx="0" cy="0" r="1.8" fill="#ffe14d" />
                  <line x1="0" y1="-8" x2="0" y2="-13" stroke="#ffe14d" strokeWidth="2" />
                  <line x1="-8" y1="0" x2="-13" y2="0" stroke="#ffe14d" strokeWidth="2" />
                  <line x1="8" y1="0" x2="13" y2="0" stroke="#ffe14d" strokeWidth="2" />
                </g>
              )}

              {/* Level Attitude Reticle */}
              <path
                d="M 52 76 L 66 76 L 71 82 L 76 76 L 81 82 L 86 76 L 100 76"
                fill="none"
                stroke="#ff9838"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Glass gloss */}
              <circle cx="76" cy="76" r="72" fill="url(#navball-gloss)" />
            </g>

            {/* Outer bezel */}
            <circle
              cx="76"
              cy="76"
              r="72"
              fill="none"
              stroke="rgba(184, 245, 102, 0.38)"
              strokeWidth="2.5"
            />
          </svg>
        </div>

        <div className="ksp-attitude-side">
          {/* SAS and manual pitch controls */}
          <div className="ksp-attitude-controls" role="group" aria-label={t('Navball & Steering', 'Navball & Steering')}>
            {sasOptions.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                className={`sas-mode-btn ${state.sasMode === opt.mode ? 'active' : ''}`}
                onClick={() => onSetSas(opt.mode)}
                title={opt.tipZh}
                aria-pressed={state.sasMode === opt.mode}
              >
                {t(opt.labelZh, opt.labelEn)}
              </button>
            ))}
  
            <button
              type="button"
              className="pitch-steer-btn"
              onPointerDown={() => onSteerPitch(1)}
              onPointerUp={() => onSteerPitch(0)}
              onPointerLeave={() => onSteerPitch(0)}
              onPointerCancel={() => onSteerPitch(0)}
            >
              ⬆ {t('Pitch Up [A]', 'Pitch Up [A]')}
            </button>
            <button
              type="button"
              className="pitch-steer-btn"
              onPointerDown={() => onSteerPitch(-1)}
              onPointerUp={() => onSteerPitch(0)}
              onPointerLeave={() => onSteerPitch(0)}
              onPointerCancel={() => onSteerPitch(0)}
            >
              ⬇ {t('Pitch East [D]', 'Pitch East [D]')}
            </button>
          </div>
          {/* Max-Q aero stress monitor */}
          <div className="aero-stress-meter">
            <div
              className="aero-stress-top"
              title={t(
                'Aerodynamic bending loads increase when the rocket turns sharply in dense air.',
                'Aerodynamic bending loads increase when the rocket turns sharply in dense air.'
              )}
            >
              <span>
                <ShieldAlert size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                {t('Aerodynamic Stress', 'Aerodynamic Stress')}
                <strong style={{ color: stressTextColor }}>{qAlphaPct.toFixed(0)}%</strong>
              </span>
              <span className="liftoff-pressure-readout">
                <Flame size={10} style={{ verticalAlign: -1 }} />{' '}
                {t('Dyn Press q: ', 'Dyn Press q: ')}
                <strong>{(state.dynamicPressurePa / 1000).toFixed(1)} kPa</strong>
              </span>
            </div>
            <div className="aero-stress-bar">
              <div
                className="aero-stress-fill"
                style={{
                  width: `${qAlphaPct}%`,
                  background: stressColor
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
