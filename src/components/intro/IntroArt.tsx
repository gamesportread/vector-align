import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Play } from 'lucide-react';
import { DT } from '../../sim/engine';
import { createTrack, inRing, isStopped, pilotThrust, TRACK, trackStep, type TrackPilot, type TrackState } from '../../sim/intro';

export type T = (zh: string, en: string, vars?: Record<string, string | number>) => string;
export interface Hotspot { id: string; name: string; text: string }

/* ---------- Generic: Side-view ship (nose pointing left) ---------- */
function ShipSide({ x, y, s, flame = 0, hot }: { x: number; y: number; s: number; flame?: number; hot?: string }) {
  const nose = 0.53 * s, wide = 1.4 * s, cone = 2.2 * s, tail = 2.9 * s;
  const edge = (px: number) => nose + ((px - 0.1 * s) / (cone - 0.1 * s)) * (wide - nose); // Half-height of cone top edge
  const w1 = 0.8 * s, w2 = 1.2 * s;
  const glow = (id: string) => (hot === id ? 'intro-hot' : '');
  return (
    <g transform={`translate(${x} ${y})`}>
      {flame < 0 && <polygon className="intro-flame" points={`${tail},${-wide * 0.35} ${tail + 34 * -flame},0 ${tail},${wide * 0.35}`} />}
      {flame > 0 && [-1, 1].map((d) => (
        <polygon key={d} className="intro-flame" points={`${s * 0.5},${d * wide * 0.36} ${s * 0.5 - 30 * flame},${d * wide * 0.44} ${s * 0.5},${d * wide * 0.52}`} />
      ))}
      <rect className={`intro-ship-tail ${glow('tail')}`} x={cone} y={-wide} width={tail - cone} height={wide * 2} rx={3} />
      <polygon className={`intro-ship-body ${glow('body')}`} points={`${s * 0.1},${-nose} ${cone},${-wide} ${cone},${wide} ${s * 0.1},${nose}`} />
      <rect className={`intro-ship-nose ${glow('nose')}`} x={0} y={-nose} width={s * 0.12} height={nose * 2} rx={2} />
      <polygon className={`intro-ship-window ${glow('window')}`} points={`${w1},${-edge(w1) + 0.08 * s} ${w2},${-edge(w2) + 0.08 * s} ${w2},${-edge(w2) + 0.32 * s} ${w1},${-edge(w1) + 0.32 * s}`} />
      {[-1, 1].map((d) => (
        <rect key={d} className={`intro-ship-jet ${glow('jets')}`} x={s * 0.45} y={d > 0 ? wide * 0.36 : -wide * 0.36 - s * 0.16} width={s * 0.12} height={s * 0.16} />
      ))}
      <rect className={`intro-ship-jet ${glow('jets')}`} x={tail - s * 0.06} y={-s * 0.15} width={s * 0.12} height={s * 0.3} />
    </g>
  );
}

function Badge({ x, y, n, label, active, seen, onClick }: { x: number; y: number; n: number; label: string; active: boolean; seen: boolean; onClick: () => void }) {
  return (
    <g className={`intro-badge ${active ? 'active' : ''} ${seen ? 'seen' : ''}`} transform={`translate(${x} ${y})`} onClick={onClick}>
      <title>{label}</title>
      {!seen && <circle className="intro-badge-pulse" r={12} />}
      <circle r={11} />
      <text y={4} textAnchor="middle">{n}</text>
    </g>
  );
}

/** Name buttons below diagram: corresponds 1-to-1 with numbers, touch-friendly. */
export function HotspotChips({ items, selected, seen, onSelect }: { items: Hotspot[]; selected: string; seen: Set<string>; onSelect: (id: string) => void }) {
  return (
    <div className="intro-chips">
      {items.map((h, i) => (
        <button key={h.id} className={`intro-chip ${selected === h.id ? 'active' : ''} ${seen.has(h.id) ? 'seen' : ''}`} onClick={() => onSelect(h.id)}>
          <i>{i + 1}</i>{h.name}
        </button>
      ))}
    </div>
  );
}

