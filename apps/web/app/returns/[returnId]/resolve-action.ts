'use server';

import { redirect } from 'next/navigation';
import { identityRequest, resultMessage } from '../../identity-api';

export async function resolveReturn(formData: FormData): Promise<void> {
  const value = formData.get('returnId');
  const returnId = typeof value === 'string' ? value.trim() : '';
  if (!returnId) redirect('/returns?message=Return%20ID%20is%20required.');
  const result = await identityRequest<Record<string, unknown>>(
    `/v1/returns/${encodeURIComponent(returnId)}/resolve`,
    { method: 'POST', idempotent: true },
  );
  const message = result.kind === 'success' ? 'Return case resolved.' : resultMessage(result);
  redirect(`/returns/${encodeURIComponent(returnId)}?message=${encodeURIComponent(message)}`);
}
