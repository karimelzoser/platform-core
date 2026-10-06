import type { Metadata } from 'next';
import { EmptyState, PageHeader, PageShell, Stack, StatusBadge, SurfaceCard } from '../ui-primitives';
import { identityRequest } from '../identity-api';
import { selectOrganization } from './actions';

export const metadata: Metadata = { title: 'Organizations | Platform' };

interface OrganizationList {
  items: readonly {
    id: string;
    name: string;
    slug: string;
    membershipId: string;
    roleCodes: readonly string[];
  }[];
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function OrganizationsPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const result = await identityRequest<OrganizationList>('/v1/identity/organizations', {
    tenant: false,
  });

  return (
    <PageShell aria-labelledby="organizations-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="IDENTITY"
          title={<span id="organizations-title">Organizations</span>}
          description="Choose the tenant workspace you are authorized to operate, or create a new organization."
          actions={
            <a className="ds-button ds-button--primary" href="/onboarding">
              New organization
            </a>
          }
        />
        {message ? <div className="identity-notice" role="status">{message}</div> : null}
        <OrganizationContent result={result} />
      </Stack>
    </PageShell>
  );
}

function OrganizationContent({ result }: { result: Awaited<ReturnType<typeof loadOrganizations>> }) {
  if (result.kind === 'authentication_required') {
    return <EmptyState title="Sign in to continue" description="Authentication is required before organization discovery." />;
  }
  if (result.kind === 'configuration_error') {
    return <EmptyState title="Identity API is not configured" description="Set API_INTERNAL_URL on the web runtime." />;
  }
  if (result.kind === 'error') {
    return <EmptyState title="Organizations could not be loaded" description={result.detail} />;
  }
  if (result.data.items.length === 0) {
    return (
      <EmptyState
        title="No active organization memberships"
        description="Create an organization or accept an invitation linked to your verified identity."
        action={<a className="ds-button ds-button--primary" href="/onboarding">Create organization</a>}
      />
    );
  }

  return (
    <div className="identity-grid" aria-label="Available organizations">
      {result.data.items.map((organization) => (
        <SurfaceCard key={organization.id} className="identity-organization-card">
          <Stack gap="compact">
            <div className="identity-card-heading">
              <div>
                <h2>{organization.name}</h2>
                <p className="identity-muted">{organization.slug}</p>
              </div>
              <StatusBadge tone="success">Active</StatusBadge>
            </div>
            <div className="identity-role-list" aria-label="Assigned roles">
              {organization.roleCodes.map((role) => (
                <StatusBadge key={role} tone="info">{role}</StatusBadge>
              ))}
            </div>
            <form action={selectOrganization}>
              <input name="organizationId" type="hidden" value={organization.id} />
              <button className="ds-button ds-button--primary" type="submit">Open workspace</button>
            </form>
          </Stack>
        </SurfaceCard>
      ))}
    </div>
  );
}

async function loadOrganizations() {
  return identityRequest<OrganizationList>('/v1/identity/organizations', { tenant: false });
}
