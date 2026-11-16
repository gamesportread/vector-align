import { makeT } from '../../i18n';
import { useSession } from '../../store';

export interface InstallHelpModalProps {
  offlineReady: boolean;
}

export function InstallHelpModal({ offlineReady }: InstallHelpModalProps) {
  const language = useSession((s) => s.language);
  const t = makeT(language);

  return (
    <>
      <p>
        {t(
          'Desktop: use the install option in Chrome or Edge. In macOS Safari choose File → Add to Dock.',
          'Desktop: use the install option in Chrome or Edge. In macOS Safari choose File → Add to Dock.'
        )}
      </p>
      <p>
        {t(
          'iPhone / iPad: open Share → Add to Home Screen. Android: open the browser menu → Install app or Add to home screen.',
          'iPhone / iPad: open Share → Add to Home Screen. Android: open the browser menu → Install app or Add to home screen.'
        )}
      </p>
      <p className="modal-highlight">
        {offlineReady
          ? t(
              'All core lesson assets are cached. You can train offline.',
              'All core lesson assets are cached. You can train offline.'
            )
          : t(
              'Stay connected through the first load. Wait for “Offline lessons ready” before going offline.',
              'Stay connected through the first load. Wait for “Offline lessons ready” before going offline.'
            )}
      </p>
    </>
  );
}
