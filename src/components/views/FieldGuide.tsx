import { loc, makeT } from '../../i18n';
import { scenarios } from '../../sim/scenarios';
import { useSession } from '../../store';

export function FieldGuide() {
  const language = useSession((s) => s.language);
  const t = makeT(language);

  return (
    <section className="content-page guide-page">
      <span className="eyebrow">{t('THE SCIENCE OF APPROACH', 'THE SCIENCE OF APPROACH')}</span>
      <h1>{t('Understand every impulse.', 'Understand every impulse.')}</h1>
      <p className="page-lead">
        {t(
          'Four small experiments in position, velocity and attitude.',
          'Four small experiments in position, velocity and attitude.'
        )}
      </p>

      {scenarios.map((c) => (
        <article className="guide-lesson" key={c.id}>
          <span>0{c.id}</span>
          <div>
            <h2>{loc(language, c.title)}</h2>
            <p>{loc(language, c.lesson)}</p>
            <small>{loc(language, c.constraints)}</small>
          </div>
        </article>
      ))}

      <article className="science-note">
        <h2>{t('Model & scientific boundaries', 'Model & scientific boundaries')}</h2>
        <p>
          {t(
            'This is a near-field teaching model for the final 100 metres. Thrust, inertia and attitude use a fixed simulation timestep and explicit units. It does not model orbital rendezvous, tidal effects, complex contact mechanics or the real Dragon control system.',
            'This is a near-field teaching model for the final 100 metres. Thrust, inertia and attitude use a fixed simulation timestep and explicit units. It does not model orbital rendezvous, tidal effects, complex contact mechanics or the real Dragon control system.'
          )}
        </p>
        <p>
          {t(
            'Translation uses ideal resultant forces in the docking-port frame; attitude commands act on body axes. Assist braking applies thrust and consumes resources. The station and ship are in orbital free fall: neglecting orbital effects locally does not mean there is no gravity in space.',
            'Translation uses ideal resultant forces in the docking-port frame; attitude commands act on body axes. Assist braking applies thrust and consumes resources. The station and ship are in orbital free fall: neglecting orbital effects locally does not mean there is no gravity in space.'
          )}
        </p>
        <p>
          {t(
            'Teaching capture limits: axial speed ≤ 0.15 m/s, lateral offset ≤ 0.18 m, lateral speed ≤ 0.04 m/s, attitude error ≤ 2°, angular rate ≤ 0.5°/s. These are not operational spacecraft limits.',
            'Teaching capture limits: axial speed ≤ 0.15 m/s, lateral offset ≤ 0.18 m, lateral speed ≤ 0.04 m/s, attitude error ≤ 2°, angular rate ≤ 0.5°/s. These are not operational spacecraft limits.'
          )}
        </p>
      </article>
    </section>
  );
}

