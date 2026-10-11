'use client';

import { LocalizedText, useDisplayLocale } from './display-locale';

export function DirectionControl() {
  const { locale, setLocale } = useDisplayLocale();

  return (
    <div className="direction-control" aria-label="Display language and direction">
      <span>
        <LocalizedText en="Display" ar="العرض" />
      </span>
      <button
        aria-pressed={locale === 'en'}
        onClick={() => {
          setLocale('en');
        }}
        type="button"
      >
        English · LTR
      </button>
      <button
        aria-pressed={locale === 'ar'}
        onClick={() => {
          setLocale('ar');
        }}
        type="button"
      >
        العربية · RTL
      </button>
    </div>
  );
}
