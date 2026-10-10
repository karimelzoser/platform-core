import type { Metadata } from 'next';
import {
  EmptyState,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';
import {
  createExchange,
  fulfillExchange,
  inspectReturnLine,
  issueRefund,
  reconcileRefund,
  resolveReturnRequest,
  reviewReturnRequest,
} from '../actions';
import { platformRequest } from '../platform-api';

export const metadata: Metadata = { title: 'Return Request | Platform' };
export const dynamic = 'force-dynamic';

interface ReturnDetail {
  id: string;
  storeId: string;
  orderId: string;
  customerId: string | null;
  kind: 'RETURN' | 'EXCHANGE';
  status: string;
  reasonCode: string;
  customerNote: string | null;
  internalNote: string | null;
  requestedAt: string;
  updatedAt: string;
  lines: readonly {
    id: string;
    orderLineId: string;
    requestedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    inspectionStatus: string;
    conditionCode: string | null;
    restockDisposition: string;
    eligibleRefundMinor: number;
    exchangeVariantId: string | null;
  }[];
  refunds: readonly {
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    providerActionId: string | null;
    providerReference: string | null;
  }[];
  exchanges: readonly {
    id: string;
    status: string;
    priceAdjustmentMinor: number;
    currency: string;
    replacementOrderId: string | null;
  }[];
  timeline: readonly { eventType: string; data: Record<string, unknown>; occurredAt: string }[];
}

interface OrderDetailResponse {
  order: {
    id: string;
    orderNumber: string;
    currency: string;
    totalMinor: string;
    financialStatus: string;
    fulfillmentStatus: string;
    payments: readonly {
      id: string;
      kind: string;
      status: string;
      amountMinor: string;
      currency: string;
    }[];
  };
}

interface IntegrationConnection {
  id: string;
  connectorKey: string;
  displayName: string;
  status: string;
}

interface PageProps {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ message?: string }>;
}

