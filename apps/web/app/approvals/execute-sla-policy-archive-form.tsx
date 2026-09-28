'use client';

import { useActionState } from 'react';
import { executeSlaPolicyArchiveApproval, type ExecuteApprovalState } from './actions';

const initialState: ExecuteApprovalState = {};

export function ExecuteSlaPolicyArchiveForm({ approvalId }: { approvalId: string }) {
  const [state, action] = useActionState(executeSlaPolicyArchiveApproval, initialState);
  return (
    <form action={action} className="approval-actions">
      <input type="hidden" name="approvalId" value={approvalId} />
      <button type="submit">Archive approved SLA policy</button>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.completed ? <p role="status">SLA policy archived.</p> : null}
    </form>
  );
}
