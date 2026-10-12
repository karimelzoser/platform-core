import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allReviewSurfaces, isAllReviewSurface } from '../../all-review-surfaces';
import { ReviewWorkspaceClient } from '../../review-workspace-client';
import { MetricCard, PageHeader, PageShell, Stack, StatusBadge, SurfaceCard } from '../../ui-primitives';

export default async function ReviewSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface } = await params;
  if (!isAllReviewSurface(surface)) notFound();
  const config = allReviewSurfaces[surface];

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
              Deterministic representative data is rendered locally. Search, filters, detail
              selection, simulated actions, responsive behavior, and RTL work without authentication,
              providers, or API availability.
            </span>
          </div>
          <StatusBadge tone="info">No backend required</StatusBadge>
        </div>

        <div className="ds-metric-grid preview-metrics">
          {config.metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <ReviewWorkspaceClient config={config} />

        <SurfaceCard>
          <div className="preview-section-heading">
            <div>
              <p className="ds-eyebrow">PRODUCT CONTRACT</p>
              <h2>What this review mode guarantees</h2>
            </div>
          </div>
          <dl className="review-contract-list">
            <div>
              <dt>Preview safety</dt>
              <dd>Review interactions stay in browser memory and cannot call providers or mutate tenant state.</dd>
            </div>
            <div>
              <dt>Live contract</dt>
              <dd>Production actions bind to canonical typed commands, permissions, approvals, audit, and outbox.</dd>
            </div>
            <div>
              <dt>Experience</dt>
              <dd>Desktop, tablet, mobile, keyboard, LTR, and RTL share one component and navigation system.</dd>
            </div>
          </dl>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function liveHref(surface: string): Route {
  return `/${surface}` as Route;
}
