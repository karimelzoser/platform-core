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
} from '../../ui-primitives';
import { identityRequest, resultMessage } from '../../identity-api';
import {
  executeDecision,
  executeExchange,
  executeRefund,
  executeRestock,
  inspectReturn,
  markReturnReceived,
  requestReturnApproval,
} from '../actions';

export const dynamic = 'force-dynamic';

interface ReturnDetail {
  id: string;
  storeId: string;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  status: string;
  reasonCode: string;
  customerNote: string | null;
  returnShipmentId: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  lines: readonly {
    id: string;
    orderLineId: string;
    title: string;
    sku: string | null;
    quantity: number;
    reasonCode: string;
    requestedResolution: string;
    proposedRefundMinor: string;
    currency: string;
  }[];
  inspections: readonly Record<string, unknown>[];
  exchanges: readonly Record<string, unknown>[];
  refunds: readonly Record<string, unknown>[];
  restocks: readonly Record<string, unknown>[];
  timeline: readonly { eventType: string; data: unknown; occurredAt: string }[];
}

interface ReturnOptions {
  variants: readonly { id: string; title: string; sku: string | null; priceMinor: string; currency: string }[];
  locations: readonly { id: string; name: string }[];
  payments: readonly { id: string; kind: string; status: string; amountMinor: string; currency: string }[];
}

interface ReturnApprovals {
  items: readonly {
    id: string;
    action: string;
    status: string;
    expiresAt: string;
    input: unknown;
  }[];
}

interface SessionView {
  permissions: readonly string[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ returnId: string }>;
}): Promise<Metadata> {
  const { returnId } = await params;
  return { title: `Return ${returnId.slice(0, 8)} | Platform` };
}

