import type { Metadata } from 'next';
import {
  EmptyState,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';
import { identityRequest } from '../identity-api';
import { updateMfaPolicy, updateOrganization, updateProfile } from './actions';

export const metadata: Metadata = { title: 'Settings | Platform' };

interface ProfileView {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  locale: string;
  timezone: string;
  updatedAt: string;
}

interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  locale: string;
  mfaPolicy: 'OPTIONAL' | 'REQUIRED_FOR_PRIVILEGED' | 'REQUIRED_FOR_ALL';
  profileOwnerMembershipId: string | null;
  updatedAt: string;
}

interface SessionView {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  roleCodes: readonly string[];
  mfaPolicy: string;
  mfaSatisfied: boolean;
}

interface MemberList {
  items: readonly {
    membershipId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
  }[];
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const [profile, organization, session, members] = await Promise.all([
    identityRequest<ProfileView>('/v1/identity/profile'),
    identityRequest<OrganizationView>('/v1/identity/organization'),
    identityRequest<SessionView>('/v1/session'),
    identityRequest<MemberList>('/v1/identity/members'),
  ]);

  const failure = firstFailure(profile, organization, session, members);
  if (failure) {
    return (
      <PageShell>
        <EmptyState
          title="Settings are unavailable"
          description={failure}
          action={
            <a className="ds-button ds-button--secondary" href="/organizations">
              Organizations
            </a>
          }
        />
      </PageShell>
    );
  }
  if (
    profile.kind !== 'success' ||
    organization.kind !== 'success' ||
    session.kind !== 'success' ||
    members.kind !== 'success'
  ) {
    return null;
  }

