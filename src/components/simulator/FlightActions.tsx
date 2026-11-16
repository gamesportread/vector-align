import { loc, makeT } from '../../i18n';
import { BookOpen, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react';
import { tone, useSession } from '../../store';

export interface FlightActionsProps {
  onOpenBriefing: () => void;
}

export function FlightActions({ onOpenBriefing }: FlightActionsProps) {
  const language = useSession((s) => s.language);
  const config = useSession((s) => s.config);
  const flight = useSession((s) => s.flight);
  const running = useSession((s) => s.running);
  const reset = useSession((s) => s.reset);
  const start = useSession((s) => s.start);
  const pause = useSession((s) => s.pause);
  const resume = useSession((s) => s.resume);

  const t = makeT(language);
  const isFailed = flight.status === 'failed';
  const isPaused = flight.status === 'flying' && !running;

  const handlePrimaryClick = () => {
    tone();
    if (isFailed) {
      start();
    } else if (running) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      start();
    }
  };

  return (
    <div className="flight-actions">
      <div className="action-buttons">
        <button
          className="icon-button reset"
          aria-label={t('Reset mission', 'Reset mission')}
          onClick={() => reset()}
          title={t('Reset mission', 'Reset mission')}
        >
          <RotateCcw size={16} />
        </button>

        <button
          className="secondary-button"
          onClick={onOpenBriefing}
          title={t('Mission strategy & briefing', 'Mission strategy & briefing')}
        >
          <BookOpen size={15} />
          {t('Briefing', 'Briefing')}
        </button>

        <button
          className="secondary-button"
          onClick={() => start(true)}
          title={t('Watch autopilot demo', 'Watch autopilot demo')}
        >
          <Play size={14} />
          {t('Watch demo', 'Watch demo')}
        </button>

        <button
          className="primary-button"
          onClick={handlePrimaryClick}
        >
          {isFailed ? <RotateCcw size={16} /> : running ? <Pause size={16} /> : <Play size={16} />}
          <span>
            {isFailed
              ? t('Retry (R)', 'Retry (R)')
              : running
              ? t('Pause', 'Pause')
              : isPaused
              ? t('Resume', 'Resume')
              : t('Take control', 'Take control')}
          </span>
        </button>
      </div>

      <div className="constraint">
        <ShieldCheck size={14} />
        <span>{loc(language, config.constraints)}</span>
      </div>
    </div>
  );
}
