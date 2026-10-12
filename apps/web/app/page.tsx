import Link from 'next/link';

const moduleGroups = [
  {
    title: 'Customer operations',
    description: 'Daily customer-facing work, commerce decisions, and post-purchase service.',
    modules: [
      ['inbox', 'Unified inbox', 'Connected'],
      ['customers', 'Customer 360', 'Connected'],
      ['tickets', 'Tickets', 'Connected'],
      ['orders', 'Orders', 'Connected'],
      ['confirmation', 'Order confirmation', 'Interactive preview'],
      ['shipping', 'Shipping', 'Connected'],
      ['returns', 'Returns & refunds', 'Interactive preview'],
      ['recovery', 'Recovery', 'Interactive preview'],
    ],
  },
  {
    title: 'Revenue & measurement',
    description: 'Pipeline, campaigns, attribution, ROI, and commercial usage control.',
    modules: [
      ['sales', 'Sales', 'Interactive preview'],
      ['campaigns', 'Campaigns', 'Interactive preview'],
      ['analytics', 'Analytics & ROI', 'Interactive preview'],
      ['billing', 'Billing & usage', 'Interactive preview'],
    ],
  },
  {
    title: 'Automation & configuration',
    description: 'Durable execution, typed workflow design, versioned configuration, and safe simulation.',
    modules: [
      ['automation', 'Automation studio', 'Interactive preview'],
      ['workflows', 'Workflow operations', 'Interactive preview'],
      ['configuration', 'Configuration studio', 'Interactive preview'],
      ['simulation', 'Configuration simulation', 'Interactive preview'],
      ['integrations', 'Integrations', 'Connected'],
    ],
  },
  {
    title: 'AI & knowledge',
    description: 'Governed AI operators, typed tools, routing, evaluation boundaries, and tenant knowledge.',
    modules: [
      ['operators', 'AI operators', 'Interactive preview'],
      ['ai-tools', 'AI tool registry', 'Interactive preview'],
      ['ai-routing', 'AI gateway & routing', 'Interactive preview'],
      ['knowledge', 'Knowledge', 'Interactive preview'],
    ],
  },
  {
    title: 'Platform & governance',
    description: 'Extensibility, custom data, developer access, administration, privacy, and retention.',
    modules: [
      ['custom-data', 'Custom data', 'Interactive preview'],
      ['developer', 'Developer platform', 'Interactive preview'],
      ['admin', 'Admin control center', 'Interactive preview'],
      ['governance', 'Data governance', 'Interactive preview'],
    ],
  },
  {
    title: 'Organization control',
    description: 'Tenant setup, access control, approvals, security, and reusable business configuration.',
    modules: [
      ['onboarding', 'Onboarding', 'Connected'],
      ['team', 'Team & roles', 'Connected'],
      ['approvals', 'Approvals', 'Connected'],
      ['settings', 'Organization settings', 'Interactive preview'],
      ['organizations', 'Organizations', 'Connected'],
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
            Review the complete product structure without waiting for hosted backend availability.
            Connected modules retain their canonical routes; interactive preview modules use local,
            deterministic state and cannot mutate tenant or provider data.
          </p>
        </div>
        <div className="platform-hero__status" role="note">
          <strong>Frontend-first product review</strong>
          <span>Search, filters, detail states, workflow boards, actions, responsive layouts, and RTL can be reviewed now.</span>
        </div>
      </header>

      <section className="platform-summary" aria-label="Platform implementation summary">
        <div>
          <strong>30</strong>
          <span>product surfaces mapped</span>
        </div>
        <div>
          <strong>6</strong>
          <span>operating workspaces</span>
        </div>
        <div>
          <strong>RTL + LTR</strong>
          <span>shared direction system</span>
        </div>
        <div>
          <strong>Zero</strong>
          <span>preview provider mutations</span>
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
                  <span
                    className="platform-module-card__status"
                    data-preview={status === 'Interactive preview' || undefined}
                  >
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
