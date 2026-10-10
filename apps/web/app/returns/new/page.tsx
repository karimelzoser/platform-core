import type { Metadata } from 'next';
import {
  EmptyState,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';
import { createReturnRequest } from '../actions';
import { platformRequest } from '../platform-api';

export const metadata: Metadata = { title: 'Create Return | Platform' };
export const dynamic = 'force-dynamic';

interface OrderList {
  items: readonly {
    id: string;
    storeId: string;
    orderNumber: string;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    currency: string;
    totalMinor: string;
  }[];
}

interface OrderDetailResponse {
  order: {
    id: string;
    storeId: string;
    orderNumber: string;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    currency: string;
    totalMinor: string;
    lines: readonly {
      id: string;
      variantId: string | null;
      sku: string | null;
      title: string;
      quantity: number;
      unitPriceMinor: string;
      totalMinor: string;
    }[];
  };
}

interface PageProps {
  searchParams: Promise<{ orderId?: string; message?: string }>;
}

export default async function NewReturnPage({ searchParams }: PageProps) {
  const { orderId, message } = await searchParams;
  const orders = await platformRequest<OrderList>('/v1/commerce/orders?limit=100');
  if (orders.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState title="Orders are unavailable" description={failure(orders)} />
      </PageShell>
    );
  }
  const eligibleOrders = orders.data.items.filter((order) =>
    ['CONFIRMED', 'CLOSED'].includes(order.status),
  );
  const selected = orderId
    ? await platformRequest<OrderDetailResponse>(
        `/v1/commerce/orders/${encodeURIComponent(orderId)}`,
      )
    : undefined;

  return (
    <PageShell aria-labelledby="new-return-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="RETURNS"
          title={<span id="new-return-title">Create return or exchange</span>}
          description="Select a canonical order, then choose the exact order line and quantity. Eligibility is revalidated by the API at submission time."
          actions={
            <a className="ds-button ds-button--secondary" href="/returns">
              Back to returns
            </a>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">STEP 1</p>
                <h2>Select order</h2>
              </div>
              <StatusBadge tone="info">Confirmed / closed only</StatusBadge>
            </div>
            {eligibleOrders.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Financial</th>
                      <th>Fulfillment</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleOrders.map((order) => (
                      <tr key={order.id}>
                        <td data-label="Order">{order.orderNumber}</td>
                        <td data-label="Status">
                          <StatusBadge tone="success">{order.status}</StatusBadge>
                        </td>
                        <td data-label="Financial">{order.financialStatus}</td>
                        <td data-label="Fulfillment">{order.fulfillmentStatus}</td>
                        <td data-label="Total">{money(order.totalMinor, order.currency)}</td>
                        <td data-label="Action">
                          <a
                            className="ds-button ds-button--secondary"
                            href={`/returns/new?orderId=${encodeURIComponent(order.id)}`}
                          >
                            Select
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No eligible orders"
                description="A return request can be opened only for a confirmed or closed order."
              />
            )}
          </Stack>
        </SurfaceCard>

        {selected ? <SelectedOrder result={selected} /> : null}
      </Stack>
    </PageShell>
  );
}

function SelectedOrder({
  result,
}: {
  result: Awaited<ReturnType<typeof platformRequest<OrderDetailResponse>>>;
}) {
  if (result.kind !== 'success') {
    return (
      <SurfaceCard>
        <EmptyState title="Order could not be loaded" description={failure(result)} />
      </SurfaceCard>
    );
  }
  const order = result.data.order;
  return (
    <SurfaceCard>
      <Stack>
        <div className="identity-section-heading">
          <div>
            <p className="ds-eyebrow">STEP 2</p>
            <h2>{order.orderNumber}</h2>
          </div>
          <StatusBadge tone="success">{order.status}</StatusBadge>
        </div>
        <form action={createReturnRequest} className="identity-form">
          <input type="hidden" name="storeId" value={order.storeId} />
          <input type="hidden" name="orderId" value={order.id} />
          <div className="identity-form-grid">
            <div className="identity-field">
              <label htmlFor="return-kind">Resolution type</label>
              <select id="return-kind" name="kind" defaultValue="RETURN" required>
                <option value="RETURN">Return / refund</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </div>
            <div className="identity-field">
              <label htmlFor="return-line">Order line</label>
              <select id="return-line" name="orderLineId" required defaultValue="">
                <option value="" disabled>
                  Select item
                </option>
                {order.lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.title} · qty {line.quantity} · {money(line.totalMinor, order.currency)}
                  </option>
                ))}
              </select>
            </div>
            <div className="identity-field">
              <label htmlFor="return-quantity">Quantity</label>
              <input
                id="return-quantity"
                name="quantity"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
            </div>
            <div className="identity-field">
              <label htmlFor="return-reason">Reason code</label>
              <input
                id="return-reason"
                name="reasonCode"
                required
                defaultValue="CUSTOMER_REQUEST"
                pattern="[A-Za-z][A-Za-z0-9_]{1,63}"
              />
            </div>
            <div className="identity-field">
              <label htmlFor="exchange-variant">Replacement variant ID</label>
              <input
                id="exchange-variant"
                name="exchangeVariantId"
                placeholder="Required only for exchange"
              />
            </div>
          </div>
          <div className="identity-field">
            <label htmlFor="return-note">Customer note</label>
            <textarea id="return-note" name="customerNote" rows={3} maxLength={4000} />
          </div>
          <div className="identity-callout">
            For exchanges, the replacement variant must belong to this store and be active. The API
            also prevents cumulative return quantities from exceeding the original order line.
          </div>
          <button className="ds-button ds-button--primary" type="submit">
            Create request
          </button>
        </form>
      </Stack>
    </SurfaceCard>
  );
}

function failure(result: { kind: string; detail?: string }) {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization.';
  if (result.kind === 'configuration_error') return 'The server API is not configured.';
  return result.detail ?? 'The platform API request failed.';
}

function money(minor: string, currency: string) {
  const amount = Number(minor) / 100;
  return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : minor}`;
}