/* ---------- Step 1: What is in the scene ---------- */
export function sceneHotspots(t: T): Hotspot[] {
  return [
    { id: 'ship', name: t('Your ship', 'Your ship'), text: t('The white shape that is narrow at one end is the spacecraft you fly. The pointy end is its door, which must meet the station’s door. Next step zooms in.', 'The white shape that is narrow at one end is the spacecraft you fly. The pointy end is its door, which must meet the station’s door. Next step zooms in.') },
    { id: 'arrow', name: t('Blue arrow', 'Blue arrow'), text: t('It shows velocity: it points where the ship is moving, and longer means faster. When it disappears, the ship has stopped.', 'It shows velocity: it points where the ship is moving, and longer means faster. When it disappears, the ship has stopped.') },
    { id: 'ring', name: t('Yellow ring (8 m)', 'Yellow ring (8 m)'), text: t('This yellow-green ring is 8 m from the station: mission 1’s stop line, called a “hold point”. Mission 1 is all about stopping inside it.', 'This yellow-green ring is 8 m from the station: mission 1’s stop line, called a “hold point”. Mission 1 is all about stopping inside it.') },
    { id: 'port', name: t('Docking port', 'Docking port'), text: t('The ring at the very front of the station: its door. Joining the ship’s door to it tightly is called “docking”. Then astronauts can float across.', 'The ring at the very front of the station: its door. Joining the ship’s door to it tightly is called “docking”. Then astronauts can float across.') },
    { id: 'line', name: t('Dashed line', 'Dashed line'), text: t('The dashed “centre line” runs straight out from the door; follow it to face the door head-on. The faint circles are distance marks.', 'The dashed “centre line” runs straight out from the door; follow it to face the door head-on. The faint circles are distance marks.') },
    { id: 'station', name: t('Space station', 'Space station'), text: t('The International Space Station: a huge lab about 400 km above Earth where astronauts live. You see its front section, called Harmony.', 'The International Space Station: a huge lab about 400 km above Earth where astronauts live. You see its front section, called Harmony.') },
    { id: 'earth', name: t('Earth (true scale)', 'Earth (true scale)'), text: t('The station flies about 420 km up, while Earth’s radius is 6,371 km. It is very close to the surface! Looking down, Earth is not a tiny marble in the distance, but a giant curved blue world spanning across the view below.', 'The station flies about 420 km up, while Earth’s radius is 6,371 km. It is very close to the surface! Looking down, Earth is not a tiny marble in the distance, but a giant curved blue world spanning across the view below.') }
  ];
}

export function SceneMap({ t, selected, seen, onSelect }: { t: T; selected: string; seen: Set<string>; onSelect: (id: string) => void }) {
  const port = 120, m = 26, cy = 150, ship = port + 18 * m;
  const hs = sceneHotspots(t);
  const hot = (id: string) => (selected === id ? 'intro-hot' : '');
  const pick = (id: string) => () => onSelect(id);
  const ring = (z: number, cls: string) => <ellipse className={cls} cx={port + z * m} cy={cy} rx={6} ry={2 * m} />;
  const badges: [string, number, number][] = [['ship', ship + 46, cy], ['arrow', ship + 30, 92], ['ring', port + 8 * m, 84], ['port', port, 116], ['line', 712, cy], ['station', 75, cy], ['earth', 380, 282]];
  return (
    <svg className="intro-svg" viewBox="0 0 760 300" role="img" aria-label={t('Scene diagram', 'Scene diagram')}>
      <defs>
        <radialGradient id="intro-earth" cx="50%" cy="0%" r="80%"><stop offset="0" stopColor="#3d7fb0" /><stop offset="1" stopColor="#0d2235" /></radialGradient>
      </defs>
      {[[60, 30], [210, 50], [470, 22], [690, 60], [600, 240], [300, 40], [170, 240], [720, 210]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} fill="#cfd9df" opacity={0.6} />)}
      <g className={`intro-hit ${hot('earth')}`} onClick={pick('earth')}><circle cx={380} cy={940} r={680} fill="url(#intro-earth)" /></g>
      <g className={`intro-hit ${hot('station')}`} onClick={pick('station')}>
        <rect className="intro-panel" x={8} y={22} width={30} height={92} /><rect className="intro-panel" x={8} y={186} width={30} height={92} />
        <rect className="intro-metal" x={20} y={20} width={6} height={260} />
        <rect className="intro-metal" x={-20} y={cy - 26} width={60} height={52} />
        <rect className="intro-metal" x={40} y={cy - 30} width={70} height={60} rx={4} />
        <rect className="intro-metal dark" x={110} y={cy - 17} width={10} height={34} />
      </g>
      <g className={`intro-hit ${hot('line')}`} onClick={pick('line')}>
        <line className="intro-centre" x1={port} y1={cy} x2={750} y2={cy} />
        <line x1={port} y1={cy} x2={750} y2={cy} stroke="transparent" strokeWidth={14} />
        {ring(4, 'intro-guide')}{ring(14, 'intro-guide')}{ring(22, 'intro-guide')}
      </g>
      <g className={`intro-hit ${hot('port')}`} onClick={pick('port')}><ellipse className="intro-port" cx={port} cy={cy} rx={5} ry={19} /></g>
      <g className={`intro-hit ${hot('ring')}`} onClick={pick('ring')}>
        {ring(8, 'intro-ring')}
        <ellipse cx={port + 8 * m} cy={cy} rx={14} ry={2 * m + 6} fill="transparent" />
        <text className="intro-ring-text" x={port + 8 * m} y={cy + 2 * m + 18} textAnchor="middle">8 m</text>
      </g>
      <g className="intro-hit" onClick={pick('ship')}><ShipSide x={ship} y={cy} s={m} hot={selected === 'ship' ? 'body' : undefined} /></g>
      <g className={`intro-hit ${hot('arrow')}`} onClick={pick('arrow')}>
        <line className="intro-arrow" x1={ship + 60} y1={92} x2={ship - 6} y2={92} />
        <polygon className="intro-arrow-head" points={`${ship - 18},92 ${ship - 4},85 ${ship - 4},99`} />
        <rect x={ship - 20} y={80} width={84} height={24} fill="transparent" />
      </g>
      {badges.map(([id, x, y]) => {
        const i = hs.findIndex((h) => h.id === id);
        return <Badge key={id} x={x} y={y} n={i + 1} label={hs[i].name} active={selected === id} seen={seen.has(id)} onClick={pick(id)} />;
      })}
    </svg>
  );
}

