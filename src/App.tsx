import { makeT } from './i18n';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { NavigationTab } from './types/app';
import { clamp } from './sim/engine';
import { constraintFeedback, isAxisLocked } from './sim/feedback';
import { advanceFrame, clearInput, hydrate, lockTone, notifyCommand, runtime, useSession } from './store';
import { classifyHatchHotkey, createSingleFrameLoop } from './utils/flightLoop';

import { Topbar, type TopbarSecondaryItem } from './components/layout/Topbar';
import { AppFooter } from './components/layout/AppFooter';
import { Modal } from './components/common/Modal';

const HomeView = lazy(() => import('./components/home/HomeView').then((m) => ({ default: m.HomeView })));
const MissionView = lazy(() => import('./components/views/MissionView').then((m) => ({ default: m.MissionView })));
const FlightLog = lazy(() => import('./components/views/FlightLog').then((m) => ({ default: m.FlightLog })));
const FieldGuide = lazy(() => import('./components/views/FieldGuide').then((m) => ({ default: m.FieldGuide })));
const BriefingModal = lazy(() =>
  import('./components/modals/BriefingModal').then((m) => ({ default: m.BriefingModal }))
);
const ReviewModal = lazy(() => import('./components/modals/ReviewModal').then((m) => ({ default: m.ReviewModal })));
const FreeFlightModal = lazy(() =>
  import('./components/modals/FreeFlightModal').then((m) => ({ default: m.FreeFlightModal }))
);
const IntroTour = lazy(() => import('./components/intro/IntroTour').then((m) => ({ default: m.IntroTour })));
const LiftoffWorkspace = lazy(() =>
  import('./components/liftoff/LiftoffWorkspace').then((m) => ({ default: m.LiftoffWorkspace }))
);
const DepartureWorkspace = lazy(() =>
  import('./components/departure/DepartureWorkspace').then((m) => ({ default: m.DepartureWorkspace }))
);
const LandingWorkspace = lazy(() =>
  import('./components/landing/LandingWorkspace').then((m) => ({ default: m.LandingWorkspace }))
);

import type { RocketVehicleId } from './sim/liftoff/types';
import type { LiftoffWorkspaceHandle } from './components/liftoff/LiftoffWorkspace';

type ActiveProgram = 'docking' | 'liftoff' | 'departure' | 'landing';
let currentActiveProgram: ActiveProgram = 'docking';

const keys: Record<string, ['translation' | 'rotation', number, number]> = {
  KeyA: ['translation', 0, -1],
  KeyD: ['translation', 0, 1],
  KeyW: ['translation', 1, 1],
  KeyS: ['translation', 1, -1],
  KeyR: ['translation', 2, -1],
  KeyF: ['translation', 2, 1],
  ArrowUp: ['rotation', 0, -1],
  ArrowDown: ['rotation', 0, 1],
  ArrowLeft: ['rotation', 1, -1],
  ArrowRight: ['rotation', 1, 1],
  KeyQ: ['rotation', 2, 1],
  KeyE: ['rotation', 2, -1]
};

