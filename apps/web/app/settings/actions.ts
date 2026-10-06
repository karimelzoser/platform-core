'use server';

import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../identity-api';

export async function updateProfile(formData: FormData): Promise<void> {
  const locale = required(formData, 'locale');
  const timezone = required(formData, 'timezone');
  if (!locale || !timezone) redirectWith('Locale and timezone are required.');

  const result = await identityRequest('/v1/identity/profile', {
    method: 'POST',
    idempotent: true,
    body: {
      firstName: optional(formData, 'firstName'),
      lastName: optional(formData, 'lastName'),
      locale,
      timezone,
    },
  });
  redirectWith(result.kind === 'success' ? 'Profile updated.' : resultMessage(result));
}

export async function updateOrganization(formData: FormData): Promise<void> {
  const name = required(formData, 'name');
  const locale = required(formData, 'locale');
  const timezone = required(formData, 'timezone');
  if (!name || !locale || !timezone) redirectWith('Organization name, locale, and timezone are required.');

  const result = await identityRequest('/v1/identity/organization', {
    method: 'POST',
    idempotent: true,
    body: {
      name,
      locale,
      timezone,
      ...(optional(formData, 'profileOwnerMembershipId')
        ? { profileOwnerMembershipId: optional(formData, 'profileOwnerMembershipId') }
        : {}),
    },
  });
  redirectWith(result.kind === 'success' ? 'Organization settings updated.' : resultMessage(result));
}

export async function updateMfaPolicy(formData: FormData): Promise<void> {
  const mfaPolicy = required(formData, 'mfaPolicy');
  if (!mfaPolicy) redirectWith('Choose an MFA policy.');

  const result = await identityRequest('/v1/identity/organization/mfa-policy', {
    method: 'POST',
    idempotent: true,
    approvalId: optional(formData, 'approvalId'),
    body: { mfaPolicy },
  });
  redirectWith(result.kind === 'success' ? 'MFA policy updated.' : resultMessage(result));
}

function redirectWith(message: string): never {
  redirect(`/settings?message=${encodeURIComponent(message)}`);
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optional(formData: FormData, key: string): string | undefined {
  return required(formData, key);
}
