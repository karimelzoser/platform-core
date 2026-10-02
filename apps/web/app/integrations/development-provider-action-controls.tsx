'use client';

import { useActionState } from 'react';
import { requestDevelopmentProviderAction, type IntegrationActionState } from './actions';

const initialState: IntegrationActionState = {};

/** Visible only for seeded disposable connectors; real provider controls remain unavailable. */
export function DevelopmentProviderActionControls({
  connectionId,
  connectorKey,
}: {
  connectionId: string;
  connectorKey: 'development-api' | 'development-web-chat';
}) {
  const [state, action] = useActionState(requestDevelopmentProviderAction, initialState);
  return (
    <section className="customer-form" aria-label="Development provider action">
      <h2>Development-only action</h2>
      <p className="muted">
        This requests approval for a harmless fixture echo through the same durable connector worker
        path. It does not contact a provider.
      </p>
      <form action={action} className="approval-actions">
        <input type="hidden" name="connectionId" value={connectionId} />
        <input type="hidden" name="connectorKey" value={connectorKey} />
        <button type="submit">Request development echo</button>
      </form>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.completed ? (
        <p className="merge-success" role="status">
          {state.completed}
        </p>
      ) : null}
    </section>
  );
}
