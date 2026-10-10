import type { ReactNode } from 'react';
import { identityRequest } from '../../identity-api';
import { Stack, StatusBadge, SurfaceCard } from '../../ui-primitives';
import { resolveReturn } from './resolve-action';

interface ReturnStatusView {
  id: string;
  status: string;
}

interface SessionView {
  permissions: readonly string[];
}

export default async function ReturnCaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ returnId: string }>;
}) {
  const { returnId } = await params;
  const [detail, session] = await Promise.all([
    identityRequest<ReturnStatusView>(`/v1/returns/${encodeURIComponent(returnId)}`),
    identityRequest<SessionView>('/v1/session'),
  ]);
  const canResolve =
    detail.kind === 'success' &&
    detail.data.status === 'INSPECTED' &&
    session.kind === 'success' &&
    session.data.permissions.includes('returns.manage');

  return (
    <>
      {children}
      {canResolve ? (
        <div className="customers-page">
          <SurfaceCard>
            <Stack gap="compact">
              <div className="identity-section-heading">
                <div>
                  <p className="ds-eyebrow">CASE CLOSURE</p>
                  <h2>Resolve the return</h2>
                </div>
                <StatusBadge tone="warning">Guarded</StatusBadge>
              </div>
              <p className="identity-muted">
                Resolution succeeds only when every accepted REFUND and EXCHANGE quantity has
                durable compensation evidence. Missing financial or replacement work keeps the case
                open.
              </p>
              <form action={resolveReturn}>
                <input type="hidden" name="returnId" value={returnId} />
                <button className="ds-button ds-button--primary" type="submit">
                  Validate and resolve case
                </button>
              </form>
            </Stack>
          </SurfaceCard>
        </div>
      ) : null}
    </>
  );
}
