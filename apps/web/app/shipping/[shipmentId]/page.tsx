import Link from 'next/link';
import { cookies } from 'next/headers';
import { ShippingRescueControls } from '../shipping-rescue-controls';

export const dynamic = 'force-dynamic';

interface ShipmentRecord {
  id: string;
  store_id: string;
  order_id: string;
  fulfillment_id: string;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  destination: Record<string, unknown>;
  declared_value_minor: string | null;
  declared_value_currency: string | null;
  estimated_delivery_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  last_tracking_at: string | null;
  provider_sync_state: string;
  updated_at: string;
}

interface ShipmentDetail {
  shipment: ShipmentRecord;
  packages: readonly {
    id: string;
    sequence: number;
    status: string;
    weight_grams: number | null;
    tracking_number: string | null;
    tracking_url: string | null;
  }[];
  trackingEvents: readonly {
    id: string;
    event_type: string;
    normalized_status: string;
    raw_code: string | null;
    description: string | null;
    location_name: string | null;
    country_code: string | null;
    occurred_at: string;
    source_type: string;
  }[];
  deliveryAttempts: readonly {
    id: string;
    attempt_number: number;
    state: string;
    attempted_at: string | null;
    next_attempt_at: string | null;
    failure_reason: string | null;
  }[];
  rescueCases: readonly {
    id: string;
    state: string;
    trigger_reason: string;
    priority: string;
    assigned_actor_id: string | null;
    summary: string;
    due_at: string | null;
    resolved_at: string | null;
    updated_at: string;
  }[];
  providerActions: readonly {
    provider_action_id: string;
    operation: string;
    state: string;
    created_at: string;
    completed_at: string | null;
  }[];
}

interface SessionAccess {
  permissions: string[];
}

interface OrderSummary {
  order: { orderNumber: string };
}

