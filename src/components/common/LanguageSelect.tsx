import { Languages } from 'lucide-react';
import { LANGUAGES, isLanguage, translate } from '../../i18n';
import { useSession } from '../../store';

export function LanguageSelect({ className = '' }: { className?: string }) {
  const language = useSession((s) => s.language);
  const setLanguage = useSession((s) => s.setLanguage);
  return (
    <label className={`language-select ${className}`}>
      <Languages size={16} aria-hidden="true" />
      <select
        aria-label={translate(language, 'Language')}
        value={language}
        onChange={(e) => { if (isLanguage(e.target.value)) setLanguage(e.target.value); }}
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.html}>{l.label}</option>)}
      </select>
    </label>
  );
}
