'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  ['/', 'Home'],
  ['/inbox', 'Inbox'],
  ['/customers', 'Customers'],
  ['/orders', 'Orders'],
  ['/shipping', 'Shipping'],
  ['/returns', 'Returns'],
  ['/recovery', 'Recovery'],
  ['/sales', 'Sales'],
  ['/campaigns', 'Campaigns'],
  ['/automation', 'Automation'],
  ['/operators', 'AI'],
  ['/analytics', 'Analytics'],
] as const;

const secondaryLinks = [
  ['/approvals', 'Approvals'],
  ['/integrations', 'Integrations'],
  ['/team', 'Team'],
  ['/settings', 'Settings'],
] as const;

export function PlatformNavigation() {
  const pathname = usePathname();
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
            <small>Platform</small>
          </span>
        </Link>
        <nav className="platform-chrome__nav" aria-label="Platform modules">
          {links.map(([href, label]) => (
            <Link
              className="platform-chrome__link"
              data-active={isActive(pathname, href)}
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
        <nav className="platform-chrome__utilities" aria-label="Platform administration">
          {secondaryLinks.map(([href, label]) => (
            <Link
              className="platform-chrome__utility"
              data-active={isActive(pathname, href)}
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
