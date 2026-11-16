import { translate } from '../i18n';
import type { Failure, Language } from '../sim/types';

const reasons: Record<string, [string, string]> = {
  overspeed: [
    'Contact speed was too high. Start counter-thrust earlier and approach below 0.15 m/s.',
    'Contact speed was too high. Start counter-thrust earlier and approach below 0.15 m/s.'
  ],
  drift: [
    'Lateral position or velocity was too large. Centre the ship, then cancel the sideways drift.',
    'Lateral position or velocity was too large. Centre the ship, then cancel the sideways drift.'
  ],
  alignment: [
    'Orientation or angular velocity was outside the capture limits. Align, then counter-thrust to stop rotating.',
    'Orientation or angular velocity was outside the capture limits. Align, then counter-thrust to stop rotating.'
  ],
  collision: [
    'You contacted station structure. Stay in the approach corridor and reduce speed before closing in.',
    'You contacted station structure. Stay in the approach corridor and reduce speed before closing in.'
  ],
  escape: [
    'The spacecraft flew beyond the safe training boundary. Without thrust it floats indefinitely in space. Watch velocity and brake in advance.',
    'The spacecraft flew beyond the safe training boundary. Without thrust it floats indefinitely in space. Watch velocity and brake in advance.'
  ],
  fuel: [
    'Thruster reserve is exhausted. Try shorter impulses and avoid repeated overcorrection.',
    'Thruster reserve is exhausted. Try shorter impulses and avoid repeated overcorrection.'
  ],
  timeout: [
    'The training time limit was reached. Review the flight trace and try again.',
    'The training time limit was reached. Review the flight trace and try again.'
  ]
};

const defaultReason: [string, string] = [
  'Review how your thrust changed the motion.',
  'Review how your thrust changed the motion.'
];

export function getReasonText(reason: Failure | string | undefined, lang: Language): string {
  return translate(lang, (reasons[reason ?? ''] ?? defaultReason)[1]);
}
