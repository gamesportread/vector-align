import { loc, makeT } from '../../i18n';
import { ArrowRight, Check, ChevronRight, LockKeyhole, Orbit, ShieldCheck } from 'lucide-react';
import { scenarios } from '../../sim/scenarios';
import { useSession } from '../../store';

export interface SidebarProps {
  isOpenMobile: boolean;
  onSelectMission: (id: number) => void;
  onOpenFreeFlight: () => void;
  onOpenGuide: () => void;
}

export function Sidebar({
  isOpenMobile,
  onSelectMission,
  onOpenFreeFlight,
  onOpenGuide
}: SidebarProps) {
  const language = useSession((s) => s.language);
  const completed = useSession((s) => s.completed);
  const activeLevel = useSession((s) => s.activeLevel);
  const currentId = useSession((s) => s.config.id);

  const t = makeT(language);
  const isLabUnlocked = completed.includes(4);

  return (
    <aside className={`sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
      <div className="course-label">
        <span className="eyebrow">{t('FLIGHT PROGRAM 01', 'FLIGHT PROGRAM 01')}</span>
        <span className="small-pill">{t('LEO', 'LEO')}</span>
      </div>

      <h2>{t('Your approach starts here.', 'Your approach starts here.')}</h2>
      <p className="sidebar-intro">
        {t('The final 100 metres. Every impulse matters.', 'The final 100 metres. Every impulse matters.')}
      </p>

      <div className="progress-caption">
        <span>{t('Course progress', 'Course progress')}</span>
        <strong>
          {completed.length}
          <span> / 4</span>
        </strong>
      </div>

      <div className="progress-track">
        {scenarios.map((sc) => (
          <span
            key={sc.id}
            className={completed.includes(sc.id) ? 'complete' : ''}
          />
        ))}
      </div>

      <div className="mission-list">
        {scenarios.map((sc) => {
          const isDone = completed.includes(sc.id);
          const isSelected = activeLevel === sc.id;
          return (
            <button
              key={sc.id}
              className={`mission-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectMission(sc.id)}
            >
              <span className="mission-number">
                {isDone ? <><Check size={18} /><span className="sr-only">0{sc.id}</span></> : String(sc.id).padStart(2, '0')}
              </span>
              <span>
                <strong>{loc(language, sc.title)}</strong>
                <small>{loc(language, sc.subtitle)}</small>
              </span>
              {isSelected && <ChevronRight size={15} />}
            </button>
          );
        })}
      </div>

      <button
        className="free-link unlocked"
        onClick={onOpenFreeFlight}
      >
        <Orbit size={18} />
        <span>{t('Free-flight lab', 'Free-flight lab')}</span>
        <ChevronRight size={15} />
      </button>

      <div className="sidebar-note">
        <div className="note-orbit">
          <Orbit size={25} />
        </div>
        <span className="eyebrow">{t('LEARN BY DOING', 'LEARN BY DOING')}</span>
        <p>
          {t('No brake pedals in space. Just you, and Newton’s laws.', 'No brake pedals in space. Just you, and Newton’s laws.')}
        </p>
        <button onClick={onOpenGuide}>
          {t('Explore the science', 'Explore the science')}
          <ArrowRight size={15} />
        </button>
      </div>

      <div className="local-status">
        <ShieldCheck size={14} />
        {t('Progress saved on this device', 'Progress saved on this device')}
      </div>
    </aside>
  );
}