function useFlight(dockingActive: boolean) {
  useEffect(() => {
    void hydrate();
  }, []);

  useEffect(() => {
    if (!dockingActive) return;

    let publish = 0;

    const shouldAnimate = () => {
      const s = useSession.getState();
      return s.running || s.hatch.state === 'opening' || s.hatch.state === 'closing';
    };

    const loop = createSingleFrameLoop({
      shouldAnimate,
      onFrame: (dt, now) => {
        advanceFrame(dt);
        if (now - publish > 80 && useSession.getState().flight !== runtime.state) {
          useSession.setState({ flight: runtime.state });
          publish = now;
        }
      },
    });

    loop.ensure();
    const unsub = useSession.subscribe((state) => {
      if (state.running || state.hatch.state === 'opening' || state.hatch.state === 'closing') {
        loop.ensure();
      } else {
        loop.stop();
      }
    });

    return () => {
      loop.dispose();
      unsub();
    };
  }, [dockingActive]);

  useEffect(() => {

    const held = new Set<string>();

    const rebuild = () => {
      clearInput();
      const session = useSession.getState();
      if (!session.running || session.demo) return;

      for (const key of held) {
        if (key === 'Space') {
          runtime.command.brake = true;
        }
        const map = keys[key];
        if (map) {
          const currentVal = runtime.command[map[0]][map[1]];
          runtime.command[map[0]][map[1]] = clamp(currentVal + map[2], -1, 1);
        }
      }
      notifyCommand();
    };

    const down = (e: KeyboardEvent) => {
      // Ignore docking keystrokes on home screen or non-docking subsystem
      if (useSession.getState().screen === 'home' || currentActiveProgram !== 'docking') return;

      // 1. When review modal is open, press R to restart mission immediately
      if (useSession.getState().panel === 'review') {
        if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          const sess = useSession.getState();
          if (sess.latest) {
            sess.select(sess.latest.scenario, sess.latest.config);
          }
          sess.start();
          return;
        }
      }

      if ((e.target as Element | null)?.closest?.('input,select,textarea,[contenteditable="true"]')) {
        return;
      }

      // Hatch toggle hotkey: Press 1 (Digit1 / Numpad1 / key === '1')
      const hatchAction = classifyHatchHotkey(e);
      if (hatchAction !== 'ignore') {
        e.preventDefault();
        if (hatchAction === 'toggle') {
          useSession.getState().toggleHatch();
        }
        return;
      }

      // 2. When flight has failed (e.g., collision), press R / Enter to restart mission immediately
      const currentFlight = useSession.getState().flight;
      if (currentFlight.status === 'failed') {
        if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.code === 'Enter') {
          e.preventDefault();
          held.clear();
          clearInput();
          useSession.getState().start();
          return;
        }
        // Disable all normal flight thruster inputs in failed state to prevent residual thrust
        return;
      }

      if (e.code in keys || e.code === 'Space') {
        e.preventDefault();

        // Degree-of-freedom lock detection and immediate operator feedback
        if (e.code in keys) {
          const map = keys[e.code];
          const cfg = useSession.getState().config;
          if (isAxisLocked(cfg, map[0], map[1])) {
            constraintFeedback.trigger(
              cfg,
              map[0],
              map[1],
              useSession.getState().language,
              lockTone
            );
            return;
          }
        }

        held.add(e.code);
        rebuild();
      }

      if (e.code === 'Escape') {
        useSession.getState().pause();
      }
    };

    const up = (e: KeyboardEvent) => {
      if (held.has(e.code)) {
        held.delete(e.code);
        rebuild();
      }
    };

    const blur = () => {
      held.clear();
      clearInput();
      useSession.getState().pause();
    };

    const visibility = () => {
      if (document.hidden) blur();
    };

    const unsubscribe = useSession.subscribe((state, previous) => {
      if (
        state.mode !== previous.mode ||
        state.running !== previous.running ||
        state.config !== previous.config
      ) {
        held.clear();
        clearInput();
      }
    });

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
}

