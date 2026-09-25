'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { executeMergeApproval, type ExecuteApprovalState } from './actions';

const initialState: ExecuteApprovalState = {};

export function ExecuteMergeForm({ approvalId }: { approvalId: string }) {
  const [state, action] = useActionState(executeMergeApproval, initialState);
  if (state.completed)
    return (
      <p className="merge-success" role="status">
        Merge completed.
      </p>
    );

  return (
    <form action={action} className="approval-actions">
      <input type="hidden" name="approvalId" value={approvalId} />
      <Submit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Executing merge…' : 'Execute approved merge'}
    </button>
  );
}