/* ---------- Step 2: Ship close-up ---------- */
export function shipHotspots(t: T): Hotspot[] {
  return [
    {
      id: 'nose',
      name: t('Pointy end = Nosecone Hatch & Port', 'Pointy end = Nosecone Hatch & Port'),
      text: t(
        'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station! International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!',
        'Nosecone Hatch: Just like a helmet visor for the spacecraft! It shields against heat and wind during launch; once in space, press [1] to open it, reveal the International Docking Adapter (IDA), and lock with the station! International Docking Adapter (IDA): The docking doorway at the ship nose with precision latching rings. Once open, align it smoothly with the station’s PMA-2 port!'
      )
    },
    { id: 'window', name: t('Window', 'Window'), text: t('Astronauts can look out, but docking mostly relies on cameras and the numbers on screen.', 'Astronauts can look out, but docking mostly relies on cameras and the numbers on screen.') },
    { id: 'body', name: t('Crew cabin', 'Crew cabin'), text: t('Where astronauts sit; shaped like a cone. The whole ship is about 3 m long, a bit shorter than a small car.', 'Where astronauts sit; shaped like a cone. The whole ship is about 3 m long, a bit shorter than a small car.') },
    { id: 'tail', name: t('Back (fuel)', 'Back (fuel)'), text: t('Holds the fuel for thrusting. Fuel is limited: every puff uses some, and when it runs out you can’t change speed any more.', 'Holds the fuel for thrusting. Fuel is limited: every puff uses some, and when it runs out you can’t change speed any more.') },
    { id: 'jets', name: t('Little jets (thrusters)', 'Little jets (thrusters)'), text: t('Small nozzles called thrusters. Gas out the back pushes the ship forward; gas out the front slows it down or backs it up. Holding a button fires them.', 'Small nozzles called thrusters. Gas out the back pushes the ship forward; gas out the front slows it down or backs it up. Holding a button fires them.') }
  ];
}

