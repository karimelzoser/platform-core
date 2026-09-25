'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestMergeApproval, type MergeRequestState } from './actions';
const initialState: MergeRequestState = {};
export function MergeRequestForm({
  sourceCustomerId,
  targetCustomerId,
}: {
  sourceCustomerId: string;
  targetCustomerId: string;
}) {
  const [state, action] = useActionState(requestMergeApproval, initialState);
  return (
    <form action={action} className="customer-form">
      <input type="hidden" name="sourceCustomerId" value={sourceCustomerId} />
      <input type="hidden" name="targetCustomerId" value={targetCustomerId} />
      <label>
        Merge reason
        <textarea name="reason" minLength={3} maxLength={1000} required />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.approvalId ? (
        <p className="merge-success" role="status">
          Approval request submitted: {state.approvalId}. The merge will remain pending until an
          authorized approver decides it.
        </p>
      ) : (
        <Submit />
      )}
    </form>
  );
}
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Requesting approval…' : 'Request merge approval'}
    </button>
  );
}
