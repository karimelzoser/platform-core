'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type DisplayLocale = 'en' | 'ar';

interface DisplayLocaleContextValue {
  locale: DisplayLocale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: DisplayLocale) => void;
}

const storageKey = 'platform.preview.display-locale';
const DisplayLocaleContext = createContext<DisplayLocaleContextValue | null>(null);

export function DisplayLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<DisplayLocale>('en');

  const applyLocale = useCallback((nextLocale: DisplayLocale) => {
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
    document.body.dataset.locale = nextLocale;
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const initialLocale: DisplayLocale = saved === 'ar' ? 'ar' : 'en';
    applyLocale(initialLocale);
    setLocaleState(initialLocale);
  }, [applyLocale]);

  const setLocale = useCallback(
    (nextLocale: DisplayLocale) => {
      window.localStorage.setItem(storageKey, nextLocale);
      applyLocale(nextLocale);
      setLocaleState(nextLocale);
    },
    [applyLocale],
  );

  const value = useMemo<DisplayLocaleContextValue>(
    () => ({ locale, direction: locale === 'ar' ? 'rtl' : 'ltr', setLocale }),
    [locale, setLocale],
  );

  return <DisplayLocaleContext.Provider value={value}>{children}</DisplayLocaleContext.Provider>;
}

export function useDisplayLocale(): DisplayLocaleContextValue {
  const value = useContext(DisplayLocaleContext);
  if (!value) throw new Error('useDisplayLocale must be used inside DisplayLocaleProvider');
  return value;
}

export function LocalizedText({ en, ar }: { en: ReactNode; ar: ReactNode }) {
  const { locale } = useDisplayLocale();
  return <>{locale === 'ar' ? ar : en}</>;
}