export function ShipCloseup({ t, selected, seen, onSelect }: { t: T; selected: string; seen: Set<string>; onSelect: (id: string) => void }) {
  const s = 80, x = 260, cy = 140;
  const hs = shipHotspots(t);
  const pick = (id: string) => () => onSelect(id);
  const badges: [string, number, number][] = [['nose', x + 6, cy], ['window', x + 80, cy - 48], ['body', x + 130, cy + 8], ['tail', x + 200, cy + 60], ['jets', x + 41, cy + 74]];
  return (
    <svg className="intro-svg" viewBox="0 0 760 280" role="img" aria-label={t('Ship close-up', 'Ship close-up')}>
      <rect className="intro-metal" x={-10} y={cy - 70} width={70} height={140} rx={6} />
      <ellipse className="intro-port" cx={62} cy={cy} rx={7} ry={44} />
      <line className="intro-centre" x1={70} y1={cy} x2={x - 4} y2={cy} />
      <text className="intro-small-text" x={30} y={cy + 92} textAnchor="middle">{t('Station door', 'Station door')}</text>
      <path className="intro-align-arrow" d={`M ${x - 22} ${cy - 62} L ${92} ${cy - 62}`} />
      <polygon className="intro-arrow-head lime" points={`${82},${cy - 62} ${94},${cy - 68} ${94},${cy - 56}`} />
      <text className="intro-small-text" x={(x + 70) / 2} y={cy - 74} textAnchor="middle">{t('Door to door, gently', 'Door to door, gently')}</text>
      <ShipSide x={x} y={cy} s={s} flame={selected === 'jets' ? 0.7 : 0} hot={selected} />
      <rect className="intro-hit-zone" x={x - 6} y={cy - 46} width={24} height={92} onClick={pick('nose')} />
      <rect className="intro-hit-zone" x={x + 58} y={cy - 64} width={44} height={30} onClick={pick('window')} />
      <rect className="intro-hit-zone" x={x + 100} y={cy - 40} width={72} height={80} onClick={pick('body')} />
      <rect className="intro-hit-zone" x={x + 176} y={cy - 112} width={56} height={224} onClick={pick('tail')} />
      <rect className="intro-hit-zone" x={x + 26} y={cy + 34} width={32} height={50} onClick={pick('jets')} />
      {badges.map(([id, bx, by]) => {
        const i = hs.findIndex((h) => h.id === id);
        return <Badge key={id} x={bx} y={by} n={i + 1} label={hs[i].name} active={selected === id} seen={seen.has(id)} onClick={pick(id)} />;
      })}
    </svg>
  );
}

