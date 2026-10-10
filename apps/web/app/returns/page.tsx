import type { Metadata } from 'next';
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';
import { identityRequest, resultMessage } from '../identity-api';

export const metadata: Metadata = { title: 'Returns | Platform' };
export const dynamic = 'force-dynamic';

interface ReturnList {
  items: readonly {
    id: string;
    orderId: string;
    orderNumber: string;
    status: string;
    reasonCode: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }[];
}

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const result = await identityRequest<ReturnList>('/v1/returns');
  if (result.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState
          title="Returns workspace is unavailable"
          description={resultMessage(result)}
          action={
            <Link className="ds-button ds-button--secondary" href="/orders">
              Orders
            </Link>
          }
        />
      </PageShell>
    );
  }

  const open = result.data.items.filter((item) =>
    ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED'].includes(item.status),
  ).length;
  const resolved = result.data.items.filter((item) => item.status === 'RESOLVED').length;
  const awaitingDecision = result.data.items.filter((item) => item.status === 'REQUESTED').length;

  return (
    <PageShell aria-labelledby="returns-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="COMMERCE OPERATIONS"
          title={<span id="returns-title">Returns, exchanges & refunds</span>}
          description="Canonical post-purchase operations with inspection evidence, approval-bound compensation, provider-safe refunds, and inventory restock history."
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href="/orders">
                Orders
              </Link>
              <Link className="ds-button ds-button--primary" href="/returns/new">
                New return
              </Link>
            </>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}
        <div className="ds-metric-grid">
          <MetricCard label="Open cases" value={open} />
          <MetricCard label="Awaiting decision" value={awaitingDecision} />
          <MetricCard label="Resolved" value={resolved} />
          <MetricCard label="Total recorded" value={result.data.items.length} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">CASE QUEUE</p>
                <h2>Return operations</h2>
              </div>
              <StatusBadge tone="info">Tenant isolated</StatusBadge>
            </div>
            {result.data.items.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.items.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Order">
                          <strong>{item.orderNumber}</strong>
                          <div className="identity-muted">{item.id}</div>
                        </td>
                        <td data-label="Reason">{humanize(item.reasonCode)}</td>
                        <td data-label="Status">
                          <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                        </td>
                        <td data-label="Created">{formatDate(item.createdAt)}</td>
                        <td data-label="Action">
                          <Link className="ds-button ds-button--secondary" href={`/returns/${item.id}`}>
                            Open case
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No return cases yet"
                description="Start from an order to calculate eligibility and available return quantities."
                action={
                  <Link className="ds-button ds-button--primary" href="/returns/new">
                    Start a return
                  </Link>
                }
              />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'RESOLVED') return 'success';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'danger';
  if (['REQUESTED', 'RECEIVED'].includes(status)) return 'warning';
  if (['APPROVED', 'IN_TRANSIT', 'INSPECTED'].includes(status)) return 'info';
  return 'neutral';
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./u, (value) => value.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
