'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export interface SendConversationMessageState {
  error?: string;
  queued?: boolean;
}

export async function handoverConversation(formData: FormData): Promise<void> {
  const conversationId = formData.get('conversationId');
  const mode = formData.get('mode');
  if (
    typeof conversationId !== 'string' ||
    typeof mode !== 'string' ||
    !['AI', 'COPILOT', 'HUMAN', 'PAUSED'].includes(mode)
  )
    return;
  await postConversationCommand(conversationId, 'handover', { mode });
}

export async function assignConversation(formData: FormData): Promise<void> {
  const conversationId = formData.get('conversationId');
  const assigneeId = formData.get('assigneeId');
  if (typeof conversationId !== 'string' || typeof assigneeId !== 'string' || !assigneeId) return;
  await postConversationCommand(conversationId, 'assignment', { assigneeId });
}

export async function updateConversationStatus(formData: FormData): Promise<void> {
  const conversationId = formData.get('conversationId');
  const status = formData.get('status');
  if (
    typeof conversationId !== 'string' ||
    typeof status !== 'string' ||
    !['OPEN', 'CLOSED'].includes(status)
  )
    return;
  await postConversationCommand(conversationId, 'status', { status });
}

export async function sendConversationMessage(
  _previousState: SendConversationMessageState,
  formData: FormData,
): Promise<SendConversationMessageState> {
  const conversationId = formData.get('conversationId');
  const body = formData.get('body');
  const submissionId = formData.get('submissionId');
  if (typeof conversationId !== 'string' || !conversationId) {
    return { error: 'The conversation could not be identified.' };
  }
  if (typeof body !== 'string' || !body.trim()) return { error: 'Write a message before sending.' };
  if (body.length > 20_000) return { error: 'Messages are limited to 20,000 characters.' };

  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId)
    return { error: 'Sign in and select an organization before sending a message.' };
  if (!baseUrl) return { error: 'Messaging workspace configuration is incomplete.' };

  try {
    const response = await fetch(
      new URL(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, baseUrl),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key':
            typeof submissionId === 'string' && submissionId ? submissionId : randomUUID(),
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ body: body.trim() }),
      },
    );
    if (response.status === 401 || response.status === 403)
      return { error: 'Your session no longer has permission to send messages.' };
    if (response.status === 409)
      return {
        error: 'This send request conflicts with an existing request. Refresh and try again.',
      };
    if (!response.ok) return { error: 'The message could not be queued. Nothing was sent.' };
  } catch {
    return { error: 'The messaging API is unavailable. Nothing was sent.' };
  }
  return { queued: true };
}

async function postConversationCommand(
  conversationId: string,
  command: 'handover' | 'assignment' | 'status',
  body: Record<string, string>,
): Promise<void> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return;
  const response = await fetch(
    new URL(`/v1/conversations/${encodeURIComponent(conversationId)}/${command}`, baseUrl),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`Conversation ${command} could not be recorded`);
}
