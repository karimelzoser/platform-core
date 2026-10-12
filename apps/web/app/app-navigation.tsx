'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const groups = [
  {
    label: 'Operate',
    items: [
      ['inbox', 'Inbox'],
      ['customers', 'Customers'],
      ['tickets', 'Tickets'],
      ['orders', 'Orders'],
      ['confirmation', 'Confirmation'],
      ['shipping', 'Shipping'],
      ['returns', 'Returns'],
      ['recovery', 'Recovery'],
    ],
  },
  {
    label: 'Grow',
    items: [
      ['sales', 'Sales'],
      ['campaigns', 'Campaigns'],
      ['analytics', 'Analytics'],
    ],
  },
  {
    label: 'Automate',
    items: [
      ['automation', 'Automation'],
      ['workflows', 'Workflow ops'],
      ['configuration', 'Configuration'],
      ['simulation', 'Simulation'],
      ['integrations', 'Integrations'],
    ],
  },
  {
    label: 'Intelligence',
    items: [
      ['operators', 'AI operators'],
      ['ai-tools', 'AI tools'],
      ['ai-routing', 'AI routing'],
      ['knowledge', 'Knowledge'],
    ],
  },
  {
    label: 'Platform',
    items: [
      ['custom-data', 'Custom data'],
      ['billing', 'Billing'],
      ['developer', 'Developer'],
      ['admin', 'Admin'],
      ['governance', 'Governance'],
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

export function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === '/preview-login') return null;

  return (
    <header className="app-nav" data-open={open || undefined}>
      <div className="app-nav__bar">
        <Link className="app-nav__brand" href="/" onClick={() => setOpen(false)}>
          <span className="app-nav__mark">P</span>
          <span>
            <strong>PRENEURA</strong>
            <small>Operations platform</small>
          </span>
        </Link>
        <div className="app-nav__meta">
          <span className="app-nav__preview-badge">Product review</span>
          <button
            aria-expanded={open}
            aria-label="Toggle platform navigation"
            className="app-nav__toggle"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
      <nav aria-label="Platform navigation" className="app-nav__panel">
        {groups.map((group) => (
          <section className="app-nav__group" key={group.label}>
            <p>{group.label}</p>
            <div>
              {group.items.map(([slug, label]) => {
                const href = `/${slug}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    aria-current={active ? 'page' : undefined}
                    className="app-nav__link"
                    data-active={active || undefined}
                    href={href}
                    key={slug}
                    onClick={() => setOpen(false)}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </header>
  );
}