export default async function ReturnCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ returnId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ returnId }, { message }] = await Promise.all([params, searchParams]);
  const [detail, options, approvals, session] = await Promise.all([
    identityRequest<ReturnDetail>(`/v1/returns/${encodeURIComponent(returnId)}`),
    identityRequest<ReturnOptions>(`/v1/returns/${encodeURIComponent(returnId)}/options`),
    identityRequest<ReturnApprovals>(`/v1/returns/${encodeURIComponent(returnId)}/approvals`),
    identityRequest<SessionView>('/v1/session'),
  ]);
  if (detail.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState
          title="Return case is unavailable"
          description={resultMessage(detail)}
          action={
            <Link className="ds-button ds-button--secondary" href="/returns">
              Return queue
            </Link>
          }
        />
      </PageShell>
    );
  }
  const access = session.kind === 'success' ? session.data.permissions : [];
  const resolutionOptions = options.kind === 'success' ? options.data : null;
  const approvalItems = approvals.kind === 'success' ? approvals.data.items : [];
  const data = detail.data;

  return (
    <PageShell aria-labelledby="return-case-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={`RETURN · ${data.orderNumber}`}
          title={<span id="return-case-title">Return case</span>}
          description={`${data.id} · ${humanize(data.reasonCode)}`}
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href={`/orders/${data.orderId}`}>
                Order
              </Link>
              <Link className="ds-button ds-button--secondary" href="/approvals">
                Approvals
              </Link>
              <Link className="ds-button ds-button--primary" href="/returns">
                Return queue
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
          <MetricCard label="Status" value={data.status} />
          <MetricCard label="Lines" value={data.lines.length} />
          <MetricCard label="Refunds" value={data.refunds.length} />
          <MetricCard label="Exchanges" value={data.exchanges.length} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">ITEMS</p>
                <h2>Requested return lines</h2>
              </div>
              <StatusBadge tone={statusTone(data.status)}>{data.status}</StatusBadge>
            </div>
            <div className="identity-table-wrap">
              <table className="identity-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Resolution</th>
                    <th>Proposed value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={line.id}>
                      <td data-label="Item">
                        <strong>{line.title}</strong>
                        <div className="identity-muted">{line.sku ?? 'No SKU'}</div>
                      </td>
                      <td data-label="Qty">{line.quantity}</td>
                      <td data-label="Resolution">{humanize(line.requestedResolution)}</td>
                      <td data-label="Proposed value">
                        {formatMoney(line.proposedRefundMinor, line.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.customerNote ? <p className="identity-muted">Customer note: {data.customerNote}</p> : null}
          </Stack>
        </SurfaceCard>

        <WorkflowControls
          data={data}
          access={access}
          options={resolutionOptions}
          approvals={approvalItems}
        />

        <div className="identity-grid">
          <EvidenceCard title="Refunds" items={data.refunds} />
          <EvidenceCard title="Exchanges" items={data.exchanges} />
          <EvidenceCard title="Restocks" items={data.restocks} />
          <EvidenceCard title="Inspections" items={data.inspections} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">IMMUTABLE HISTORY</p>
                <h2>Return timeline</h2>
              </div>
              <StatusBadge tone="info">Append only</StatusBadge>
            </div>
            <ol className="detail-list">
              {data.timeline.map((event, index) => (
                <li key={`${event.eventType}-${event.occurredAt}-${String(index)}`}>
                  <strong>{event.eventType}</strong>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  <small>{compactJson(event.data)}</small>
                </li>
              ))}
            </ol>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function WorkflowControls({
  data,
  access,
  options,
  approvals,
}: {
  data: ReturnDetail;
  access: readonly string[];
  options: ReturnOptions | null;
  approvals: ReturnApprovals['items'];
}) {
  const approved = approvals.filter((item) => item.status === 'APPROVED');
  return (
    <Stack gap="spacious">
      {data.status === 'REQUESTED' && access.includes('returns.approve') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">DECISION</p>
            <h2>Approve or reject the return</h2>
            <p className="identity-muted">
              Decision execution is digest-bound. Request approval first; a different authorized
              user must approve it in the approval inbox.
            </p>
            <div className="identity-role-editor-grid">
              {(['APPROVE', 'REJECT'] as const).map((decision) => (
                <form action={requestReturnApproval} className="identity-form" key={decision}>
                  <input type="hidden" name="returnId" value={data.id} />
                  <input type="hidden" name="kind" value="DECISION" />
                  <input type="hidden" name="decision" value={decision} />
                  <div className="identity-field">
                    <label htmlFor={`decision-reason-${decision}`}>Reason</label>
                    <input id={`decision-reason-${decision}`} name="reason" required />
                  </div>
                  <button className="ds-button ds-button--secondary" type="submit">
                    Request {decision.toLowerCase()} approval
                  </button>
                </form>
              ))}
            </div>
            <ApprovedDecisionExecutions returnId={data.id} approvals={approved} />
          </Stack>
        </SurfaceCard>
      ) : null}

      {['APPROVED', 'IN_TRANSIT'].includes(data.status) && access.includes('returns.manage') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">RECEIPT</p>
            <h2>Receive returned goods</h2>
            <form action={markReturnReceived}>
              <input type="hidden" name="returnId" value={data.id} />
              <button className="ds-button ds-button--primary" type="submit">
                Mark return received
              </button>
            </form>
          </Stack>
        </SurfaceCard>
      ) : null}

      {data.status === 'RECEIVED' && access.includes('returns.manage') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">INSPECTION</p>
            <h2>Record physical inspection</h2>
            <form action={inspectReturn} className="identity-form">
              <input type="hidden" name="returnId" value={data.id} />
              {data.lines.map((line) => (
                <article className="identity-role-card" key={line.id}>
                  <input type="hidden" name="returnLineId" value={line.id} />
                  <strong>{line.title}</strong>
                  <div className="identity-form-grid">
                    <label>
                      Accepted quantity
                      <input
                        name={`accepted:${line.id}`}
                        type="number"
                        min={0}
                        max={line.quantity}
                        defaultValue={line.quantity}
                      />
                    </label>
                    <label>
                      Rejected quantity
                      <input
                        name={`rejected:${line.id}`}
                        type="number"
                        min={0}
                        max={line.quantity}
                        defaultValue={0}
                      />
                    </label>
                    <label>
                      Condition
                      <select name={`condition:${line.id}`} defaultValue="NEW">
                        <option value="NEW">New</option>
                        <option value="OPENED">Opened</option>
                        <option value="USED">Used</option>
                        <option value="DAMAGED">Damaged</option>
                        <option value="DEFECTIVE">Defective</option>
                        <option value="MISSING_PARTS">Missing parts</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                  </div>
                </article>
              ))}
              <div className="identity-field">
                <label htmlFor="inspection-note">Inspection note</label>
                <textarea id="inspection-note" name="inspectionNote" rows={3} />
              </div>
              <button className="ds-button ds-button--primary" type="submit">
                Complete inspection
              </button>
            </form>
          </Stack>
        </SurfaceCard>
      ) : null}

      {['INSPECTED', 'RESOLVED'].includes(data.status) ? (
        <ResolutionControls data={data} access={access} options={options} approvals={approved} />
      ) : null}

      <ApprovalHistory approvals={approvals} />
    </Stack>
  );
}

