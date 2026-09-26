'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

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
