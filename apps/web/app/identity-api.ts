import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export type IdentityApiResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'authentication_required' }
  | { kind: 'configuration_error' }
  | { kind: 'error'; detail: string };

interface IdentityRequestOptions {
  tenant?: boolean;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  idempotent?: boolean;
  approvalId?: string;
}

export async function identityRequest<T>(
  path: string,
  options: IdentityRequestOptions = {},
): Promise<IdentityApiResult<T>> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const requiresTenant = options.tenant !== false;
  if (!token || (requiresTenant && !tenantId)) return { kind: 'authentication_required' };

  const baseUrl = process.env.API_INTERNAL_URL;
  if (!baseUrl) return { kind: 'configuration_error' };

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-correlation-id': randomUUID(),
  };
  if (requiresTenant && tenantId) headers['x-tenant-id'] = tenantId;
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
    if (response.status === 403) {
      return { kind: 'error', detail: 'Your current role or authentication assurance does not allow this operation.' };
    }
    if (!response.ok) {
      return { kind: 'error', detail: (await safeError(response)) ?? `The API returned ${String(response.status)}.` };
    }
    return { kind: 'success', data: (await response.json()) as T };
  } catch {
    return { kind: 'error', detail: 'The identity API is currently unavailable.' };
  }
}

export function resultMessage(result: IdentityApiResult<unknown>): string {
  if (result.kind === 'authentication_required') return 'Sign in and select an organization first.';
  if (result.kind === 'configuration_error') return 'The server identity API is not configured.';
  if (result.kind === 'error') return result.detail;
  return 'Completed.';
}

async function safeError(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length <= 400 ? body.message : undefined;
  } catch {
    return undefined;
  }
}
