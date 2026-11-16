import { LanguageSelect } from '../common/LanguageSelect';
import { makeT } from '../../i18n';
import { BookOpen, Check, Orbit, Radio, Volume2, VolumeX } from 'lucide-react';
import type { NavigationTab } from '../../types/app';
import { tone, useSession } from '../../store';

export interface TopbarSecondaryItem {
  id: number;
  label: string;
  title?: string;
  completed?: boolean;
}

export interface TopbarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onReturnHome?: () => void;
  hideReferenceTabs?: boolean;
  onOpenBriefing?: () => void;
  secondaryItems?: TopbarSecondaryItem[];
  activeSecondaryId?: number;
  onSelectSecondary?: (id: number) => void;
}

export function Topbar({
  currentTab,
  onTabChange,
  onReturnHome,
  hideReferenceTabs = false,
  onOpenBriefing,
  secondaryItems,
  activeSecondaryId,
  onSelectSecondary
}: TopbarProps) {
  const language = useSession((s) => s.language);
  const muted = useSession((s) => s.muted);
  const save = useSession((s) => s.save);

  const t = makeT(language);

  const navItems: { tab: NavigationTab; icon: typeof Orbit; labelZh: string; labelEn: string }[] = [
    { tab: 'mission', icon: Orbit, labelZh: 'Missions', labelEn: 'Missions' },
    { tab: 'log', icon: Radio, labelZh: 'Flight log', labelEn: 'Flight log' },
    { tab: 'guide', icon: BookOpen, labelZh: 'Field guide', labelEn: 'Field guide' }
  ];

  const handleToggleSound = () => {
    useSession.setState({ muted: !muted });
    save();
    tone();
  };

  return (
    <header className="topbar">
      <a
        className="brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onReturnHome?.();
        }}
        aria-label={t('Return to Main Menu', 'Return to Main Menu')}
        title={t('Return to Mission Menu', 'Return to Mission Menu')}
      >
        <img src="/favicon.svg" alt="" />
      </a>

      <nav aria-label={t('Main navigation', 'Main navigation')}>
        {navItems.filter((item) => !hideReferenceTabs || item.tab === 'mission').map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              type="button"
              className={currentTab === item.tab ? 'nav-active' : ''}
              onClick={() => onTabChange(item.tab)}
            >
              <Icon size={17} />
              {t(item.labelZh, item.labelEn)}
            </button>
          );
        })}

        {onOpenBriefing && (
          <button type="button" onClick={onOpenBriefing}>
            <BookOpen size={17} />
            {t('Briefing', 'Briefing')}
          </button>
        )}

        {secondaryItems && secondaryItems.length > 0 && (
          <>
            <span className="topbar-nav-divider" role="separator" aria-orientation="vertical" />
            {secondaryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`topbar-secondary-btn ${currentTab === 'mission' && activeSecondaryId === item.id ? 'nav-active' : ''}`}
                onClick={() => onSelectSecondary?.(item.id)}
                title={item.title ?? item.label}
              >
                <span>{item.label}</span>
                {item.completed && <Check size={12} className="topbar-secondary-done" aria-hidden="true" />}
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="header-actions">
        <LanguageSelect />
        <button
          className="icon-button"
          aria-label={t('Toggle sound', 'Toggle sound')}
          onClick={handleToggleSound}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </header>
  );
}
