import { loc, makeT } from '../../i18n';
import { AlertTriangle, ArrowRight, BookOpen, Check, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import { useSession } from '../../store';
import { FlightChart } from '../charts/FlightChart';
import { analyzeFlight } from '../../sim/debrief';

export function ReviewContent() {
  const language = useSession((s) => s.language);
  const latest = useSession((s) => s.latest);
  const start = useSession((s) => s.start);
  const select = useSession((s) => s.select);
  const openIntro = useSession((s) => s.openIntro);

  const t = makeT(language);

  if (!latest?.result) {
    return <p>{t('No flight recorded yet.', 'No flight recorded yet.')}</p>;
  }

  const analysis = analyzeFlight(latest, language);
  const success = analysis.isSuccess;

  return (
    <div className="debrief-container">
      {/* Status badge and core diagnosis */}
      <div className={`debrief-header ${success ? 'is-success' : 'is-failure'}`}>
        <div className={`result-icon ${success ? 'success' : 'failure'}`}>
          {success ? <Check size={32} /> : <AlertTriangle size={30} />}
        </div>
        <div className="debrief-header-text">
          <div className="debrief-badges">
            <span className={`debrief-pill pill-${analysis.badgeType}`}>
              {analysis.badgeTitle}
            </span>
            <span className="debrief-scenario-pill">
              {t('Mission 0{0}', 'Mission 0{0}', { 0: latest.scenario })} · {loc(language, latest.config.title)}
            </span>
          </div>
          <h3 className="result-title">{analysis.headline}</h3>
          <p className="debrief-summary">{analysis.causeExplanation}</p>
          {latest.demo && (
            <p className="demo-notice" style={{ marginTop: '8px', color: '#9bb8a8', fontSize: '0.8125rem' }}>
              {t(
                'This demo uses the same thrusters and physics as your flight. Complete a flight yourself to earn course progress.',
                'This demo uses the same thrusters and physics as your flight. Complete a flight yourself to earn course progress.'
              )}
            </p>
          )}
        </div>
      </div>

      {/* Black box flight metric comparison grid */}
      <div className="debrief-metrics-grid">
        {analysis.metrics.map((m) => (
          <div key={m.id} className={`debrief-metric-card ${m.passed ? 'is-pass' : 'is-fail'}`}>
            <div className="metric-header">
              <span className="metric-title">{m.name}</span>
              <span className={`metric-badge ${m.passed ? 'badge-pass' : 'badge-fail'}`}>
                {m.passed ? (success ? '✓ Passed' : '✓ Nominal') : '✕ Exceeded'}
              </span>
            </div>
            <div className="metric-values">
              <strong className="metric-actual">{m.valueText}</strong>
              <small className="metric-target">{t('Target', 'Target')}: {m.limitText}</small>
            </div>
            <p className="metric-eval">{m.comment}</p>
          </div>
        ))}
      </div>

      {/* Flight instructor tips and scientific explanations */}
      <div className="debrief-insights-card">
        <div className="insight-section">
          <div className="insight-title">
            <Sparkles size={16} />
            <h4>{t('The Physics in Space', 'The Physics in Space')}</h4>
          </div>
          <p>{analysis.physicsInsight}</p>
        </div>

        {!success && (
          <div className="insight-section tips-section">
            <div className="insight-title">
              <ShieldAlert size={16} />
              <h4>{t('Flight Instructor Tips', 'Flight Instructor Tips')}</h4>
            </div>
            <ul className="pilot-tips-list">
              {analysis.pilotTips.map((tip, idx) => (
                <li key={idx}>
                  <span className="tip-index">{idx + 1}</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Flight time series telemetry chart */}
      <FlightChart record={latest} />

      {/* Modal bottom action buttons */}
      <div className="modal-actions debrief-actions">
        <button
          className="secondary-button"
          onClick={() => {
            select(latest.scenario, latest.config);
            start();
          }}
        >
          <RotateCcw size={16} />
          {t('Try again (R)', 'Try again (R)')}
        </button>

        {!success && (
          <button
            className="secondary-button guide-hint-btn"
            onClick={() => {
              openIntro(2); // Jump to step 3 in orientation: no brakes in space
            }}
          >
            <BookOpen size={16} />
            {t('Review Guide', 'Review Guide')}
          </button>
        )}

        {success && !latest.demo && latest.scenario < 4 && (
          <button
            className="primary-button"
            onClick={() => select(latest.scenario + 1)}
          >
            {t('Next mission', 'Next mission')}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ReviewModal() {
  return <ReviewContent />;
}
