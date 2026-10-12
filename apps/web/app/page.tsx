import type { Route } from 'next';
import Link from 'next/link';

const moduleGroups = [
  {
    title: 'Customer operations',
    description: 'Daily customer-facing work, commerce decisions, and post-purchase service.',
    modules: [
      ['inbox', 'Unified inbox'],
      ['customers', 'Customer 360'],
      ['tickets', 'Tickets'],
      ['orders', 'Orders'],
      ['confirmation', 'Order confirmation'],
      ['shipping', 'Shipping'],
      ['returns', 'Returns & refunds'],
      ['recovery', 'Recovery'],
    ],
  },
  {
    title: 'Revenue & measurement',
    description: 'Pipeline, campaigns, attribution, ROI, and commercial usage control.',
    modules: [
      ['sales', 'Sales'],
      ['campaigns', 'Campaigns'],
      ['analytics', 'Analytics & ROI'],
      ['billing', 'Billing & usage'],
    ],
  },
  {
    title: 'Automation & configuration',
    description: 'Durable execution, typed workflow design, versioned configuration, and safe simulation.',
    modules: [
      ['automation', 'Automation studio'],
      ['workflows', 'Workflow operations'],
      ['configuration', 'Configuration studio'],
      ['simulation', 'Configuration simulation'],
      ['integrations', 'Integrations'],
    ],
  },
  {
    title: 'AI & knowledge',
    description: 'Governed operators, typed tools, model routing, evaluation boundaries, and tenant knowledge.',
    modules: [
      ['operators', 'AI operators'],
      ['ai-tools', 'AI tool registry'],
      ['ai-routing', 'AI gateway & routing'],
      ['knowledge', 'Knowledge'],
    ],
  },
  {
    title: 'Platform & governance',
    description: 'Extensibility, custom data, developer access, administration, privacy, and retention.',
    modules: [
      ['custom-data', 'Custom data'],
      ['developer', 'Developer platform'],
      ['admin', 'Admin control center'],
      ['governance', 'Data governance'],
    ],
  },
  {
    title: 'Organization control',
    description: 'Tenant setup, access control, approvals, security, and reusable business configuration.',
    modules: [
      ['onboarding', 'Onboarding'],
      ['team', 'Team & roles'],
      ['approvals', 'Approvals'],
      ['settings', 'Organization settings'],
      ['organizations', 'Organizations'],
    ],
  },
] as const;

export default function HomePage() {
  return (
    <main className="platform-home">
      <header className="platform-hero">
        <div>
          <p className="eyebrow">PRENEURA PLATFORM</p>
          <h1>One operating system for customer operations, revenue, automation, and AI.</h1>
          <p className="intro">
            Review the complete product experience without waiting for backend availability. Every
            review workspace uses deterministic representative data, local interaction state,
            responsive layouts, and the same product contracts that later bind to canonical APIs.
          </p>
        </div>
        <div className="platform-hero__status" role="note">
          <strong>Full product review mode</strong>
          <span>Visual and interaction review is decoupled from hosted services and provider credentials.</span>
        </div>
      </header>

      <section className="review-index-callout" aria-label="Review mode explanation">
        <span className="review-index-callout__icon" aria-hidden="true">
          R
        </span>
        <div>
          <strong>All planned product areas are reviewable now</strong>
          <span>
            Preview records are clearly labeled and never presented as production state. Search,
            filters, detail states, workflow boards, and simulated controls run locally without
            backend mutation.
          </span>
        </div>
        <Link className="ds-button ds-button--primary" href="/review/inbox">
          Start product tour
        </Link>
      </section>

      <section className="platform-summary" aria-label="Platform review summary">
        <div>
          <strong>30</strong>
          <span>reviewable product surfaces</span>
        </div>
        <div>
          <strong>6</strong>
          <span>operating workspaces</span>
        </div>
        <div>
          <strong>RTL + LTR</strong>
          <span>shared interaction direction</span>
        </div>
        <div>
          <strong>Backend-free</strong>
          <span>deterministic local review data</span>
        </div>
      </section>

      <div className="platform-module-groups">
        {moduleGroups.map((group) => (
          <section className="platform-module-group" key={group.title}>
            <div className="platform-module-group__heading">
              <div>
                <p className="eyebrow">WORKSPACE</p>
                <h2>{group.title}</h2>
              </div>
              <p>{group.description}</p>
            </div>
            <nav aria-label={group.title} className="platform-module-grid">
              {group.modules.map(([slug, label]) => (
                <Link className="platform-module-card" href={reviewHref(slug)} key={slug}>
                  <span className="platform-module-card__status" data-preview="true">
                    Interactive review
                  </span>
                  <strong>{label}</strong>
                  <span>Open review workspace</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
      </div>
    </main>
  );
}

function reviewHref(slug: string): Route {
  return `/review/${slug}` as Route;
}
