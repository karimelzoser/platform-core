'use client';

import { useEffect, useState } from 'react';

type DisplayLocale = 'en' | 'ar';

const storageKey = 'platform.preview.display-locale';

export function DirectionControl() {
  const [locale, setLocale] = useState<DisplayLocale>('en');

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'ar' || saved === 'en') {
      applyLocale(saved);
      setLocale(saved);
    }
  }, []);

  function selectLocale(nextLocale: DisplayLocale) {
    window.localStorage.setItem(storageKey, nextLocale);
    applyLocale(nextLocale);
    setLocale(nextLocale);
  }

  return (
    <div className="direction-control" aria-label="Display language and direction">
      <span>Display</span>
      <button
        aria-pressed={locale === 'en'}
        onClick={() => {
          selectLocale('en');
        }}
        type="button"
      >
        English · LTR
      </button>
      <button
        aria-pressed={locale === 'ar'}
        onClick={() => {
          selectLocale('ar');
        }}
        type="button"
      >
        العربية · RTL
      </button>
    </div>
  );
}

function applyLocale(locale: DisplayLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}
