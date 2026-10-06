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
  deleteRole,
  inviteMember,
  revokeInvitation,
  saveRole,
  setMemberRoles,
  setMemberStatus,
} from './actions';

export const metadata: Metadata = { title: 'Team & Roles | Platform' };

interface MemberList {
  items: readonly {
    membershipId: string;
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
    title: string | null;
    joinedAt: string | null;
    statusReason: string | null;
    roleCodes: readonly string[];
    roleIds: readonly string[];
  }[];
}

interface RoleList {
  items: readonly {
    id: string;
    code: string;
    name: string;
    description: string | null;
    system: boolean;
    permissionCodes: readonly string[];
  }[];
  permissions: readonly { code: string; category: string; description: string; risk: string }[];
}

interface InvitationList {
  items: readonly {
    id: string;
    email: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    roleCodes: readonly string[];
  }[];
}

interface SessionView {
  membershipId: string;
  roleCodes: readonly string[];
  mfaPolicy: string;
  mfaSatisfied: boolean;
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function TeamPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [members, roles, invitations, session] = await Promise.all([
    identityRequest<MemberList>('/v1/identity/members'),
    identityRequest<RoleList>('/v1/identity/roles'),
    identityRequest<InvitationList>('/v1/identity/invitations'),
    identityRequest<SessionView>('/v1/session'),
  ]);

  const failure = firstFailure(members, roles, invitations, session);
  if (failure) {
    return (
      <PageShell>
        <EmptyState title="Team workspace is unavailable" description={failure} action={<a className="ds-button ds-button--secondary" href="/organizations">Organizations</a>} />
      </PageShell>
    );
  }
  if (members.kind !== 'success' || roles.kind !== 'success' || invitations.kind !== 'success' || session.kind !== 'success') return null;

  const activeMembers = members.data.items.filter((member) => member.status === 'ACTIVE').length;
  const pendingInvitations = invitations.data.items.filter((invite) => invite.status === 'PENDING').length;
  const customRoles = roles.data.items.filter((role) => !role.system).length;

