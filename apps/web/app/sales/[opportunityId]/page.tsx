import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../../ui-primitives';
import {
  closeSalesOpportunity,
  completeSalesActivity,
  createSalesActivity,
  moveSalesOpportunity,
} from '../actions';
import { platformRequest } from '../platform-api';

export const metadata: Metadata = { title: 'Sales opportunity | Platform' };
export const dynamic = 'force-dynamic';

interface OpportunityDetail {
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
  wonStoreId: string | null;
  wonOrderId: string | null;
  closedAt: string | null;
  lossReason: string | null;
  activities: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    body: string | null;
    assignedMembershipId: string | null;
    dueAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  timeline: Array<{ eventType: string; data: Record<string, unknown>; occurredAt: string }>;
}
interface Pipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; category: 'OPEN' | 'WON' | 'LOST'; status: string }>;
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
interface OrderList {
  items: Array<{
    id: string;
    storeId: string;
    customerId: string | null;
    orderNumber: string;
    status: string;
    currency: string;
    totalMinor: string;
  }>;
}
interface PageProps {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ message?: string }>;
}

export default async function SalesOpportunityPage({ params, searchParams }: PageProps) {
  const [{ opportunityId }, { message }] = await Promise.all([params, searchParams]);
  const detail = await platformRequest<OpportunityDetail>(
    `/v1/sales/opportunities/${encodeURIComponent(opportunityId)}`,
  );
  if (detail.kind === 'error' && detail.detail.toLowerCase().includes('not found')) notFound();
  if (detail.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState
          title="Sales opportunity is unavailable"
          description={
            detail.kind === 'authentication_required'
              ? 'Sign in and select an active organization.'
              : detail.kind === 'configuration_error'
                ? 'The server platform API is not configured.'
                : detail.detail
          }
        />
      </PageShell>
    );
  }
  const opportunity = detail.data;
  const [pipelines, members, orders] = await Promise.all([
    platformRequest<Pipeline[]>('/v1/sales/pipelines'),
    platformRequest<MemberList>('/v1/identity/members'),
    platformRequest<OrderList>(
      `/v1/commerce/orders?customerId=${encodeURIComponent(opportunity.customerId)}&limit=100`,
    ),
  ]);
  const currentPipeline =
    pipelines.kind === 'success'
      ? pipelines.data.find((pipeline) => pipeline.id === opportunity.pipelineId)
      : undefined;
  const membersList =
    members.kind === 'success' ? members.data.items.filter((member) => member.status === 'ACTIVE') : [];
  const eligibleOrders =
    orders.kind === 'success'
      ? orders.data.items.filter(
          (order) =>
            order.customerId === opportunity.customerId &&
            order.currency === opportunity.currency &&
            ['CONFIRMED', 'CLOSED'].includes(order.status),
        )
      : [];
  const returnTo = `/sales/${opportunity.id}`;

  return (
    <PageShell aria-labelledby="sales-opportunity-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="SALES OPPORTUNITY"
          title={<span id="sales-opportunity-title">{opportunity.name}</span>}
          description={`${opportunity.customerName} · ${opportunity.pipelineName} / ${opportunity.stageName}`}
          actions={
            <>
              <a className="ds-button ds-button--secondary" href="/sales">Sales board</a>
              <a className="ds-button ds-button--secondary" href={`/customers/${opportunity.customerId}`}>Customer 360</a>
            </>
          }
        />
        {message ? <div className="identity-notice" role="status">{message}</div> : null}
        <div className="ds-metric-grid">
          <MetricCard label="Status" value={opportunity.status} />
          <MetricCard label="Expected value" value={formatCurrency(opportunity.expectedValueMinor, opportunity.currency)} />
          <MetricCard label="Probability" value={`${(opportunity.probabilityBasisPoints / 100).toFixed(0)}%`} />
          <MetricCard label="Open tasks" value={opportunity.activities.filter((activity) => activity.status === 'OPEN').length} />
        </div>

        {opportunity.status === 'OPEN' && currentPipeline ? (
          <SurfaceCard>
            <Stack>
              <div className="identity-section-heading">
                <div><p className="ds-eyebrow">PROGRESSION</p><h2>Move or close opportunity</h2></div>
                <StatusBadge tone="info">Canonical state transition</StatusBadge>
              </div>
              <form action={moveSalesOpportunity} className="identity-form identity-form--inline">
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="identity-field">
                  <label htmlFor="sales-detail-stage">Open stage</label>
                  <select id="sales-detail-stage" name="stageId" defaultValue={opportunity.stageId}>
                    {currentPipeline.stages.filter((stage) => stage.status === 'ACTIVE' && stage.category === 'OPEN').map((stage) => (
                      <option key={stage.id} value={stage.id}>{stage.name}</option>
                    ))}
                  </select>
                </div>
                <div className="identity-field">
                  <label htmlFor="sales-detail-probability">Probability bps</label>
                  <input id="sales-detail-probability" name="probabilityBasisPoints" type="number" min={0} max={10000} placeholder={String(opportunity.probabilityBasisPoints)} />
                </div>
                <button className="ds-button ds-button--secondary" type="submit">Update stage</button>
              </form>

              <div className="identity-role-editor-grid">
                <form action={closeSalesOpportunity} className="identity-form identity-role-card">
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="outcome" value="WON" />
                  <h3>Mark won</h3>
                  <div className="identity-field">
                    <label htmlFor="sales-won-stage">Won stage</label>
                    <select id="sales-won-stage" name="stageId" required defaultValue="">
                      <option value="" disabled>Select won stage</option>
                      {currentPipeline.stages.filter((stage) => stage.category === 'WON' && stage.status === 'ACTIVE').map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                    </select>
                  </div>
                  <div className="identity-field">
                    <label htmlFor="sales-won-order">Confirmed / closed order</label>
                    <select id="sales-won-order" name="wonOrderRef" required={false} defaultValue="">
                      <option value="">Select order below</option>
                      {eligibleOrders.map((order) => <option key={order.id} value={`${order.storeId}|${order.id}`}>{order.orderNumber} · {formatCurrency(Number(order.totalMinor), order.currency)}</option>)}
                    </select>
                  </div>
                  <WonOrderHiddenFields orders={eligibleOrders} />
                  <p className="identity-muted">Select an order and copy its store/order values only through the generated controls; the API verifies customer, currency and order state again.</p>
                  {eligibleOrders.map((order) => (
                    <label className="identity-field" key={order.id}>
                      <span>{order.orderNumber}</span>
                      <input type="radio" name="wonOrderChoice" value={order.id} formAction={undefined} />
                    </label>
                  ))}
                  <div className="identity-field"><label htmlFor="sales-won-store-id">Store ID</label><input id="sales-won-store-id" name="wonStoreId" placeholder="Choose from eligible order" /></div>
                  <div className="identity-field"><label htmlFor="sales-won-order-id">Order ID</label><input id="sales-won-order-id" name="wonOrderId" placeholder="Choose from eligible order" /></div>
                  <button className="ds-button ds-button--primary" type="submit" disabled={!eligibleOrders.length}>Mark won</button>
                </form>

                <form action={closeSalesOpportunity} className="identity-form identity-role-card">
                  <input type="hidden" name="opportunityId" value={opportunity.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="outcome" value="LOST" />
                  <h3>Mark lost</h3>
                  <div className="identity-field">
                    <label htmlFor="sales-lost-stage">Lost stage</label>
                    <select id="sales-lost-stage" name="stageId" required defaultValue="">
                      <option value="" disabled>Select lost stage</option>
                      {currentPipeline.stages.filter((stage) => stage.category === 'LOST' && stage.status === 'ACTIVE').map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                    </select>
                  </div>
                  <div className="identity-field"><label htmlFor="sales-loss-reason">Loss reason</label><textarea id="sales-loss-reason" name="lossReason" rows={4} required /></div>
                  <button className="ds-button ds-button--danger" type="submit">Mark lost</button>
                </form>
              </div>
            </Stack>
          </SurfaceCard>
        ) : (
          <SurfaceCard>
            <div className="identity-section-heading"><h2>Commercial outcome</h2><StatusBadge tone={opportunity.status === 'WON' ? 'success' : 'danger'}>{opportunity.status}</StatusBadge></div>
            {opportunity.wonOrderId ? <p>Won order: <a href={`/orders/${opportunity.wonOrderId}`}>{opportunity.wonOrderId}</a></p> : null}
            {opportunity.lossReason ? <p>Loss reason: {opportunity.lossReason}</p> : null}
          </SurfaceCard>
        )}

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading"><div><p className="ds-eyebrow">ACTIVITIES</p><h2>Tasks & follow-up</h2></div><StatusBadge tone="neutral">Tenant members only</StatusBadge></div>
            <form action={createSalesActivity} className="identity-form">
              <input type="hidden" name="customerId" value={opportunity.customerId} />
              <input type="hidden" name="leadId" value={opportunity.leadId ?? ''} />
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="identity-form-grid">
                <div className="identity-field"><label htmlFor="sales-activity-type">Type</label><select id="sales-activity-type" name="activityType" defaultValue="FOLLOW_UP"><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="MEETING">Meeting</option><option value="NOTE">Note</option><option value="TASK">Task</option><option value="FOLLOW_UP">Follow-up</option></select></div>
                <div className="identity-field"><label htmlFor="sales-activity-title">Title</label><input id="sales-activity-title" name="title" required /></div>
                <div className="identity-field"><label htmlFor="sales-activity-owner">Assignee</label><select id="sales-activity-owner" name="assignedMembershipId" defaultValue={opportunity.ownerMembershipId ?? ''}><option value="">Unassigned</option>{membersList.map((member) => <option key={member.membershipId} value={member.membershipId}>{memberName(member)}</option>)}</select></div>
                <div className="identity-field"><label htmlFor="sales-activity-due">Due at</label><input id="sales-activity-due" name="dueAt" type="datetime-local" /></div>
              </div>
              <div className="identity-field"><label htmlFor="sales-activity-body">Notes</label><textarea id="sales-activity-body" name="body" rows={3} /></div>
              <button className="ds-button ds-button--primary" type="submit">Add activity</button>
            </form>
            {opportunity.activities.length ? (
              <div className="identity-table-wrap">
                <table className="identity-table"><thead><tr><th>Activity</th><th>Status</th><th>Due</th><th>Action</th></tr></thead><tbody>{opportunity.activities.map((activity) => <tr key={activity.id}><td data-label="Activity"><strong>{activity.title}</strong><small className="identity-muted"> · {activity.type}</small>{activity.body ? <p>{activity.body}</p> : null}</td><td data-label="Status"><StatusBadge tone={activity.status === 'COMPLETED' ? 'success' : 'info'}>{activity.status}</StatusBadge></td><td data-label="Due">{activity.dueAt ? new Date(activity.dueAt).toLocaleString() : '—'}</td><td data-label="Action">{activity.status === 'OPEN' ? <form action={completeSalesActivity}><input type="hidden" name="activityId" value={activity.id} /><input type="hidden" name="returnTo" value={returnTo} /><button className="ds-button ds-button--secondary" type="submit">Complete</button></form> : '—'}</td></tr>)}</tbody></table>
              </div>
            ) : <p className="identity-muted">No sales activities recorded yet.</p>}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading"><div><p className="ds-eyebrow">TIMELINE</p><h2>Sales history</h2></div><StatusBadge tone="info">Append only</StatusBadge></div>
            <ol>{opportunity.timeline.map((event, index) => <li key={`${event.eventType}-${String(index)}`}><strong>{event.eventType}</strong> · {new Date(event.occurredAt).toLocaleString()}</li>)}</ol>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function memberName(member: MemberList['items'][number]): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name || member.email || member.membershipId;
}
function formatCurrency(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100); }
  catch { return `${new Intl.NumberFormat('en-US').format(value)} ${currency}`; }
}

// The backend is authoritative for the won-order relationship. This component is
// intentionally inert metadata for server rendering; a subsequent UX closure can
// replace the compact store/order controls with a client-side linked selector.
function WonOrderHiddenFields({ orders }: { orders: OrderList['items'] }) {
  return orders.length ? <p className="identity-muted">{orders.length} eligible canonical order(s) available.</p> : null;
}
