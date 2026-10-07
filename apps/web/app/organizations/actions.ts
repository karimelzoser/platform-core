'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { identityRequest } from '../identity-api';

interface OrganizationList {
  items: readonly { id: string }[];
}

export async function selectOrganization(formData: FormData): Promise<void> {
  const organizationId = required(formData, 'organizationId');
  if (!organizationId) redirect('/organizations?message=Choose%20an%20organization.');

  const result = await identityRequest<OrganizationList>('/v1/identity/organizations', {
    tenant: false,
  });
  if (result.kind !== 'success') {
    redirect(
      `/organizations?message=${encodeURIComponent('Unable to verify organization access.')}`,
    );
  }
  if (!result.data.items.some((item) => item.id === organizationId)) {
    redirect(`/organizations?message=${encodeURIComponent('Organization access is not active.')}`);
  }

  const store = await cookies();
  store.set('platform_tenant_id', organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
    path: '/',
  });
  redirect('/team');
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
