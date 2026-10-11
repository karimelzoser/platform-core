import Link from 'next/link';

const moduleGroups = [
  {
    title: 'Customer operations',
    description: 'Daily customer-facing work and service control.',
    modules: [
      ['inbox', 'Unified inbox', 'Live surface'],
      ['customers', 'Customer 360', 'Live surface'],
      ['tickets', 'Tickets', 'Live surface'],
      ['confirmation', 'Order confirmation', 'Preview'],
      ['returns', 'Returns & refunds', 'Preview'],
      ['recovery', 'Recovery', 'Preview'],
    ],
  },
  {
    title: 'Commerce & revenue',
    description: 'Orders, fulfillment, sales motion, campaigns, and business outcomes.',
    modules: [
      ['orders', 'Orders', 'Live surface'],
      ['shipping', 'Shipping', 'Live surface'],
      ['sales', 'Sales', 'Preview'],
      ['campaigns', 'Campaigns', 'Preview'],
      ['analytics', 'Analytics & ROI', 'Preview'],
      ['billing', 'Billing & usage', 'Preview'],
    ],
  },
  {
    title: 'Automation & intelligence',
    description: 'Durable workflows, controlled AI, knowledge, and governed actions.',
    modules: [
      ['automation', 'Automation studio', 'Preview'],
      ['operators', 'AI operators', 'Preview'],
      ['knowledge', 'Knowledge', 'Preview'],
      ['approvals', 'Approvals', 'Live surface'],
      ['integrations', 'Integrations', 'Live surface'],
      ['developer', 'Developer platform', 'Preview'],
    ],
  },
  {
    title: 'Organization control',
    description: 'Tenant setup, access control, security, and reusable business configuration.',
    modules: [
      ['onboarding', 'Onboarding', 'Live surface'],
      ['team', 'Team & roles', 'Live surface'],
      ['settings', 'Organization settings', 'Preview'],
      ['organizations', 'Organizations', 'Live surface'],
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
            Review the complete product structure now. Backend-independent preview modules use
            deterministic sample data, while implemented modules continue to use their real tenant
            routes and security boundaries.
          </p>
        </div>
        <div className="platform-hero__status" role="note">
          <strong>Product review mode</strong>
          <span>Frontend work can continue without waiting for the hosted backend.</span>
        </div>
      </header>

      <section className="platform-summary" aria-label="Platform implementation summary">
        <div>
          <strong>21</strong>
          <span>product surfaces mapped</span>
        </div>
        <div>
          <strong>RTL + LTR</strong>
          <span>shared interaction direction</span>
        </div>
        <div>
          <strong>Tenant-safe</strong>
          <span>live modules retain canonical auth/RLS</span>
        </div>
        <div>
          <strong>Preview-safe</strong>
          <span>sample metrics are explicitly labeled</span>
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
              {group.modules.map(([slug, label, status]) => (
                <Link className="platform-module-card" href={`/${slug}`} key={slug}>
                  <span className="platform-module-card__status" data-preview={status === 'Preview'}>
                    {status}
                  </span>
                  <strong>{label}</strong>
                  <span>Open workspace</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
      </div>
    </main>
  );
}
