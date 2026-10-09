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
    redirect(
      '/organizations/new?message=Organization%20name%20and%20slug%20are%20required.',
    );
  }

  const result = await identityRequest<CreatedOrganization>('/v1/identity/organizations', {
    tenant: false,
    method: 'POST',
    body: { name, slug, locale, timezone },
  });
  if (result.kind !== 'success') {
    redirect(`/organizations/new?message=${encodeURIComponent(resultMessage(result))}`);
  }

  const store = await cookies();
  store.set('platform_tenant_id', result.data.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ENV === 'production',
    path: '/',
  });
  redirect(
    '/onboarding?message=Organization%20workspace%20created.%20Complete%20the%20business%20profile%20next.',
  );
}

export async function saveBusinessProfile(formData: FormData): Promise<void> {
  const countryCode = upper(required(formData, 'countryCode'));
  const currencyCode = upper(required(formData, 'currencyCode'));
  const timezone = required(formData, 'timezone');
  const locale = required(formData, 'locale');
  const industryCode = upper(required(formData, 'industryCode'));
  const customerModel = required(formData, 'customerModel');
  const commerceModel = required(formData, 'commerceModel');
  const monthlyOrderVolumeBand = required(formData, 'monthlyOrderVolumeBand');
  const monthlyConversationVolumeBand = required(formData, 'monthlyConversationVolumeBand');
  const goals = formData
    .getAll('goals')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    !countryCode ||
    !currencyCode ||
    !timezone ||
    !locale ||
    !industryCode ||
    !customerModel ||
    !commerceModel ||
    !monthlyOrderVolumeBand ||
    !monthlyConversationVolumeBand ||
    goals.length === 0
  ) {
    redirect(
      '/onboarding?message=Complete%20all%20business%20profile%20fields%20and%20choose%20at%20least%20one%20goal.',
    );
  }

  const result = await identityRequest('/v1/onboarding/profile', {
    method: 'POST',
    idempotent: true,
    body: {
      countryCode,
      currencyCode,
      timezone,
      locale,
      industryCode,
      customerModel,
      commerceModel,
      monthlyOrderVolumeBand,
      monthlyConversationVolumeBand,
      goals,
    },
  });

  if (result.kind !== 'success') {
    redirect(`/onboarding?message=${encodeURIComponent(resultMessage(result))}`);
  }
  redirect('/onboarding?message=Business%20profile%20saved.');
}

export async function setOnboardingStep(formData: FormData): Promise<void> {
  const step = required(formData, 'step')?.toUpperCase();
  const status = required(formData, 'status')?.toUpperCase();
  if (
    (step !== 'TEAM' && step !== 'INTEGRATION') ||
    (status !== 'PENDING' && status !== 'SKIPPED')
  ) {
    redirect('/onboarding?message=Invalid%20onboarding%20step%20update.');
  }

  const result = await identityRequest(`/v1/onboarding/steps/${step.toLowerCase()}`, {
    method: 'POST',
    idempotent: true,
    body: { status },
  });
  if (result.kind !== 'success') {
    redirect(`/onboarding?message=${encodeURIComponent(resultMessage(result))}`);
  }

  const message =
    status === 'SKIPPED' ? `${step} step skipped for now.` : `${step} step reopened.`;
  redirect(`/onboarding?message=${encodeURIComponent(message)}`);
}

function required(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function upper(value: string | undefined): string | undefined {
  return value?.toUpperCase();
}
