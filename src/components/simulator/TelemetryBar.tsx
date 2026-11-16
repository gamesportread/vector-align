import { makeT } from '../../i18n';
import { angleError, angularSpeed, lateralError } from '../../sim/engine';
import { useSession } from '../../store';
import { Metric } from '../common/Metric';
import { FlightActions } from './FlightActions';

export interface TelemetryBarProps {
  onOpenBriefing?: () => void;
}

export function TelemetryBar({ onOpenBriefing = () => {} }: TelemetryBarProps) {
  const language = useSession((s) => s.language);
  const config = useSession((s) => s.config);
  const flight = useSession((s) => s.flight);
  const mode = useSession((s) => s.mode);

  const t = makeT(language);
  const rotationReadout = config.id === 3 || mode === 'rotate';

  const portDistanceVal = Math.max(0, flight.position[2]).toFixed(2);
  const portDistanceDetail =
    config.id === 1
      ? t('Hold point 8.00 m', 'Hold point 8.00 m')
      : t('Relative to docking port', 'Relative to docking port');

  const secondMetricLabel = rotationReadout
    ? t('ATTITUDE ERROR', 'ATTITUDE ERROR')
    : t('CLOSING SPEED', 'CLOSING SPEED');
  const secondMetricVal = (
    rotationReadout ? angleError(flight) : -flight.velocity[2]
  ).toFixed(2);
  const secondMetricUnit = rotationReadout ? '°' : 'm/s';
  const secondMetricDetail = rotationReadout
    ? t('Target below 2°', 'Target below 2°')
    : t('Negative means moving away', 'Negative means moving away');

  const thirdMetricLabel = rotationReadout
    ? t('ANGULAR RATE', 'ANGULAR RATE')
    : t('LATERAL OFFSET', 'LATERAL OFFSET');
  const thirdMetricVal = (
    rotationReadout ? angularSpeed(flight) : lateralError(flight)
  ).toFixed(2);
  const thirdMetricUnit = rotationReadout ? '°/s' : 'm';
  const thirdMetricDetail = rotationReadout
    ? t('Stop rotating after alignment', 'Stop rotating after alignment')
    : `X ${flight.position[0].toFixed(2)} · Y ${flight.position[1].toFixed(2)}`;

  return (
    <div className="telemetry">
      <div className="telemetry-metrics">
        <Metric
          label={t('PORT DISTANCE', 'PORT DISTANCE')}
          value={portDistanceVal}
          unit="m"
          detail={portDistanceDetail}
        />
        <Metric
          label={secondMetricLabel}
          value={secondMetricVal}
          unit={secondMetricUnit}
          accent
          detail={secondMetricDetail}
        />
        <Metric
          label={thirdMetricLabel}
          value={thirdMetricVal}
          unit={thirdMetricUnit}
          detail={thirdMetricDetail}
        />
        <Metric
          label={t('THRUSTER RESERVE', 'THRUSTER RESERVE')}
          value={flight.fuel.toFixed(0)}
          unit="%"
          detail={t('Teaching resource budget', 'Teaching resource budget')}
          fuel={flight.fuel}
        />
      </div>

      <FlightActions onOpenBriefing={onOpenBriefing} />
    </div>
  );
}
