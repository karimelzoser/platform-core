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
import {
  detectRecoveryOpportunity,
  expireRecoveryOpportunities,
  saveRecoveryPolicy,
} from './actions';
import { platformRequest } from './platform-api';

export const metadata: Metadata = { title: 'Recovery | Platform' };
export const dynamic = 'force-dynamic';

interface RecoveryListItem {
  id: string;
  storeId: string;
  sourceOrderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  potentialValueMinor: number;
  currency: string;
  attemptCount: number;
  eligibleAt: string;
  expiresAt: string;
  recoveredOrderId: string | null;
  recoveredAt: string | null;
  recoveredValueMinor: number | null;
}

interface RecoveryPolicy {
  id: string;
  storeId: string;
  name: string;
  status: string;
  abandonmentDelayMinutes: number;
  opportunityTtlHours: number;
  maxAttempts: number;
  cooldownMinutes: number;
  attributionWindowHours: number;
  channels: readonly string[];
  maxOfferPercentBasisPoints: number;
  maxOfferAmountMinor: number;
}

interface StoreList {
  items: readonly { id: string; name: string; status: string; defaultCurrency: string }[];
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function RecoveryPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [opportunities, policies, stores] = await Promise.all([
    platformRequest<RecoveryListItem[]>('/v1/recovery'),
    platformRequest<RecoveryPolicy[]>('/v1/recovery/policies'),
    platformRequest<StoreList>('/v1/commerce/stores'),
  ]);
  const failure = firstFailure(opportunities, policies, stores);
  if (failure) {
    return (
      <PageShell>
        <EmptyState title="Recovery workspace is unavailable" description={failure} />
      </PageShell>
    );
  }
  if (
    opportunities.kind !== 'success' ||
    policies.kind !== 'success' ||
    stores.kind !== 'success'
  )
    return null;

  const active = opportunities.data.filter((item) => ['ELIGIBLE', 'ACTIVE'].includes(item.status));
  const recovered = opportunities.data.filter((item) => item.status === 'RECOVERED');
  const suppressed = opportunities.data.filter((item) => item.status === 'SUPPRESSED');
  const potentialValue = active.reduce((sum, item) => sum + item.potentialValueMinor, 0);
  const recoveredValue = recovered.reduce(
    (sum, item) => sum + (item.recoveredValueMinor ?? 0),
    0,
  );

