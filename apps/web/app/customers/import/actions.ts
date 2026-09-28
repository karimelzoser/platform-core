'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { parseCustomerImportCsv } from './csv';

export interface ImportState {
  error?: string;
  count?: number;
}

export async function importCustomers(
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 500_000)
    return { error: 'Choose a CSV file no larger than 500 KB.' };
  const parsed = parseCustomerImportCsv(await file.text());
  if (!('customers' in parsed)) return parsed;
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization first.' };
  try {
    const response = await fetch(new URL('/v1/customers/import', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ customers: parsed.customers }),
    });
    if (!response.ok)
      return { error: 'Import failed. No rows were saved; review names and contact identities.' };
    return { count: parsed.customers.length };
  } catch {
    return { error: 'The customer API is currently unavailable.' };
  }
}
