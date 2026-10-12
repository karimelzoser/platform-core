import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isReviewSurface, reviewSurfaces } from '../../review-surfaces';
import {
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';

export default async function ReviewSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface } = await params;
  if (!isReviewSurface(surface)) notFound();
  const config = reviewSurfaces[surface];

  return (
    <PageShell aria-labelledby="review-surface-title" className="preview-workspace">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={config.eyebrow}
          title={<span id="review-surface-title">{config.label}</span>}
          description={config.description}
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href="/">
                Product home
              </Link>
              <Link className="ds-button ds-button--primary" href={liveHref(surface)}>
                Open live route
              </Link>
            </>
          }
        />

        <div className="preview-mode-banner" role="note">
          <div>
            <strong>Frontend product review mode</strong>
            <span>
              Deterministic representative data is rendered without authentication, providers, or
              API availability. Live routes remain separate and keep their canonical security
              boundaries.
            </span>
          </div>
          <StatusBadge tone="info">No backend required</StatusBadge>
        </div>

        <div className="ds-metric-grid preview-metrics">
          {config.metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <section
          className="preview-grid preview-grid--main"
          aria-label={`${config.label} workflow`}
        >
          <SurfaceCard className="preview-board-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">OPERATIONS</p>
                <h2>Workflow board</h2>
              </div>
              <StatusBadge tone="neutral">Representative state</StatusBadge>
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
            <span className="preview-muted">Sample records only</span>
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

        <section className="review-controls-grid" aria-label="Product controls">
          <SurfaceCard>
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">PRIMARY ACTIONS</p>
                <h2>Operator controls</h2>
              </div>
            </div>
            <div className="preview-actions-grid">
              {config.nextActions.map((action, index) => (
                <button
                  className={
                    index === 0
                      ? 'ds-button ds-button--primary'
                      : 'ds-button ds-button--secondary'
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
              Actions are deliberately disabled in review mode. Their live equivalents will bind to
              canonical typed commands when the corresponding backend workstream is connected.
            </p>
          </SurfaceCard>

          <SurfaceCard>
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">PRODUCT CONTRACT</p>
                <h2>Review expectations</h2>
              </div>
            </div>
            <dl className="review-contract-list">
              <div>
                <dt>Tenant boundary</dt>
                <dd>Every live record remains tenant-scoped and authorization-checked.</dd>
              </div>
              <div>
                <dt>Actions</dt>
                <dd>State changes bind to registered commands, approvals, audit, and outbox.</dd>
              </div>
              <div>
                <dt>Experience</dt>
                <dd>Desktop, tablet, mobile, keyboard, LTR, and RTL share one component system.</dd>
              </div>
            </dl>
          </SurfaceCard>
        </section>
      </Stack>
    </PageShell>
  );
}

function liveHref(surface: string): Route {
  return `/${surface}` as Route;
}
