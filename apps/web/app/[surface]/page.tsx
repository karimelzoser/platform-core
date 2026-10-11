import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';
import {
  isPlatformPreviewSurface,
  platformPreviewSurfaces,
} from '../preview-platform-surfaces';
import { isPreviewSurface, previewSurfaces, type PreviewSurface } from '../preview-surfaces';

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
  operators: 'AI operators',
  approvals: 'Approvals',
  integrations: 'Integrations',
  knowledge: 'Knowledge',
  analytics: 'Analytics & ROI',
  billing: 'Billing & usage',
  developer: 'Developer platform',
  team: 'Team & roles',
  settings: 'Organization settings',
  onboarding: 'Onboarding',
  configuration: 'Configuration',
  simulation: 'Configuration simulation',
  'custom-data': 'Custom data',
  admin: 'Admin control center',
  runtime: 'Workflow runtime',
} as const;

type Surface = keyof typeof surfaceLabels;

function isSurface(value: string): value is Surface {
  return value in surfaceLabels;
}

function previewFor(surface: string): PreviewSurface | undefined {
  if (isPreviewSurface(surface)) return previewSurfaces[surface];
  if (isPlatformPreviewSurface(surface)) return platformPreviewSurfaces[surface];
  return undefined;
}

export default async function SurfacePage({ params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  if (!isSurface(surface)) notFound();

  const config = previewFor(surface);
  if (!config) {
    return (
      <PageShell aria-labelledby="surface-title">
        <Stack gap="spacious">
          <PageHeader
            eyebrow="TENANT WORKSPACE"
            title={<span id="surface-title">{surfaceLabels[surface]}</span>}
            description="This module is backed by a dedicated application route when its implementation is available."
            actions={
              <Link className="ds-button ds-button--secondary" href="/">
                Platform home
              </Link>
            }
          />
          <SurfaceCard>
            <p className="preview-muted">
              Use the main navigation to open the implemented operational surface. Backend-independent
              preview data is available only for modules still under implementation.
            </p>
          </SurfaceCard>
        </Stack>
      </PageShell>
    );
  }

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
            <strong>Backend-independent product preview</strong>
            <span>
              This screen uses deterministic sample data so product structure, workflows, responsive
              behavior, and RTL can be reviewed before the live backend is connected.
            </span>
          </div>
          <StatusBadge tone="info">Preview data</StatusBadge>
        </div>

        <div className="ds-metric-grid preview-metrics">
          {config.metrics.map((metric) => (
            <MetricCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>

        <section className="preview-grid preview-grid--main" aria-label={`${config.label} workflow`}>
          <SurfaceCard className="preview-board-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">WORKFLOW</p>
                <h2>Operational board</h2>
              </div>
              <StatusBadge tone="neutral">Sample state</StatusBadge>
            </div>
            <div className="preview-board">
              {config.lanes.map((lane) => (
                <section className="preview-lane" key={lane.title}>
                  <div className="preview-lane__heading">
                    <h3>{lane.title}</h3>
                    <StatusBadge tone={lane.tone}>{lane.items.length}</StatusBadge>
                  </div>
                  <ul>
                    {lane.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="preview-insight-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">SIGNALS</p>
                <h2>{config.insightTitle}</h2>
              </div>
            </div>
            <ul className="preview-insight-list">
              {config.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </SurfaceCard>
        </section>

        <SurfaceCard>
          <div className="preview-section-heading">
            <div>
              <p className="ds-eyebrow">WORK QUEUE</p>
              <h2>Current items</h2>
            </div>
            <span className="preview-muted">Representative data only</span>
          </div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Context</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row) => (
                  <tr key={`${row.primary}-${row.secondary}`}>
                    <td data-label="Item">
                      <strong>{row.primary}</strong>
                    </td>
                    <td data-label="Context">{row.secondary}</td>
                    <td data-label="Status">
                      <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
                    </td>
                    <td data-label="Details" className="preview-muted">
                      {row.meta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="preview-section-heading">
            <div>
              <p className="ds-eyebrow">NEXT ACTIONS</p>
              <h2>Product controls</h2>
            </div>
          </div>
          <div className="preview-actions-grid">
            {config.nextActions.map((action, index) => (
              <button
                className={
                  index === 0 ? 'ds-button ds-button--primary' : 'ds-button ds-button--secondary'
                }
                disabled
                key={action}
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
          <p className="preview-muted preview-footnote">
            Controls are intentionally disabled in backend-independent preview mode. Their visual and
            interaction states are present now; live actions will bind to canonical typed commands as
            each backend workstream is completed.
          </p>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}
