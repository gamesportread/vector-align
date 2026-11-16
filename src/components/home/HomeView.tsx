import { LanguageSelect } from '../common/LanguageSelect';
import { makeT } from '../../i18n';
import { useCallback, useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  Clock, 
  MapPin, 
  Rocket, 
  Layers, 
  Settings as SettingsIcon, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  Volume2,
  VolumeX,
  Monitor,
  Lock,
  ExternalLink,
  Compass,
  RotateCcw
} from 'lucide-react';
import { HOME_MISSIONS, type HomeMissionItem, type HistoricalScenario } from '../../data/homeMissions';
import { Modal } from '../common/Modal';
import { tone, useSession } from '../../store';
import { HomePanorama } from './HomePanorama';
import './home.css';

export interface HomeViewProps {
  onEnterSimulator: (taskId?: number, scenarioId?: string) => void;
}

export function HomeView({ onEnterSimulator }: HomeViewProps) {
  const language = useSession((s) => s.language);
  const muted = useSession((s) => s.muted);
  const quality = useSession((s) => s.quality);
  const save = useSession((s) => s.save);

  const t = makeT(language);

  // Selected mission (1: Liftoff, 2: Station Docking, 3: Departure, 4: Landing)
  const [selectedTaskId, setSelectedTaskId] = useState<number>(1);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('saturn-v');

  // Modals state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [devNoticeOpen, setDevNoticeOpen] = useState(false);
  const [scenarioTooltip, setScenarioTooltip] = useState<string | null>(null);

  // 360° Panorama view controls (Bonus)
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [viewAngles, setViewAngles] = useState<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const [resetSignal, setResetSignal] = useState<number>(0);

  const handlePanoramaAngleChange = useCallback((yaw: number, pitch: number) => {
    setViewAngles((prev) => (prev.yaw === yaw && prev.pitch === pitch ? prev : { yaw, pitch }));
  }, []);

  const currentMission: HomeMissionItem = 
    HOME_MISSIONS.find((m) => m.id === selectedTaskId) ?? HOME_MISSIONS[0];

  const handleSelectTask = (id: number) => {
    tone();
    setSelectedTaskId(id);
    const mission = HOME_MISSIONS.find((m) => m.id === id);
    if (mission?.historicalScenarios?.length) {
      setSelectedScenarioId(mission.historicalScenarios[0].id);
    }
    setScenarioTooltip(null);
  };

  const handleEnterClick = () => {
    tone();
    if (currentMission.isImplemented) {
      onEnterSimulator(selectedTaskId, selectedScenarioId);
    } else {
      setDevNoticeOpen(true);
    }
  };

  const handleScenarioSelect = (scenario: HistoricalScenario) => {
    tone();
    if (scenario.isAvailable) {
      setSelectedScenarioId(scenario.id);
      setScenarioTooltip(null);
    } else {
      setScenarioTooltip(
        `[${scenario.titleEn}] historical scenario is currently in development!`
      );
    }
  };

  const toggleSound = () => {
    useSession.setState({ muted: !muted });
    save();
    tone();
  };

  const toggleQuality = () => {
    const nextQuality = quality === 'high' ? 'low' : 'high';
    useSession.setState({ quality: nextQuality });
    save();
    tone();
  };

  // Keyboard shortcut: Press Enter to enter the simulation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen || creditsOpen || devNoticeOpen) return;
      if (e.key === 'Enter') {
        handleEnterClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, settingsOpen, creditsOpen, devNoticeOpen]);

  return (
    <div className="home-container" data-testid="mission-select-home">
      {/* 360° Panorama 3D dynamic background (Bonus) */}
      <HomePanorama
        selectedTaskId={selectedTaskId}
        autoRotate={isAutoRotating}
        onAngleChange={handlePanoramaAngleChange}
        resetSignal={resetSignal}
        quality={quality}
      />

      {/* Gradients ensuring readability on the left while preserving visual focus on the right */}
      <div className="home-overlay" />
      <div className="home-ambient-grid" />

      {/* UI Content Layer */}
      <div className="home-ui">
        <LanguageSelect className="home-language" />
        {/* Top-Left: Big Brand & Mission Title */}
        <header className="home-header">
          <div className="home-brand-tag">
            <span>{t('Orbital Flight Simulation Academy', 'Orbital Flight Simulation Academy')}</span>
          </div>
          <h1 className="home-title">
            <span>VECTOR</span>
            <span className="title-accent">ALIGN</span>
          </h1>
          <div className="home-title-sub">
            <span className="home-title-sub-dot" />
            <span>{t('Mission Select · Fly NASA Spacecraft', 'Mission Select · Fly NASA Spacecraft')}</span>
          </div>
        </header>

        {/* Main single-screen layout: Left Cluster (Menu + Scenario Card with matching top/bottom bounds) + Right 360 HUD */}
        <div className="home-main-layout">
          {/* Left Cluster: Main menu + Scenario card */}
          <div className="home-left-cluster">
            {/* Primary navigation */}
            <nav className="home-menu-stack" aria-label={t('Main Menu', 'Main Menu')}>
              {/* Liftoff */}
              <button
                type="button"
                className={`home-menu-btn ${selectedTaskId === 1 ? 'active' : ''}`}
                onClick={() => handleSelectTask(1)}
              >
                <span>{t('Liftoff', 'Liftoff')}</span>
              </button>

              {/* Station Docking */}
              <button
                type="button"
                className={`home-menu-btn ${selectedTaskId === 2 ? 'active' : ''}`}
                onClick={() => handleSelectTask(2)}
              >
                <span>{t('Station Docking', 'Station Docking')}</span>
              </button>

              {/* Departure */}
              <button
                type="button"
                className={`home-menu-btn ${selectedTaskId === 3 ? 'active' : ''}`}
                onClick={() => handleSelectTask(3)}
              >
                <span>{t('Departure', 'Departure')}</span>
              </button>

              {/* Landing */}
              <button
                type="button"
                className={`home-menu-btn ${selectedTaskId === 4 ? 'active' : ''}`}
                onClick={() => handleSelectTask(4)}
              >
                <span>{t('Landing', 'Landing')}</span>
              </button>

              {/* Options */}
              <button
                type="button"
                className="home-menu-btn secondary-action"
                onClick={() => { tone(); setSettingsOpen(true); }}
              >
                <span>{t('Options', 'Options')}</span>
              </button>

              {/* Credits & Acknowledgements */}
              <button
                type="button"
                className="home-menu-btn secondary-action"
                onClick={() => { tone(); setCreditsOpen(true); }}
              >
                <span>{t('Credits & Acknowledgements', 'Credits & Acknowledgements')}</span>
              </button>
            </nav>

            {/* Scenario Card */}
            <aside className="scenario-card" aria-label={t('Secondary Menu', 'Secondary Menu')}>
              <div className="scenario-card-tab">
                <span className="scenario-card-tab-label">{t('MISSION FILES', 'MISSION FILES')}</span>
                <span className="scenario-card-tab-title">{t(currentMission.titleZh, currentMission.titleEn)}</span>
              </div>
              <div className="scenario-list">
                {currentMission.historicalScenarios?.map((s) => (
                  <div key={s.id} className={`scenario-block ${s.isAvailable ? 'available' : 'unavailable'}`}>
                    {/* Mission title button */}
                    <button
                      type="button"
                      className={`scenario-task-btn ${s.isAvailable ? 'task-btn-convex' : 'task-btn-disabled'}`}
                      onClick={() => {
                        if (s.isAvailable) {
                          tone();
                          onEnterSimulator(selectedTaskId, s.id);
                        } else {
                          tone();
                          setScenarioTooltip(
                            `[${s.titleEn}] is currently under development!`
                          );
                        }
                      }}
                      aria-label={t(s.titleZh, s.titleEn)}
                      aria-disabled={!s.isAvailable}
                    >
                      <span className="task-btn-title">
                        {t(s.titleZh, s.titleEn)}
                      </span>
                      {s.isAvailable ? (
                        <span className="task-btn-badge available">
                          <span>{t('LAUNCH', 'LAUNCH')}</span>
                          <ArrowRight size={14} />
                        </span>
                      ) : (
                        <span className="task-btn-badge locked">
                          <Lock size={12} />
                          <span>{t(s.statusZh, s.statusEn)}</span>
                        </span>
                      )}
                    </button>

                    {/* Subtext under button */}
                    <div className={`scenario-task-subtext ${s.isAvailable ? 'available' : 'locked'}`}>
                      {s.eraZh && (
                        <span className="scenario-task-era">
                          <Sparkles size={11} />
                          <span>{t(s.eraZh, s.eraEn)}</span>
                        </span>
                      )}
                      <p className="scenario-task-desc">{t(s.descZh, s.descEn)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {scenarioTooltip && (
                <div className="scenario-tooltip-bar">
                  <AlertCircle size={13} />
                  <span>{scenarioTooltip}</span>
                </div>
              )}
            </aside>
          </div>

          {/* 360° Panorama HUD (Bonus) */}
          <div className="home-panorama-hud">
            <button
              type="button"
              className={`panorama-pill-btn ${isAutoRotating ? 'active' : ''}`}
              onClick={() => setIsAutoRotating((v) => !v)}
              title={t('Toggle 360° Auto-Cruise', 'Toggle 360° Auto-Cruise')}
            >
              <Compass size={14} />
              <span>{t('360° Panorama', '360° Panorama')}</span>
              <span className="panorama-bearing">{`AZ: ${viewAngles.yaw}°`}</span>
            </button>

            <button
              type="button"
              className="panorama-reset-btn"
              onClick={() => setResetSignal((s) => s + 1)}
              title={t('Reset View Angle', 'Reset View Angle')}
            >
              <RotateCcw size={12} />
              <span>{t('Reset', 'Reset')}</span>
            </button>

            <span className="panorama-hint-text">
              {t('🖱️ Drag to explore 360°', '🖱️ Drag to explore 360°')}
            </span>
          </div>
        </div>
      </div>

      {/* 5 Options Modal */}
      {settingsOpen && (
        <Modal
          title={t('Settings · Options', 'Settings · Options')}
          onClose={() => setSettingsOpen(false)}
        >
          <div className="settings-grid">
            <div className="setting-row">
              <div className="setting-info">
                <strong>{t('Audio & Sound Effects', 'Audio & Sound Effects')}</strong>
                <small>{t('Thruster gas and latch feedback audio', 'Thruster gas and latch feedback audio')}</small>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={toggleSound}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                <span>{muted ? t('Muted', 'Muted') : t('Enabled', 'Enabled')}</span>
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <strong>{t('Graphics Quality', 'Graphics Quality')}</strong>
                <small>{t('Earth texture detail and shadow rendering', 'Earth texture detail and shadow rendering')}</small>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={toggleQuality}
              >
                <Monitor size={15} />
                <span>{quality === 'high' ? t('High', 'High') : t('Low', 'Low')}</span>
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <strong className="controls-help-title">
                {t('Flight Controls Cheatsheet', 'Flight Controls Cheatsheet')}
              </strong>
              <div className="controls-help-grid">
                <div className="controls-help-item">
                  <span>{t('Fore / Aft Thrust', 'Fore / Aft Thrust')}</span>
                  <div><kbd>W</kbd> <kbd>S</kbd></div>
                </div>
                <div className="controls-help-item">
                  <span>{t('Port / Stbd Thrust', 'Port / Stbd Thrust')}</span>
                  <div><kbd>A</kbd> <kbd>D</kbd></div>
                </div>
                <div className="controls-help-item">
                  <span>{t('Up / Down Thrust', 'Up / Down Thrust')}</span>
                  <div><kbd>R</kbd> <kbd>F</kbd></div>
                </div>
                <div className="controls-help-item">
                  <span>{t('Pitch & Yaw', 'Pitch & Yaw')}</span>
                  <div><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></div>
                </div>
                <div className="controls-help-item">
                  <span>{t('Roll (Clockwise)', 'Roll (Clockwise)')}</span>
                  <div><kbd>Q</kbd> <kbd>E</kbd></div>
                </div>
                <div className="controls-help-item">
                  <span>{t('All-Stop Brake', 'All-Stop Brake')}</span>
                  <div><kbd>Space</kbd></div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 6 Credits Modal */}
      {creditsOpen && (
        <Modal
          title={t('Credits & Acknowledgements', 'Credits & Acknowledgements')}
          onClose={() => setCreditsOpen(false)}
        >
          <div className="credits-list">
            <div className="credits-section">
              <h4>{t('Mission Vision', 'Mission Vision')}</h4>
              <p>
                {t(
                  'Vector Align is an interactive orbital flight academy built for curious students and space enthusiasts, translating complex orbital mechanics into intuitive hands-on missions.',
                  'Vector Align is an interactive orbital flight academy built for curious students and space enthusiasts, translating complex orbital mechanics into intuitive hands-on missions.'
                )}
              </p>
            </div>

            <div className="credits-section">
              <h4>{t('3D Physics & Simulation', '3D Physics & Simulation')}</h4>
              <p>
                {t(
                  'Powered by WebGL, Three.js, and custom Newtonian physics engines simulating real frictionless vacuum motion, 6-DOF RCS dynamics, and docking colliders.',
                  'Powered by WebGL, Three.js, and custom Newtonian physics engines simulating real frictionless vacuum motion, 6-DOF RCS dynamics, and docking colliders.'
                )}
              </p>
            </div>

            <div className="credits-section">
              <h4>{t('Asset Credits & NASA Sources', 'Asset Credits & NASA Sources')}</h4>
              <p>
                {t(
                  'ISS 3D model courtesy of NASA open 3D resources. True-scale Earth textures provided by NASA Visible Earth and Blue Marble imagery.',
                  'ISS 3D model courtesy of NASA open 3D resources. True-scale Earth textures provided by NASA Visible Earth and Blue Marble imagery.'
                )}
              </p>
              <div className="credits-sources-list">
                <a
                  href="https://www.nasa.gov/international-space-station/harmony-module/"
                  target="_blank"
                  rel="noreferrer"
                  className="credits-source-link"
                >
                  <span>{t('NASA · Harmony module', 'NASA · Harmony module')}</span>
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://science.nasa.gov/resource/international-space-station-3d-model/"
                  target="_blank"
                  rel="noreferrer"
                  className="credits-source-link"
                >
                  <span>{t('NASA VTAD · International Space Station model', 'NASA VTAD · International Space Station model')}</span>
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/"
                  target="_blank"
                  rel="noreferrer"
                  className="credits-source-link"
                >
                  <span>{t('NASA Earth Observatory · Blue Marble', 'NASA Earth Observatory · Blue Marble')}</span>
                  <ExternalLink size={14} />
                </a>
                <a
                  href="https://www.nasa.gov/stem-content/crew-orbital-docking-simulation-coding-sim/"
                  target="_blank"
                  rel="noreferrer"
                  className="credits-source-link"
                >
                  <span>{t('NASA STEM · Crew Orbital Docking Simulation', 'NASA STEM · Crew Orbital Docking Simulation')}</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="credits-section">
              <h4>{t('Dedication', 'Dedication')}</h4>
              <p>
                {t(
                  'Dedicated to the scientists, engineers, and astronauts who dared to touch the stars.',
                  'Dedicated to the scientists, engineers, and astronauts who dared to touch the stars.'
                )}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* In development modal for missions 1, 3, 4 */}
      {devNoticeOpen && (
        <Modal
          title={t('Mission In Development', 'Mission In Development')}
          onClose={() => setDevNoticeOpen(false)}
        >
          <div className="home-dev-modal">
            <div className="dev-modal-icon-badge">
              <Rocket size={28} />
            </div>
            <h3 className="dev-modal-title">
              {t('[{0}] is currently being constructed', '[{0}] is currently being constructed', { 0: t(currentMission.titleZh, currentMission.titleEn) })}
            </h3>
            <p className="dev-modal-desc">
              {t(
                `This mission phase involves advanced trajectory simulations. Our engineering team is currently tuning dynamic parameters and 3D scenes.`,
                `This mission phase involves advanced trajectory simulations. Our engineering team is currently tuning dynamic parameters and 3D scenes.`
              )}
            </p>

            <div className="dev-modal-features">
              <div className="dev-feature-item">
                <CheckCircle2 size={16} />
                <span>{t('Core mission [Station Docking] is 100% live with complete 6-DOF physics & 4 training levels!', 'Core mission [Station Docking] is 100% live with complete 6-DOF physics & 4 training levels!')}</span>
              </div>
              <div className="dev-feature-item">
                <CheckCircle2 size={16} />
                <span>{t('Fly the crew spacecraft in low Earth orbit, experiencing inertia and precise docking maneuvers.', 'Fly the crew spacecraft in low Earth orbit, experiencing inertia and precise docking maneuvers.')}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDevNoticeOpen(false)}
              >
                {t('Back to Menu', 'Back to Menu')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setDevNoticeOpen(false);
                  setSelectedTaskId(2);
                  onEnterSimulator();
                }}
              >
                <Rocket size={15} />
                <span>{t('Launch Station Docking', 'Launch Station Docking')}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
