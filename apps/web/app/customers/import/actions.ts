'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

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
  const parsed = parseCsv(await file.text());
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

function parseCsv(text: string): { customers: unknown[] } | ImportState {
  const rows = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((cell) => cell.trim()));
  const [header, ...data] = rows;
  if (
    !header ||
    header.join(',').toLowerCase() !== 'display_name,first_name,last_name,company_name,email,phone'
  )
    return {
      error: 'CSV header must be: display_name,first_name,last_name,company_name,email,phone',
    };
  if (!data.length || data.length > 100) return { error: 'CSV must contain one to 100 data rows.' };
  const customers = data.map((row) => ({
    displayName: row[0] || undefined,
    firstName: row[1] || undefined,
    lastName: row[2] || undefined,
    companyName: row[3] || undefined,
    contactPoints: [
      row[4]
        ? { channel: 'EMAIL', value: row[4], label: 'Imported email', isPrimary: true }
        : undefined,
      row[5]
        ? { channel: 'PHONE', value: row[5], label: 'Imported phone', isPrimary: !row[4] }
        : undefined,
    ].filter(Boolean),
  }));
  if (
    customers.some(
      (customer) =>
        !customer.displayName && !customer.firstName && !customer.lastName && !customer.companyName,
    )
  )
    return { error: 'Every row requires a display name, personal name, or company name.' };
  return { customers };
}
