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

interface PageProps {
  searchParams: Promise<{ auth_error?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const { auth_error: authError } = await searchParams;
  return (
    <main className="landing">
      <p className="eyebrow">PLATFORM</p>
      <h1>One operational view. Deliberate control.</h1>
      <p className="intro">
        Manage customer operations, commerce, and approved AI actions from one tenant-isolated
        workspace.
      </p>
      {authError ? (
        <p role="alert" className="identity-notice">
          {authError}
        </p>
      ) : null}
      <div className="identity-role-list">
        <Link className="ds-button ds-button--primary" href="/auth/login">
          Sign in
        </Link>
        <Link className="ds-button ds-button--secondary" href="/organizations">
          Open organizations
        </Link>
      </div>
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
