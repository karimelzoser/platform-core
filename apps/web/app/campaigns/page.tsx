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
import { identityRequest } from '../identity-api';
import {
  cancelCampaign,
  createCampaign,
  freezeCampaignAudience,
  pauseCampaign,
  resumeCampaign,
  startCampaign,
} from './actions';

export const metadata: Metadata = { title: 'Campaigns | Platform' };
export const dynamic = 'force-dynamic';

interface CampaignDashboard {
  items: readonly CampaignItem[];
}

interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  connectionId: string;
  connectionName: string;
  segmentId: string | null;
  templateId: string;
  status: string;
  timezone: string;
  sendWindowStartMinute: number;
  sendWindowEndMinute: number;
  batchSize: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  temporalWorkflowId: string | null;
  attributionWindowHours: number;
  updatedAt: string;
  metrics: {
    total: number;
    eligible: number;
    suppressed: number;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    conversions: number;
    conversionValueMinor: string;
    providerCostMinor: string;
  };
}

interface IntegrationConnection {
  id: string;
  connectorKey: string;
  displayName: string;
  status: string;
  capabilities: readonly string[];
}

interface MessageTemplate {
  id: string;
  name: string;
  locale: string;
  channel: string | null;
  body: string;
  status: string;
}

interface Segment {
  id: string;
  name: string;
  status: string;
  mode: string;
  memberCount: number;
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function CampaignsPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [campaigns, connections, templates, segments] = await Promise.all([
    identityRequest<CampaignDashboard>('/v1/campaigns'),
    identityRequest<IntegrationConnection[]>('/v1/integrations/connections'),
    identityRequest<MessageTemplate[]>('/v1/conversations/templates'),
    identityRequest<Segment[]>('/v1/customers/segments'),
  ]);
  const failure = firstFailure(campaigns, connections, templates, segments);
  if (failure) {
    return (
      <PageShell>
        <EmptyState title="Campaign workspace is unavailable" description={failure} />
      </PageShell>
    );
  }
  if (
    campaigns.kind !== 'success' ||
    connections.kind !== 'success' ||
    templates.kind !== 'success' ||
    segments.kind !== 'success'
  )
    return null;

  const outboundConnections = connections.data.filter(
    (item) =>
      ['CONNECTED', 'DEGRADED'].includes(item.status) &&
      item.capabilities.includes('messaging.outbound'),
  );
  const campaignTemplates = templates.data.filter(
    (item) => item.status === 'ACTIVE' && ['EMAIL', 'WHATSAPP', 'MESSENGER', 'INSTAGRAM'].includes(item.channel ?? ''),
  );
  const activeSegments = segments.data.filter((item) => item.status === 'ACTIVE');
  const running = campaigns.data.items.filter((item) => item.status === 'RUNNING').length;
  const eligible = campaigns.data.items.reduce((sum, item) => sum + item.metrics.eligible, 0);
  const conversions = campaigns.data.items.reduce((sum, item) => sum + item.metrics.conversions, 0);
  const conversionValue = campaigns.data.items.reduce(
    (sum, item) => sum + Number(item.metrics.conversionValueMinor),
    0,
  );