export default function App() {
  const session = useSession();
  const { language, flight, panel, storageError } = session;
  const t = makeT(language);

  const [tab, setTab] = useState<NavigationTab>('mission');
  const [activeProgram, setActiveProgram] = useState<ActiveProgram>(() => {
    if (typeof window === 'undefined') return 'docking';
    const prog = new URLSearchParams(window.location.search).get('program');
    if (prog === 'liftoff' || prog === 'departure' || prog === 'landing') return prog;
    return 'docking';
  });

  useFlight(session.screen === 'simulator' && activeProgram === 'docking' && tab === 'mission');
  const [liftoffVehicleId, setLiftoffVehicleId] = useState<RocketVehicleId>('saturn-v');
  const [liftoffActiveLevel, setLiftoffActiveLevel] = useState<number>(1);
  const liftoffWorkspace = useRef<LiftoffWorkspaceHandle>(null);
  const [departureActiveLevel, setDepartureActiveLevel] = useState<number>(1);
  const [landingActiveLevel, setLandingActiveLevel] = useState<number>(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  currentActiveProgram = activeProgram;

  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW();

  // Subscribe to lock feedback state
  const constraintAlert = useSyncExternalStore(
    constraintFeedback.subscribe,
    constraintFeedback.getAlert,
    constraintFeedback.getAlert
  );
  const activeShakeAxis = useSyncExternalStore(
    constraintFeedback.subscribe,
    constraintFeedback.getShakeAxis,
    constraintFeedback.getShakeAxis
  );

  const handleTabChange = (newTab: NavigationTab) => {
    session.pause();
    setTab(newTab);
  };

  const handleOpenFreeFlight = () => {
    session.pause();
    useSession.setState({ panel: 'free' });
  };

  const secondaryItems = useMemo<TopbarSecondaryItem[]>(() => {
    const t = makeT(language);
    if (activeProgram === 'liftoff') {
      return [
        { id: 1, label: `01 ${t('Liftoff & Gravity Turn', 'Liftoff & Gravity Turn')}` },
        { id: 2, label: `02 ${t('Staging', 'Staging')}` },
        { id: 3, label: `03 ${t('Orbit Insertion', 'Orbit Insertion')}` },
        { id: 4, label: `★ ${t('Full Launch', 'Full Launch')}` }
      ];
    }
    if (activeProgram === 'departure') {
      return [
        { id: 1, label: `01 ${t('Latch Release', 'Latch Release')}`, completed: session.departureCompleted.includes(1) },
        { id: 2, label: `02 ${t('Corridor Centering', 'Corridor Centering')}`, completed: session.departureCompleted.includes(2) },
        { id: 3, label: `03 ${t('Attitude Watch', 'Attitude Watch')}`, completed: session.departureCompleted.includes(3) },
        { id: 4, label: `04 ${t('Full Departure', 'Full Departure')}`, completed: session.departureCompleted.includes(4) }
      ];
    }
    if (activeProgram === 'landing') {
      return [
        { id: 1, label: `01 ${t('Plasma Blackout', 'Plasma Blackout')}`, completed: session.landingCompleted.includes(1) },
        { id: 2, label: `02 ${t('Sky Blossom', 'Sky Blossom')}`, completed: session.landingCompleted.includes(2) },
        { id: 3, label: `03 ${t('Retro Cushion', 'Retro Cushion')}`, completed: session.landingCompleted.includes(3) },
        { id: 4, label: `04 ${t('Heroic Return', 'Heroic Return')}`, completed: session.landingCompleted.includes(4) }
      ];
    }
    return [
      { id: 1, label: `01 ${t('Learn to stop', 'Learn to stop')}`, completed: session.completed.includes(1) },
      { id: 2, label: `02 ${t('Cancel the drift', 'Cancel the drift')}`, completed: session.completed.includes(2) },
      { id: 3, label: `03 ${t('Align the port', 'Align the port')}`, completed: session.completed.includes(3) },
      { id: 4, label: `04 ${t('The final 50 metres', 'The final 50 metres')}`, completed: session.completed.includes(4) },
      { id: 5, label: `∞ ${t('Free-flight lab', 'Free-flight lab')}` }
    ];
  }, [activeProgram, language, session.completed, session.departureCompleted, session.landingCompleted]);

  const activeSecondaryId =
    activeProgram === 'liftoff'
      ? liftoffActiveLevel
      : activeProgram === 'departure'
      ? departureActiveLevel
      : activeProgram === 'landing'
      ? landingActiveLevel
      : panel === 'free'
      ? 5
      : session.activeLevel;

  const isFlying = flight.status === 'flying';
  const isCockpit =
    tab === 'mission' &&
    ((activeProgram === 'docking' && session.activeLevel > 0) ||
      (activeProgram === 'liftoff' && liftoffActiveLevel > 0) ||
      (activeProgram === 'departure' && departureActiveLevel > 0) ||
      (activeProgram === 'landing' && landingActiveLevel > 0));
  const noSidebar = true;

  if (session.screen === 'home') {
    return (
      <Suspense fallback={null}>
        <HomeView
          onEnterSimulator={(taskId = 2, scenarioId = 'iss-standard') => {
            if (taskId === 1) {
              setActiveProgram('liftoff');
              setLiftoffVehicleId(scenarioId === 'sls-artemis-1' ? 'sls' : 'saturn-v');
              setLiftoffActiveLevel(1);
            } else if (taskId === 3) {
              setActiveProgram('departure');
              setDepartureActiveLevel(1);
            } else if (taskId === 4) {
              setActiveProgram('landing');
              setLandingActiveLevel(1);
            } else {
              setActiveProgram('docking');
              session.select(1);
            }
            setTab('mission');
            session.setScreen('simulator');
            useSession.setState({ activeLevel: 1 });
          }}
        />
      </Suspense>
    );
  }

  return (
    <div
      className={[
        'app-shell',
        activeProgram === 'liftoff' ? 'liftoff-program' : '',
        isCockpit ? 'cockpit-screen' : '',
        noSidebar ? 'no-sidebar' : '',
        isFlying && tab === 'mission' ? 'in-flight' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Topbar
        currentTab={tab}
        hideReferenceTabs={activeProgram === 'liftoff'}
        onOpenBriefing={activeProgram === 'liftoff' ? () => liftoffWorkspace.current?.openBriefing() : undefined}
        onTabChange={handleTabChange}
        onReturnHome={() => {
          session.setScreen('home');
          setLiftoffActiveLevel(1);
        }}
        secondaryItems={secondaryItems}
        activeSecondaryId={activeSecondaryId}
        onSelectSecondary={(id) => {
          if (activeProgram === 'liftoff') {
            setLiftoffActiveLevel(id);
          } else if (activeProgram === 'departure') {
            setDepartureActiveLevel(id);
          } else if (activeProgram === 'landing') {
            setLandingActiveLevel(id);
          } else {
            if (id === 5) {
              handleOpenFreeFlight();
              return;
            }
            session.select(id);
            useSession.setState({ activeLevel: id, panel: 'none' });
          }
          setTab('mission');
        }}
      />

      <Suspense fallback={null}>
        {tab !== 'mission' ? (
          <main className="main-full">
            {storageError && (
              <div className="notice">
                {t(
                  'Local storage is unavailable. Progress lasts for this session only.',
                  'Local storage is unavailable. Progress lasts for this session only.'
                )}
              </div>
            )}

            {tab === 'log' ? <FlightLog /> : <FieldGuide />}

            <AppFooter
              offlineReady={offlineReady}
              needRefresh={needRefresh}
              onUpdateApp={() => void updateServiceWorker(true)}
            />
          </main>
        ) : activeProgram === 'liftoff' ? (
          <LiftoffWorkspace
            ref={liftoffWorkspace}
            initialVehicleId={liftoffVehicleId}
            initialActiveLevel={liftoffActiveLevel}
            isOpenMobile={mobileMenuOpen}
            onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)}
            onCloseMobile={() => setMobileMenuOpen(false)}
            onActiveLevelChange={setLiftoffActiveLevel}
          />
        ) : activeProgram === 'departure' ? (
          <DepartureWorkspace
            initialActiveLevel={departureActiveLevel}
            isOpenMobile={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            onActiveLevelChange={setDepartureActiveLevel}
          />
        ) : activeProgram === 'landing' ? (
          <LandingWorkspace
            initialActiveLevel={landingActiveLevel}
            isOpenMobile={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
            onActiveLevelChange={setLandingActiveLevel}
          />
        ) : (
          <div className="liftoff-shell liftoff-no-sidebar">
            <main className="liftoff-main">
              {storageError && (
                <div className="notice">
                  {t(
                    'Local storage is unavailable. Progress lasts for this session only.',
                    'Local storage is unavailable. Progress lasts for this session only.'
                  )}
                </div>
              )}

              <MissionView
                constraintAlert={constraintAlert}
                activeShakeAxis={activeShakeAxis}
                onOpenBriefing={() => {
                  session.pause();
                  useSession.setState({ panel: 'brief' });
                }}
                onOpenFreeFlight={handleOpenFreeFlight}
              />

              <AppFooter
                offlineReady={offlineReady}
                needRefresh={needRefresh}
                onUpdateApp={() => void updateServiceWorker(true)}
              />
            </main>
          </div>
        )}

        {/* Modal dialogs assembly */}

        {panel === 'brief' && (
          <Modal
            title={t('Mission briefing', 'Mission briefing')}
            onClose={() => useSession.setState({ panel: 'none' })}
          >
            <BriefingModal onStartFlight={() => session.start()} />
          </Modal>
        )}

        {panel === 'review' && (
          <Modal
            title={session.demo ? t('Demo debrief', 'Demo debrief') : t('Flight debrief', 'Flight debrief')}
            onClose={() => useSession.setState({ panel: 'none' })}
          >
            <ReviewModal />
          </Modal>
        )}

        {panel === 'free' && (
          <Modal
            title={t('Free-flight lab', 'Free-flight lab')}
            onClose={() => useSession.setState({ panel: 'none' })}
          >
            <FreeFlightModal onStart={() => setTab('mission')} />
          </Modal>
        )}

        {panel === 'intro' && (
          <Modal
            title={t('Docking visual guide', 'Docking visual guide')}
            onClose={() => useSession.getState().closeIntro()}
            className="intro-modal"
          >
            <IntroTour />
          </Modal>
        )}

      </Suspense>
    </div>
  );
}
