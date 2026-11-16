import { useState } from 'react';
import { makeT } from '../../i18n';
import type { LandingSample } from '../../sim/landing';
import type { Language } from '../../sim/types';

type LandingChartTab = 'descent' | 'thermal';

export function LandingTelemetryChart({
  samples,
  language
}: {
  samples: LandingSample[];
  language: Language;
}) {
  const t = makeT(language);
  const [tab, setTab] = useState<LandingChartTab>('descent');

  if (samples.length < 2) return null;

  const width = 520;
  const height = 128;
  const padL = 12;
  const padR = 12;
  const padT = 14;
  const padB = 18;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxTime = Math.max(1, samples[samples.length - 1].time - samples[0].time);
  const t0 = samples[0].time;

  const buildPath = (values: number[], fixedMax?: number) => {
    const minV = 0;
    const maxV = Math.max(1e-3, fixedMax ?? Math.max(...values, 1));
    return values
      .map((val, idx) => {
        const timeRatio = (samples[idx].time - t0) / maxTime;
        const xRatio = maxTime > 240 ? Math.pow(timeRatio, 0.48) : timeRatio;
        const x = padL + xRatio * plotW;
        const norm = Math.max(0, Math.min(1, (val - minV) / (maxV - minV)));
        const y = padT + (1 - norm) * plotH;
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const primarySeries =
    tab === 'descent'
      ? {
          label: t('Altitude', 'Altitude'),
          unit: 'km',
          color: '#b8f566',
          values: samples.map((s) => s.altitudeKm),
          latest: `${samples[samples.length - 1].altitudeKm.toFixed(2)} km`
        }
      : {
          label: t('G-Load', 'G-Load'),
          unit: 'G',
          color: '#facc15',
          values: samples.map((s) => s.gLoad),
          fixedMax: 9,
          latest: `${Math.max(...samples.map((s) => s.gLoad)).toFixed(1)} G`
        };

  const secondarySeries =
    tab === 'descent'
      ? {
          label: t('Descent Speed', 'Descent Speed'),
          unit: 'm/s',
          color: '#38bdf8',
          values: samples.map((s) => s.speedMs),
          latest: `${samples[samples.length - 1].speedMs.toFixed(1)} m/s`
        }
      : {
          label: t('Shield Temp', 'Shield Temp'),
          unit: '°C',
          color: '#fb923c',
          values: samples.map((s) => s.tempC),
          fixedMax: 2200,
          latest: `${Math.round(Math.max(...samples.map((s) => s.tempC)))}°C`
        };

  return (
    <div className="landing-debrief-chart">
      <div className="landing-debrief-chart-head">
        <span className="eyebrow">{t('Reentry Telemetry Trace', 'Reentry Telemetry Trace')}</span>
        <div className="landing-chart-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'descent'}
            className={tab === 'descent' ? 'active' : ''}
            onClick={() => setTab('descent')}
          >
            {t('Altitude & Speed', 'Altitude & Speed')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'thermal'}
            className={tab === 'thermal' ? 'active' : ''}
            onClick={() => setTab('thermal')}
          >
            {t('G-Load & Thermal', 'G-Load & Thermal')}
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="landing-chart-svg"
        role="img"
        aria-label={t('Reentry Telemetry Trace', 'Reentry Telemetry Trace')}
      >
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padT + ratio * plotH;
          return (
            <line
              key={ratio}
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeDasharray="4 4"
            />
          );
        })}
        <path
          d={buildPath(primarySeries.values, primarySeries.fixedMax)}
          fill="none"
          stroke={primarySeries.color}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <path
          d={buildPath(secondarySeries.values, secondarySeries.fixedMax)}
          fill="none"
          stroke={secondarySeries.color}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>

      <div className="landing-chart-legend">
        <span>
          <i style={{ background: primarySeries.color }} />
          {primarySeries.label}: <strong>{primarySeries.latest}</strong>
        </span>
        <span>
          <i style={{ background: secondarySeries.color }} />
          {secondarySeries.label}: <strong>{secondarySeries.latest}</strong>
        </span>
      </div>
    </div>
  );
}
