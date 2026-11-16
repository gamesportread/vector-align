import type { Language, Localized } from '../sim/types';
import { MESSAGES } from './messages';

export const LANGUAGES: { code: Language; label: string; html: string }[] = [
  { code: 'en', label: 'English', html: 'en' },
  { code: 'es', label: 'Español', html: 'es' },
  { code: 'zh', label: '简体中文', html: 'zh-CN' },
  { code: 'ru', label: 'Русский', html: 'ru' },
  { code: 'fr', label: 'Français', html: 'fr' },
  { code: 'ja', label: '日本語', html: 'ja' },
  { code: 'de', label: 'Deutsch', html: 'de' }
];

/** Catalog column order in messages rows: [en, es, zh, ru, fr, ja, de]. */
const COLUMNS: Language[] = ['en', 'es', 'zh', 'ru', 'fr', 'ja', 'de'];

const catalogs = new Map<Language, Map<string, string>>();
for (const [i, code] of COLUMNS.entries()) {
  if (i === 0) continue;
  catalogs.set(code, new Map(MESSAGES.map(row => [row[0], row[i]])));
}

export const isLanguage = (value: unknown): value is Language => COLUMNS.includes(value as Language);
export const htmlLang = (lang: Language) => LANGUAGES.find(l => l.code === lang)?.html ?? 'en';

export type Vars = Record<string, string | number>;

/** English text is the catalog key; missing entries fall back to English. `{name}` placeholders are filled from vars. */
export function translate(lang: Language, en: string, vars?: Vars): string {
  const text = (lang === 'en' ? undefined : catalogs.get(lang)?.get(en)) ?? en;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Legacy bilingual call signature t(zh, en, vars?) — the English argument is the key. */
export const makeT = (lang: Language) => (_zh: string, en: string, vars?: Vars) => translate(lang, en, vars);

export const loc = (lang: Language, value: Localized, vars?: Vars) => translate(lang, value.en, vars ?? value.vars);

