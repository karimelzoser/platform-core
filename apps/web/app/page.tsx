import Link from 'next/link';

const primarySurfaces = [
  ['inbox', 'Unified inbox'],
  ['customers', 'Customer 360'],
  ['orders', 'Orders'],
  ['shipping', 'Shipping'],
  ['tickets', 'Tickets'],
  ['approvals', 'Approvals'],
  ['integrations', 'Integrations'],
  ['automation', 'Automation'],
] as const;

export default function HomePage() {
  return (
    <main className="landing">
      <p className="eyebrow">PLATFORM</p>
      <h1>One operational view. Deliberate control.</h1>
      <p className="intro">
        Manage customer operations, commerce, and approved AI actions from one tenant-isolated
        workspace.
      </p>
      <nav aria-label="Primary operations" className="surface-grid">
        {primarySurfaces.map(([slug, label]) => (
          <Link className="surface-link" href={`/${slug}`} key={slug}>
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
