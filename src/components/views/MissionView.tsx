import { loc, makeT } from '../../i18n';
import { useEffect, useState } from 'react';
import { BookOpen, Compass, Sparkles, Target } from 'lucide-react';
import type { ActiveAlert } from '../../sim/feedback';
import { useSession } from '../../store';
import { AttitudeMonitor } from '../simulator/AttitudeMonitor';
import { ControlPanelSection } from '../simulator/ControlPad';
import { SimulatorView } from '../simulator/SimulatorView';
import '../liftoff/liftoff.css';

export interface MissionViewProps {
  constraintAlert: ActiveAlert | null;
  activeShakeAxis: string | null;
  onOpenBriefing: () => void;
  onOpenFreeFlight?: () => void;
}

export function MissionView({
  constraintAlert,
  activeShakeAxis,
  onOpenBriefing,
  onOpenFreeFlight
}: MissionViewProps) {
  const language = useSession((s) => s.language);
  const config = useSession((s) => s.config);
  const [viewTab, setViewTab] = useState<'sim' | 'objective'>('sim');

  useEffect(() => {
    setViewTab('sim');
  }, [config.id]);

  const t = makeT(language);

  return (
    <>
      <header className="liftoff-stage-header">
        <h1 className="liftoff-stage-title">
          <span className="title-number">0{config.id}</span>
          {loc(language, config.title)}
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
              <p className="liftoff-objective-lead">{loc(language, config.subtitle)}</p>
              <p>{loc(language, config.brief)}</p>
              <p className="liftoff-objective-focus">
                {config.objective ? loc(language, config.objective) : loc(language, config.brief)}
              </p>
            </article>

            <article className="liftoff-objective-card">
              <h3>{t('PASS CRITERIA', 'PASS CRITERIA')}</h3>
              <p className="liftoff-objective-criteria">
                {config.passCriteria ? loc(language, config.passCriteria) : ''}
              </p>

              <div className="liftoff-objective-science">
                <div className="liftoff-objective-badge is-science">
                  <Sparkles size={14} />
                  <span>{t('FLIGHT PRINCIPLE', 'FLIGHT PRINCIPLE')}</span>
                </div>
                <p>{loc(language, config.lesson)}</p>
                <p className="liftoff-science-lesson">{loc(language, config.constraints)}</p>
              </div>
            </article>

            <article className="liftoff-objective-card is-wide">
              <h3>{t('CONTROLS & HOW-TO', 'CONTROLS & HOW-TO')}</h3>
              <p>{config.hint ? loc(language, config.hint) : loc(language, config.brief)}</p>

              <div className="liftoff-key-legend">
                <div className="liftoff-key-item">
                  <kbd>W / S · A / D</kbd>
                  <span>{t('Translate Up/Down & Left/Right', 'Translate Up/Down & Left/Right')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>F / R</kbd>
                  <span>{t('Translate Forward / Reverse', 'Translate Forward / Reverse')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>↑↓←→ · Q / E</kbd>
                  <span>{t('Rotate Pitch / Yaw / Roll', 'Rotate Pitch / Yaw / Roll')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>Space</kbd>
                  <span>{t('Precision RCS Brake', 'Precision RCS Brake')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>1</kbd>
                  <span>{t('Open / Close Nosecone Hatch', 'Open / Close Nosecone Hatch')}</span>
                </div>
                <div className="liftoff-key-item">
                  <kbd>R (Review)</kbd>
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
                  onClick={onOpenBriefing}
                >
                  <BookOpen size={15} />
                  <span>{t('Briefing', 'Briefing')}</span>
                </button>
                {onOpenFreeFlight && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onOpenFreeFlight}
                  >
                    <Compass size={15} />
                    <span>{t('Free-flight lab', 'Free-flight lab')}</span>
                  </button>
                )}
              </div>
            </article>
          </div>
        </section>
      ) : (
        <>
          {/* 3D simulator and HUD */}
          <SimulatorView constraintAlert={constraintAlert} onOpenBriefing={onOpenBriefing} />

          {/* Control panel and attitude monitor columns */}
          <div className="lower-panels">
            <ControlPanelSection activeShakeAxis={activeShakeAxis} />
            <AttitudeMonitor />
          </div>
        </>
      )}
    </>
  );
}

