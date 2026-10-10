import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export type PlatformApiResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'authentication_required' }
  | { kind: 'configuration_error' }
  | { kind: 'error'; detail: string };

export async function platformRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    idempotent?: boolean;
    approvalId?: string;
  } = {},
): Promise<PlatformApiResult<T>> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  if (!token || !tenantId) return { kind: 'authentication_required' };
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!baseUrl) return { kind: 'configuration_error' };

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-tenant-id': tenantId,
    'x-correlation-id': randomUUID(),
  };
  if (options.body) headers['content-type'] = 'application/json';
  if (options.idempotent) headers['idempotency-key'] = randomUUID();
  if (options.approvalId?.trim()) headers['x-approval-id'] = options.approvalId.trim();

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: options.method ?? 'GET',
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
    });
    if (response.status === 401) return { kind: 'authentication_required' };
    if (!response.ok) {
      return {
        kind: 'error',
        detail: (await safeError(response)) ?? `The API returned ${String(response.status)}.`,
      };
    }
    return { kind: 'success', data: (await response.json()) as T };
  } catch {
    return { kind: 'error', detail: 'The platform API is currently unavailable.' };
  }
}

export function apiMessage(result: PlatformApiResult<unknown>): string {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization first.';
  if (result.kind === 'configuration_error') return 'The server API is not configured.';
  if (result.kind === 'error') return result.detail;
  return 'Completed.';
}

async function safeError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length <= 500
      ? body.message
      : undefined;
  } catch {
    return undefined;
  }
}
