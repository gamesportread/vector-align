import { makeT } from '../../i18n';
import { useSession } from '../../store';

export interface AppFooterProps {
  offlineReady: boolean;
  needRefresh: boolean;
  onUpdateApp: () => void;
}

export function AppFooter({ offlineReady, needRefresh, onUpdateApp }: AppFooterProps) {
  const language = useSession((s) => s.language);
  const isRunning = useSession((s) => s.running);
  const flightStatus = useSession((s) => s.flight.status);

  const t = makeT(language);
  const showUpdateToast = needRefresh && !isRunning && flightStatus !== 'flying';

  return (
    <>
      <footer>
        <span>
          VECTOR ALIGN<span className="footer-dot">·</span>
          {t('SPACECRAFT DOCKING ACADEMY', 'SPACECRAFT DOCKING ACADEMY')}
        </span>
        <span>
          {offlineReady
            ? t('OFFLINE LESSONS READY', 'OFFLINE LESSONS READY')
            : t('FIRST USE REQUIRES CONNECTION', 'FIRST USE REQUIRES CONNECTION')}
        </span>
      </footer>

      {showUpdateToast && (
        <div className="update-toast">
          {t('An update is ready', 'An update is ready')}
          <button onClick={onUpdateApp}>{t('Update', 'Update')}</button>
        </div>
      )}
    </>
  );
}
