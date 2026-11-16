import { makeT } from '../../i18n';
import { Crosshair } from 'lucide-react';
import { angleError, angularSpeed, attitude } from '../../sim/engine';
import { useSession } from '../../store';

export function AttitudeMonitor() {
  const language = useSession((s) => s.language);
  const flight = useSession((s) => s.flight);

  const t = makeT(language);
  const angles = attitude(flight);
  const totalAngle = angleError(flight);
  const rate = angularSpeed(flight);

  const axisLabels = [
    t('PITCH', 'PITCH'),
    t('YAW', 'YAW'),
    t('ROLL', 'ROLL')
  ];

  const isAligned = totalAngle <= 2.0;

  return (
    <section className="attitude-panel">
      <div className="panel-heading">
        <h3>
          <Crosshair size={17} />
          {t('Attitude monitor', 'Attitude monitor')}
          {isAligned && <span className="aligned-tag">{t('● ALIGNED', '● ALIGNED')}</span>}
        </h3>
        <span className="eyebrow">{t('DEG', 'DEG')}</span>
      </div>

      <div className="attitude-values">
        {angles.map((v, i) => {
          const inSafe = Math.abs(v) <= 2.0;
          return (
            <div key={i}>
              <span>{axisLabels[i]}</span>
              <strong className={inSafe ? 'val-aligned' : ''}>
                {v.toFixed(1)}
                <small>°</small>
              </strong>
              <div className="angle-track">
                <i style={{ left: `${Math.max(4, Math.min(96, 50 + v))}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <p>
        {t('Total error', 'Total error')}{' '}
        <b className={isAligned ? 'val-aligned' : ''}>{totalAngle.toFixed(1)}°</b>
        <span>
          {t('Angular rate', 'Angular rate')} <b>{rate.toFixed(1)}°/s</b>
        </span>
      </p>
    </section>
  );
}
