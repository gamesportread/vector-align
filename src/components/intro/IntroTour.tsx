import { makeT } from '../../i18n';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Rocket } from 'lucide-react';
import { useSession } from '../../store';
import { HotspotChips, sceneHotspots, SceneMap, ShipCloseup, shipHotspots, TrackSim, type Hotspot, type T } from './IntroArt';

/** Clickable diagram + description card. Tracks viewed items. */
function Explorer({ t, items, Art }: { t: T; items: Hotspot[]; Art: typeof SceneMap }) {
  const [selected, setSelected] = useState(items[0].id);
  const [seen, setSeen] = useState(() => new Set([items[0].id]));
  const select = (id: string) => { setSelected(id); setSeen((s) => new Set(s).add(id)); };
  const current = items.find((h) => h.id === selected)!;
  return (
    <>
      <div className="intro-art"><Art t={t} selected={selected} seen={seen} onSelect={select} /></div>
      <HotspotChips items={items} selected={selected} seen={seen} onSelect={select} />
      <div className="intro-card" aria-live="polite">
        <strong>{items.indexOf(current) + 1}. {current.name}</strong>
        <p>{current.text}</p>
        <small>{t('Explored {0} / {1}', 'Explored {0} / {1}', { 0: seen.size, 1: items.length })}</small>
      </div>
    </>
  );
}

