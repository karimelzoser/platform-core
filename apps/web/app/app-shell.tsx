'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DirectionControl } from './direction-control';

const groups = [
  {
    label: 'Customer operations',
    items: [
      ['inbox', 'Unified inbox'],
      ['customers', 'Customer 360'],
      ['tickets', 'Tickets'],
      ['confirmation', 'Confirmation'],
      ['returns', 'Returns & refunds'],
      ['recovery', 'Recovery'],
    ],
  },
  {
    label: 'Commerce & revenue',
    items: [
      ['orders', 'Orders'],
      ['shipping', 'Shipping'],
      ['sales', 'Sales'],
      ['campaigns', 'Campaigns'],
      ['analytics', 'Analytics & ROI'],
      ['billing', 'Billing & usage'],
    ],
  },
  {
    label: 'Automation & AI',
    items: [
      ['automation', 'Automation studio'],
      ['operators', 'AI operators'],
      ['knowledge', 'Knowledge'],
      ['approvals', 'Approvals'],
      ['integrations', 'Integrations'],
      ['developer', 'Developer platform'],
    ],
  },
  {
    label: 'Organization',
    items: [
      ['onboarding', 'Onboarding'],
      ['team', 'Team & roles'],
      ['settings', 'Settings'],
      ['organizations', 'Organizations'],
    ],
  },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter(([, label]) => label.toLowerCase().includes(normalizedQuery)),
        }))
        .filter((group) => group.items.length > 0),
    [normalizedQuery],
  );

  return (
    <div className="product-shell">
      <aside className="product-shell__sidebar" aria-label="Platform navigation">
        <div className="product-shell__brand-row">
          <Link className="product-shell__brand" href="/" aria-label="PRENEURA platform home">
            <span className="product-shell__brand-mark">P</span>
            <span>
              <strong>PRENEURA</strong>
              <small>Operations platform</small>
            </span>
          </Link>
          <span className="product-shell__environment">Review</span>
        </div>

        <label className="product-shell__search">
          <span className="sr-only">Find a module</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a module…"
            aria-label="Find a module"
          />
          <kbd>/</kbd>
        </label>

        <nav className="product-shell__nav">
          {filteredGroups.map((group) => (
            <section key={group.label} className="product-shell__nav-group">
              <h2>{group.label}</h2>
              <div>
                {group.items.map(([slug, label]) => {
                  const href = `/review/${slug}`;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      href={href}
                      key={slug}
                      className="product-shell__nav-link"
                      aria-current={active ? 'page' : undefined}
                      data-active={active ? 'true' : 'false'}
                    >
                      <span className="product-shell__nav-dot" aria-hidden="true" />
                      <span>{label}</span>
                      <small>Review</small>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="product-shell__sidebar-footer">
          <Link href="/review/organizations">Organizations</Link>
          <Link href="/review/onboarding">Setup workspace</Link>
        </div>
      </aside>

      <section className="product-shell__workspace">
        <header className="product-shell__topbar">
          <details className="product-shell__mobile-nav">
            <summary aria-label="Open platform navigation">Menu</summary>
            <div className="product-shell__mobile-panel">
              {groups.map((group) => (
                <div key={group.label}>
                  <strong>{group.label}</strong>
                  {group.items.map(([slug, label]) => (
                    <Link href={`/review/${slug}`} key={slug}>
                      {label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>

          <div className="product-shell__context">
            <span className="product-shell__context-label">Workspace</span>
            <strong>Full product review</strong>
            <span className="product-shell__context-separator">/</span>
            <span className="product-shell__preview-note">No backend required</span>
          </div>

          <div className="product-shell__top-actions">
            <Link className="product-shell__icon-link" href="/review/approvals" aria-label="Approvals">
              Approvals
            </Link>
            <Link className="product-shell__icon-link" href="/review/integrations" aria-label="Integrations">
              Integrations
            </Link>
            <DirectionControl />
          </div>
        </header>

        <div className="product-shell__content">{children}</div>
      </section>
    </div>
  );
}