  return (
    <PageShell aria-labelledby="campaigns-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="CAMPAIGNS"
          title={<span id="campaigns-title">Campaign orchestration</span>}
          description="Freeze CRM audiences, enforce verified consent and suppression at send time, and route every outbound message through the canonical Messaging and Connector delivery path."
          actions={
            <>
              <a className="ds-button ds-button--secondary" href="/segments">
                CRM segments
              </a>
              <a className="ds-button ds-button--secondary" href="/integrations">
                Integrations
              </a>
            </>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="ds-metric-grid">
          <MetricCard label="Campaigns" value={campaigns.data.items.length} />
          <MetricCard label="Running" value={running} />
          <MetricCard label="Eligible recipients" value={eligible} />
          <MetricCard label="Attributed revenue" value={formatMinor(conversionValue)} detail={`${String(conversions)} conversion(s)`} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">CREATE</p>
                <h2>New consent-aware campaign</h2>
              </div>
              <StatusBadge tone="info">CRM + Messaging canonical state</StatusBadge>
            </div>
            {outboundConnections.length && campaignTemplates.length ? (
              <form action={createCampaign} className="identity-form">
                <div className="identity-form-grid">
                  <Field id="campaign-name" name="name" label="Campaign name" required />
                  <Select
                    id="campaign-channel"
                    name="channel"
                    label="Channel"
                    options={['WHATSAPP', 'EMAIL', 'MESSENGER', 'INSTAGRAM'].map((value) => ({ value, label: value }))}
                  />
                  <Select
                    id="campaign-connection"
                    name="connectionId"
                    label="Outbound connection"
                    options={outboundConnections.map((item) => ({ value: item.id, label: `${item.displayName} · ${item.connectorKey}` }))}
                  />
                  <Select
                    id="campaign-template"
                    name="templateId"
                    label="Message template"
                    options={campaignTemplates.map((item) => ({ value: item.id, label: `${item.name} · ${item.channel ?? 'Any'} · ${item.locale}` }))}
                  />
                  <Select
                    id="campaign-segment"
                    name="segmentId"
                    label="CRM segment (optional)"
                    optional
                    options={activeSegments.map((item) => ({ value: item.id, label: `${item.name} · ${String(item.memberCount)} members` }))}
                  />
                  <Field id="campaign-timezone" name="timezone" label="Timezone" value="UTC" required />
                  <Field id="campaign-start" name="sendWindowStart" label="Send window start" value="00:00" type="time" required />
                  <Field id="campaign-end" name="sendWindowEnd" label="Send window end" value="23:59" type="time" required />
                  <Field id="campaign-batch" name="batchSize" label="Batch size" value="500" type="number" required />
                  <Field id="campaign-attribution" name="attributionWindowHours" label="Attribution window (hours)" value="168" type="number" required />
                </div>
                <button className="ds-button ds-button--primary" type="submit">
                  Create campaign
                </button>
              </form>
            ) : (
              <EmptyState
                title="Campaign prerequisites are incomplete"
                description="A connected outbound Messaging integration and an active channel template are required before creating a campaign."
              />
            )}
            <p className="identity-muted">
              Automatic scheduled execution is intentionally not claimed here. The campaign records a durable Temporal workflow identity, while timer/replay/cancellation execution is closed in the dedicated Temporal platform workstream.
            </p>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">OPERATIONS</p>
                <h2>Campaign lifecycle</h2>
              </div>
              <StatusBadge tone="warning">Launch requires approval</StatusBadge>
            </div>
            {campaigns.data.items.length ? (
              <div className="identity-member-grid">
                {campaigns.data.items.map((campaign) => (
                  <article className="identity-member-card" key={campaign.id}>
                    <div className="identity-card-heading">
                      <div>
                        <h3>{campaign.name}</h3>
                        <p className="identity-muted">{campaign.channel} · {campaign.connectionName}</p>
                      </div>
                      <StatusBadge tone={statusTone(campaign.status)}>{campaign.status}</StatusBadge>
                    </div>
                    <div className="identity-role-list">
                      <StatusBadge>{campaign.metrics.eligible} eligible</StatusBadge>
                      <StatusBadge tone={campaign.metrics.suppressed ? 'warning' : 'neutral'}>{campaign.metrics.suppressed} suppressed</StatusBadge>
                      <StatusBadge tone="info">{campaign.metrics.sent + campaign.metrics.delivered + campaign.metrics.read} accepted+</StatusBadge>
                      <StatusBadge tone={campaign.metrics.failed ? 'danger' : 'neutral'}>{campaign.metrics.failed} failed</StatusBadge>
                    </div>
                    <p className="identity-muted">
                      Window {formatMinute(campaign.sendWindowStartMinute)}–{formatMinute(campaign.sendWindowEndMinute)} {campaign.timezone} · batch {campaign.batchSize} · workflow {campaign.temporalWorkflowId ?? 'not started'}
                    </p>
                    {campaign.status === 'DRAFT' && campaign.metrics.total === 0 ? (
                      <form action={freezeCampaignAudience}>
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <button className="ds-button ds-button--secondary" type="submit">Freeze audience</button>
                      </form>
                    ) : null}
                    {['DRAFT', 'SCHEDULED'].includes(campaign.status) && campaign.metrics.eligible > 0 ? (
                      <form action={startCampaign} className="identity-form identity-form--compact">
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <div className="identity-field">
                          <label htmlFor={`campaign-approval-${campaign.id}`}>Approval ID</label>
                          <input id={`campaign-approval-${campaign.id}`} name="approvalId" placeholder="Approved campaigns.campaign.start action" />
                        </div>
                        <button className="ds-button ds-button--primary" type="submit">Start campaign</button>
                      </form>
                    ) : null}
                    {campaign.status === 'RUNNING' ? <StateForm action={pauseCampaign} campaignId={campaign.id} label="Pause" /> : null}
                    {campaign.status === 'PAUSED' ? <StateForm action={resumeCampaign} campaignId={campaign.id} label="Resume" /> : null}
                    {['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(campaign.status) ? <StateForm action={cancelCampaign} campaignId={campaign.id} label="Cancel" danger /> : null}
                    <div className="identity-role-list">
                      <StatusBadge tone="success">{campaign.metrics.conversions} conversions</StatusBadge>
                      <StatusBadge>{formatMinor(Number(campaign.metrics.conversionValueMinor))} attributed</StatusBadge>
                      <StatusBadge>{formatMinor(Number(campaign.metrics.providerCostMinor))} provider cost</StatusBadge>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No campaigns yet" description="Create a campaign to freeze its consent-aware CRM audience." />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function StateForm({ action, campaignId, label, danger = false }: { action: (formData: FormData) => Promise<void>; campaignId: string; label: string; danger?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <button className={`ds-button ${danger ? 'ds-button--danger' : 'ds-button--secondary'}`} type="submit">{label}</button>
    </form>
  );
}

function Field({ id, name, label, value, type = 'text', required = false }: { id: string; name: string; label: string; value?: string; type?: string; required?: boolean }) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} defaultValue={value} required={required} min={type === 'number' ? 1 : undefined} />
    </div>
  );
}

function Select({ id, name, label, options, optional = false }: { id: string; name: string; label: string; options: readonly { value: string; label: string }[]; optional?: boolean }) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} required={!optional} defaultValue="">
        <option value="">{optional ? 'All active customers' : 'Choose'}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function firstFailure(...results: Array<{ kind: string; detail?: string }>): string | undefined {
  const failure = results.find((result) => result.kind !== 'success');
  if (!failure) return undefined;
  if (failure.kind === 'authentication_required') return 'Sign in and select an active organization.';
  if (failure.kind === 'configuration_error') return 'The server API is not configured.';
  return failure.detail ?? 'The Campaign API could not load this workspace.';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING') return 'info';
  if (['SCHEDULED', 'PAUSED'].includes(status)) return 'warning';
  if (status === 'CANCELLED') return 'danger';
  return 'neutral';
}

function formatMinute(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function formatMinor(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value / 100));
}
