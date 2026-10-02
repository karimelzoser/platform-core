'use client';

import { useActionState } from 'react';
import { executeProviderActionApproval, type ExecuteApprovalState } from './actions';

const initialState: ExecuteApprovalState = {};

export function ExecuteProviderActionForm({ approvalId }: { approvalId: string }) {
  const [state, action] = useActionState(executeProviderActionApproval, initialState);
  return (
    <form action={action} className="approval-actions">
      <input type="hidden" name="approvalId" value={approvalId} />
      <button type="submit">Queue approved provider action</button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.completed ? (
        <p className="merge-success" role="status">
          Provider action queued.
        </p>
      ) : null}
    </form>
  );
}
