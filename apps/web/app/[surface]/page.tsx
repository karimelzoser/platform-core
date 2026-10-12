import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, PageShell, Stack, StatusBadge } from '../ui-primitives';
import { PreviewWorkspaceClient } from '../preview-workspace-client';
import { isPreviewSurface, previewSurfaces } from '../preview-surfaces';

const surfaceLabels = {
  inbox: 'Unified inbox',
  customers: 'Customer 360',
  tickets: 'Tickets',
  orders: 'Orders',
  confirmation: 'Order confirmation',
  shipping: 'Shipping',
  recovery: 'Recovery',
  returns: 'Returns & refunds',
  sales: 'Sales',
  campaigns: 'Campaigns',
  automation: 'Automation studio',
  workflows: 'Workflow operations',
  configuration: 'Configuration studio',
  simulation: 'Configuration simulation',
  operators: 'AI operators',
  'ai-tools': 'AI tool registry',
  'ai-routing': 'AI gateway & routing',
  approvals: 'Approvals',
  integrations: 'Integrations',
  knowledge: 'Knowledge',
  analytics: 'Analytics & ROI',
  billing: 'Billing & usage',
  developer: 'Developer platform',
  'custom-data': 'Custom data',
  admin: 'Admin control center',
  governance: 'Data governance',
  team: 'Team & roles',
  settings: 'Organization settings',
  onboarding: 'Onboarding',
  organizations: 'Organizations',
} as const;

type Surface = keyof typeof surfaceLabels;

function isSurface(value: string): value is Surface {
  return value in surfaceLabels;
}

export default async function SurfacePage({ params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  if (!isSurface(surface)) notFound();

  if (!isPreviewSurface(surface)) {
    return (
      <PageShell aria-labelledby="surface-title">
        <Stack gap="spacious">
          <PageHeader
            eyebrow="TENANT WORKSPACE"
            title={<span id="surface-title">{surfaceLabels[surface]}</span>}
            description="This module has a dedicated application route. Open it from the platform navigation to use its implemented workflow."
            actions={
              <Link className="ds-button ds-button--secondary" href="/">
                Platform home
              </Link>
            }
          />
        </Stack>
      </PageShell>
    );
  }

  const config = previewSurfaces[surface];

  return (
    <PageShell aria-labelledby="surface-title" className="preview-workspace">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={config.eyebrow}
          title={<span id="surface-title">{config.label}</span>}
          description={config.description}
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href="/">
                Platform home
              </Link>
              <Link className="ds-button ds-button--primary" href="/onboarding">
                Organization setup
              </Link>
            </>
          }
        />

        <div className="preview-mode-banner" role="note">
          <div>
            <strong>Backend-independent product review</strong>
            <span>
              Deterministic sample state is rendered locally. Search, filtering, selection, responsive
              behavior, RTL, and action feedback work without calling the platform API.
            </span>
          </div>
          <StatusBadge tone="info">No backend mutation</StatusBadge>
        </div>

        <div className="ds-metric-grid preview-metrics">
          {config.metrics.map((metric) => (
            <article className="ds-metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>

        <PreviewWorkspaceClient config={config} />
      </Stack>
    </PageShell>
  );
}