  return (
    <PageShell aria-labelledby="recovery-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="REVENUE RECOVERY"
          title={<span id="recovery-title">Abandoned-order recovery</span>}
          description="Detect recoverable canonical orders, enforce verified consent and cooldown policy, queue outreach through Messaging, and attribute recovered revenue without duplicating customer or order state."
          actions={
            <form action={expireRecoveryOpportunities}>
              <button className="ds-button ds-button--secondary" type="submit">
                Expire due opportunities
              </button>
            </form>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="ds-metric-grid">
          <MetricCard label="Active opportunities" value={active.length} />
          <MetricCard label="Potential value" value={formatMoney(potentialValue)} />
          <MetricCard label="Recovered value" value={formatMoney(recoveredValue)} />
          <MetricCard label="Suppressed" value={suppressed.length} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">DISCOVERY</p>
                <h2>Detect a recoverable order</h2>
              </div>
              <StatusBadge tone="info">Canonical Commerce order</StatusBadge>
            </div>
            <form action={detectRecoveryOpportunity} className="identity-form identity-form--inline">
              <div className="identity-field">
                <label htmlFor="recovery-order-id">Draft / pending order ID</label>
                <input
                  id="recovery-order-id"
                  name="orderId"
                  required
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
              <button className="ds-button ds-button--primary" type="submit">
                Detect opportunity
              </button>
            </form>
            <p className="identity-muted">
              Detection never creates a second cart or customer. It references the canonical Commerce
              order and CRM customer and assigns a deterministic workflow identity for durable
              scheduling.
            </p>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">POLICY</p>
                <h2>Store recovery policy</h2>
              </div>
              <StatusBadge tone="warning">High-risk change</StatusBadge>
            </div>
            {stores.data.items.length ? (
              <form action={saveRecoveryPolicy} className="identity-form">
                <div className="identity-form-grid">
                  <FieldSelect
                    id="recovery-policy-store"
                    name="storeId"
                    label="Store"
                    options={stores.data.items.map((store) => ({ value: store.id, label: store.name }))}
                  />
                  <FieldInput id="recovery-policy-name" name="name" label="Policy name" value="Standard recovery" />
                  <NumberField id="recovery-delay" name="abandonmentDelayMinutes" label="Abandonment delay (minutes)" value={60} min={1} />
                  <NumberField id="recovery-ttl" name="opportunityTtlHours" label="Opportunity lifetime (hours)" value={72} min={1} />
                  <NumberField id="recovery-attempts" name="maxAttempts" label="Maximum attempts" value={3} min={1} max={20} />
                  <NumberField id="recovery-cooldown" name="cooldownMinutes" label="Cooldown (minutes)" value={240} min={1} />
                  <NumberField id="recovery-attribution" name="attributionWindowHours" label="Attribution window (hours)" value={168} min={1} />
                  <NumberField id="recovery-percent" name="maxOfferPercentBasisPoints" label="Max discount (basis points)" value={1000} min={0} max={10000} />
                  <NumberField id="recovery-fixed" name="maxOfferAmountMinor" label="Max fixed offer (minor units)" value={0} min={0} />
                  <FieldInput id="recovery-approval" name="approvalId" label="Approval ID" placeholder="When required by policy" />
                </div>
                <fieldset className="identity-field">
                  <legend>Allowed outreach channels</legend>
                  <div className="identity-role-list">
                    {['WHATSAPP', 'EMAIL', 'MESSENGER', 'INSTAGRAM'].map((channel) => (
                      <label key={channel}>
                        <input
                          name="channels"
                          type="checkbox"
                          value={channel}
                          defaultChecked={channel === 'WHATSAPP' || channel === 'EMAIL'}
                        />{' '}
                        {channel}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button className="ds-button ds-button--secondary" type="submit">
                  Save recovery policy
                </button>
              </form>
            ) : (
              <EmptyState
                title="No stores available"
                description="Create or synchronize a Commerce store before configuring recovery."
              />
            )}
            {policies.data.length ? (
              <div className="identity-role-list" aria-label="Active recovery policies">
                {policies.data.map((policy) => (
                  <StatusBadge key={policy.id} tone={policy.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {policy.name} · {policy.channels.join(' / ')}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">QUEUE</p>
                <h2>Recovery opportunities</h2>
              </div>
              <StatusBadge tone="info">Tenant scoped</StatusBadge>
            </div>
            {opportunities.data.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Attempts</th>
                      <th>Expires</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.data.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Order">{item.orderNumber}</td>
                        <td data-label="Customer">{item.customerName}</td>
                        <td data-label="Status">
                          <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                        </td>
                        <td data-label="Value">
                          {formatMoney(item.potentialValueMinor)} {item.currency}
                        </td>
                        <td data-label="Attempts">{item.attemptCount}</td>
                        <td data-label="Expires">{formatDate(item.expiresAt)}</td>
                        <td data-label="Action">
                          <a
                            className="ds-button ds-button--secondary"
                            href={`/recovery/${encodeURIComponent(item.id)}`}
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No recovery opportunities"
                description="Detect a draft or pending canonical order after its recovery policy is configured."
              />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function FieldInput({
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
  min,
  max,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  max?: number;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="number" defaultValue={value} min={min} max={max} required />
    </div>
  );
}

function FieldSelect({
  id,
  name,
  label,
  options,
}: {
  id: string;
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} required defaultValue="">
        <option value="" disabled>
          Select
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function firstFailure(...results: Array<{ kind: string; detail?: string }>): string | undefined {
  const failed = results.find((result) => result.kind !== 'success');
  if (!failed) return undefined;
  if (failed.kind === 'authentication_required') return 'Sign in and select an organization.';
  if (failed.kind === 'configuration_error') return 'The server API is not configured.';
  return failed.detail ?? 'The platform API could not load recovery.';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'RECOVERED') return 'success';
  if (['SUPPRESSED', 'CANCELLED'].includes(status)) return 'danger';
  if (status === 'EXPIRED') return 'neutral';
  if (['ELIGIBLE', 'ACTIVE'].includes(status)) return 'warning';
  return 'info';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US').format(value / 100);
}
