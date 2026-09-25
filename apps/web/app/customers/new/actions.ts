'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export interface CustomerCreationState {
  error?: string;
}

interface CreatedCustomerResponse {
  result: { customerId: string };
}

interface NewContactPoint {
  channel: 'EMAIL' | 'PHONE';
  value: string;
  label: string;
  isPrimary: true;
}

export async function createCustomer(
  _previousState: CustomerCreationState,
  formData: FormData,
): Promise<CustomerCreationState> {
  const token = (await cookies()).get('platform_access_token')?.value;
  const tenantId = (await cookies()).get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before creating a customer.' };
  if (!baseUrl) return { error: 'Customer workspace configuration is incomplete.' };

  const contactPoints: NewContactPoint[] = [
    contactPoint('EMAIL', formData.get('email'), 'Email'),
    contactPoint('PHONE', formData.get('phone'), 'Phone'),
  ].filter((contact): contact is NewContactPoint => contact !== undefined);
  const body = {
    displayName: optionalValue(formData.get('displayName')),
    firstName: optionalValue(formData.get('firstName')),
    lastName: optionalValue(formData.get('lastName')),
    companyName: optionalValue(formData.get('companyName')),
    preferredLanguage: optionalLanguage(formData.get('preferredLanguage')),
    timezone: optionalValue(formData.get('timezone')),
    contactPoints,
  };
  if (!body.displayName && !body.firstName && !body.lastName && !body.companyName) {
    return { error: 'Add a name or company before saving this customer.' };
  }

  const suppliedKey = optionalValue(formData.get('submissionId'));
  let customerId: string;
  try {
    const response = await fetch(new URL('/v1/customers', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': suppliedKey ?? randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403) {
      return { error: 'Your session no longer has permission to create customers.' };
    }
    if (response.status === 409) {
      return { error: 'This customer conflicts with an existing canonical identity or request.' };
    }
    if (!response.ok)
      return { error: 'The customer could not be saved. Review the fields and try again.' };
    const result = (await response.json()) as CreatedCustomerResponse;
    if (!isCreatedCustomerResponse(result))
      return { error: 'The customer API returned an invalid response.' };
    customerId = result.result.customerId;
  } catch {
    return { error: 'The customer API is currently unavailable. Nothing was saved.' };
  }
  redirect(`/customers/${customerId}`);
}

function contactPoint(
  channel: 'EMAIL' | 'PHONE',
  value: unknown,
  label: string,
): NewContactPoint | undefined {
  const normalized = optionalValue(value);
  return normalized ? { channel, value: normalized, label, isPrimary: true } : undefined;
}

function optionalValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function optionalLanguage(value: unknown): 'en' | 'ar' | undefined {
  return value === 'en' || value === 'ar' ? value : undefined;
}

function isCreatedCustomerResponse(value: unknown): value is CreatedCustomerResponse {
  if (value === null || typeof value !== 'object') return false;
  const result = (value as { result?: unknown }).result;
  return (
    result !== null &&
    typeof result === 'object' &&
    typeof (result as { customerId?: unknown }).customerId === 'string'
  );
}
