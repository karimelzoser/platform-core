import type { Metadata } from 'next';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';
import { createRecoveryOffer, dispatchRecoveryAttempt, markRecoveryAttributed } from '../actions';
import { platformRequest } from '../platform-api';

export const metadata: Metadata = { title: 'Recovery Opportunity | Platform' };
export const dynamic = 'force-dynamic';

interface RecoveryDetail {
  id: string;
  storeId: string;
  sourceOrderId: string;
  orderNumber: string;
  sourceOrderStatus: string;
  customerId: string;
  customerName: string;
  status: string;
  potentialValueMinor: number;
  currency: string;
  detectedAt: string;
  eligibleAt: string;
  expiresAt: string;
  suppressionCode: string | null;
  suppressionReason: string | null;
  temporalWorkflowId: string;
  recoveredOrderId: string | null;
  attributedAttemptId: string | null;
  recoveredAt: string | null;
  recoveredValueMinor: number | null;
  attempts: readonly {
    id: string;
    sequence: number;
    channel: string;
    status: string;
    conversationId: string;
    messageId: string | null;
    offerId: string | null;
    body: string;
    scheduledAt: string;
    queuedAt: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
    lastError: string | null;
  }[];
  offers: readonly {
    id: string;
    type: string;
    percentBasisPoints: number | null;
    amountMinor: number | null;
    currency: string | null;
    code: string | null;
    status: string;
    expiresAt: string;
  }[];
  conversations: readonly { id: string; channel: string; status: string }[];
  preferences: readonly {
    channel: string;
    status: string;
    suppressedUntil: string | null;
    reason: string | null;
  }[];
  timeline: readonly {
    eventType: string;
    data: Record<string, unknown>;
    occurredAt: string;
  }[];
}

interface PageProps {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ message?: string }>;
}