/* ---------- Steps 3 & 4: Practice along a straight line ---------- */
export function TrackSim({ t, mode }: { t: T; mode: 'practice' | 'compare' }) {
  const [state, setState] = useState<TrackState>(createTrack);
  const [pilot, setPilot] = useState<TrackPilot | null>(null);
  const stateRef = useRef(state), input = useRef(0), pilotRef = useRef<TrackPilot | null>(null);
  const rate = mode === 'compare' ? 3 : 1;

  const launch = (p: TrackPilot) => {
    stateRef.current = createTrack(); input.current = 0; pilotRef.current = p;
    setState(stateRef.current); setPilot(p);
  };

  useEffect(() => {
    let frame = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += Math.min(0.25, (now - last) / 1000) * rate; last = now;
      const p = pilotRef.current;
      if (p && stateRef.current.status === 'flying') {
        while (acc >= DT) { stateRef.current = trackStep(stateRef.current, pilotThrust(p, stateRef.current, input.current)); acc -= DT; }
        setState(stateRef.current);
      } else acc = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rate]);

  useEffect(() => {
    if (mode !== 'practice') return;
    const map: Record<string, number> = { KeyR: -1, KeyF: 1 };
    const down = (e: KeyboardEvent) => { if (e.code in map) { e.preventDefault(); input.current = map[e.code]; } };
    const up = (e: KeyboardEvent) => { if (e.code in map) input.current = 0; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); input.current = 0; };
  }, [mode]);

  const port = 70, m = 36, cy = 118;
  const nose = port + state.x * m;
  const running = pilot !== null && state.status === 'flying';
  const arrowLen = Math.min(150, Math.abs(state.v) * 120);
  const dir = Math.sign(state.v);

  let message: string;
  if (state.status === 'crash') message = pilot === 'coast'
    ? t('Bang! Nobody braked, so the ship kept its speed and hit the station. Touching the station fails mission 1.', 'Bang! Nobody braked, so the ship kept its speed and hit the station. Touching the station fails mission 1.')
    : t('Bang! Releasing the button doesn’t stop the ship. Brake earlier.', 'Bang! Releasing the button doesn’t stop the ship. Brake earlier.');
  else if (state.status === 'lost') message = t('Braked too hard, so the ship drifted backward. Use short, gentle taps near the end.', 'Braked too hard, so the ship drifted backward. Use short, gentle taps near the end.');
  else if (state.status === 'success') message = pilot === 'auto'
    ? t('Braking starts over 4 m before the ring, so the speed reaches zero right inside it.', 'Braking starts over 4 m before the ring, so the speed reaches zero right inside it.')
    : t('Nice! You stopped in the ring — that is exactly how mission 1 is won.', 'Nice! You stopped in the ring — that is exactly how mission 1 is won.');
  else if (!pilot) message = mode === 'practice'
    ? t('Press “Start practice”. The ship drifts toward the station; hold “Brake” to stop it in the ring.', 'Press “Start practice”. The ship drifts toward the station; hold “Brake” to stop it in the ring.')
    : t('Pick one and watch what happens (3× speed).', 'Pick one and watch what happens (3× speed).');
  else if (state.hold > 0) message = t('Stopped in the ring, hold it… {0} / {1} s', 'Stopped in the ring, hold it… {0} / {1} s', { 0: state.hold.toFixed(1), 1: TRACK.hold });
  else if (inRing(state) && !isStopped(state)) message = t('Inside the ring, but still moving.', 'Inside the ring, but still moving.');
  else if (state.thrust === 0 && !isStopped(state)) message = t('No button pressed, yet the ship keeps moving — that’s inertia: things keep doing what they were doing.', 'No button pressed, yet the ship keeps moving — that’s inertia: things keep doing what they were doing.');
  else if (state.thrust > 0) message = t('Gas out the front: speed is dropping…', 'Gas out the front: speed is dropping…');
  else message = t('Gas out the back: the ship speeds up toward the station!', 'Gas out the back: the ship speeds up toward the station!');

  const hold = (v: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); input.current = v; },
    onPointerUp: () => { input.current = 0; }, onPointerCancel: () => { input.current = 0; }, onLostPointerCapture: () => { input.current = 0; }
  });

  return (
    <div className={`intro-track ${state.status}`}>
      <svg className="intro-svg" viewBox="0 0 720 232" role="img" aria-label={t('One-line practice', 'One-line practice')}>
        <rect className={`intro-metal ${state.status === 'crash' ? 'crashed' : ''}`} x={-10} y={cy - 62} width={72} height={124} rx={5} />
        <rect className="intro-metal dark" x={62} y={cy - 24} width={8} height={48} />
        <line className="intro-centre" x1={port} y1={cy} x2={720} y2={cy} />
        <rect className="intro-ring-band" x={port + (TRACK.target - TRACK.tolerance) * m} y={cy - 74} width={TRACK.tolerance * 2 * m} height={148} />
        <ellipse className="intro-ring" cx={port + TRACK.target * m} cy={cy} rx={7} ry={72} />
        {Array.from({ length: 9 }, (_, i) => i * 2).map((d) => (
          <g key={d}><line className="intro-tick" x1={port + d * m} y1={206} x2={port + d * m} y2={212} /><text className="intro-small-text" x={port + d * m} y={228} textAnchor="middle">{d}{d === 16 ? t(' m', ' m') : ''}</text></g>
        ))}
        <ShipSide x={nose} y={cy} s={m} flame={running ? state.thrust : 0} />
        {Math.abs(state.v) > 0.005 && (
          <g>
            <line className="intro-arrow" x1={nose + 52} y1={cy - 64} x2={nose + 52 + dir * arrowLen} y2={cy - 64} />
            <polygon className="intro-arrow-head" transform={`translate(${nose + 52 + dir * (arrowLen + 6)} ${cy - 64}) scale(${-dir} 1)`} points="-8,0 6,-7 6,7" />
          </g>
        )}
      </svg>
      <div className="intro-readout">
        <span><small>{t('To door', 'To door')}</small><b>{state.x.toFixed(2)}</b> {t('m', 'm')}</span>
        <span className={isStopped(state) ? 'ok' : ''}><small>{t('Closing speed', 'Closing speed')}</small><b>{(-state.v).toFixed(2)}</b> {t('m/s', 'm/s')}</span>
        <span className={inRing(state) ? 'ok' : ''}><small>{t('In the ring?', 'In the ring?')}</small><b>{inRing(state) ? t('Yes', 'Yes') : t('No', 'No')}</b></span>
      </div>
      <p className="intro-track-msg" aria-live="polite">{message}</p>
      <div className="intro-track-controls">
        {mode === 'practice' ? (
          <>
            <button className="secondary-button" onClick={() => launch('manual')}>
              {pilot ? <RotateCcw size={15} /> : <Play size={15} />}{pilot ? t('Retry', 'Retry') : t('Start practice', 'Start practice')}
            </button>
            <button className="intro-thrust" disabled={!running} {...hold(-1)}>◀ {t('Speed up', 'Speed up')} <kbd>R</kbd></button>
            <button className="intro-thrust brake" disabled={!running} {...hold(1)}>{t('Brake', 'Brake')} ▶ <kbd>F</kbd></button>
          </>
        ) : (
          <>
            <button className={`secondary-button ${pilot === 'coast' ? 'picked' : ''}`} onClick={() => launch('coast')}><Play size={15} />{t('What if I never brake?', 'What if I never brake?')}</button>
            <button className={`secondary-button ${pilot === 'auto' ? 'picked' : ''}`} onClick={() => launch('auto')}><Play size={15} />{t('Show the right way', 'Show the right way')}</button>
          </>
        )}
      </div>
    </div>
  );
}
