import { makeT } from '../../i18n';
import { useState } from 'react';
import type { FlightRecord, Language } from '../../sim/types';
import { useSession } from '../../store';
import { formatTime } from '../../utils/formatters';
import { getReasonText } from '../../utils/flightReasons';

export interface FlightChartProps {
  record?: FlightRecord | null;
}

type ChartCategory = 'approach' | 'lateral' | 'attitude';

interface MetricSeries {
  key: string;
  nameZh: string;
  nameEn: string;
  unit: string;
  color: string;
  values: number[];
  tolerance?: number;
  customLabel?: string;
}

export function FlightChart({ record }: FlightChartProps) {
  const sessionLatest = useSession((s) => s.latest);
  const language = useSession((s) => s.language);
  const currentRecord = record ?? sessionLatest;

  const t = makeT(language);

  // Select default category tab based on mission
  const defaultCategory: ChartCategory =
    currentRecord?.scenario === 2
      ? 'lateral'
      : currentRecord?.scenario === 3
      ? 'attitude'
      : 'approach';

  const [activeTab, setActiveTab] = useState<ChartCategory>(defaultCategory);

  if (!currentRecord?.samples.length) return null;

  const samples = currentRecord.samples;
  const cfg = currentRecord.config;
  const maxTime = Math.max(1, samples[samples.length - 1].time);
  const width = 520;
  const height = 125;

  // Prepare 2 comparative series curves based on selected tab
  let seriesList: MetricSeries[] = [];

  if (activeTab === 'approach') {
    seriesList = [
      {
        key: 'distance',
        nameZh: cfg.id === 1 ? 'Hold Distance' : 'Port Distance',
        nameEn: cfg.id === 1 ? 'Hold Distance' : 'Port Distance',
        unit: 'm',
        color: '#b3f56b',
        values: samples.map((s) => Math.max(0, s.distance)),
        tolerance: cfg.id === 1 ? cfg.targetZ : cfg.id === 4 ? 0.35 : undefined,
        customLabel:
          cfg.id === 1
            ? `Target Hold Point ${cfg.targetZ.toFixed(2)} m (±${cfg.positionTolerance} m)`
            : cfg.id === 4
            ? 'Target Contact ≤ 0.35 m'
            : undefined
      },
      {
        key: 'speed',
        nameZh: 'Speed',
        nameEn: 'Speed',
        unit: 'm/s',
        color: '#7bc7db',
        values: samples.map((s) => s.speed),
        tolerance: cfg.speedTolerance
      }
    ];
  } else if (activeTab === 'lateral') {
    // Lateral offset and estimated lateral speed
    seriesList = [
      {
        key: 'lateral',
        nameZh: 'Lateral Offset',
        nameEn: 'Lateral Offset',
        unit: 'm',
        color: '#87e8de',
        values: samples.map((s) => s.lateral),
        tolerance: cfg.positionTolerance
      },
      {
        key: 'speed',
        nameZh: 'Relative Speed',
        nameEn: 'Relative Speed',
        unit: 'm/s',
        color: '#7bc7db',
        values: samples.map((s) => s.speed),
        tolerance: 0.04
      }
    ];
  } else {
    // Attitude error and estimated angular speed
    seriesList = [
      {
        key: 'angle',
        nameZh: 'Attitude Error',
        nameEn: 'Attitude Error',
        unit: '°',
        color: '#ffa39e',
        values: samples.map((s) => s.angle),
        tolerance: cfg.angleTolerance
      },
      {
        key: 'speed',
        nameZh: 'Closing Speed',
        nameEn: 'Closing Speed',
        unit: 'm/s',
        color: '#7bc7db',
        values: samples.map((s) => s.speed),
        tolerance: cfg.angularSpeedTolerance
      }
    ];
  }

  return (
    <div className="flight-charts-enhanced">
      {/* Convenient data view switching for missions 2/3/4 or custom lab */}
      <div className="chart-tab-bar">
        <button
          className={`chart-tab ${activeTab === 'approach' ? 'active' : ''}`}
          onClick={() => setActiveTab('approach')}
        >
          {t('Approach (Dist/Speed)', 'Approach (Dist/Speed)')}
        </button>
        <button
          className={`chart-tab ${activeTab === 'lateral' ? 'active' : ''}`}
          onClick={() => setActiveTab('lateral')}
        >
          {t('Lateral Drift (M2)', 'Lateral Drift (M2)')}
        </button>
        <button
          className={`chart-tab ${activeTab === 'attitude' ? 'active' : ''}`}
          onClick={() => setActiveTab('attitude')}
        >
          {t('Attitude (M3)', 'Attitude (M3)')}
        </button>
      </div>

      <div className="flight-charts">
        {seriesList.map((series, index) => {
          const maxVal = Math.max(...series.values, series.tolerance ?? 0, 0.1);
          const points = samples
            .map((p, i) => {
              const x = 10 + (p.time / maxTime) * (width - 20);
              const y = height - 15 - (series.values[i] / maxVal) * (height - 30);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

          const toleranceY =
            series.tolerance !== undefined && series.tolerance <= maxVal
              ? height - 15 - (series.tolerance / maxVal) * (height - 30)
              : null;

          return (
            <div key={series.key + index} className="chart-card">
              <div className="chart-caption">
                <span>
                  {t(series.nameZh, series.nameEn)} / {series.unit}
                  {series.customLabel ? (
                    <small className="chart-tol-label">
                      ({series.customLabel})
                    </small>
                  ) : series.tolerance !== undefined ? (
                    <small className="chart-tol-label">
                      ({t('Limit', 'Limit')} ≤ {series.tolerance} {series.unit})
                    </small>
                  ) : null}
                </span>
                <span className="chart-max-val">
                  {t('Peak', 'Peak')}: {maxVal.toFixed(2)}
                </span>
              </div>

              <svg
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`${series.nameEn} over time`}
              >
                {/* Background axis */}
                <path
                  d={`M10 10V${height - 15}H${width - 10}`}
                  stroke="#3d4648"
                  fill="none"
                />

                {/* Tolerance threshold dashed reference line */}
                {toleranceY !== null && (
                  <line
                    x1="10"
                    x2={width - 10}
                    y1={toleranceY}
                    y2={toleranceY}
                    stroke="#e6a23c"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                    opacity="0.8"
                  />
                )}

                {/* Flight event vertical lines */}
                {currentRecord.events
                  .filter((e) => e.type !== 'start')
                  .map((e, i) => {
                    const eventX = 10 + (e.time / maxTime) * (width - 20);
                    return (
                      <line
                        key={i}
                        x1={eventX}
                        x2={eventX}
                        y1="10"
                        y2={height - 15}
                        stroke={e.type === 'failed' ? '#eb9c7b' : '#677874'}
                        strokeDasharray="3 4"
                      />
                    );
                  })}

                {/* Telemetry polyline */}
                <polyline
                  points={points}
                  stroke={series.color}
                  strokeWidth="2"
                  fill="none"
                />
              </svg>

              <div className="chart-time">
                <span>0 s</span>
                <span>{maxTime.toFixed(1)} s</span>
              </div>
            </div>
          );
        })}

        {/* Key event sequence */}
        <ul className="event-list">
          {currentRecord.events
            .filter((e) => e.type !== 'start')
            .slice(-4)
            .map((e, i) => (
              <li key={i}>
                <time>{formatTime(e.time)}</time>
                {e.reason
                  ? getReasonText(e.reason, language)
                  : e.type === 'brake'
                  ? t('Assist brake applied', 'Assist brake applied')
                  : e.type === 'success'
                  ? t('Mission criteria reached', 'Mission criteria reached')
                  : e.type}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
