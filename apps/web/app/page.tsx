import Link from 'next/link';

const moduleGroups = [
  {
    title: 'Customer operations',
    description: 'Daily customer-facing work, service control, confirmation, and post-purchase care.',
    modules: [
      ['inbox', 'Unified inbox'],
      ['customers', 'Customer 360'],
      ['tickets', 'Tickets'],
      ['confirmation', 'Order confirmation'],
      ['returns', 'Returns & refunds'],
      ['recovery', 'Recovery'],
    ],
  },
  {
    title: 'Commerce & revenue',
    description: 'Orders, fulfillment, pipeline, campaigns, analytics, and commercial control.',
    modules: [
      ['orders', 'Orders'],
      ['shipping', 'Shipping'],
      ['sales', 'Sales'],
      ['campaigns', 'Campaigns'],
      ['analytics', 'Analytics & ROI'],
      ['billing', 'Billing & usage'],
    ],
  },
  {
    title: 'Automation & intelligence',
    description: 'Durable workflows, governed AI, knowledge, approvals, integrations, and developer access.',
    modules: [
      ['automation', 'Automation studio'],
      ['operators', 'AI operators'],
      ['knowledge', 'Knowledge'],
      ['approvals', 'Approvals'],
      ['integrations', 'Integrations'],
      ['developer', 'Developer platform'],
    ],
  },
  {
    title: 'Organization control',
    description: 'Tenant setup, access control, security, workspace configuration, and organization switching.',
    modules: [
      ['onboarding', 'Onboarding'],
      ['team', 'Team & roles'],
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
          <h1>One operating system for customer operations and revenue.</h1>
          <p className="intro">
            Review the complete product experience without waiting for backend availability. Every
            module below renders deterministic representative data, responsive states, and the same
            design language that will bind to canonical APIs later.
          </p>
        </div>
        <div className="platform-hero__status" role="note">
          <strong>Full product review mode</strong>
          <span>Visual review is intentionally decoupled from hosted services and provider credentials.</span>
        </div>
      </header>

      <section className="review-index-callout" aria-label="Review mode explanation">
        <span className="review-index-callout__icon" aria-hidden="true">R</span>
        <div>
          <strong>All product areas are reviewable now</strong>
          <span>
            Preview records are clearly labeled and never presented as production state. Each module
            keeps a direct link to its live route for later backend verification.
          </span>
        </div>
        <Link className="ds-button ds-button--primary" href="/review/inbox">
          Start product tour
        </Link>
      </section>

      <section className="platform-summary" aria-label="Platform review summary">
        <div>
          <strong>22</strong>
          <span>reviewable product surfaces</span>
        </div>
        <div>
          <strong>RTL + LTR</strong>
          <span>shared interaction direction</span>
        </div>
        <div>
          <strong>Responsive</strong>
          <span>desktop, tablet, and mobile</span>
        </div>
        <div>
          <strong>Backend-free</strong>
          <span>deterministic review data</span>
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
                <Link className="platform-module-card" href={`/review/${slug}`} key={slug}>
                  <span className="platform-module-card__status" data-preview="true">
                    Product review
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
