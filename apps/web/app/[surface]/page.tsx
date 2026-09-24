import Link from 'next/link';
import { notFound } from 'next/navigation';

const surfaces = {
  inbox: 'Unified inbox',
  customers: 'Customer 360',
  tickets: 'Tickets',
  orders: 'Orders',
  confirmation: 'Confirmation',
  shipping: 'Shipping',
  recovery: 'Recovery',
  returns: 'Returns and refunds',
  sales: 'Sales',
  campaigns: 'Campaigns',
  automation: 'Automation studio',
  operators: 'AI operators',
  approvals: 'Approvals',
  integrations: 'Integrations',
  knowledge: 'Knowledge',
  analytics: 'Analytics',
  billing: 'Billing',
  developer: 'Developer settings',
  team: 'Team and roles',
  settings: 'Organization settings',
  onboarding: 'Onboarding',
} as const;

type Surface = keyof typeof surfaces;

function isSurface(value: string): value is Surface {
  return value in surfaces;
}

export default async function SurfacePage({ params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  if (!isSurface(surface)) notFound();
  return (
    <main className="workspace" aria-labelledby="surface-title">
      <header className="workspace-header">
        <Link href="/" className="brand">
          Platform
        </Link>
        <span aria-hidden="true">/</span>
        <span>{surfaces[surface]}</span>
      </header>
      <section className="state-panel">
        <p className="eyebrow">TENANT WORKSPACE</p>
        <h1 id="surface-title">{surfaces[surface]}</h1>
        <p>
          Sign in and select an organization to load authorized live data. This surface never
          renders fabricated operational metrics.
        </p>
        <Link className="action" href="/onboarding">
          Set up organization
        </Link>
      </section>
    </main>
  );
}
