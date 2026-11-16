import { describe, expect, it } from 'vitest';
import { extractKeys } from './extract';
import { MESSAGES } from './messages';
import { LANGUAGES, loc, translate } from './index';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('i18n catalogs', () => {
  const { keys, dynamic } = extractKeys();
  const catalog = new Map(MESSAGES.map((row) => [row[0], row]));

  it('has no untranslatable template strings in t() calls', () => {
    expect(dynamic).toEqual([]);
  });

  it('covers every UI string in all languages', () => {
    const missing = [...keys].filter((k) => !catalog.has(k));
    expect(missing).toEqual([]);
    for (const row of MESSAGES) for (const text of row) expect(text.trim().length, row[0]).toBeGreaterThan(0);
  });

  it('keeps {placeholders} identical across languages', () => {
    for (const row of MESSAGES) for (const text of row.slice(1)) expect(placeholders(text), row[0]).toBe(placeholders(row[0]));
  });

  it('translates, interpolates and falls back to English', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'es', 'zh', 'ru', 'fr', 'ja', 'de']);
    expect(translate('de', 'Close')).toBe('Schließen');
    expect(translate('ja', 'Drift {0} m/s', { 0: '0.12' })).toBe('ドリフト 0.12 m/s');
    expect(translate('fr', 'Not in the catalog')).toBe('Not in the catalog');
    expect(loc('es', { zh: 'Learn to stop', en: 'Learn to stop' })).toBe('Aprende a detenerte');
  });
});
