import { htmlLang, loc, makeT } from '../../i18n';
import { Radio } from 'lucide-react';
import { scenarios } from '../../sim/scenarios';
import { useSession } from '../../store';
import { ReviewContent } from '../modals/ReviewModal';

export function FlightLog() {
  const language = useSession((s) => s.language);
  const latest = useSession((s) => s.latest);

  const t = makeT(language);
  const scenarioConfig = scenarios.find((c) => c.id === latest?.scenario);

  return (
    <section className="content-page">
      <span className="eyebrow">{t('FLIGHT RECORDER', 'FLIGHT RECORDER')}</span>
      <h1>{t('Your flight log', 'Your flight log')}</h1>

      {latest ? (
        <>
          <p>
            {scenarioConfig ? loc(language, scenarioConfig.title) : ''} ·{' '}
            {new Date(latest.date).toLocaleString(htmlLang(language))}{' '}
            {latest.demo ? '· DEMO' : ''}
          </p>
          <ReviewContent />
        </>
      ) : (
        <div className="empty-state">
          <Radio size={38} />
          <h3>{t('Your first flight is waiting.', 'Your first flight is waiting.')}</h3>
          <p>
            {t(
              'Finish a mission to review your latest trajectory and debrief here.',
              'Finish a mission to review your latest trajectory and debrief here.'
            )}
          </p>
        </div>
      )}
    </section>
  );
}