export default async function ReturnDetailPage({ params, searchParams }: PageProps) {
  const { requestId } = await params;
  const { message } = await searchParams;
  const detail = await platformRequest<ReturnDetail>(
    `/v1/returns/${encodeURIComponent(requestId)}`,
  );
  if (detail.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState title="Return request is unavailable" description={failure(detail)} />
      </PageShell>
    );
  }
  const [order, connections] = await Promise.all([
    platformRequest<OrderDetailResponse>(
      `/v1/commerce/orders/${encodeURIComponent(detail.data.orderId)}`,
    ),
    platformRequest<IntegrationConnection[]>('/v1/integrations/connections'),
  ]);
  const request = detail.data;

  return (
    <PageShell aria-labelledby="return-detail-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={`${request.kind} · ${request.reasonCode}`}
          title={<span id="return-detail-title">Return request</span>}
          description={`Request ${shortId(request.id)} for canonical order ${shortId(request.orderId)}.`}
          actions={
            <a className="ds-button ds-button--secondary" href="/returns">
              Back to queue
            </a>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <SurfaceCard>
          <div className="identity-card-heading">
            <div>
              <p className="ds-eyebrow">STATE</p>
              <h2>{request.kind}</h2>
              <p className="identity-muted">Requested {formatDate(request.requestedAt)}</p>
            </div>
            <StatusBadge tone={statusTone(request.status)}>{request.status}</StatusBadge>
          </div>
          <p>{request.customerNote ?? 'No customer note.'}</p>
          {request.internalNote ? (
            <p className="identity-muted">Internal: {request.internalNote}</p>
          ) : null}
        </SurfaceCard>

        {request.status === 'REQUESTED' ? (
          <SurfaceCard>
            <Stack>
              <div className="identity-section-heading">
                <div>
                  <p className="ds-eyebrow">REVIEW</p>
                  <h2>Approve or reject</h2>
                </div>
                <StatusBadge tone="warning">High-risk</StatusBadge>
              </div>
              <form action={reviewReturnRequest} className="identity-form">
                <input type="hidden" name="requestId" value={request.id} />
                <div className="identity-form-grid">
                  <div className="identity-field">
                    <label htmlFor="return-decision">Decision</label>
                    <select id="return-decision" name="decision" defaultValue="APPROVE">
                      <option value="APPROVE">Approve</option>
                      <option value="REJECT">Reject</option>
                    </select>
                  </div>
                  <div className="identity-field">
                    <label htmlFor="review-approval">Approval ID</label>
                    <input
                      id="review-approval"
                      name="approvalId"
                      placeholder="Required when authorization policy asks"
                    />
                  </div>
                </div>
                <div className="identity-field">
                  <label htmlFor="review-note">Internal note</label>
                  <textarea id="review-note" name="internalNote" rows={3} />
                </div>
                <button className="ds-button ds-button--primary" type="submit">
                  Record review
                </button>
              </form>
            </Stack>
          </SurfaceCard>
        ) : null}

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">INSPECTION</p>
                <h2>Return lines</h2>
              </div>
              <StatusBadge tone="info">Quantity guarded</StatusBadge>
            </div>
            <div className="identity-member-grid">
              {request.lines.map((line) => (
                <article className="identity-member-card" key={line.id}>
                  <div className="identity-card-heading">
                    <div>
                      <h3>Line {shortId(line.orderLineId)}</h3>
                      <p className="identity-muted">
                        Requested {line.requestedQuantity} · accepted {line.acceptedQuantity}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(line.inspectionStatus)}>
                      {line.inspectionStatus}
                    </StatusBadge>
                  </div>
                  <p>
                    Eligible value:{' '}
                    {money(
                      line.eligibleRefundMinor,
                      order.kind === 'success' ? order.data.order.currency : '',
                    )}
                  </p>
                  {['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING'].includes(request.status) ? (
                    <form
                      action={inspectReturnLine}
                      className="identity-form identity-form--compact"
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="lineId" value={line.id} />
                      <div className="identity-form-grid">
                        <label className="identity-field">
                          Received quantity
                          <input
                            name="receivedQuantity"
                            type="number"
                            min="0"
                            max={line.requestedQuantity}
                            defaultValue={line.receivedQuantity || line.requestedQuantity}
                          />
                        </label>
                        <label className="identity-field">
                          Accepted quantity
                          <input
                            name="acceptedQuantity"
                            type="number"
                            min="0"
                            max={line.requestedQuantity}
                            defaultValue={line.acceptedQuantity || line.requestedQuantity}
                          />
                        </label>
                        <label className="identity-field">
                          Inspection status
                          <select
                            name="inspectionStatus"
                            defaultValue={
                              line.inspectionStatus === 'PENDING'
                                ? 'ACCEPTED'
                                : line.inspectionStatus
                            }
                          >
                            <option value="ACCEPTED">Accepted</option>
                            <option value="PARTIAL">Partial</option>
                            <option value="REJECTED">Rejected</option>
                            <option value="PENDING">Pending</option>
                          </select>
                        </label>
                        <label className="identity-field">
                          Restock disposition
                          <select
                            name="restockDisposition"
                            defaultValue={
                              line.restockDisposition === 'PENDING'
                                ? 'RESTOCK'
                                : line.restockDisposition
                            }
                          >
                            <option value="RESTOCK">Restock</option>
                            <option value="QUARANTINE">Quarantine</option>
                            <option value="DISCARD">Discard</option>
                            <option value="RETURN_TO_VENDOR">Return to vendor</option>
                            <option value="PENDING">Pending</option>
                          </select>
                        </label>
                        <label className="identity-field">
                          Condition code
                          <input
                            name="conditionCode"
                            defaultValue={line.conditionCode ?? ''}
                            placeholder="GOOD / DAMAGED"
                          />
                        </label>
                        <label className="identity-field">
                          Approval ID
                          <input name="approvalId" />
                        </label>
                      </div>
                      <button className="ds-button ds-button--secondary" type="submit">
                        Save inspection
                      </button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          </Stack>
        </SurfaceCard>

        {request.kind === 'RETURN' &&
        ['APPROVED', 'RECEIVED', 'INSPECTING'].includes(request.status) ? (
          <RefundPanel request={request} order={order} connections={connections} />
        ) : null}

        {request.kind === 'EXCHANGE' &&
        ['APPROVED', 'RECEIVED', 'INSPECTING'].includes(request.status) ? (
          <ExchangePanel request={request} order={order} />
        ) : null}

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">RESOLUTION</p>
                <h2>Close request</h2>
              </div>
            </div>
            <p className="identity-muted">
              Resolution is blocked until every line is inspected and all refund or exchange work is
              complete.
            </p>
            {!['RESOLVED', 'REJECTED', 'CANCELLED'].includes(request.status) ? (
              <form action={resolveReturnRequest}>
                <input type="hidden" name="requestId" value={request.id} />
                <button className="ds-button ds-button--primary" type="submit">
                  Resolve request
                </button>
              </form>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">AUDIT TRAIL</p>
                <h2>Return timeline</h2>
              </div>
            </div>
            {request.timeline.length ? (
              <ol className="detail-list">
                {[...request.timeline].reverse().map((event, index) => (
                  <li key={`${event.eventType}-${event.occurredAt}-${String(index)}`}>
                    <strong>{event.eventType}</strong>
                    <span>{formatDate(event.occurredAt)}</span>
                    <small>{JSON.stringify(event.data)}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No timeline events" />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function RefundPanel({
  request,
  order,
  connections,
}: {
  request: ReturnDetail;
  order: Awaited<ReturnType<typeof platformRequest<OrderDetailResponse>>>;
  connections: Awaited<ReturnType<typeof platformRequest<IntegrationConnection[]>>>;
}) {
  const capturedPayments =
    order.kind === 'success'
      ? order.data.order.payments.filter(
          (payment) =>
            ['CAPTURE', 'SALE'].includes(payment.kind) &&
            ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status),
        )
      : [];
  const activeConnections =
    connections.kind === 'success'
      ? connections.data.filter((connection) =>
          ['CONNECTED', 'DEGRADED'].includes(connection.status),
        )
      : [];
  return (
    <SurfaceCard>
      <Stack>
        <div className="identity-section-heading">
          <div>
            <p className="ds-eyebrow">REFUND</p>
            <h2>Financial resolution</h2>
          </div>
          <StatusBadge tone="danger">Critical approval</StatusBadge>
        </div>
        <form action={issueRefund} className="identity-form">
          <input type="hidden" name="requestId" value={request.id} />
          <div className="identity-form-grid">
            <label className="identity-field">
              Source payment
              <select name="sourcePaymentId" required defaultValue="">
                <option value="" disabled>
                  Select payment
                </option>
                {capturedPayments.map((payment) => (
                  <option key={payment.id} value={payment.id}>
                    {payment.kind} · {money(Number(payment.amountMinor), payment.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="identity-field">
              Provider connection
              <select name="connectionId" required defaultValue="">
                <option value="" disabled>
                  Select connection
                </option>
                {activeConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.displayName} · {connection.connectorKey}
                  </option>
                ))}
              </select>
            </label>
            <label className="identity-field">
              Amount (minor units)
              <input name="amountMinor" type="number" min="1" required />
            </label>
            <label className="identity-field">
              Currency
              <input
                name="currency"
                defaultValue={order.kind === 'success' ? order.data.order.currency : ''}
                required
              />
            </label>
            <label className="identity-field">
              Approval ID
              <input name="approvalId" required />
            </label>
          </div>
          <label className="identity-field">
            Reason
            <input name="reason" required defaultValue="Accepted return" />
          </label>
          <button className="ds-button ds-button--danger" type="submit">
            Queue approved refund
          </button>
        </form>
        {request.refunds.length ? (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Refund</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Provider</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {request.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td data-label="Refund">
                      <code>{shortId(refund.id)}</code>
                    </td>
                    <td data-label="Status">
                      <StatusBadge tone={statusTone(refund.status)}>{refund.status}</StatusBadge>
                    </td>
                    <td data-label="Amount">{money(refund.amountMinor, refund.currency)}</td>
                    <td data-label="Provider">
                      {refund.providerReference ?? shortId(refund.providerActionId ?? '')}
                    </td>
                    <td data-label="Action">
                      {!['SUCCEEDED', 'CANCELLED'].includes(refund.status) ? (
                        <form action={reconcileRefund}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="refundId" value={refund.id} />
                          <button className="ds-button ds-button--secondary" type="submit">
                            Reconcile
                          </button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Stack>
    </SurfaceCard>
  );
}

function ExchangePanel({
  request,
  order,
}: {
  request: ReturnDetail;
  order: Awaited<ReturnType<typeof platformRequest<OrderDetailResponse>>>;
}) {
  const currency = order.kind === 'success' ? order.data.order.currency : '';
  const exchange = request.exchanges[0];
  return (
    <SurfaceCard>
      <Stack>
        <div className="identity-section-heading">
          <div>
            <p className="ds-eyebrow">EXCHANGE</p>
            <h2>Replacement order</h2>
          </div>
          <StatusBadge tone="warning">High-risk approval</StatusBadge>
        </div>
        {!exchange ? (
          <form action={createExchange} className="identity-form">
            <input type="hidden" name="requestId" value={request.id} />
            <div className="identity-form-grid">
              <label className="identity-field">
                Price adjustment (minor units)
                <input name="priceAdjustmentMinor" type="number" defaultValue="0" required />
              </label>
              <label className="identity-field">
                Currency
                <input name="currency" defaultValue={currency} required />
              </label>
              <label className="identity-field">
                Approval ID
                <input name="approvalId" required />
              </label>
            </div>
            <button className="ds-button ds-button--primary" type="submit">
              Approve exchange
            </button>
          </form>
        ) : (
          <>
            <p>
              <StatusBadge tone={statusTone(exchange.status)}>{exchange.status}</StatusBadge> ·
              adjustment {money(exchange.priceAdjustmentMinor, exchange.currency)}
            </p>
            {exchange.status === 'APPROVED' ? (
              <form action={fulfillExchange} className="identity-form identity-form--inline">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="exchangeId" value={exchange.id} />
                <label className="identity-field">
                  Replacement order ID
                  <input name="replacementOrderId" required />
                </label>
                <button className="ds-button ds-button--primary" type="submit">
                  Link fulfilled replacement
                </button>
              </form>
            ) : null}
          </>
        )}
      </Stack>
    </SurfaceCard>
  );
}

function failure(result: { kind: string; detail?: string }) {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization.';
  if (result.kind === 'configuration_error') return 'The server API is not configured.';
  return result.detail ?? 'The platform API request failed.';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (['RESOLVED', 'SUCCEEDED', 'FULFILLED', 'ACCEPTED'].includes(status)) return 'success';
  if (['REJECTED', 'CANCELLED', 'FAILED'].includes(status)) return 'danger';
  if (
    [
      'REQUESTED',
      'APPROVED',
      'IN_TRANSIT',
      'RECEIVED',
      'INSPECTING',
      'QUEUED',
      'PROCESSING',
      'PARTIAL',
    ].includes(status)
  )
    return 'warning';
  return 'neutral';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
function shortId(value: string) {
  return value ? `${value.slice(0, 8)}…` : '—';
}
function money(minor: number | string, currency: string) {
  const amount = Number(minor) / 100;
  return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : String(minor)}`.trim();
}