function ApprovedDecisionExecutions({
  returnId,
  approvals,
}: {
  returnId: string;
  approvals: ReturnApprovals['items'];
}) {
  const decisions = approvals.filter((approval) => approval.action === 'returns.request.decide');
  return decisions.length ? (
    <div className="identity-role-editor-grid">
      {decisions.map((approval) => {
        const input = objectInput(approval.input);
        const decision = input.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
        return (
          <form action={executeDecision} className="identity-form" key={approval.id}>
            <input type="hidden" name="returnId" value={returnId} />
            <input type="hidden" name="approvalId" value={approval.id} />
            <input type="hidden" name="decision" value={decision} />
            <input type="hidden" name="reason" value={stringValue(input.reason)} />
            <StatusBadge tone="success">Approved · {decision}</StatusBadge>
            <button className="ds-button ds-button--primary" type="submit">
              Execute {decision.toLowerCase()}
            </button>
          </form>
        );
      })}
    </div>
  ) : null;
}

function ResolutionControls({
  data,
  access,
  options,
  approvals,
}: {
  data: ReturnDetail;
  access: readonly string[];
  options: ReturnOptions | null;
  approvals: ReturnApprovals['items'];
}) {
  const refundLines = data.lines.filter((line) => line.requestedResolution === 'REFUND');
  const exchangeLines = data.lines.filter((line) => line.requestedResolution === 'EXCHANGE');
  return (
    <div className="identity-grid">
      {refundLines.length && access.includes('commerce.refunds.issue') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">REFUND</p>
            <h2>Financial resolution</h2>
            <form action={requestReturnApproval} className="identity-form">
              <input type="hidden" name="returnId" value={data.id} />
              <input type="hidden" name="kind" value="REFUND" />
              <label>
                Payment
                <select name="paymentId" defaultValue="">
                  <option value="">Manual / no provider payment</option>
                  {options?.payments.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.kind} · {formatMoney(payment.amountMinor, payment.currency)} · {payment.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount (minor units)
                <input
                  name="amountMinor"
                  type="number"
                  min={1}
                  defaultValue={sumProposed(refundLines)}
                  required
                />
              </label>
              <input type="hidden" name="currency" value={data.currency} />
              <label>
                Reason
                <input name="reason" defaultValue="Accepted return refund" required />
              </label>
              <button className="ds-button ds-button--secondary" type="submit">
                Request refund approval
              </button>
            </form>
            {approvals
              .filter((approval) => approval.action === 'returns.refund.issue')
              .map((approval) => (
                <ApprovedRefund key={approval.id} approval={approval} returnId={data.id} />
              ))}
          </Stack>
        </SurfaceCard>
      ) : null}

      {exchangeLines.length && access.includes('returns.approve') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">EXCHANGE</p>
            <h2>Replacement resolution</h2>
            <form action={requestReturnApproval} className="identity-form">
              <input type="hidden" name="returnId" value={data.id} />
              <input type="hidden" name="kind" value="EXCHANGE" />
              <label>
                Return line
                <select name="returnLineId" required>
                  {exchangeLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.title} · qty {line.quantity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Replacement
                <select name="replacementVariantId" required defaultValue="">
                  <option value="" disabled>
                    Select replacement variant
                  </option>
                  {options?.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title} · {variant.sku ?? 'No SKU'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input name="quantity" type="number" min={1} defaultValue={1} required />
              </label>
              <label>
                Unit price delta (minor units)
                <input name="unitPriceDeltaMinor" type="number" defaultValue={0} />
              </label>
              <button className="ds-button ds-button--secondary" type="submit">
                Request exchange approval
              </button>
            </form>
            {approvals
              .filter((approval) => approval.action === 'returns.exchange.create')
              .map((approval) => (
                <ApprovedExchange key={approval.id} approval={approval} returnId={data.id} />
              ))}
          </Stack>
        </SurfaceCard>
      ) : null}

      {access.includes('commerce.inventory.manage') ? (
        <SurfaceCard>
          <Stack>
            <p className="ds-eyebrow">RESTOCK</p>
            <h2>Return accepted stock</h2>
            <form action={requestReturnApproval} className="identity-form">
              <input type="hidden" name="returnId" value={data.id} />
              <input type="hidden" name="kind" value="RESTOCK" />
              <label>
                Return line
                <select name="returnLineId" required>
                  {data.lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.title} · qty {line.quantity}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inventory location
                <select name="locationId" required defaultValue="">
                  <option value="" disabled>
                    Select location
                  </option>
                  {options?.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input name="quantity" type="number" min={1} defaultValue={1} required />
              </label>
              <label>
                Note
                <input name="note" defaultValue="Accepted returned inventory" />
              </label>
              <button className="ds-button ds-button--secondary" type="submit">
                Request restock approval
              </button>
            </form>
            {approvals
              .filter((approval) => approval.action === 'returns.restock.record')
              .map((approval) => (
                <ApprovedRestock key={approval.id} approval={approval} returnId={data.id} />
              ))}
          </Stack>
        </SurfaceCard>
      ) : null}
    </div>
  );
}

function ApprovedRefund({ approval, returnId }: { approval: ReturnApprovals['items'][number]; returnId: string }) {
  const input = objectInput(approval.input);
  return (
    <form action={executeRefund} className="identity-form identity-form--compact">
      <input type="hidden" name="returnId" value={returnId} />
      <input type="hidden" name="approvalId" value={approval.id} />
      <input type="hidden" name="amountMinor" value={numberValue(input.amountMinor)} />
      <input type="hidden" name="currency" value={stringValue(input.currency)} />
      <input type="hidden" name="reason" value={stringValue(input.reason)} />
      <input type="hidden" name="paymentId" value={stringValue(input.paymentId)} />
      <StatusBadge tone="success">Approved refund · {approval.id.slice(0, 8)}</StatusBadge>
      <button className="ds-button ds-button--primary" type="submit">
        Execute approved refund
      </button>
    </form>
  );
}

function ApprovedExchange({ approval, returnId }: { approval: ReturnApprovals['items'][number]; returnId: string }) {
  const input = objectInput(approval.input);
  const line = Array.isArray(input.lines) ? objectInput(input.lines[0]) : {};
  return (
    <form action={executeExchange} className="identity-form identity-form--compact">
      <input type="hidden" name="returnId" value={returnId} />
      <input type="hidden" name="approvalId" value={approval.id} />
      <input type="hidden" name="returnLineId" value={stringValue(line.returnLineId)} />
      <input type="hidden" name="replacementVariantId" value={stringValue(line.replacementVariantId)} />
      <input type="hidden" name="quantity" value={numberValue(line.quantity)} />
      <input type="hidden" name="unitPriceDeltaMinor" value={numberValue(line.unitPriceDeltaMinor)} />
      <StatusBadge tone="success">Approved exchange · {approval.id.slice(0, 8)}</StatusBadge>
      <button className="ds-button ds-button--primary" type="submit">
        Execute approved exchange
      </button>
    </form>
  );
}

function ApprovedRestock({ approval, returnId }: { approval: ReturnApprovals['items'][number]; returnId: string }) {
  const input = objectInput(approval.input);
  return (
    <form action={executeRestock} className="identity-form identity-form--compact">
      <input type="hidden" name="returnId" value={returnId} />
      <input type="hidden" name="approvalId" value={approval.id} />
      <input type="hidden" name="returnLineId" value={stringValue(input.returnLineId)} />
      <input type="hidden" name="locationId" value={stringValue(input.locationId)} />
      <input type="hidden" name="quantity" value={numberValue(input.quantity)} />
      <input type="hidden" name="note" value={stringValue(input.note)} />
      <StatusBadge tone="success">Approved restock · {approval.id.slice(0, 8)}</StatusBadge>
      <button className="ds-button ds-button--primary" type="submit">
        Execute approved restock
      </button>
    </form>
  );
}

function ApprovalHistory({ approvals }: { approvals: ReturnApprovals['items'] }) {
  return approvals.length ? (
    <SurfaceCard>
      <Stack>
        <p className="ds-eyebrow">APPROVAL EVIDENCE</p>
        <h2>Protected actions</h2>
        <ul className="detail-list">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <strong>{approval.action}</strong>
              <span>{approval.status}</span>
              <small>
                {approval.id} · expires {new Date(approval.expiresAt).toLocaleString()}
              </small>
            </li>
          ))}
        </ul>
      </Stack>
    </SurfaceCard>
  ) : null;
}

