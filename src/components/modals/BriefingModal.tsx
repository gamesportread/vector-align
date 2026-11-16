import { loc, makeT } from '../../i18n';
import { CheckCircle2, Gamepad2, Lightbulb, Lock, Play, Rocket, Target } from 'lucide-react';
import { useSession } from '../../store';

export interface BriefingModalProps {
  onStartFlight: () => void;
}

export function BriefingModal({ onStartFlight }: BriefingModalProps) {
  const language = useSession((s) => s.language);
  const config = useSession((s) => s.config);

  const t = makeT(language);

  return (
    <div className="briefing-modal-content">
      <span className="eyebrow">{t('MISSION 0{0} BRIEFING', 'MISSION 0{0} BRIEFING', { 0: config.id })}</span>
      <h3 className="briefing-modal-title">{loc(language, config.title)}</h3>

      <div className="briefing-card-grid">
        <div className="briefing-card goal-card">
          <div className="card-tag">
            <Target size={15} />
            <span>{t('SPECIFIC GOAL', 'SPECIFIC GOAL')}</span>
          </div>
          <p className="card-text">
            {config.objective ? loc(language, config.objective) : loc(language, config.subtitle)}
          </p>
        </div>

        <div className="briefing-card hint-card">
          <div className="card-tag">
            <Gamepad2 size={15} />
            <span>{t('CONTROLS & HOW-TO', 'CONTROLS & HOW-TO')}</span>
          </div>
          <p className="card-text">
            {config.hint ? loc(language, config.hint) : loc(language, config.brief)}
          </p>
        </div>

        <div className="briefing-card criteria-card">
          <div className="card-tag">
            <CheckCircle2 size={15} />
            <span>{t('PASS CRITERIA', 'PASS CRITERIA')}</span>
          </div>
          <p className="card-text">
            {config.passCriteria ? loc(language, config.passCriteria) : ''}
          </p>
        </div>
      </div>

      <div className="briefing-note-box">
        <div className="note-title">
          <Lightbulb size={15} />
          <span>{t('FLIGHT PRINCIPLE', 'FLIGHT PRINCIPLE')}</span>
        </div>
        <p>{loc(language, config.lesson)}</p>
      </div>

      <div className="briefing-fun-fact-box">
        <div className="fun-fact-title">
          <Rocket size={15} />
          <span>{t('🚀 Space Fun Fact: Why Crew Dragon Has a Nose Cone Hatch', '🚀 Space Fun Fact: Why Crew Dragon Has a Nose Cone Hatch')}</span>
        </div>
        <p>
          {t(
            'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!',
            'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station!'
          )}
        </p>
        <p>
          {t(
            'International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!',
            'International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!'
          )}
        </p>
      </div>

      <div className="briefing-constraints-line">
        <Lock size={13} />
        <span>{loc(language, config.constraints)}</span>
      </div>

      <button className="primary-button briefing-start-btn" onClick={onStartFlight}>
        <Play size={17} />
        {t('Take control & Start', 'Take control & Start')}
      </button>
    </div>
  );
}
