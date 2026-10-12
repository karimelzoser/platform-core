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
  workflows: 'Workflow operations',
  configuration: 'Configuration studio',
  simulation: 'Configuration simulation',
  operators: 'AI operators',
  'ai-tools': 'AI tool registry',
  'ai-routing': 'AI gateway and routing',
  approvals: 'Approvals',
  integrations: 'Integrations',
  knowledge: 'Knowledge',
  analytics: 'Analytics and ROI',
  billing: 'Billing and usage',
  developer: 'Developer platform',
  'custom-data': 'Custom data',
  admin: 'Admin control center',
  governance: 'Data governance',
  team: 'Team and roles',
  settings: 'Organization settings',
  onboarding: 'Onboarding',
  organizations: 'Organizations',
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
          PRENEURA
        </Link>
        <span aria-hidden="true">/</span>
        <span>{surfaces[surface]}</span>
      </header>
      <section className="state-panel">
        <p className="eyebrow">LIVE TENANT WORKSPACE</p>
        <h1 id="surface-title">{surfaces[surface]}</h1>
        <p>
          This route is reserved for authorized live tenant data and canonical commands. It does
          not fall back to representative review data when the backend module is unavailable.
        </p>
        <div className="page-actions">
          <Link className="action" href={`/review/${surface}`}>
            Open frontend review
          </Link>
          <Link className="action secondary" href="/onboarding">
            Set up organization
          </Link>
        </div>
      </section>
    </main>
  );
}