function EvidenceCard({ title, items }: { title: string; items: readonly Record<string, unknown>[] }) {
  return (
    <SurfaceCard>
      <Stack gap="compact">
        <p className="ds-eyebrow">{title.toUpperCase()}</p>
        <h2>{items.length}</h2>
        {items.length ? (
          <ul className="detail-list">
            {items.slice(0, 5).map((item, index) => (
              <li key={`${title}-${String(index)}`}>
                <span>{compactJson(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="identity-muted">No records yet.</p>
        )}
      </Stack>
    </SurfaceCard>
  );
}

function objectInput(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sumProposed(lines: ReturnDetail['lines']): number {
  return lines.reduce((sum, line) => sum + Number(line.proposedRefundMinor), 0);
}

function compactJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json.length > 280 ? `${json.slice(0, 277)}...` : json;
  } catch {
    return 'Evidence recorded';
  }
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'RESOLVED') return 'success';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'danger';
  if (['REQUESTED', 'RECEIVED'].includes(status)) return 'warning';
  if (['APPROVED', 'IN_TRANSIT', 'INSPECTED'].includes(status)) return 'info';
  return 'neutral';
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./u, (first) => first.toUpperCase());
}

function formatMoney(minor: string | number, currency: string): string {
  const amount = Number(minor) / 100;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount);
}
