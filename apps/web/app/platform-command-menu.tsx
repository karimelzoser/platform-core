'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LocalizedText, useDisplayLocale } from './display-locale';
import { productGroups, productModules } from './product-catalog';

export function PlatformCommandMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useDisplayLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const reviewMode = pathname === '/' || pathname.startsWith('/review/');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return productModules;
    return productModules.filter((module) => {
      const group = productGroups.find((candidate) => candidate.key === module.group);
      return [
        module.slug,
        module.labelEn,
        module.labelAr,
        group?.titleEn ?? '',
        group?.titleAr ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [query]);

  function target(slug: string) {
    return reviewMode ? `/review/${slug}` : `/${slug}`;
  }

  function navigate(slug: string) {
    setOpen(false);
    setQuery('');
    router.push(target(slug));
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="platform-command-trigger"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <span>
          <LocalizedText en="Find" ar="بحث" />
        </span>
        <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div
          className="platform-command-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          role="presentation"
        >
          <section
            aria-label={locale === 'ar' ? 'البحث في وحدات المنصة' : 'Find a platform module'}
            aria-modal="true"
            className="platform-command-dialog"
            role="dialog"
          >
            <header className="platform-command-dialog__header">
              <div>
                <p className="ds-eyebrow">
                  <LocalizedText en="PLATFORM NAVIGATION" ar="التنقل في المنصة" />
                </p>
                <h2>
                  <LocalizedText en="Find a workspace" ar="ابحث عن مساحة عمل" />
                </h2>
              </div>
              <button
                aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}
                className="platform-command-close"
                onClick={() => {
                  setOpen(false);
                }}
                type="button"
              >
                ×
              </button>
            </header>
            <input
              autoFocus
              className="platform-command-input"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && results[0]) navigate(results[0].slug);
              }}
              placeholder={locale === 'ar' ? 'الوحدة، المسار، المجموعة…' : 'Module, route, group…'}
              type="search"
              value={query}
            />
            <div className="platform-command-results" role="listbox">
              {results.length ? (
                results.map((module) => {
                  const group = productGroups.find((candidate) => candidate.key === module.group);
                  return (
                    <button
                      className="platform-command-result"
                      key={module.slug}
                      onClick={() => {
                        navigate(module.slug);
                      }}
                      role="option"
                      type="button"
                    >
                      <span>
                        <strong>{locale === 'ar' ? module.labelAr : module.labelEn}</strong>
                        <small>{locale === 'ar' ? group?.titleAr : group?.titleEn}</small>
                      </span>
                      <span className="platform-command-result__meta">
                        {module.implementation === 'implemented' ? (
                          <LocalizedText en="Implemented" ar="منفذة" />
                        ) : (
                          <LocalizedText en="Frontend preview" ar="معاينة واجهة" />
                        )}
                        <bdi>/{module.slug}</bdi>
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="platform-command-empty" role="status">
                  <strong>
                    <LocalizedText en="No matching workspace" ar="لا توجد مساحة عمل مطابقة" />
                  </strong>
                  <span>
                    <LocalizedText
                      en="Try another module name or route."
                      ar="جرّب اسم وحدة أو مساراً آخر."
                    />
                  </span>
                </div>
              )}
            </div>
            <footer className="platform-command-dialog__footer">
              <span>
                <kbd>Enter</kbd> <LocalizedText en="open first result" ar="فتح أول نتيجة" />
              </span>
              <span>
                <kbd>Esc</kbd> <LocalizedText en="close" ar="إغلاق" />
              </span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
