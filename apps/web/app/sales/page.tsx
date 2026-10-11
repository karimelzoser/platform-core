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
  addSalesActivity,
  closeSalesOpportunity,
  completeSalesActivity,
  createSalesLead,
  createSalesOpportunity,
  moveSalesOpportunity,
  qualifySalesLead,
} from './actions';
import { PipelineBuilder } from './pipeline-builder';
import { platformRequest } from './platform-api';

export const metadata: Metadata = { title: 'Sales | Platform' };
export const dynamic = 'force-dynamic';

interface SalesDashboard {
  pipelines: readonly {
    id: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    status: string;
    stages: readonly {
      id: string;
      name: string;
      position: number;
      probabilityBps: number;
      terminalKind: 'OPEN' | 'WON' | 'LOST';
    }[];
  }[];
  leads: readonly {
    id: string;
    customerId: string;
    customerName: string | null;
    ownerMembershipId: string | null;
    source: string;
    status: string;
    score: number;
    qualificationGrade: string;
    updatedAt: string;
  }[];
  opportunities: readonly {
    id: string;
    customerId: string;
    customerName: string | null;
    name: string;
    status: string;
    pipelineId: string;
    pipelineName: string;
    stageId: string;
    stageName: string;
    ownerMembershipId: string | null;
    currencyCode: string;
    expectedValueMinor: string;
    probabilityBps: number;
    expectedCloseDate: string | null;
    updatedAt: string;
  }[];
  activities: readonly {
    id: string;
    customerId: string;
    opportunityId: string | null;
    leadId: string | null;
    type: string;
    status: string;
    subject: string;
    dueAt: string | null;
    completedAt: string | null;
  }[];
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function SalesPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const result = await platformRequest<SalesDashboard>('/v1/sales');
  if (result.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState title="Sales workspace is unavailable" description={failureMessage(result)} />
      </PageShell>
    );
  }

  const dashboard = result.data;
  const openOpportunities = dashboard.opportunities.filter((item) => item.status === 'OPEN');
  const qualifiedLeads = dashboard.leads.filter((item) =>
    ['QUALIFIED', 'CONVERTED'].includes(item.status),
  );
  const dueActivities = dashboard.activities.filter((item) => item.status === 'PLANNED');
  const openValueMinor = openOpportunities.reduce(
    (sum, item) => sum + Number(item.expectedValueMinor),
    0,
  );
  const weightedValueMinor = openOpportunities.reduce(
    (sum, item) => sum + Math.round((Number(item.expectedValueMinor) * item.probabilityBps) / 10000),
    0,
  );

  return (
    <PageShell aria-labelledby="sales-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="REVENUE OPERATIONS"
          title={<span id="sales-title">Sales pipeline</span>}
          description="Qualify canonical CRM customers, manage opportunities and activities, and link won revenue back to Commerce without duplicating customer identity."
          actions={
            <a className="ds-button ds-button--secondary" href="/customers">
              Customer 360
            </a>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="ds-metric-grid">
          <MetricCard label="Active pipelines" value={dashboard.pipelines.length} />
          <MetricCard label="Qualified leads" value={qualifiedLeads.length} />
          <MetricCard label="Open pipeline" value={formatMoney(openValueMinor)} />
          <MetricCard
            label="Weighted pipeline"
            value={formatMoney(weightedValueMinor)}
            detail={`${String(dueActivities.length)} planned activities`}
          />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">PIPELINE MODEL</p>
                <h2>Create a configurable pipeline</h2>
              </div>
              <StatusBadge tone="info">Tenant-scoped</StatusBadge>
            </div>
            <p className="identity-muted">
              Stages carry default probability and explicit open / won / lost semantics. Terminal
              stages are enforced by the database so API, automation and future AI tools cannot
              invent inconsistent opportunity states.
            </p>
            <PipelineBuilder />
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">LEADS</p>
                <h2>Qualify CRM customers</h2>
              </div>
              <StatusBadge tone="success">CRM-linked</StatusBadge>
            </div>
            <form action={createSalesLead} className="identity-form identity-form--inline">
              <div className="identity-field">
                <label htmlFor="sales-lead-customer">CRM customer ID</label>
                <input
                  id="sales-lead-customer"
                  name="customerId"
                  required
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
              <div className="identity-field">
                <label htmlFor="sales-lead-source">Lead source</label>
                <input id="sales-lead-source" name="source" required defaultValue="manual" />
              </div>
              <button className="ds-button ds-button--primary" type="submit">
                Create lead
              </button>
            </form>
            <p className="identity-muted">
              Create or resolve the customer in Customer 360 first. Sales stores only the tenant-safe
              customer reference and commercial lifecycle state.
            </p>
            {dashboard.leads.length ? (
              <div className="identity-member-grid">
                {dashboard.leads.map((lead) => (
                  <article className="identity-member-card" key={lead.id}>
                    <div className="identity-card-heading">
                      <div>
                        <h3>{lead.customerName ?? lead.customerId}</h3>
                        <p className="identity-muted">{lead.source}</p>
                      </div>
                      <StatusBadge tone={leadTone(lead.status)}>{lead.status}</StatusBadge>
                    </div>
                    <div className="identity-role-list">
                      <StatusBadge tone="neutral">Score {lead.score}</StatusBadge>
                      <StatusBadge tone="info">{lead.qualificationGrade}</StatusBadge>
                    </div>
                    {lead.status !== 'CONVERTED' ? (
                      <form action={qualifySalesLead} className="identity-form identity-form--compact">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <div className="identity-form-grid">
                          <div className="identity-field">
                            <label htmlFor={`sales-lead-score-${lead.id}`}>Score</label>
                            <input
                              id={`sales-lead-score-${lead.id}`}
                              name="score"
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={lead.score}
                              required
                            />
                          </div>
                          <div className="identity-field">
                            <label htmlFor={`sales-lead-grade-${lead.id}`}>Grade</label>
                            <select
                              id={`sales-lead-grade-${lead.id}`}
                              name="grade"
                              defaultValue={lead.qualificationGrade}
                            >
                              <option value="UNKNOWN">Unknown</option>
                              <option value="COLD">Cold</option>
                              <option value="WARM">Warm</option>
                              <option value="HOT">Hot</option>
                            </select>
                          </div>
                          <div className="identity-field">
                            <label htmlFor={`sales-lead-status-${lead.id}`}>Qualification</label>
                            <select id={`sales-lead-status-${lead.id}`} name="status" defaultValue="QUALIFIED">
                              <option value="QUALIFYING">Qualifying</option>
                              <option value="QUALIFIED">Qualified</option>
                              <option value="DISQUALIFIED">Disqualified</option>
                            </select>
                          </div>
                        </div>
                        <div className="identity-field">
                          <label htmlFor={`sales-lead-notes-${lead.id}`}>Qualification notes</label>
                          <textarea id={`sales-lead-notes-${lead.id}`} name="notes" rows={2} />
                        </div>
                        <div className="identity-field">
                          <label htmlFor={`sales-lead-reason-${lead.id}`}>Disqualification reason</label>
                          <input id={`sales-lead-reason-${lead.id}`} name="reason" />
                        </div>
                        <button className="ds-button ds-button--secondary" type="submit">
                          Update qualification
                        </button>
                      </form>
                    ) : (
                      <p className="identity-muted">Converted into an opportunity.</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No sales leads yet"
                description="Reference an active CRM customer to start qualification."
              />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">OPPORTUNITIES</p>
                <h2>Commercial pipeline</h2>
              </div>
              <StatusBadge tone="info">Stage-guarded</StatusBadge>
            </div>
            {openStageOptions(dashboard).length ? (
              <form action={createSalesOpportunity} className="identity-form">
                <div className="identity-form-grid">
                  <Field name="customerId" label="CRM customer ID" required />
                  <Field name="leadId" label="Lead ID (optional)" />
                  <Field name="name" label="Opportunity name" required />
                  <div className="identity-field">
                    <label htmlFor="sales-opportunity-stage">Pipeline / initial stage</label>
                    <select id="sales-opportunity-stage" name="pipelineStage" required defaultValue="">
                      <option value="" disabled>
                        Select an open stage
                      </option>
                      {openStageOptions(dashboard).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field name="currencyCode" label="Currency" value="EGP" required maxLength={3} />
                  <Field
                    name="expectedValueMinor"
                    label="Expected value (minor units)"
                    type="number"
                    value="0"
                    required
                  />
                  <Field name="expectedCloseDate" label="Expected close" type="date" />
                </div>
                <button className="ds-button ds-button--primary" type="submit">
                  Create opportunity
                </button>
              </form>
            ) : (
              <EmptyState
                title="Create a pipeline first"
                description="An opportunity requires at least one active open pipeline stage."
              />
            )}

            {dashboard.opportunities.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Opportunity</th>
                      <th>Stage</th>
                      <th>Value</th>
                      <th>Probability</th>
                      <th>Lifecycle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.opportunities.map((opportunity) => (
                      <tr key={opportunity.id}>
                        <td data-label="Opportunity">
                          <strong>{opportunity.name}</strong>
                          <small className="identity-muted">
                            {opportunity.customerName ?? opportunity.customerId}
                          </small>
                        </td>
                        <td data-label="Stage">
                          <StatusBadge tone={opportunityTone(opportunity.status)}>
                            {opportunity.stageName}
                          </StatusBadge>
                        </td>
                        <td data-label="Value">
                          {formatCurrency(
                            Number(opportunity.expectedValueMinor),
                            opportunity.currencyCode,
                          )}
                        </td>
                        <td data-label="Probability">
                          {String(Math.round(opportunity.probabilityBps / 100))}%
                        </td>
                        <td data-label="Lifecycle">
                          {opportunity.status === 'OPEN' ? (
                            <OpportunityControls opportunity={opportunity} dashboard={dashboard} />
                          ) : (
                            <StatusBadge tone={opportunityTone(opportunity.status)}>
                              {opportunity.status}
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No opportunities yet" description="Convert a qualified customer into pipeline value." />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">ACTIVITIES</p>
                <h2>Tasks and touchpoints</h2>
              </div>
              <StatusBadge tone="neutral">Operational follow-up</StatusBadge>
            </div>
            <form action={addSalesActivity} className="identity-form">
              <div className="identity-form-grid">
                <Field name="customerId" label="CRM customer ID" required />
                <Field name="opportunityId" label="Opportunity ID" />
                <Field name="leadId" label="Lead ID" />
                <div className="identity-field">
                  <label htmlFor="sales-activity-type">Type</label>
                  <select id="sales-activity-type" name="type" defaultValue="TASK">
                    <option value="TASK">Task</option>
                    <option value="CALL">Call</option>
                    <option value="EMAIL">Email</option>
                    <option value="MEETING">Meeting</option>
                    <option value="NOTE">Note</option>
                  </select>
                </div>
                <Field name="subject" label="Subject" required />
                <Field name="dueAt" label="Due at" type="datetime-local" />
              </div>
              <div className="identity-field">
                <label htmlFor="sales-activity-body">Details</label>
                <textarea id="sales-activity-body" name="body" rows={2} />
              </div>
              <button className="ds-button ds-button--primary" type="submit">
                Add activity
              </button>
            </form>

            {dashboard.activities.length ? (
              <div className="identity-member-grid">
                {dashboard.activities.map((activity) => (
                  <article className="identity-member-card" key={activity.id}>
                    <div className="identity-card-heading">
                      <div>
                        <h3>{activity.subject}</h3>
                        <p className="identity-muted">
                          {activity.type}
                          {activity.dueAt ? ` · due ${formatDate(activity.dueAt)}` : ''}
                        </p>
                      </div>
                      <StatusBadge tone={activity.status === 'DONE' ? 'success' : 'warning'}>
                        {activity.status}
                      </StatusBadge>
                    </div>
                    {activity.status === 'PLANNED' ? (
                      <form action={completeSalesActivity}>
                        <input type="hidden" name="activityId" value={activity.id} />
                        <button className="ds-button ds-button--secondary" type="submit">
                          Mark complete
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No activities yet" description="Schedule the next sales touchpoint or task." />
            )}
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function OpportunityControls({
  opportunity,
  dashboard,
}: {
  opportunity: SalesDashboard['opportunities'][number];
  dashboard: SalesDashboard;
}) {
  const pipeline = dashboard.pipelines.find((item) => item.id === opportunity.pipelineId);
  const openStages = pipeline?.stages.filter((stage) => stage.terminalKind === 'OPEN') ?? [];
  const terminalStages = pipeline?.stages.filter((stage) => stage.terminalKind !== 'OPEN') ?? [];
  return (
    <details>
      <summary>Update</summary>
      <Stack gap="compact">
        <form action={moveSalesOpportunity} className="identity-form identity-form--compact">
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <div className="identity-field">
            <label htmlFor={`sales-move-${opportunity.id}`}>Open stage</label>
            <select id={`sales-move-${opportunity.id}`} name="stageId" defaultValue={opportunity.stageId}>
              {openStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name} · {String(Math.round(stage.probabilityBps / 100))}%
                </option>
              ))}
            </select>
          </div>
          <div className="identity-field">
            <label htmlFor={`sales-move-reason-${opportunity.id}`}>Reason</label>
            <input id={`sales-move-reason-${opportunity.id}`} name="reason" />
          </div>
          <button className="ds-button ds-button--secondary" type="submit">
            Move stage
          </button>
        </form>
        {terminalStages.map((stage) => (
          <form action={closeSalesOpportunity} className="identity-form identity-form--compact" key={stage.id}>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="status" value={stage.terminalKind} />
            {stage.terminalKind === 'WON' ? (
              <div className="identity-field">
                <label htmlFor={`sales-won-order-${opportunity.id}`}>Won order ID (optional)</label>
                <input id={`sales-won-order-${opportunity.id}`} name="orderId" />
              </div>
            ) : (
              <div className="identity-field">
                <label htmlFor={`sales-loss-reason-${opportunity.id}`}>Loss reason</label>
                <input id={`sales-loss-reason-${opportunity.id}`} name="reason" required />
              </div>
            )}
            <button
              className={stage.terminalKind === 'LOST' ? 'ds-button ds-button--danger' : 'ds-button ds-button--primary'}
              type="submit"
            >
              Mark {stage.terminalKind.toLowerCase()}
            </button>
          </form>
        ))}
      </Stack>
    </details>
  );
}

function Field({
  name,
  label,
  required: isRequired = false,
  type = 'text',
  value,
  maxLength,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  value?: string;
  maxLength?: number;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={`sales-${name}`}>{label}</label>
      <input
        id={`sales-${name}`}
        name={name}
        type={type}
        required={isRequired}
        defaultValue={value}
        {...(maxLength ? { maxLength } : {})}
      />
    </div>
  );
}

function openStageOptions(dashboard: SalesDashboard) {
  return dashboard.pipelines.flatMap((pipeline) =>
    pipeline.stages
      .filter((stage) => stage.terminalKind === 'OPEN')
      .map((stage) => ({
        value: `${pipeline.id}:${stage.id}`,
        label: `${pipeline.name} · ${stage.name} · ${String(Math.round(stage.probabilityBps / 100))}%`,
      })),
  );
}

function leadTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'QUALIFIED' || status === 'CONVERTED') return 'success';
  if (status === 'DISQUALIFIED') return 'danger';
  if (status === 'QUALIFYING') return 'warning';
  return 'neutral';
}

function opportunityTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'WON') return 'success';
  if (status === 'LOST') return 'danger';
  return 'info';
}

function failureMessage(result: { kind: string; detail?: string }): string {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization first.';
  if (result.kind === 'configuration_error') return 'The server API is not configured.';
  return result.detail ?? 'The Sales API could not load this workspace.';
}

function formatMoney(minor: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(minor / 100);
}

function formatCurrency(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
