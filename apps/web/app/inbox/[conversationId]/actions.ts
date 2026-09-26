'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export async function handoverConversation(formData: FormData): Promise<void> {
  const conversationId = formData.get('conversationId');
  const mode = formData.get('mode');
  if (
    typeof conversationId !== 'string' ||
    !['AI', 'COPILOT', 'HUMAN', 'PAUSED'].includes(String(mode))
  )
    return;
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return;
  const response = await fetch(
    new URL(`/v1/conversations/${encodeURIComponent(conversationId)}/handover`, baseUrl),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({ mode }),
    },
  );
  if (!response.ok) throw new Error('Conversation handover could not be recorded');
}
