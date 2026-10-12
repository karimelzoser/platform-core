'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DirectionControl } from './direction-control';
import { ReviewActivityMenu } from './review-activity-menu';

const groups = [
  {
    label: 'Customer operations',
    items: [
      ['inbox', 'Unified inbox'],
      ['customers', 'Customer 360'],
      ['tickets', 'Tickets'],
      ['orders', 'Orders'],
      ['confirmation', 'Confirmation'],
      ['shipping', 'Shipping'],
      ['returns', 'Returns & refunds'],
      ['recovery', 'Recovery'],
    ],
  },
  {
    label: 'Revenue & measurement',
    items: [
      ['sales', 'Sales'],
      ['campaigns', 'Campaigns'],
      ['analytics', 'Analytics & ROI'],
      ['billing', 'Billing & usage'],
    ],
  },
  {
    label: 'Automation & configuration',
    items: [
      ['automation', 'Automation studio'],
      ['workflows', 'Workflow operations'],
      ['configuration', 'Configuration studio'],
      ['simulation', 'Configuration simulation'],
      ['integrations', 'Integrations'],
    ],
  },
  {
    label: 'AI & knowledge',
    items: [
      ['operators', 'AI operators'],
      ['ai-tools', 'AI tool registry'],
      ['ai-routing', 'AI gateway & routing'],
      ['knowledge', 'Knowledge'],
    ],
  },
  {
    label: 'Platform & governance',
    items: [
      ['custom-data', 'Custom data'],
      ['developer', 'Developer platform'],
      ['admin', 'Admin control center'],
      ['governance', 'Data governance'],
    ],
  },
  {
    label: 'Organization',
    items: [
      ['onboarding', 'Onboarding'],
      ['team', 'Team & roles'],
      ['approvals', 'Approvals'],
      ['settings', 'Settings'],
      ['organizations', 'Organizations'],
    ],
  },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const element = event.target instanceof HTMLElement ? event.target : null;
      const editing =
        element?.tagName === 'INPUT' ||
        element?.tagName === 'TEXTAREA' ||
        element?.tagName === 'SELECT' ||
        element?.isContentEditable;

      if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    setQuery('');
  }, [pathname]);

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
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a module…"
            aria-label="Find a module"
          />
          <kbd>/</kbd>
        </label>

        <nav className="product-shell__nav" aria-label="Product review modules">
          {filteredGroups.map((group) => (
            <section key={group.label} className="product-shell__nav-group">
              <h2>{group.label}</h2>
              <div>
                {group.items.map(([slug, label]) => {
                  const href = reviewHref(slug);
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
          {filteredGroups.length === 0 ? (
            <p className="product-shell__no-results" role="status">
              No modules match “{query}”. Press Escape to clear.
            </p>
          ) : null}
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
                    <Link href={reviewHref(slug)} key={slug}>
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
            <ReviewActivityMenu />
            <Link
              className="product-shell__icon-link"
              href="/review/approvals"
              aria-label="Approvals"
            >
              Approvals
            </Link>
            <Link
              className="product-shell__icon-link"
              href="/review/integrations"
              aria-label="Integrations"
            >
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

function reviewHref(slug: string): Route {
  return `/review/${slug}` as Route;
}
