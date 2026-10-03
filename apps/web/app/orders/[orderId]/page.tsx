import Link from 'next/link';
import { cookies } from 'next/headers';
import { OrderWorkflowControls } from '../order-workflow-controls';

export const dynamic = 'force-dynamic';

interface OrderDetail {
  id: string;
  storeId: string;
  customerId: string | null;
  orderNumber: string;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  currency: string;
  totalMinor: string;
  source: string;
  placedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: readonly {
    id: string;
    sku: string | null;
    title: string;
    quantity: number;
    unitPriceMinor: string;
    totalMinor: string;
  }[];
  payments: readonly {
    id: string;
    kind: string;
    status: string;
    amountMinor: string;
    currency: string;
  }[];
  fulfillments: readonly {
    id: string;
    status: string;
    fulfilledAt: string | null;
  }[];
}

interface WorkflowDetail {
  confirmationState: string;
  duplicateState: string;
  modificationState: string;
  cancellationState: string;
  providerSyncState: string;
  confirmationAttempts: number;
  duplicates: readonly {
    id: string;
    candidateOrderId: string;
    score: number;
    reasons: readonly string[];
    state: string;
  }[];
  changeRequests: readonly {
    id: string;
    kind: string;
    state: string;
    patch: Record<string, unknown>;
    reason: string | null;
  }[];
  providerActions: readonly {
    providerActionId: string;
    operation: string;
    state: string;
    createdAt: string;
    completedAt: string | null;
  }[];
}

interface SessionAccess {
  permissions: string[];
}

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const [result, access] = await Promise.all([loadOrder(orderId), loadAccess()]);
  if (result.kind === 'error')
    return (
      <main className="customers-page">
        <Link className="back-link" href="/orders">
          ← Orders
        </Link>
        <section className="state-panel customer-state">
          <h1>Order unavailable</h1>
          <p>{result.detail}</p>
        </section>
      </main>
    );

  const { order, workflow } = result;
  const permissions = access.kind === 'success' ? access.access.permissions : [];
  return (
    <main className="customers-page">
      <Link className="back-link" href="/orders">
        ← Orders
      </Link>
      <header className="customer-profile-header order-profile-header">
        <div>
          <p className="eyebrow">ORDER {order.orderNumber}</p>
          <h1>{order.orderNumber}</h1>
          <p>
            {order.source} · {order.id}
          </p>
        </div>
        <div className="order-status-stack" aria-label="Order state">
          <span className="status-pill">{order.status}</span>
          <span>{order.financialStatus}</span>
          <span>{order.fulfillmentStatus}</span>
        </div>
      </header>

      <section className="order-summary-strip" aria-label="Order summary">
        <SummaryMetric label="Total" value={formatMoney(order.totalMinor, order.currency)} />
        <SummaryMetric label="Store" value={order.storeId} />
        <SummaryMetric label="Customer" value={order.customerId ?? 'Guest / unmapped'} />
        <SummaryMetric label="Updated" value={new Date(order.updatedAt).toLocaleString()} />
      </section>

      <div className="order-detail-grid">
        <section className="customer-card customer-card-wide">
          <div className="order-card-heading">
            <div>
              <p className="eyebrow">LINE ITEMS</p>
              <h2>Commercial contents</h2>
            </div>
            <span className="status-pill">{order.lines.length} lines</span>
          </div>
          <div className="order-table order-lines-table" role="table" aria-label="Order lines">
            <div className="order-table-row order-table-head" role="row">
              <span role="columnheader">Item</span>
              <span role="columnheader">SKU</span>
              <span role="columnheader">Qty</span>
              <span role="columnheader">Unit</span>
              <span role="columnheader">Total</span>
            </div>
            {order.lines.map((line) => (
              <div className="order-table-row" key={line.id} role="row">
                <span>{line.title}</span>
                <span>{line.sku ?? '—'}</span>
                <span>{line.quantity}</span>
                <span>{formatMoney(line.unitPriceMinor, order.currency)}</span>
                <span>{formatMoney(line.totalMinor, order.currency)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="customer-card">
          <p className="eyebrow">PAYMENTS</p>
          <h2>Recorded payment state</h2>
          {order.payments.length ? (
            <ul className="detail-list">
              {order.payments.map((payment) => (
                <li key={payment.id}>
                  <strong>{payment.kind}</strong>
                  <span>{formatMoney(payment.amountMinor, payment.currency)}</span>
                  <small>{payment.status}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No canonical payment records.</p>
          )}
        </section>

        <section className="customer-card">
          <p className="eyebrow">FULFILLMENT</p>
          <h2>Recorded fulfillment state</h2>
          {order.fulfillments.length ? (
            <ul className="detail-list">
              {order.fulfillments.map((fulfillment) => (
                <li key={fulfillment.id}>
                  <strong>{fulfillment.status}</strong>
                  <span>{fulfillment.id}</span>
                  <small>
                    {fulfillment.fulfilledAt
                      ? new Date(fulfillment.fulfilledAt).toLocaleString()
                      : 'Not fulfilled'}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No fulfillment records.</p>
          )}
        </section>
      </div>

      {workflow ? (
        <>
          <section className="order-workflow-overview" aria-label="Order workflow state">
            <SummaryMetric label="Confirmation" value={workflow.confirmationState} />
            <SummaryMetric label="Duplicates" value={workflow.duplicateState} />
            <SummaryMetric label="Modification" value={workflow.modificationState} />
            <SummaryMetric label="Cancellation" value={workflow.cancellationState} />
            <SummaryMetric label="Provider sync" value={workflow.providerSyncState} />
          </section>
          <OrderWorkflowControls
            orderId={order.id}
            permissions={permissions}
            storeId={order.storeId}
            workflow={workflow}
          />
          {workflow.providerActions.length ? (
            <section className="customer-card customer-card-wide">
              <p className="eyebrow">PROVIDER ACTIVITY</p>
              <h2>Durable external actions</h2>
              <ul className="detail-list">
                {workflow.providerActions.map((action) => (
                  <li key={action.providerActionId}>
                    <strong>{action.operation}</strong>
                    <span>{action.providerActionId}</span>
                    <small>
                      {action.state} · {new Date(action.createdAt).toLocaleString()}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section className="state-panel customer-state">
          <h2>Workflow state unavailable</h2>
          <p>The canonical order exists, but no workflow state is attached yet.</p>
        </section>
      )}
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="order-summary-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

async function loadOrder(
  orderId: string,
): Promise<
  | { kind: 'success'; order: OrderDetail; workflow: WorkflowDetail | null }
  | { kind: 'error'; detail: string }
> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL(`/v1/commerce/orders/${orderId}`, session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (response.status === 404) return { kind: 'error', detail: 'Order not found.' };
    if (!response.ok) return { kind: 'error', detail: 'Commerce order request failed.' };
    return (await response.json()) as {
      kind: 'success';
      order: OrderDetail;
      workflow: WorkflowDetail | null;
    };
  } catch {
    return { kind: 'error', detail: 'Commerce API is unavailable.' };
  }
}

async function loadAccess(): Promise<
  { kind: 'success'; access: SessionAccess } | { kind: 'error' }
> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error' };
  try {
    const response = await fetch(new URL('/v1/session', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    return response.ok
      ? { kind: 'success', access: (await response.json()) as SessionAccess }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

async function sessionHeaders(): Promise<
  { baseUrl: string; headers: Record<string, string> } | undefined
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return undefined;
  return {
    baseUrl,
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
  };
}

function formatMoney(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isSafeInteger(value)) return `${minor} ${currency}`;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value / 100);
}
