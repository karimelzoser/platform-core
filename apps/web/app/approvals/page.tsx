import { cookies } from 'next/headers';
import { decideApproval } from './actions';
import { ExecuteMergeForm } from './execute-merge-form';
import { ExecuteSlaPolicyForm } from './execute-sla-policy-form';
export const dynamic = 'force-dynamic';
interface Approval {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: string;
  expires_at: string;
}
export default async function ApprovalsPage() {
  const result = await loadApprovals();
  return (
    <main className="customers-page">
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">APPROVAL INBOX</p>
          <h1>Approvals</h1>
          <p>Decisions are tenant-scoped, recorded, and cannot be self-approved.</p>
        </div>
      </header>
      {result.kind === 'error' ? (
        <section className="state-panel customer-state">
          <h2>Approvals unavailable</h2>
          <p>{result.detail}</p>
        </section>
      ) : (
        <section className="customer-card customer-card-wide">
          {result.items.length ? (
            <ul className="detail-list">
              {result.items.map((approval) => (
                <li key={approval.id}>
                  <strong>{approval.action}</strong>
                  <span>
                    {approval.resource_type}: {approval.resource_id}
                  </span>
                  <small>
                    {approval.status} · expires {new Date(approval.expires_at).toLocaleString()}
                  </small>
                  {approval.status === 'REQUESTED' ? (
                    <form action={decideApproval} className="approval-actions">
                      <input type="hidden" name="approvalId" value={approval.id} />
                      <button name="decision" value="APPROVED" type="submit">
                        Approve
                      </button>
                      <button name="decision" value="REJECTED" type="submit">
                        Reject
                      </button>
                    </form>
                  ) : null}
                  {approval.status === 'APPROVED' && approval.action === 'crm.customer.merge' ? (
                    <ExecuteMergeForm approvalId={approval.id} />
                  ) : null}
                  {approval.status === 'APPROVED' &&
                  approval.action === 'tickets.sla_policy.create' ? (
                    <ExecuteSlaPolicyForm approvalId={approval.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No approval requests are available for this tenant.</p>
          )}
        </section>
      )}
    </main>
  );
}
async function loadApprovals(): Promise<
  { kind: 'success'; items: Approval[] } | { kind: 'error'; detail: string }
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId) return { kind: 'error', detail: 'Sign in and select an organization.' };
  if (!baseUrl) return { kind: 'error', detail: 'Set API_INTERNAL_URL.' };
  try {
    const response = await fetch(new URL('/v1/approvals', baseUrl), {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
    });
    if (!response.ok) return { kind: 'error', detail: 'Approval API request failed.' };
    return { kind: 'success', items: (await response.json()) as Approval[] };
  } catch {
    return { kind: 'error', detail: 'Approval API is unavailable.' };
  }
}