export default async function RecoveryDetailPage({ params, searchParams }: PageProps) {
  const { opportunityId } = await params;
  const { message } = await searchParams;
  const result = await platformRequest<RecoveryDetail>(
    `/v1/recovery/${encodeURIComponent(opportunityId)}`,
  );
  if (result.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState
          title="Recovery opportunity is unavailable"
          description={failureMessage(result)}
          action={
            <a className="ds-button ds-button--secondary" href="/recovery">
              Back to recovery
            </a>
          }
        />
      </PageShell>
    );
  }
  const detail = result.data;
  const activeOffer = detail.offers.find((offer) => offer.status === 'ACTIVE');
  const eligiblePreferenceCount = detail.preferences.filter(
    (preference) => preference.status === 'OPTED_IN' && !preference.suppressedUntil,
  ).length;

  return (
    <PageShell aria-labelledby="recovery-detail-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="RECOVERY OPPORTUNITY"
          title={<span id="recovery-detail-title">{detail.orderNumber}</span>}
          description={`Recovery for ${detail.customerName}. Source order ${shortId(detail.sourceOrderId)} remains canonical; no duplicate cart or customer state is created.`}
          actions={
            <a className="ds-button ds-button--secondary" href="/recovery">
              Recovery queue
            </a>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="ds-metric-grid">
          <MetricCard label="Status" value={detail.status} />
          <MetricCard
            label="Potential value"
            value={`${formatMoney(detail.potentialValueMinor)} ${detail.currency}`}
          />
          <MetricCard label="Attempts" value={detail.attempts.length} />
          <MetricCard label="Consent-ready channels" value={eligiblePreferenceCount} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">ELIGIBILITY</p>
                <h2>Recovery state</h2>
              </div>
              <StatusBadge tone={statusTone(detail.status)}>{detail.status}</StatusBadge>
            </div>
            <dl className="ds-detail-list">
              <div>
                <dt>Source order</dt>
                <dd>
                  {detail.orderNumber} · {detail.sourceOrderStatus}
                </dd>
              </div>
              <div>
                <dt>Eligible</dt>
                <dd>{formatDate(detail.eligibleAt)}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{formatDate(detail.expiresAt)}</dd>
              </div>
              <div>
                <dt>Workflow identity</dt>
                <dd>
                  <code>{detail.temporalWorkflowId}</code>
                </dd>
              </div>
              <div>
                <dt>Suppression</dt>
                <dd>
                  {detail.suppressionCode ?? 'None'}
                  {detail.suppressionReason ? ` · ${detail.suppressionReason}` : ''}
                </dd>
              </div>
              <div>
                <dt>Recovered order</dt>
                <dd>{detail.recoveredOrderId ?? 'Not attributed'}</dd>
              </div>
            </dl>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">CONSENT & CHANNELS</p>
                <h2>Dispatch readiness</h2>
              </div>
              <StatusBadge tone="info">CRM + Messaging</StatusBadge>
            </div>
            {detail.preferences.length ? (
              <div className="identity-role-list">
                {detail.preferences.map((preference) => (
                  <StatusBadge
                    key={preference.channel}
                    tone={
                      preference.status === 'OPTED_IN' && !preference.suppressedUntil
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {preference.channel} · {preference.status}
                    {preference.suppressedUntil ? ' · temporarily suppressed' : ''}
                  </StatusBadge>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No communication preference evidence"
                description="Recovery outreach is blocked until verified opt-in exists for a dispatchable channel."
              />
            )}
            {detail.conversations.length ? (
              <p className="identity-muted">
                {detail.conversations.length} dispatchable customer conversation(s) are available.
              </p>
            ) : (
              <EmptyState
                title="No dispatchable conversation"
                description="Connect a supported messaging provider and establish the customer conversation before sending recovery outreach."
              />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">OFFER</p>
                <h2>Recovery incentive</h2>
              </div>
              <StatusBadge tone="warning">High-risk change</StatusBadge>
            </div>
            <p className="identity-muted">
              This records recovery offer terms and a code snapshot. It does not claim to provision
              a provider coupon; production connector/configuration work owns provider-side
              materialization.
            </p>
            <form action={createRecoveryOffer} className="identity-form">
              <input type="hidden" name="opportunityId" value={detail.id} />
              <div className="identity-form-grid">
                <div className="identity-field">
                  <label htmlFor="recovery-offer-type">Offer type</label>
                  <select id="recovery-offer-type" name="offerType" defaultValue="PERCENT" required>
                    <option value="PERCENT">Percent</option>
                    <option value="FIXED">Fixed amount</option>
                    <option value="FREE_SHIPPING">Free shipping</option>
                  </select>
                </div>
                <NumberField
                  id="recovery-offer-percent"
                  name="percentBasisPoints"
                  label="Percent basis points"
                  value={500}
                />
                <NumberField
                  id="recovery-offer-amount"
                  name="amountMinor"
                  label="Fixed amount (minor units)"
                  value={100}
                />
                <TextField
                  id="recovery-offer-currency"
                  name="currency"
                  label="Currency"
                  value={detail.currency}
                />
                <TextField
                  id="recovery-offer-code"
                  name="code"
                  label="Code snapshot"
                  value="RECOVER5"
                />
                <div className="identity-field">
                  <label htmlFor="recovery-offer-expiry">Expires at</label>
                  <input
                    id="recovery-offer-expiry"
                    name="expiresAt"
                    type="datetime-local"
                    required
                  />
                </div>
                <TextField
                  id="recovery-offer-approval"
                  name="approvalId"
                  label="Approval ID"
                  placeholder="When required by policy"
                />
              </div>
              <button className="ds-button ds-button--secondary" type="submit">
                Create offer
              </button>
            </form>
            {activeOffer ? (
              <p className="identity-muted">
                Active offer: {activeOffer.type} {activeOffer.code ? `· ${activeOffer.code}` : ''} ·
                expires {formatDate(activeOffer.expiresAt)}
              </p>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">OUTREACH</p>
                <h2>Queue recovery message</h2>
              </div>
              <StatusBadge tone="info">Canonical Messaging command</StatusBadge>
            </div>
            {detail.conversations.length ? (
              <form action={dispatchRecoveryAttempt} className="identity-form">
                <input type="hidden" name="opportunityId" value={detail.id} />
                <div className="identity-form-grid">
                  <div className="identity-field">
                    <label htmlFor="recovery-conversation">Conversation</label>
                    <select
                      id="recovery-conversation"
                      name="conversationId"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select conversation
                      </option>
                      {detail.conversations.map((conversation) => (
                        <option key={conversation.id} value={conversation.id}>
                          {conversation.channel} · {shortId(conversation.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="identity-field">
                    <label htmlFor="recovery-channel">Channel</label>
                    <select
                      id="recovery-channel"
                      name="channel"
                      required
                      defaultValue={detail.conversations[0]?.channel ?? 'EMAIL'}
                    >
                      {Array.from(
                        new Set(detail.conversations.map((conversation) => conversation.channel)),
                      ).map((channel) => (
                        <option key={channel} value={channel}>
                          {channel}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="identity-field">
                    <label htmlFor="recovery-offer-id">Offer</label>
                    <select
                      id="recovery-offer-id"
                      name="offerId"
                      defaultValue={activeOffer?.id ?? ''}
                    >
                      <option value="">No offer</option>
                      {detail.offers
                        .filter((offer) => offer.status === 'ACTIVE')
                        .map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.type} {offer.code ?? ''}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="identity-field">
                  <label htmlFor="recovery-body">Message body</label>
                  <textarea
                    id="recovery-body"
                    name="body"
                    required
                    rows={4}
                    defaultValue="You left items waiting in your order. Complete your purchase when you're ready."
                  />
                </div>
                <button className="ds-button ds-button--primary" type="submit">
                  Queue recovery outreach
                </button>
              </form>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">ATTRIBUTION</p>
                <h2>Link recovered order</h2>
              </div>
              <StatusBadge tone="info">Measured revenue</StatusBadge>
            </div>
            <form action={markRecoveryAttributed} className="identity-form identity-form--inline">
              <input type="hidden" name="opportunityId" value={detail.id} />
              <div className="identity-field">
                <label htmlFor="recovered-order-id">Recovered order ID</label>
                <input
                  id="recovered-order-id"
                  name="recoveredOrderId"
                  required
                  defaultValue={detail.sourceOrderId}
                />
              </div>
              <button className="ds-button ds-button--secondary" type="submit">
                Attribute recovery
              </button>
            </form>
            <p className="identity-muted">
              Same-order conversion and distinct recovered orders are supported. Attribution still
              requires the same tenant, store, customer, currency, a dispatched attempt, and the
              policy attribution window.
            </p>
          </Stack>
        </SurfaceCard>

        <SurfaceCard aria-labelledby="recovery-outreach-history-title">
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">ATTEMPTS</p>
                <h2 id="recovery-outreach-history-title">Outreach history</h2>
              </div>
              <StatusBadge tone="neutral">{detail.attempts.length}</StatusBadge>
            </div>
            {detail.attempts.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table" aria-label="Recovery outreach history">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Channel</th>
                      <th>Status</th>
                      <th>Queued</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td data-label="#">{attempt.sequence}</td>
                        <td data-label="Channel">{attempt.channel}</td>
                        <td data-label="Status">
                          <StatusBadge tone={statusTone(attempt.status)}>
                            {attempt.status}
                          </StatusBadge>
                        </td>
                        <td data-label="Queued">
                          {attempt.queuedAt ? formatDate(attempt.queuedAt) : '—'}
                        </td>
                        <td data-label="Message">
                          <code>{attempt.messageId ? shortId(attempt.messageId) : '—'}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No recovery attempts"
                description="Consent and channel policy are evaluated before the first message can be reserved."
              />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">TIMELINE</p>
                <h2>Recovery evidence</h2>
              </div>
              <StatusBadge tone="neutral">Append-only</StatusBadge>
            </div>
            <ol className="detail-list">
              {detail.timeline.map((event, index) => (
                <li key={`${event.eventType}-${event.occurredAt}-${String(index)}`}>
                  <strong>{event.eventType}</strong>
                  <span>{formatDate(event.occurredAt)}</span>
                </li>
              ))}
            </ol>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function TextField({
  id,
  name,
  label,
  value,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} defaultValue={value} placeholder={placeholder} />
    </div>
  );
}

function NumberField({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="number" min="0" defaultValue={value} />
    </div>
  );
}

function failureMessage(result: { kind: string; detail?: string }) {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization.';
  if (result.kind === 'configuration_error') return 'The server API is not configured.';
  return result.detail ?? 'The recovery opportunity could not be loaded.';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (['RECOVERED', 'DELIVERED', 'SENT'].includes(status)) return 'success';
  if (['FAILED', 'SUPPRESSED', 'CANCELLED'].includes(status)) return 'danger';
  if (['ELIGIBLE', 'ACTIVE', 'QUEUED', 'RESERVED'].includes(status)) return 'warning';
  return 'neutral';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US').format(value / 100);
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}