  return (
    <PageShell aria-labelledby="settings-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="IDENTITY & ORGANIZATION"
          title={<span id="settings-title">Settings</span>}
          description="Keep personal preferences, organization defaults, ownership, and authentication assurance explicit and auditable."
          actions={
            <>
              <a className="ds-button ds-button--secondary" href="/team">
                Team & roles
              </a>
              <a className="ds-button ds-button--secondary" href="/organizations">
                Switch organization
              </a>
            </>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="identity-settings-grid">
          <SurfaceCard>
            <Stack>
              <div className="identity-section-heading">
                <div>
                  <p className="ds-eyebrow">PROFILE</p>
                  <h2>Your preferences</h2>
                </div>
                <StatusBadge tone="success">Self service</StatusBadge>
              </div>
              <p className="identity-muted">
                Email identity is owned by Keycloak. The platform stores only operational profile
                preferences.
              </p>
              <form action={updateProfile} className="identity-form">
                <div className="identity-form-grid">
                  <div className="identity-field">
                    <label htmlFor="profile-first-name">First name</label>
                    <input
                      id="profile-first-name"
                      name="firstName"
                      defaultValue={profile.data.firstName ?? ''}
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="identity-field">
                    <label htmlFor="profile-last-name">Last name</label>
                    <input
                      id="profile-last-name"
                      name="lastName"
                      defaultValue={profile.data.lastName ?? ''}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="identity-readonly-field">
                  <span>Email</span>
                  <strong>{profile.data.email ?? 'Managed by identity provider'}</strong>
                </div>
                <LocaleTimezoneFields
                  prefix="profile"
                  locale={profile.data.locale}
                  timezone={profile.data.timezone}
                />
                <button className="ds-button ds-button--primary" type="submit">
                  Save profile
                </button>
              </form>
            </Stack>
          </SurfaceCard>

          <SurfaceCard>
            <Stack>
              <div className="identity-section-heading">
                <div>
                  <p className="ds-eyebrow">ORGANIZATION</p>
                  <h2>Workspace defaults</h2>
                </div>
                <StatusBadge tone="info">{organization.data.status}</StatusBadge>
              </div>
              <form action={updateOrganization} className="identity-form">
                <div className="identity-field">
                  <label htmlFor="organization-settings-name">Organization name</label>
                  <input
                    id="organization-settings-name"
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={organization.data.name}
                  />
                </div>
                <div className="identity-readonly-field">
                  <span>Workspace slug</span>
                  <strong>{organization.data.slug}</strong>
                </div>
                <LocaleTimezoneFields
                  prefix="organization"
                  locale={organization.data.locale}
                  timezone={organization.data.timezone}
                />
                <div className="identity-field">
                  <label htmlFor="profile-owner-membership">Primary organization owner</label>
                  <select
                    id="profile-owner-membership"
                    name="profileOwnerMembershipId"
                    defaultValue={organization.data.profileOwnerMembershipId ?? ''}
                  >
                    <option value="">No primary owner selected</option>
                    {members.data.items
                      .filter((member) => member.status === 'ACTIVE')
                      .map((member) => (
                        <option key={member.membershipId} value={member.membershipId}>
                          {memberName(member)}
                        </option>
                      ))}
                  </select>
                </div>
                <button className="ds-button ds-button--primary" type="submit">
                  Save organization
                </button>
              </form>
            </Stack>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">AUTHENTICATION POLICY</p>
                <h2>Multi-factor authentication</h2>
              </div>
              <StatusBadge tone={session.data.mfaSatisfied ? 'success' : 'warning'}>
                {session.data.mfaSatisfied ? 'MFA assured session' : 'No MFA assurance'}
              </StatusBadge>
            </div>
            <p className="identity-muted">
              Keycloak owns passwords, OTP, WebAuthn, and recovery credentials. This setting only
              defines what assurance the tenant requires before platform access is granted.
            </p>
            {!session.data.mfaSatisfied ? (
              <div className="identity-callout identity-callout--warning" role="note">
                Changing MFA policy requires a session that already contains MFA assurance plus a
                valid approval for this CRITICAL action. Complete MFA in Keycloak, then return here.
              </div>
            ) : null}
            <form action={updateMfaPolicy} className="identity-form identity-form--mfa">
              <fieldset className="identity-radio-group">
                <legend>Tenant MFA requirement</legend>
                <MfaOption
                  value="OPTIONAL"
                  current={organization.data.mfaPolicy}
                  title="Optional"
                  detail="Keycloak may offer MFA, but this tenant does not require it for platform access."
                />
                <MfaOption
                  value="REQUIRED_FOR_PRIVILEGED"
                  current={organization.data.mfaPolicy}
                  title="Required for Owner and Admin"
                  detail="Privileged tenant operators must present MFA assurance; ordinary roles remain policy-controlled."
                />
                <MfaOption
                  value="REQUIRED_FOR_ALL"
                  current={organization.data.mfaPolicy}
                  title="Required for all members"
                  detail="Every active membership requires MFA assurance before tenant access is resolved."
                />
              </fieldset>
              <div className="identity-field">
                <label htmlFor="mfa-approval-id">Approval ID</label>
                <input
                  id="mfa-approval-id"
                  name="approvalId"
                  placeholder="Required approved action evidence"
                />
              </div>
              <div className="identity-actions-row">
                <a className="ds-button ds-button--secondary" href="/approvals">
                  Open approvals
                </a>
                <button
                  className="ds-button ds-button--primary"
                  type="submit"
                  disabled={!session.data.mfaSatisfied}
                >
                  Update MFA policy
                </button>
              </div>
            </form>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function LocaleTimezoneFields({
  prefix,
  locale,
  timezone,
}: {
  prefix: string;
  locale: string;
  timezone: string;
}) {
  return (
    <div className="identity-form-grid">
      <div className="identity-field">
        <label htmlFor={`${prefix}-locale`}>Language</label>
        <select id={`${prefix}-locale`} name="locale" defaultValue={locale}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>
      <div className="identity-field">
        <label htmlFor={`${prefix}-timezone`}>Timezone</label>
        <input
          id={`${prefix}-timezone`}
          name="timezone"
          defaultValue={timezone}
          list="platform-timezones"
          required
        />
        <datalist id="platform-timezones">
          <option value="Africa/Cairo" />
          <option value="Asia/Riyadh" />
          <option value="Asia/Dubai" />
          <option value="Asia/Kuwait" />
          <option value="Asia/Qatar" />
          <option value="UTC" />
        </datalist>
      </div>
    </div>
  );
}

function MfaOption({
  value,
  current,
  title,
  detail,
}: {
  value: OrganizationView['mfaPolicy'];
  current: OrganizationView['mfaPolicy'];
  title: string;
  detail: string;
}) {
  return (
    <label className="identity-radio-card">
      <input type="radio" name="mfaPolicy" value={value} defaultChecked={current === value} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
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
