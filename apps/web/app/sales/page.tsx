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
  assignSalesLead,
  createSalesLead,
  createSalesOpportunity,
  moveSalesOpportunity,
  qualifySalesLead,
} from './actions';
import { PipelineEditor } from './pipeline-editor';
import { platformRequest, type PlatformApiResult } from './platform-api';

export const metadata: Metadata = { title: 'Sales | Platform' };
export const dynamic = 'force-dynamic';

interface Lead {
  id: string;
  customerId: string;
  customerName: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  status: string;
  source: string;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  opportunityId: string | null;
  updatedAt: string;
}
interface Stage {
  id: string;
  code: string;
  name: string;
  category: 'OPEN' | 'WON' | 'LOST';
  sortOrder: number;
  defaultProbabilityBasisPoints: number;
  status: string;
}
interface Pipeline {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
  stages: Stage[];
}
interface Opportunity {
  id: string;
  customerId: string;
  customerName: string;
  leadId: string | null;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  stageCategory: string;
  ownerMembershipId: string | null;
  ownerName: string | null;
  name: string;
  status: string;
  expectedValueMinor: number;
  currency: string;
  probabilityBasisPoints: number;
  expectedCloseDate: string | null;
  openActivityCount: number;
}
interface CustomerList {
  items: Array<{
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    status: string;
  }>;
}
interface MemberList {
  items: Array<{
    membershipId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
  }>;
}
interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function SalesPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [leads, pipelines, opportunities, customers, members] = await Promise.all([
    platformRequest<Lead[]>('/v1/sales/leads'),
    platformRequest<Pipeline[]>('/v1/sales/pipelines'),
    platformRequest<Opportunity[]>('/v1/sales/opportunities'),
    platformRequest<CustomerList>('/v1/customers?limit=100'),
    platformRequest<MemberList>('/v1/identity/members'),
  ]);
  const failure = firstFailure(leads, pipelines, opportunities, customers, members);
  if (failure) {
    return (
      <PageShell>
        <EmptyState title="Sales workspace is unavailable" description={failure} />
      </PageShell>
    );
  }
  if (
    leads.kind !== 'success' || pipelines.kind !== 'success' || opportunities.kind !== 'success' ||
    customers.kind !== 'success' || members.kind !== 'success'
  ) return null;

  const activeCustomers = customers.data.items.filter((customer) => customer.status === 'ACTIVE');
  const activeMembers = members.data.items.filter((member) => member.status === 'ACTIVE');
  const qualifiedLeads = leads.data.filter((lead) => lead.status === 'QUALIFIED');
  const openOpportunities = opportunities.data.filter((item) => item.status === 'OPEN');
  const weightedValue = openOpportunities.reduce(
    (sum, item) => sum + Math.round(item.expectedValueMinor * item.probabilityBasisPoints / 10_000), 0,
  );
  const openActivities = openOpportunities.reduce((sum, item) => sum + item.openActivityCount, 0);
  const activePipelines = pipelines.data.filter((pipeline) => pipeline.status === 'ACTIVE');
  const openStageOptions = activePipelines.flatMap((pipeline) =>
    pipeline.stages
      .filter((stage) => stage.status === 'ACTIVE' && stage.category === 'OPEN')
      .map((stage) => ({
        value: `${pipeline.id}|${stage.id}`,
        label: `${pipeline.name} · ${stage.name}`,
      })),
  );

  return (
    <PageShell aria-labelledby="sales-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="SALES"
          title={<span id="sales-title">Pipeline & opportunities</span>}
          description="Qualify CRM customers, manage pipeline stages, schedule sales work, and link won opportunities to canonical Commerce orders without creating a second customer or order system."
          actions={
            <a className="ds-button ds-button--secondary" href="/customers">
              Customer 360
            </a>
          }
        />
        {message ? <div className="identity-notice" role="status">{message}</div> : null}

        <div className="ds-metric-grid">
          <MetricCard label="Qualified leads" value={qualifiedLeads.length} />
          <MetricCard label="Open opportunities" value={openOpportunities.length} />
          <MetricCard label="Weighted pipeline" value={formatMoney(weightedValue)} />
          <MetricCard label="Open sales tasks" value={openActivities} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">LEAD INTAKE</p>
                <h2>Create a CRM-referenced lead</h2>
              </div>
              <StatusBadge tone="info">Canonical customer</StatusBadge>
            </div>
            {activeCustomers.length ? (
              <form action={createSalesLead} className="identity-form identity-form--inline">
                <SelectField
                  id="sales-lead-customer"
                  name="customerId"
                  label="Customer"
                  options={activeCustomers.map((customer) => ({
                    value: customer.id,
                    label: customerName(customer),
                  }))}
                />
                <SelectField
                  id="sales-lead-owner"
                  name="ownerMembershipId"
                  label="Owner"
                  allowBlank="Unassigned"
                  options={activeMembers.map((member) => ({
                    value: member.membershipId,
                    label: memberName(member),
                  }))}
                />
                <div className="identity-field">
                  <label htmlFor="sales-lead-source">Source</label>
                  <input id="sales-lead-source" name="source" defaultValue="platform" required />
                </div>
                <button className="ds-button ds-button--primary" type="submit">Create lead</button>
              </form>
            ) : (
              <EmptyState
                title="No active customers"
                description="Create or import the customer in Customer 360 before opening a sales lead."
              />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">LEAD WORKLIST</p>
                <h2>Qualification & ownership</h2>
              </div>
              <StatusBadge tone="neutral">Structured signals</StatusBadge>
            </div>
            {leads.data.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table">
                  <thead>
                    <tr>
                      <th>Customer</th><th>Status</th><th>Score</th><th>Owner</th><th>Qualification</th><th>Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.data.map((lead) => (
                      <tr key={lead.id}>
                        <td data-label="Customer">
                          <a href={`/customers/${lead.customerId}`}>{lead.customerName}</a>
                          <small className="identity-muted"> · {lead.source}</small>
                        </td>
                        <td data-label="Status"><StatusBadge tone={statusTone(lead.status)}>{lead.status}</StatusBadge></td>
                        <td data-label="Score">{lead.qualificationScore ?? '—'}{lead.qualificationGrade ? ` · ${lead.qualificationGrade}` : ''}</td>
                        <td data-label="Owner">{lead.ownerName ?? 'Unassigned'}</td>
                        <td data-label="Qualification">
                          {lead.status === 'CONVERTED' || lead.status === 'ARCHIVED' ? (
                            lead.opportunityId ? <a href={`/sales/${lead.opportunityId}`}>Open opportunity</a> : 'Closed'
                          ) : (
                            <form action={qualifySalesLead} className="identity-form identity-form--compact">
                              <input type="hidden" name="leadId" value={lead.id} />
                              <select name="outcome" aria-label={`Qualification outcome for ${lead.customerName}`} defaultValue="QUALIFIED">
                                <option value="QUALIFIED">Qualified</option>
                                <option value="DISQUALIFIED">Disqualified</option>
                              </select>
                              <input name="score" type="number" min={0} max={100} defaultValue={lead.qualificationScore ?? 70} aria-label={`Qualification score for ${lead.customerName}`} />
                              <select name="grade" aria-label={`Qualification grade for ${lead.customerName}`} defaultValue={lead.qualificationGrade ?? 'MEDIUM'}>
                                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                              </select>
                              <input name="disqualificationReason" placeholder="Reason when disqualified" aria-label={`Disqualification reason for ${lead.customerName}`} />
                              <button className="ds-button ds-button--secondary" type="submit">Save</button>
                            </form>
                          )}
                        </td>
                        <td data-label="Assignment">
                          <form action={assignSalesLead} className="identity-form identity-form--compact">
                            <input type="hidden" name="leadId" value={lead.id} />
                            <select name="membershipId" defaultValue={lead.ownerMembershipId ?? ''} aria-label={`Owner for ${lead.customerName}`}>
                              <option value="">Unassigned</option>
                              {activeMembers.map((member) => <option key={member.membershipId} value={member.membershipId}>{memberName(member)}</option>)}
                            </select>
                            <button className="ds-button ds-button--secondary" type="submit">Assign</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No sales leads" description="Create the first lead from an active CRM customer." />
            )}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div><p className="ds-eyebrow">PIPELINE CONFIGURATION</p><h2>Pipeline stages</h2></div>
              <StatusBadge tone="warning">Tenant configuration</StatusBadge>
            </div>
            <PipelineEditor />
            {activePipelines.length ? (
              <div className="identity-role-list" aria-label="Configured pipelines">
                {activePipelines.map((pipeline) => (
                  <StatusBadge key={pipeline.id} tone={pipeline.isDefault ? 'success' : 'neutral'}>
                    {pipeline.name} · {pipeline.stages.length} stages{pipeline.isDefault ? ' · default' : ''}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div><p className="ds-eyebrow">OPPORTUNITY</p><h2>Open a commercial opportunity</h2></div>
              <StatusBadge tone="info">Value & probability</StatusBadge>
            </div>
            {activeCustomers.length && openStageOptions.length ? (
              <form action={createSalesOpportunity} className="identity-form">
                <div className="identity-form-grid">
                  <SelectField id="sales-opportunity-customer" name="customerId" label="Customer" options={activeCustomers.map((customer) => ({ value: customer.id, label: customerName(customer) }))} />
                  <SelectField id="sales-opportunity-lead" name="leadId" label="Qualified lead" allowBlank="No lead link" options={qualifiedLeads.map((lead) => ({ value: lead.id, label: `${lead.customerName} · score ${String(lead.qualificationScore ?? '—')}` }))} />
                  <SelectField id="sales-opportunity-stage" name="stageRef" label="Starting stage" options={openStageOptions} />
                  <SelectField id="sales-opportunity-owner" name="ownerMembershipId" label="Owner" allowBlank="Unassigned" options={activeMembers.map((member) => ({ value: member.membershipId, label: memberName(member) }))} />
                  <TextField id="sales-opportunity-name" name="name" label="Opportunity name" />
                  <NumberField id="sales-opportunity-value" name="expectedValueMinor" label="Expected value (minor units)" min={0} />
                  <TextField id="sales-opportunity-currency" name="currency" label="Currency" defaultValue="EGP" pattern="[A-Z]{3}" />
                  <NumberField id="sales-opportunity-probability" name="probabilityBasisPoints" label="Probability (basis points)" min={0} max={10000} required={false} />
                  <div className="identity-field"><label htmlFor="sales-opportunity-close">Expected close date</label><input id="sales-opportunity-close" name="expectedCloseDate" type="date" /></div>
                </div>
                <button className="ds-button ds-button--primary" type="submit">Create opportunity</button>
              </form>
            ) : (
              <EmptyState title="Opportunity prerequisites are incomplete" description="Create an active customer and at least one pipeline with an open stage." />
            )}
          </Stack>
        </SurfaceCard>

        {activePipelines.map((pipeline) => (
          <SurfaceCard key={pipeline.id}>
            <Stack>
              <div className="identity-section-heading">
                <div><p className="ds-eyebrow">PIPELINE BOARD</p><h2>{pipeline.name}</h2></div>
                {pipeline.isDefault ? <StatusBadge tone="success">Default</StatusBadge> : null}
              </div>
              <div className="identity-member-grid">
                {pipeline.stages.map((stage) => {
                  const stageItems = opportunities.data.filter((item) => item.pipelineId === pipeline.id && item.stageId === stage.id);
                  return (
                    <section className="identity-member-card" key={stage.id} aria-label={`${stage.name} stage`}>
                      <div className="identity-card-heading"><h3>{stage.name}</h3><StatusBadge tone={stage.category === 'WON' ? 'success' : stage.category === 'LOST' ? 'danger' : 'info'}>{stageItems.length}</StatusBadge></div>
                      {stageItems.length ? stageItems.map((item) => (
                        <article key={item.id}>
                          <h4><a href={`/sales/${item.id}`}>{item.name}</a></h4>
                          <p className="identity-muted">{item.customerName}</p>
                          <p>{formatCurrency(item.expectedValueMinor, item.currency)} · {formatProbability(item.probabilityBasisPoints)}</p>
                          {item.status === 'OPEN' ? (
                            <form action={moveSalesOpportunity} className="identity-form identity-form--compact">
                              <input type="hidden" name="opportunityId" value={item.id} />
                              <input type="hidden" name="returnTo" value="/sales" />
                              <select name="stageId" defaultValue={item.stageId} aria-label={`Stage for ${item.name}`}>
                                {pipeline.stages.filter((candidate) => candidate.category === 'OPEN' && candidate.status === 'ACTIVE').map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                              </select>
                              <button className="ds-button ds-button--secondary" type="submit">Move</button>
                            </form>
                          ) : <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>}
                        </article>
                      )) : <p className="identity-muted">No opportunities in this stage.</p>}
                    </section>
                  );
                })}
              </div>
            </Stack>
          </SurfaceCard>
        ))}
      </Stack>
    </PageShell>
  );
}

function firstFailure(...results: Array<PlatformApiResult<unknown>>): string | undefined {
  const failed = results.find((result) => result.kind !== 'success');
  if (!failed) return undefined;
  if (failed.kind === 'authentication_required') return 'Sign in and select an active organization.';
  if (failed.kind === 'configuration_error') return 'The server platform API is not configured.';
  return failed.kind === 'error' ? failed.detail : 'Sales data could not be loaded.';
}

function customerName(customer: CustomerList['items'][number]): string {
  return customer.displayName ?? [customer.firstName, customer.lastName].filter(Boolean).join(' ') ?? customer.companyName ?? customer.id;
}
function memberName(member: MemberList['items'][number]): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name || member.email || member.membershipId;
}
function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (['QUALIFIED', 'WON', 'CONVERTED'].includes(status)) return 'success';
  if (['DISQUALIFIED', 'LOST', 'CANCELLED'].includes(status)) return 'danger';
  if (['NEW', 'OPEN'].includes(status)) return 'info';
  return 'neutral';
}
function formatMoney(value: number): string { return new Intl.NumberFormat('en-US').format(value); }
function formatCurrency(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100); }
  catch { return `${new Intl.NumberFormat('en-US').format(value)} ${currency}`; }
}
function formatProbability(basisPoints: number): string { return `${(basisPoints / 100).toFixed(0)}%`; }

function SelectField({ id, name, label, options, allowBlank }: { id: string; name: string; label: string; options: Array<{ value: string; label: string }>; allowBlank?: string }) {
  return <div className="identity-field"><label htmlFor={id}>{label}</label><select id={id} name={name} required={!allowBlank} defaultValue="">{allowBlank ? <option value="">{allowBlank}</option> : <option value="" disabled>Select {label.toLowerCase()}</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
function TextField({ id, name, label, defaultValue, pattern }: { id: string; name: string; label: string; defaultValue?: string; pattern?: string }) {
  return <div className="identity-field"><label htmlFor={id}>{label}</label><input id={id} name={name} required defaultValue={defaultValue} pattern={pattern} /></div>;
}
function NumberField({ id, name, label, min, max, required = true }: { id: string; name: string; label: string; min: number; max?: number; required?: boolean }) {
  return <div className="identity-field"><label htmlFor={id}>{label}</label><input id={id} name={name} type="number" min={min} max={max} required={required} /></div>;
}
