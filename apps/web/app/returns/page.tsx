import type { Metadata } from 'next';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';
import { saveReturnPolicy } from './actions';
import { platformRequest } from './platform-api';

export const metadata: Metadata = { title: 'Returns & Exchanges | Platform' };
export const dynamic = 'force-dynamic';

interface ReturnListItem {
  id: string;
  storeId: string;
  orderId: string;
  customerId: string | null;
  kind: 'RETURN' | 'EXCHANGE';
  status: string;
  reasonCode: string;
  requestedAt: string;
  updatedAt: string;
}

interface StoreList {
  items: readonly {
    id: string;
    name: string;
    status: string;
    defaultCurrency: string;
  }[];
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function ReturnsPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [returns, stores] = await Promise.all([
    platformRequest<ReturnListItem[]>('/v1/returns'),
    platformRequest<StoreList>('/v1/commerce/stores'),
  ]);
  const failure = firstFailure(returns, stores);
  if (failure) {
    return (
      <PageShell>
        <EmptyState title="Returns workspace is unavailable" description={failure} />
      </PageShell>
    );
  }
  if (returns.kind !== 'success' || stores.kind !== 'success') return null;

  const open = returns.data.filter((item) => !['RESOLVED', 'REJECTED', 'CANCELLED'].includes(item.status));
  const awaitingInspection = returns.data.filter((item) => ['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING'].includes(item.status));
  const exchanges = returns.data.filter((item) => item.kind === 'EXCHANGE');

  return (
    <PageShell aria-labelledby="returns-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="POST-PURCHASE OPERATIONS"
          title={<span id="returns-title">Returns, exchanges & refunds</span>}
          description="Operate eligibility, inspection, refund, and exchange resolution against canonical commerce state. Provider refund side effects remain queued and reconciled after commit."
          actions={
            <a className="ds-button ds-button--primary" href="/returns/new">
              Create return
            </a>
          }
        />
        {message ? <div className="identity-notice" role="status">{message}</div> : null}

        <div className="ds-metric-grid">
          <MetricCard label="Open requests" value={open.length} />
          <MetricCard label="Inspection / resolution" value={awaitingInspection.length} />
          <MetricCard label="Exchange requests" value={exchanges.length} />
          <MetricCard label="Stores" value={stores.data.items.length} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">POLICY</p>
                <h2>Store return policy</h2>
              </div>
              <StatusBadge tone="warning">High-risk change</StatusBadge>
            </div>
            {stores.data.items.length ? (
              <form action={saveReturnPolicy} className="identity-form">
                <div className="identity-form-grid">
                  <div className="identity-field">
                    <label htmlFor="return-policy-store">Store</label>
                    <select id="return-policy-store" name="storeId" required defaultValue="">
                      <option value="" disabled>Select store</option>
                      {stores.data.items.map((store) => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="identity-field">
                    <label htmlFor="return-policy-name">Policy name</label>
                    <input id="return-policy-name" name="name" required defaultValue="Standard returns" />
                  </div>
                  <div className="identity-field">
                    <label htmlFor="return-window">Return window (days)</label>
                    <input id="return-window" name="returnWindowDays" type="number" min="0" max="365" defaultValue="14" required />
                  </div>
                  <div className="identity-field">
                    <label htmlFor="return-policy-approval">Approval ID</label>
                    <input id="return-policy-approval" name="approvalId" placeholder="When required by policy" />
                  </div>
                </div>
                <div className="identity-role-list">
                  <label><input name="requireInspection" type="checkbox" defaultChecked /> Require inspection</label>
                  <label><input name="allowExchange" type="checkbox" defaultChecked /> Allow exchanges</label>
                  <label><input name="allowStoreCredit" type="checkbox" defaultChecked /> Allow store credit</label>
                </div>
                <button className="ds-button ds-button--secondary" type="submit">Save return policy</button>
              </form>
            ) : (
              <EmptyState title="No stores available" description="Create or synchronize a commerce store before configuring returns." />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">QUEUE</p>
                <h2>Return requests</h2>
              </div>
              <StatusBadge tone="info">Tenant scoped</StatusBadge>
            </div>
            {returns.data.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Order</th>
                      <th>Requested</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.data.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Type">{item.kind}</td>
                        <td data-label="Status"><StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge></td>
                        <td data-label="Reason">{item.reasonCode}</td>
                        <td data-label="Order"><code>{shortId(item.orderId)}</code></td>
                        <td data-label="Requested">{formatDate(item.requestedAt)}</td>
                        <td data-label="Action"><a className="ds-button ds-button--secondary" href={`/returns/${encodeURIComponent(item.id)}`}>Open</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No return requests"
                description="Start from a confirmed or closed canonical order when a customer needs a return or exchange."
                action={<a className="ds-button ds-button--primary" href="/returns/new">Create first return</a>}
              />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function firstFailure(...results: Array<{ kind: string; detail?: string }>): string | undefined {
  const failed = results.find((result) => result.kind !== 'success');
  if (!failed) return undefined;
  if (failed.kind === 'authentication_required') return 'Sign in and select an organization.';
  if (failed.kind === 'configuration_error') return 'The server API is not configured.';
  return failed.detail ?? 'The platform API could not load returns.';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'RESOLVED') return 'success';
  if (['REJECTED', 'CANCELLED', 'FAILED'].includes(status)) return 'danger';
  if (['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING'].includes(status)) return 'warning';
  return 'neutral';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}
