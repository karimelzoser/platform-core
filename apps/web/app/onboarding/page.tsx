import type { Metadata } from 'next';
import { PageHeader, PageShell, Stack, SurfaceCard } from '../ui-primitives';
import { createOrganization } from './actions';

export const metadata: Metadata = { title: 'Organization setup | Platform' };

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  return (
    <PageShell aria-labelledby="onboarding-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="ORGANIZATION SETUP"
          title={<span id="onboarding-title">Create your workspace</span>}
          description="Establish the organization identity, language, timezone, and owner boundary. Business profiling continues in the next setup stage."
          actions={
            <a className="ds-button ds-button--secondary" href="/organizations">
              Back to organizations
            </a>
          }
        />
        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}
        <SurfaceCard>
          <form action={createOrganization} className="identity-form">
            <div className="identity-field">
              <label htmlFor="organization-name">Organization name</label>
              <input
                id="organization-name"
                name="name"
                required
                maxLength={200}
                autoComplete="organization"
              />
            </div>
            <div className="identity-field">
              <label htmlFor="organization-slug">Workspace slug</label>
              <input
                id="organization-slug"
                name="slug"
                required
                pattern="[a-z0-9][a-z0-9-]{1,62}"
                placeholder="acme-egypt"
              />
              <small>Lowercase letters, numbers, and hyphens.</small>
            </div>
            <div className="identity-form-grid">
              <div className="identity-field">
                <label htmlFor="organization-locale">Default language</label>
                <select id="organization-locale" name="locale" defaultValue="en">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
              <div className="identity-field">
                <label htmlFor="organization-timezone">Timezone</label>
                <select id="organization-timezone" name="timezone" defaultValue="Africa/Cairo">
                  <option value="Africa/Cairo">Africa/Cairo</option>
                  <option value="Asia/Riyadh">Asia/Riyadh</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div className="identity-callout">
              The authenticated Keycloak identity becomes the first active Owner. MFA credentials
              remain in Keycloak; this application stores only organization policy and assurance
              evidence.
            </div>
            <button className="ds-button ds-button--primary" type="submit">
              Create organization
            </button>
          </form>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}
