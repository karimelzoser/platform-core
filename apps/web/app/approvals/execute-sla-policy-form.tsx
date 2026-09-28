'use client';

import { useActionState } from 'react';
import { executeSlaPolicyApproval, type ExecuteApprovalState } from './actions';

const initialState: ExecuteApprovalState = {};

export function ExecuteSlaPolicyForm({ approvalId }: { approvalId: string }) {
  const [state, action] = useActionState(executeSlaPolicyApproval, initialState);
  return (
    <form action={action} className="approval-actions">
      <input type="hidden" name="approvalId" value={approvalId} />
      <button type="submit">Create approved SLA policy</button>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.completed ? <p role="status">SLA policy created.</p> : null}
    </form>
  );
}
