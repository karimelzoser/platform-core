'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../identity-api';

interface CreatedOrganization {
  organizationId: string;
  membershipId: string;
  userId: string;
}

export async function createOrganization(formData: FormData): Promise<void> {
  const name = required(formData, 'name');
  const slug = required(formData, 'slug');
  const locale = required(formData, 'locale') ?? 'en';
  const timezone = required(formData, 'timezone') ?? 'UTC';
  if (!name || !slug) {
    redirect('/onboarding?message=Organization%20name%20and%20slug%20are%20required.');
  }

  const result = await identityRequest<CreatedOrganization>('/v1/identity/organizations', {
    tenant: false,
    method: 'POST',
    body: { name, slug, locale, timezone },
  });
  if (result.kind !== 'success') {
    redirect(`/onboarding?message=${encodeURIComponent(resultMessage(result))}`);
  }

  const store = await cookies();
  store.set('platform_tenant_id', result.data.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
    path: '/',
  });
  redirect('/settings?message=Organization%20workspace%20created.');
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
