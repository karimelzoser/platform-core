'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const refreshPath = revalidatePath as (path: string) => void;

export interface IntegrationActionState {
  error?: string;
  completed?: string;
}

export async function requestConnectionHealth(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const connectionId = idFrom(formData);
  if (!connectionId) return { error: 'The integration connection could not be identified.' };
  return sendConnectionCommand(connectionId, '/health-check', undefined, 'Health check requested.');
}

export async function requestInitialSync(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const connectionId = idFrom(formData);
  if (!connectionId) return { error: 'The integration connection could not be identified.' };
  return sendConnectionCommand(
    connectionId,
    '/sync-runs',
    { kind: 'INITIAL', cursor: {} },
    'Initial sync requested.',
  );
}

async function sendConnectionCommand(
  connectionId: string,
  suffix: string,
  body: Record<string, unknown> | undefined,
  completed: string,
): Promise<IntegrationActionState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before managing integrations.' };
  try {
    const response = await fetch(
      new URL(`/v1/integrations/connections/${encodeURIComponent(connectionId)}${suffix}`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          'x-tenant-id': tenantId,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session does not have permission for this integration command.' };
    if (response.status === 409)
      return { error: 'This command requires an approval or conflicts with an existing request.' };
    if (!response.ok) return { error: 'The integration command could not be recorded.' };
  } catch {
    return { error: 'The integration API is unavailable.' };
  }
  refreshPath('/integrations');
  return { completed };
}

function idFrom(formData: FormData): string | undefined {
  const value = formData.get('connectionId');
  return typeof value === 'string' && value.length === 36 ? value : undefined;
}