export function IntroTour() {
  const language = useSession((s) => s.language);
  const step = useSession((s) => s.introStep);
  const t = makeT(language);
  const go = (n: number) => useSession.setState({ introStep: n });

  const finish = (demo: boolean) => {
    const s = useSession.getState();
    s.closeIntro();
    s.select(1);
    s.start(demo);
  };

  const steps = [
    {
      tab: t('What’s on screen', 'What’s on screen'),
      title: t('First: what is everything on screen?', 'First: what is everything on screen?'),
      body: (
        <>
          <div className="intro-mission-goal-box">
            <div className="goal-box-title">
              <span className="goal-box-badge">🎯 {t('Mission Goal', 'Mission Goal')}</span>
              <strong>{t('Fly the ship and stop steadily inside the 8 m yellow ring', 'Fly the ship and stop steadily inside the 8 m yellow ring')}</strong>
            </div>
            <p className="goal-box-desc">
              {t('The ship is gliding toward the station. Space has no friction: releasing keys will not stop you. Press key F (forward thrusters) to brake, bring speed to 0, and hold steady for 1.5 s to pass!', 'The ship is gliding toward the station. Space has no friction: releasing keys will not stop you. Press key F (forward thrusters) to brake, bring speed to 0, and hold steady for 1.5 s to pass!')}
            </p>
          </div>
          <Explorer t={t} items={sceneHotspots(t)} Art={SceneMap} />
        </>
      )
    },
    {
      tab: t('Your ship', 'Your ship'),
      title: t('What is the pointy thing? Your spaceship', 'What is the pointy thing? Your spaceship'),
      lead: t(
        'Your job: fly this ship so its door joins the station’s door gently. That is called docking. The nosecone hatch works like a helmet visor—press [1] to open it, reveal the docking adapter (IDA) to lock on! Tap each part of the ship:',
        'Your job: fly this ship so its door joins the station’s door gently. That is called docking. The nosecone hatch works like a helmet visor—press [1] to open it, reveal the docking adapter (IDA) to lock on! Tap each part of the ship:'
      ),
      body: <Explorer t={t} items={shipHotspots(t)} Art={ShipCloseup} />
    },
    {
      tab: t('No brakes in space', 'No brakes in space'),
      title: t('Try it: there are no brake pads in space', 'Try it: there are no brake pads in space'),
      lead: t('On a bike, stop pedalling and you slowly stop because the ground and air drag on you (friction). In space almost nothing drags on the ship, so after you let go it keeps drifting at the same speed. To stop, you must fire the opposite way.', 'On a bike, stop pedalling and you slowly stop because the ground and air drag on you (friction). In space almost nothing drags on the ship, so after you let go it keeps drifting at the same speed. To stop, you must fire the opposite way.'),
      body: <TrackSim t={t} mode="practice" />
    },
    {
      tab: t('Why the ring', 'Why the ring'),
      title: t('Why does mission 1 stop at the yellow ring?', 'Why does mission 1 stop at the yellow ring?'),
      lead: t('Compare the two ways first, then read the three reasons below.', 'Compare the two ways first, then read the three reasons below.'),
      body: (
        <>
          <TrackSim t={t} mode="compare" />
          <div className="intro-reasons">
            <div><b>1</b><strong>{t('Learn to stop first', 'Learn to stop first')}</strong><p>{t('Mission 1 trains one skill: stopping exactly where you want. Every later mission and every docking needs it.', 'Mission 1 trains one skill: stopping exactly where you want. Every later mission and every docking needs it.')}</p></div>
            <div><b>2</b><strong>{t('Real ships do this too', 'Real ships do this too')}</strong><p>{t('Real spacecraft pause at fixed “hold points” on the way in, check everything is fine, then continue. The yellow ring is our hold point.', 'Real spacecraft pause at fixed “hold points” on the way in, check everything is fine, then continue. The yellow ring is our hold point.')}</p></div>
            <div><b>3</b><strong>{t('Leave a safety gap', 'Leave a safety gap')}</strong><p>{t('8 m is still a safe gap. Even if you overshoot a little, there is time to fix it before hitting anything.', '8 m is still a safe gap. Even if you overshoot a little, there is time to fix it before hitting anything.')}</p></div>
          </div>
          <div className="intro-rule">
            <strong>{t('How do you pass? All three at once:', 'How do you pass? All three at once:')}</strong>
            <ul>
              <li>{t('The ship is within 0.35 m of the ring (about an arm’s length);', 'The ship is within 0.35 m of the ring (about an arm’s length);')}</li>
              <li>{t('Speed below 0.06 m/s — under 6 cm per second, almost still;', 'Speed below 0.06 m/s — under 6 cm per second, almost still;')}</li>
              <li>{t('Hold it like that for 1.5 seconds.', 'Hold it like that for 1.5 seconds.')}</li>
            </ul>
          </div>
        </>
      )
    },
    {
      tab: t('Read the screen', 'Read the screen'),
      title: t('Last: the numbers and keys', 'Last: the numbers and keys'),
      lead: t('In training there are four numbers under the scene and a row of buttons. Mission 1 only needs the first two numbers and the forward/back keys.', 'In training there are four numbers under the scene and a row of buttons. Mission 1 only needs the first two numbers and the forward/back keys.'),
      body: (
        <>
          <div className="intro-grid">
            <div className="key"><span>{t('PORT DISTANCE', 'PORT DISTANCE')}</span><p>{t('How many metres to the station door. In mission 1, stop near 8.', 'How many metres to the station door. In mission 1, stop near 8.')}</p></div>
            <div className="key"><span>{t('CLOSING SPEED', 'CLOSING SPEED')}</span><p>{t('Metres per second toward the door. 0 means stopped; negative means backing away.', 'Metres per second toward the door. 0 means stopped; negative means backing away.')}</p></div>
            <div><span>{t('LATERAL OFFSET', 'LATERAL OFFSET')}</span><p>{t('How far off the centre line. Ignore it for now; mission 2 trains it.', 'How far off the centre line. Ignore it for now; mission 2 trains it.')}</p></div>
            <div><span>{t('THRUSTER RESERVE', 'THRUSTER RESERVE')}</span><p>{t('Every puff uses fuel. If it runs out you can’t steer any more and the mission fails.', 'Every puff uses fuel. If it runs out you can’t steer any more and the mission fails.')}</p></div>
          </div>
          <div className="intro-keys">
            <span><kbd>1</kbd>{t('Nosecone hatch: press [1] to open and reveal the docking adapter (IDA)', 'Nosecone hatch: press [1] to open and reveal the docking adapter (IDA)')}</span>
            <span><kbd>R</kbd>{t('Speed up toward the station', 'Speed up toward the station')}</span>
            <span><kbd>F</kbd>{t('Brake / back away', 'Brake / back away')}</span>
            <span><kbd>{t('Space', 'Space')}</kbd>{t('Assist brake: slows you to zero (uses fuel too)', 'Assist brake: slows you to zero (uses fuel too)')}</span>
            <span><kbd>{t('Drag', 'Drag')}</kbd>{t('Turn the camera; “Side view” shows the ring distance best', 'Turn the camera; “Side view” shows the ring distance best')}</span>
          </div>
          <p className="intro-tip">{t('Tip: You can switch back to "Level 0" in the sidebar at any time to explore the full spacecraft and station diagrams.', 'Tip: You can switch back to "Level 0" in the sidebar at any time to explore the full spacecraft and station diagrams.')}</p>
        </>
      )
    }
  ];

  const current = steps[step] ?? steps[0];
  const last = step === steps.length - 1;

  return (
    <div className="intro-tour">
      <nav className="intro-steps" aria-label={t('Guide steps', 'Guide steps')}>
        {steps.map((s, i) => (
          <button key={i} aria-label={s.tab} className={i === step ? 'active' : i < step ? 'done' : ''} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}>
            <i>{i + 1}</i><span>{s.tab}</span>
          </button>
        ))}
      </nav>
      <h3>{current.title}</h3>
      <p className="intro-lead">{current.lead}</p>
      {/* key lets practice mini-sim reset on step switch */}
      <div key={step}>{current.body}</div>
      <div className="intro-footer">
        <button className="intro-skip" onClick={() => useSession.getState().closeIntro()}>{t('Skip guide', 'Skip guide')}</button>
        <div>
          {step > 0 && <button className="secondary-button" onClick={() => go(step - 1)}><ArrowLeft size={15} />{t('Back', 'Back')}</button>}
          {last ? (
            <>
              <button className="secondary-button" onClick={() => finish(true)}><Play size={15} />{t('Watch demo', 'Watch demo')}</button>
              <button className="primary-button" onClick={() => finish(false)}><Rocket size={16} />{t('Start mission 1', 'Start mission 1')}</button>
            </>
          ) : (
            <button className="primary-button" onClick={() => go(step + 1)}>{t('Next', 'Next')}<ArrowRight size={15} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