export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  const result = await loadShipment(shipmentId);
  if (result.kind === 'error')
    return (
      <main className="customers-page">
        <Link className="back-link" href="/shipping">
          ← Shipping
        </Link>
        <section className="state-panel customer-state">
          <h1>Shipment unavailable</h1>
          <p>{result.detail}</p>
        </section>
      </main>
    );

  const detail = result.detail;
  const shipment = detail.shipment;
  const [access, order] = await Promise.all([loadAccess(), loadOrder(shipment.order_id)]);
  const permissions = access.kind === 'success' ? access.access.permissions : [];
  const orderNumber = order.kind === 'success' ? order.summary.order.orderNumber : shipment.order_id;
  const destination = shipment.destination;
  const activeRescue = detail.rescueCases.find(
    (rescue) => !['RESOLVED', 'CANCELLED'].includes(rescue.state),
  );

  return (
    <main className="customers-page">
      <Link className="back-link" href="/shipping">
        ← Shipping
      </Link>
      <header className="customer-profile-header order-profile-header">
        <div>
          <p className="eyebrow">SHIPMENT · {orderNumber}</p>
          <h1>{shipment.tracking_number ?? 'Tracking pending'}</h1>
          <p>{shipment.id}</p>
        </div>
        <div className="order-status-stack" aria-label="Shipment state">
          <span
            className={
              shipment.status === 'EXCEPTION'
                ? 'status-pill shipping-status-exception'
                : 'status-pill'
            }
          >
            {shipment.status}
          </span>
          <span>{shipment.provider_sync_state}</span>
        </div>
      </header>

      <section className="shipping-summary-strip" aria-label="Shipment summary">
        <SummaryMetric label="Order" value={orderNumber} />
        <SummaryMetric
          label="Estimated delivery"
          value={formatDate(shipment.estimated_delivery_at, 'Not available')}
        />
        <SummaryMetric
          label="Last tracking"
          value={formatDate(shipment.last_tracking_at, 'No tracking event')}
        />
        <SummaryMetric
          label="Declared value"
          value={formatMoney(shipment.declared_value_minor, shipment.declared_value_currency)}
        />
      </section>

      <div className="shipping-detail-grid">
        <section className="customer-card">
          <div className="order-card-heading">
            <div>
              <p className="eyebrow">DESTINATION</p>
              <h2>Delivery address</h2>
            </div>
          </div>
          <address className="shipping-address">
            <strong>{stringField(destination, 'name') ?? 'Recipient not supplied'}</strong>
            <span>{stringField(destination, 'line1') ?? 'Address line unavailable'}</span>
            {stringField(destination, 'line2') ? <span>{stringField(destination, 'line2')}</span> : null}
            <span>
              {[stringField(destination, 'city'), stringField(destination, 'region')]
                .filter(Boolean)
                .join(', ')}
            </span>
            <span>{stringField(destination, 'countryCode') ?? 'Country unavailable'}</span>
            {stringField(destination, 'phone') ? <span>{stringField(destination, 'phone')}</span> : null}
          </address>
          <p>
            <Link href={`/orders/${shipment.order_id}`}>Open canonical order</Link>
          </p>
          {shipment.tracking_url ? (
            <p>
              <a
                className="shipping-tracking-link"
                href={shipment.tracking_url}
                rel="noreferrer"
                target="_blank"
              >
                Open carrier tracking
              </a>
            </p>
          ) : null}
        </section>

        <section className="customer-card">
          <div className="order-card-heading">
            <div>
              <p className="eyebrow">PACKAGES</p>
              <h2>Package state</h2>
            </div>
            <span className="status-pill">{detail.packages.length}</span>
          </div>
          {detail.packages.length ? (
            <ul className="detail-list">
              {detail.packages.map((item) => (
                <li key={item.id}>
                  <strong>Package {item.sequence}</strong>
                  <span>{item.tracking_number ?? 'Tracking inherited from shipment'}</span>
                  <small>
                    {item.status}
                    {item.weight_grams === null ? '' : ` · ${item.weight_grams} g`}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No package records.</p>
          )}
        </section>

        <section className="customer-card customer-card-wide">
          <div className="order-card-heading">
            <div>
              <p className="eyebrow">TRACKING</p>
              <h2>Normalized carrier timeline</h2>
            </div>
            <span className="status-pill">{detail.trackingEvents.length} events</span>
          </div>
          {detail.trackingEvents.length ? (
            <ol className="shipping-timeline">
              {detail.trackingEvents.map((event) => (
                <li key={event.id}>
                  <div aria-hidden="true" />
                  <div>
                    <strong>{event.event_type}</strong>
                    <span>{event.description ?? event.normalized_status}</span>
                    <small>
                      {formatDate(event.occurred_at)}
                      {event.location_name ? ` · ${event.location_name}` : ''}
                      {event.raw_code ? ` · ${event.raw_code}` : ''}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No normalized tracking events.</p>
          )}
        </section>

        <section className="customer-card">
          <div className="order-card-heading">
            <div>
              <p className="eyebrow">DELIVERY RESCUE</p>
              <h2>Exception operations</h2>
            </div>
            {activeRescue ? <span className="status-pill">{activeRescue.priority}</span> : null}
          </div>
          {detail.rescueCases.length ? (
            <ul className="detail-list">
              {detail.rescueCases.map((rescue) => (
                <li key={rescue.id}>
                  <strong>{rescue.state}</strong>
                  <span>{rescue.summary}</span>
                  <small>
                    {rescue.trigger_reason} · Updated {formatDate(rescue.updated_at)}
                  </small>
                  {rescue.id === activeRescue?.id ? (
                    <ShippingRescueControls
                      permissions={permissions}
                      rescueCaseId={rescue.id}
                      shipmentId={shipment.id}
                      state={rescue.state}
                      storeId={shipment.store_id}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No delivery rescue case is attached to this shipment.</p>
          )}
        </section>

        <section className="customer-card">
          <p className="eyebrow">DELIVERY ATTEMPTS</p>
          <h2>Last-mile attempts</h2>
          {detail.deliveryAttempts.length ? (
            <ul className="detail-list">
              {detail.deliveryAttempts.map((attempt) => (
                <li key={attempt.id}>
                  <strong>
                    Attempt {attempt.attempt_number} · {attempt.state}
                  </strong>
                  <span>{attempt.failure_reason ?? 'No failure reason'}</span>
                  <small>{formatDate(attempt.attempted_at, 'Not attempted')}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No delivery attempts recorded.</p>
          )}
        </section>

        <section className="customer-card customer-card-wide">
          <p className="eyebrow">PROVIDER ACTIONS</p>
          <h2>Durable carrier execution</h2>
          {detail.providerActions.length ? (
            <ul className="detail-list">
              {detail.providerActions.map((action) => (
                <li key={action.provider_action_id}>
                  <strong>{action.operation}</strong>
                  <span>{action.provider_action_id}</span>
                  <small>
                    {action.state} · {formatDate(action.created_at)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No carrier provider actions are attached to this shipment.</p>
          )}
        </section>
      </div>
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

async function loadShipment(
  shipmentId: string,
): Promise<{ kind: 'success'; detail: ShipmentDetail } | { kind: 'error'; detail: string }> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error', detail: 'Sign in and select an organization.' };
  try {
    const response = await fetch(new URL(`/v1/shipping/shipments/${shipmentId}`, session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (response.status === 404) return { kind: 'error', detail: 'Shipment not found.' };
    if (!response.ok) return { kind: 'error', detail: 'Shipping request failed.' };
    return { kind: 'success', detail: (await response.json()) as ShipmentDetail };
  } catch {
    return { kind: 'error', detail: 'Shipping API is unavailable.' };
  }
}

async function loadOrder(
  orderId: string,
): Promise<{ kind: 'success'; summary: OrderSummary } | { kind: 'error' }> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error' };
  try {
    const response = await fetch(new URL(`/v1/commerce/orders/${orderId}`, session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    return response.ok
      ? { kind: 'success', summary: (await response.json()) as OrderSummary }
      : { kind: 'error' };
  } catch {
    return { kind: 'error' };
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

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' && field.trim() ? field : undefined;
}

function formatDate(value: string | null, fallback = '—'): string {
  return value ? new Date(value).toLocaleString() : fallback;
}

function formatMoney(minor: string | null, currency: string | null): string {
  if (minor === null || currency === null) return 'Not declared';
  const value = Number(minor);
  if (!Number.isSafeInteger(value)) return `${minor} ${currency}`;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value / 100);
}
