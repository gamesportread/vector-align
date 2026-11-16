import { makeT } from '../../i18n';
import { useState } from 'react';
import { DoorClosed, DoorOpen, HelpCircle, Loader2 } from 'lucide-react';
import { useSession } from '../../store';
import type { HatchState } from '../../sim/types';

export interface ControlsOverlayProps {
  className?: string;
}

export function ControlsOverlay({ className = '' }: ControlsOverlayProps) {
  const language = useSession((s) => s.language);
  const hatch = useSession((s) => s.hatch);
  const toggleHatch = useSession((s) => s.toggleHatch);
  const [showTooltip, setShowTooltip] = useState(false);

  const t = makeT(language);

  const getHatchLabel = (state: HatchState) => {
    switch (state) {
      case 'closed':
        return t('Hatch: Closed [Press 1]', 'Hatch: Closed [Press 1]');
      case 'opening':
        return t('Hatch: Opening...', 'Hatch: Opening...');
      case 'open':
        return t('Hatch: Open (Ready to dock)', 'Hatch: Open (Ready to dock)');
      case 'closing':
        return t('Hatch: Closing...', 'Hatch: Closing...');
    }
  };

  const getHatchIcon = (state: HatchState) => {
    switch (state) {
      case 'closed':
        return <DoorClosed size={16} className="hatch-icon closed" />;
      case 'opening':
      case 'closing':
        return <Loader2 size={16} className="hatch-icon spinning" />;
      case 'open':
        return <DoorOpen size={16} className="hatch-icon open" />;
    }
  };

  const isTransitioning = hatch.state === 'opening' || hatch.state === 'closing';

  return (
    <div className={`hud-controls-overlay ${className}`} role="region" aria-label={t('Hatch Controls', 'Hatch Controls')}>
      <div className="hatch-control-wrapper">
        <button
          type="button"
          className={`hatch-status-button state-${hatch.state}`}
          onClick={() => toggleHatch()}
          onPointerDown={(e) => {
            // Prevent taking focus away from canvas/controls while allowing touch click
            e.currentTarget.focus();
          }}
          title={t('Click to toggle hatch (Shortcut: 1)', 'Click to toggle hatch (Shortcut: 1)')}
          aria-label={getHatchLabel(hatch.state)}
          aria-pressed={hatch.state === 'open' || hatch.state === 'opening'}
        >
          <span className="hatch-icon-wrap">
            {getHatchIcon(hatch.state)}
          </span>
          <span className="hatch-text">
            {getHatchLabel(hatch.state)}
          </span>
          <span className="hatch-touch-badge">
            {t('TAP', 'TAP')}
          </span>
        </button>

        <button
          type="button"
          className="hatch-help-trigger"
          onClick={() => setShowTooltip((v) => !v)}
          title={t('About nose cone hatch', 'About nose cone hatch')}
          aria-label={t('Hatch info', 'Hatch info')}
        >
          <HelpCircle size={14} />
        </button>

        {showTooltip && (
          <div className="hatch-hud-tooltip">
            <p>
              <strong>{t('💡 Why open the hatch before docking?', '💡 Why open the hatch before docking?')}</strong>
            </p>
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
            <button
              type="button"
              className="hatch-tooltip-close"
              onClick={() => setShowTooltip(false)}
            >
              {t('Got it', 'Got it')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ControlsOverlay;
