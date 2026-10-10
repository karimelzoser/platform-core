import type { Metadata } from 'next';
import Link from 'next/link';
import {
  EmptyState,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';
import { identityRequest, resultMessage } from '../../identity-api';
import { createReturn } from '../actions';

export const metadata: Metadata = { title: 'New return | Platform' };
export const dynamic = 'force-dynamic';

interface Eligibility {
  orderId: string;
  orderNumber: string;
  currency: string;
  eligible: boolean;
  reasons: readonly string[];
  deadline: string;
  policy: {
    id: string | null;
    returnWindowDays: number;
    requireFulfilled: boolean;
    allowExchanges: boolean;
    requireInspection: boolean;
    allowRestock: boolean;
  };
  lines: readonly {
    orderLineId: string;
    title: string;
    sku: string | null;
    purchasedQuantity: number;
    alreadyReturnedQuantity: number;
    returnableQuantity: number;
    lineTotalMinor: string;
  }[];
}

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; message?: string }>;
}) {
  const { orderId, message } = await searchParams;
  const eligibility = orderId
    ? await identityRequest<Eligibility>(`/v1/returns/eligibility/${encodeURIComponent(orderId)}`)
    : null;

  return (
    <PageShell aria-labelledby="new-return-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="RETURN ELIGIBILITY"
          title={<span id="new-return-title">Start a return</span>}
          description="Load the canonical order first. The platform calculates the active policy, return deadline, already-returned quantities, and available resolution choices before anything is created."
          actions={
            <Link className="ds-button ds-button--secondary" href="/returns">
              Return queue
            </Link>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <SurfaceCard>
          <form method="get" className="identity-form identity-form--inline">
            <div className="identity-field">
              <label htmlFor="return-order-id">Order ID</label>
              <input
                id="return-order-id"
                name="orderId"
                required
                defaultValue={orderId ?? ''}
                placeholder="Canonical order UUID"
              />
            </div>
            <button className="ds-button ds-button--primary" type="submit">
              Check eligibility
            </button>
          </form>
        </SurfaceCard>

        {eligibility ? <EligibilityWorkspace result={eligibility} /> : null}
      </Stack>
    </PageShell>
  );
}

function EligibilityWorkspace({
  result,
}: {
  result: Awaited<ReturnType<typeof identityRequest<Eligibility>>>;
}) {
  if (result.kind !== 'success') {
    return <EmptyState title="Order eligibility could not be loaded" description={resultMessage(result)} />;
  }
  const data = result.data;
  const availableLines = data.lines.filter((line) => line.returnableQuantity > 0);
  return (
    <>
      <div className="identity-grid">
        <SurfaceCard>
          <Stack gap="compact">
            <p className="ds-eyebrow">ORDER</p>
            <h2>{data.orderNumber}</h2>
            <StatusBadge tone={data.eligible ? 'success' : 'danger'}>
              {data.eligible ? 'Eligible' : 'Not eligible'}
            </StatusBadge>
            <p className="identity-muted">Deadline: {formatDate(data.deadline)}</p>
          </Stack>
        </SurfaceCard>
        <SurfaceCard>
          <Stack gap="compact">
            <p className="ds-eyebrow">POLICY</p>
            <h2>{data.policy.returnWindowDays} day window</h2>
            <p className="identity-muted">
              {data.policy.requireInspection ? 'Inspection required' : 'Inspection optional'} ·{' '}
              {data.policy.allowExchanges ? 'Exchanges allowed' : 'Refunds only'} ·{' '}
              {data.policy.allowRestock ? 'Restock allowed' : 'No restock'}
            </p>
          </Stack>
        </SurfaceCard>
      </div>

      {!data.eligible ? (
        <EmptyState
          title="This order is not currently returnable"
          description={data.reasons.map(humanize).join(' · ') || 'The active policy rejected the order.'}
          action={
            <Link className="ds-button ds-button--secondary" href={`/orders/${data.orderId}`}>
              Open order
            </Link>
          }
        />
      ) : availableLines.length === 0 ? (
        <EmptyState
          title="Nothing remains returnable"
          description="All purchased quantities are already represented by active return cases."
        />
      ) : (
        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">RETURN LINES</p>
                <h2>Select quantities and resolutions</h2>
              </div>
              <StatusBadge tone="info">{data.currency}</StatusBadge>
            </div>
            <form action={createReturn} className="identity-form">
              <input type="hidden" name="orderId" value={data.orderId} />
              <div className="identity-field">
                <label htmlFor="case-reason">Case reason</label>
                <select id="case-reason" name="reasonCode" defaultValue="CUSTOMER_REQUEST">
                  <option value="CUSTOMER_REQUEST">Customer request</option>
                  <option value="DEFECTIVE">Defective</option>
                  <option value="WRONG_ITEM">Wrong item</option>
                  <option value="DAMAGED">Damaged</option>
                  <option value="NOT_AS_DESCRIBED">Not as described</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="identity-field">
                <label htmlFor="customer-note">Customer note</label>
                <textarea id="customer-note" name="customerNote" rows={3} maxLength={4000} />
              </div>

              <div className="identity-role-editor-grid">
                {availableLines.map((line) => {
                  const unitValue = Math.max(
                    0,
                    Math.floor(Number(line.lineTotalMinor) / Math.max(1, line.purchasedQuantity)),
                  );
                  return (
                    <article className="identity-role-card" key={line.orderLineId}>
                      <label className="identity-checkbox-row">
                        <input type="checkbox" name="selectedLine" value={line.orderLineId} />
                        <span>
                          <strong>{line.title}</strong>
                          <small>
                            {line.sku ?? 'No SKU'} · {line.returnableQuantity} of{' '}
                            {line.purchasedQuantity} available
                          </small>
                        </span>
                      </label>
                      <div className="identity-form identity-form--compact">
                        <div className="identity-field">
                          <label htmlFor={`quantity-${line.orderLineId}`}>Quantity</label>
                          <input
                            id={`quantity-${line.orderLineId}`}
                            name={`quantity:${line.orderLineId}`}
                            type="number"
                            min={1}
                            max={line.returnableQuantity}
                            defaultValue={1}
                          />
                        </div>
                        <div className="identity-field">
                          <label htmlFor={`reason-${line.orderLineId}`}>Line reason</label>
                          <select
                            id={`reason-${line.orderLineId}`}
                            name={`reason:${line.orderLineId}`}
                            defaultValue="DEFECTIVE"
                          >
                            <option value="DEFECTIVE">Defective</option>
                            <option value="WRONG_ITEM">Wrong item</option>
                            <option value="DAMAGED">Damaged</option>
                            <option value="NOT_AS_DESCRIBED">Not as described</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div className="identity-field">
                          <label htmlFor={`resolution-${line.orderLineId}`}>Resolution</label>
                          <select
                            id={`resolution-${line.orderLineId}`}
                            name={`resolution:${line.orderLineId}`}
                            defaultValue="REFUND"
                          >
                            <option value="REFUND">Refund</option>
                            {data.policy.allowExchanges ? <option value="EXCHANGE">Exchange</option> : null}
                            <option value="STORE_CREDIT">Store credit</option>
                            <option value="NO_REFUND">No refund</option>
                          </select>
                        </div>
                        <div className="identity-field">
                          <label htmlFor={`refund-${line.orderLineId}`}>
                            Proposed value (minor units)
                          </label>
                          <input
                            id={`refund-${line.orderLineId}`}
                            name={`refund:${line.orderLineId}`}
                            type="number"
                            min={0}
                            defaultValue={unitValue}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="ds-button ds-button--primary" type="submit">
                Create return request
              </button>
            </form>
          </Stack>
        </SurfaceCard>
      )}
    </>
  );
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./u, (first) => first.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
