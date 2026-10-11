'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LocalizedText, useDisplayLocale } from './display-locale';
import { PlatformCommandMenu } from './platform-command-menu';
import { navigationModules, type ProductModule } from './product-catalog';

const compactLabels: Record<string, readonly [string, string]> = {
  customers: ['Customers', 'العملاء'],
  operators: ['AI', 'الذكاء الاصطناعي'],
  analytics: ['Analytics', 'التحليلات'],
  team: ['Team', 'الفريق'],
  settings: ['Settings', 'الإعدادات'],
};

export function PlatformNavigation() {
  const pathname = usePathname();
  const { locale, setLocale } = useDisplayLocale();
  const reviewMode = pathname === '/' || pathname.startsWith('/review/');
  if (pathname === '/preview-login' || pathname.startsWith('/health')) return null;

  return (
    <div className="platform-chrome">
      <div className="platform-chrome__inner">
        <Link className="platform-chrome__brand" href="/" aria-label="PRENEURA platform home">
          <span className="platform-chrome__mark" aria-hidden="true">
            P
          </span>
          <span>
            <strong>PRENEURA</strong>
            <small>
              {reviewMode ? (
                <LocalizedText en="Review mode" ar="وضع المراجعة" />
              ) : (
                <LocalizedText en="Platform" ar="المنصة" />
              )}
            </small>
          </span>
        </Link>
        <nav className="platform-chrome__nav" aria-label="Platform modules">
          <NavigationLink
            active={pathname === '/'}
            href="/"
            labelAr="الرئيسية"
            labelEn="Home"
          />
          {navigationModules('primary').map((module) => (
            <ModuleNavigationLink
              key={module.slug}
              module={module}
              pathname={pathname}
              reviewMode={reviewMode}
            />
          ))}
        </nav>
        <nav className="platform-chrome__utilities" aria-label="Platform administration">
          {navigationModules('secondary').map((module) => (
            <ModuleNavigationLink
              key={module.slug}
              module={module}
              pathname={pathname}
              reviewMode={reviewMode}
              utility
            />
          ))}
        </nav>
        <PlatformCommandMenu />
        <div className="platform-chrome__locale" aria-label="Display language and direction">
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
      </div>
    </div>
  );
}

function ModuleNavigationLink({
  module,
  pathname,
  reviewMode,
  utility = false,
}: {
  module: ProductModule;
  pathname: string;
  reviewMode: boolean;
  utility?: boolean;
}) {
  const href = reviewMode ? `/review/${module.slug}` : `/${module.slug}`;
  const compact = compactLabels[module.slug];
  return (
    <NavigationLink
      active={isActive(pathname, href)}
      href={href}
      labelEn={compact?.[0] ?? module.labelEn}
      labelAr={compact?.[1] ?? module.labelAr}
      utility={utility}
    />
  );
}

function NavigationLink({
  href,
  labelEn,
  labelAr,
  active,
  utility = false,
}: {
  href: string;
  labelEn: string;
  labelAr: string;
  active: boolean;
  utility?: boolean;
}) {
  return (
    <Link
      className={utility ? 'platform-chrome__utility' : 'platform-chrome__link'}
      data-active={active}
      href={href}
    >
      <LocalizedText en={labelEn} ar={labelAr} />
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
