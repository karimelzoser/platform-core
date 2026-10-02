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

export async function requestWebhookSubscription(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const connectionId = idFrom(formData);
  const callbackUrl = textFrom(formData, 'callbackUrl');
  if (!connectionId || !callbackUrl)
    return { error: 'A connection and HTTPS callback URL are required.' };
  try {
    if (new URL(callbackUrl).protocol !== 'https:')
      return { error: 'Webhook callbacks must use HTTPS.' };
  } catch {
    return { error: 'Webhook callback URL is invalid.' };
  }
  return sendConnectionCommand(
    connectionId,
    '/webhook-subscriptions',
    { callbackUrl },
    'Webhook subscription requested.',
  );
}

export async function requestWebhookUnsubscription(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const connectionId = idFrom(formData);
  const subscriptionId = textFrom(formData, 'subscriptionId');
  if (!connectionId || !subscriptionId || subscriptionId.length !== 36)
    return { error: 'The webhook subscription could not be identified.' };
  return sendConnectionCommand(
    connectionId,
    `/webhook-subscriptions/${encodeURIComponent(subscriptionId)}/unregister`,
    undefined,
    'Webhook unregistration requested.',
  );
}

export async function requestDevelopmentProviderAction(
  _previousState: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const connectionId = idFrom(formData);
  const connectorKey = textFrom(formData, 'connectorKey');
  const actionType =
    connectorKey === 'development-api'
      ? 'development.api.echo'
      : connectorKey === 'development-web-chat'
        ? 'development.web_chat.echo'
        : undefined;
  if (!connectionId || !actionType)
    return { error: 'Development provider actions are unavailable for this connection.' };
  return sendApprovalRequest(
    { connectionId, actionType, input: { source: 'developer-preview' } },
    'Development action approval requested.',
  );
}

async function sendApprovalRequest(
  body: Record<string, unknown>,
  completed: string,
): Promise<IntegrationActionState> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl)
    return { error: 'Sign in and select an organization before requesting an approval.' };
  try {
    const response = await fetch(new URL('/v1/approvals/provider-action-request', baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session does not have permission to request this approval.' };
    if (!response.ok) return { error: 'The provider action approval could not be recorded.' };
  } catch {
    return { error: 'The approval service is currently unavailable.' };
  }
  refreshPath('/approvals');
  refreshPath('/integrations');
  return { completed };
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

function textFrom(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
