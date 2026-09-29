'use client';

import { useActionState } from 'react';
import {
  requestConnectionHealth,
  requestInitialSync,
  type IntegrationActionState,
} from './actions';

const initialState: IntegrationActionState = {};

export function ConnectionControls({ connectionId }: { connectionId: string }) {
  const [healthState, healthAction] = useActionState(requestConnectionHealth, initialState);
  const [syncState, syncAction] = useActionState(requestInitialSync, initialState);
  return (
    <div className="approval-actions">
      <form action={healthAction}>
        <input type="hidden" name="connectionId" value={connectionId} />
        <button type="submit">Run health check</button>
      </form>
      <form action={syncAction}>
        <input type="hidden" name="connectionId" value={connectionId} />
        <button type="submit">Request initial sync</button>
      </form>
      {healthState.error || syncState.error ? (
        <p className="form-error" role="alert">
          {healthState.error ?? syncState.error}
        </p>
      ) : null}
      {healthState.completed || syncState.completed ? (
        <p className="merge-success" role="status">
          {healthState.completed ?? syncState.completed}
        </p>
      ) : null}
    </div>
  );
}