  return (
    <PageShell aria-labelledby="team-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="IDENTITY & ACCESS"
          title={<span id="team-title">Team & roles</span>}
          description="Manage tenant memberships, invitations, and reusable role definitions through the same RBAC and approval boundary used by platform commands."
          actions={<><a className="ds-button ds-button--secondary" href="/organizations">Switch organization</a><a className="ds-button ds-button--secondary" href="/approvals">Approvals</a><a className="ds-button ds-button--primary" href="/settings">Settings</a></>}
        />
        {message ? <div className="identity-notice" role="status">{message}</div> : null}
        <div className="ds-metric-grid">
          <MetricCard label="Active members" value={activeMembers} />
          <MetricCard label="Pending invitations" value={pendingInvitations} />
          <MetricCard label="Custom roles" value={customRoles} />
          <MetricCard label="MFA policy" value={session.data.mfaPolicy} detail={session.data.mfaSatisfied ? 'Current session has MFA assurance' : 'Current session has no MFA assurance'} />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading"><div><p className="ds-eyebrow">INVITATIONS</p><h2>Invite a teammate</h2></div><StatusBadge tone="warning">Approval-sensitive</StatusBadge></div>
            <p className="identity-muted">Invitations are bound to the recipient&apos;s verified Keycloak email. High-risk invitations require approved action evidence.</p>
            <form action={inviteMember} className="identity-form identity-form--inline">
              <div className="identity-field"><label htmlFor="invite-email">Email</label><input id="invite-email" name="email" type="email" required autoComplete="email" /></div>
              <div className="identity-field"><label htmlFor="invite-role">Role</label><select id="invite-role" name="roleId" required defaultValue=""><option value="" disabled>Select role</option>{roles.data.items.map((role) => <option key={role.id} value={role.id}>{role.name}{role.system ? ' · system' : ''}</option>)}</select></div>
              <div className="identity-field"><label htmlFor="invite-approval">Approval ID</label><input id="invite-approval" name="approvalId" placeholder="Required when policy asks for approval" /></div>
              <button className="ds-button ds-button--primary" type="submit">Create invitation</button>
            </form>
            {invitations.data.items.length ? <div className="identity-table-wrap"><table className="identity-table"><thead><tr><th>Email</th><th>Roles</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead><tbody>{invitations.data.items.map((invite) => <tr key={invite.id}><td data-label="Email">{invite.email}</td><td data-label="Roles">{invite.roleCodes.join(', ') || '—'}</td><td data-label="Status"><StatusBadge tone={statusTone(invite.status)}>{invite.status}</StatusBadge></td><td data-label="Expires">{formatDate(invite.expiresAt)}</td><td data-label="Action">{invite.status === 'PENDING' ? <form action={revokeInvitation}><input type="hidden" name="invitationId" value={invite.id} /><button className="ds-button ds-button--secondary" type="submit">Revoke</button></form> : '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No invitations yet" description="Create the first invitation when another teammate needs access." />}
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading"><div><p className="ds-eyebrow">MEMBERS</p><h2>Membership lifecycle</h2></div><StatusBadge tone="info">Last-owner protected</StatusBadge></div>
            <div className="identity-member-grid">
              {members.data.items.map((member) => (
                <article className="identity-member-card" key={member.membershipId}>
                  <div className="identity-card-heading"><div><h3>{memberName(member)}</h3><p className="identity-muted">{member.email ?? 'No email'}</p></div><StatusBadge tone={statusTone(member.status)}>{member.status}</StatusBadge></div>
                  <div className="identity-role-list">{member.roleCodes.map((role) => <StatusBadge key={role} tone="neutral">{role}</StatusBadge>)}</div>
                  <form action={setMemberRoles} className="identity-form identity-form--compact">
                    <input type="hidden" name="membershipId" value={member.membershipId} />
                    <div className="identity-field"><label htmlFor={`roles-${member.membershipId}`}>Assigned roles</label><select id={`roles-${member.membershipId}`} name="roleIds" multiple defaultValue={[...member.roleIds]}>{roles.data.items.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
                    <div className="identity-field"><label htmlFor={`role-approval-${member.membershipId}`}>Approval ID</label><input id={`role-approval-${member.membershipId}`} name="approvalId" /></div>
                    <button className="ds-button ds-button--secondary" type="submit">Update roles</button>
                  </form>
                  {member.membershipId !== session.data.membershipId ? <form action={setMemberStatus} className="identity-form identity-form--compact"><input type="hidden" name="membershipId" value={member.membershipId} /><div className="identity-field"><label htmlFor={`status-${member.membershipId}`}>Status</label><select id={`status-${member.membershipId}`} name="status" defaultValue={member.status === 'REMOVED' ? 'ACTIVE' : member.status}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="REMOVED">Removed</option></select></div><div className="identity-field"><label htmlFor={`status-approval-${member.membershipId}`}>Approval ID</label><input id={`status-approval-${member.membershipId}`} name="approvalId" /></div><button className="ds-button ds-button--secondary" type="submit">Update status</button></form> : <p className="identity-muted">Current membership · self-suspension/removal is blocked.</p>}
                </article>
              ))}
            </div>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading"><div><p className="ds-eyebrow">ROLES</p><h2>Role editor</h2></div><StatusBadge tone="warning">Approval-sensitive</StatusBadge></div>
            <p className="identity-muted">System roles are visible but immutable. Custom roles may use only registered platform permissions.</p>
            <div className="identity-role-editor-grid">
              {roles.data.items.map((role) => role.system ? <article className="identity-role-card" key={role.id}><div className="identity-card-heading"><div><h3>{role.name}</h3><p className="identity-muted">{role.code}</p></div><StatusBadge tone="info">System</StatusBadge></div><p>{role.description ?? 'Built-in platform role.'}</p><details><summary>{role.permissionCodes.length} permissions</summary><code className="identity-code-list">{role.permissionCodes.join('\n')}</code></details></article> : <RoleEditor role={role} key={role.id} />)}
              <RoleEditor />
            </div>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function RoleEditor({ role }: { role?: RoleList['items'][number] }) {
  return <article className="identity-role-card"><form action={saveRole} className="identity-form identity-form--compact">{role ? <input type="hidden" name="roleId" value={role.id} /> : null}<div className="identity-card-heading"><h3>{role ? `Edit ${role.name}` : 'New custom role'}</h3>{role ? <StatusBadge>Custom</StatusBadge> : null}</div><div className="identity-field"><label>Code<input name="code" required defaultValue={role?.code ?? ''} pattern="[a-z][a-z0-9_-]{1,62}" /></label></div><div className="identity-field"><label>Name<input name="name" required defaultValue={role?.name ?? ''} /></label></div><div className="identity-field"><label>Description<textarea name="description" defaultValue={role?.description ?? ''} rows={2} /></label></div><div className="identity-field"><label>Permission codes<textarea name="permissionCodes" defaultValue={role?.permissionCodes.join('\n') ?? ''} rows={7} placeholder="customers.read&#10;tickets.read" /></label></div><div className="identity-field"><label>Approval ID<input name="approvalId" /></label></div><button className="ds-button ds-button--primary" type="submit">{role ? 'Save role' : 'Create role'}</button></form>{role ? <form action={deleteRole} className="identity-delete-form"><input type="hidden" name="roleId" value={role.id} /><label>Approval ID<input name="approvalId" /></label><button className="ds-button ds-button--danger" type="submit">Delete custom role</button></form> : null}</article>;
}

function firstFailure(...results: Array<{ kind: string; detail?: string }>): string | undefined {
  const result = results.find((item) => item.kind !== 'success');
  if (!result) return undefined;
  if (result.kind === 'authentication_required') return 'Sign in and select an active organization.';
  if (result.kind === 'configuration_error') return 'The server identity API is not configured.';
  return result.detail ?? 'The identity API could not load this workspace.';
}

function memberName(member: MemberList['items'][number]): string {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'Unnamed member';
}

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (['ACTIVE', 'ACCEPTED'].includes(status)) return 'success';
  if (['PENDING', 'INVITED'].includes(status)) return 'warning';
  if (['SUSPENDED', 'EXPIRED'].includes(status)) return 'warning';
  if (['REMOVED', 'REVOKED'].includes(status)) return 'danger';
  return 'neutral';
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? '—' : parsed.toLocaleDateString();
}
