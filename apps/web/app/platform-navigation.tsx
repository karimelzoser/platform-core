'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LocalizedText, useDisplayLocale } from './display-locale';

const links = [
  ['/', 'Home', 'الرئيسية'],
  ['/inbox', 'Inbox', 'صندوق الوارد'],
  ['/customers', 'Customers', 'العملاء'],
  ['/orders', 'Orders', 'الطلبات'],
  ['/shipping', 'Shipping', 'الشحن'],
  ['/returns', 'Returns', 'المرتجعات'],
  ['/recovery', 'Recovery', 'الاسترداد'],
  ['/sales', 'Sales', 'المبيعات'],
  ['/campaigns', 'Campaigns', 'الحملات'],
  ['/automation', 'Automation', 'الأتمتة'],
  ['/operators', 'AI', 'الذكاء الاصطناعي'],
  ['/analytics', 'Analytics', 'التحليلات'],
] as const;

const secondaryLinks = [
  ['/approvals', 'Approvals', 'الموافقات'],
  ['/integrations', 'Integrations', 'التكاملات'],
  ['/team', 'Team', 'الفريق'],
  ['/settings', 'Settings', 'الإعدادات'],
] as const;

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
          {links.map(([href, en, ar]) => {
            const target = navigationHref(href, reviewMode);
            return (
              <Link
                className="platform-chrome__link"
                data-active={isActive(pathname, target)}
                href={target}
                key={href}
              >
                <LocalizedText en={en} ar={ar} />
              </Link>
            );
          })}
        </nav>
        <nav className="platform-chrome__utilities" aria-label="Platform administration">
          {secondaryLinks.map(([href, en, ar]) => {
            const target = navigationHref(href, reviewMode);
            return (
              <Link
                className="platform-chrome__utility"
                data-active={isActive(pathname, target)}
                href={target}
                key={href}
              >
                <LocalizedText en={en} ar={ar} />
              </Link>
            );
          })}
        </nav>
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

function navigationHref(href: string, reviewMode: boolean): string {
  if (href === '/') return '/';
  return reviewMode ? `/review${href}` : href;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
