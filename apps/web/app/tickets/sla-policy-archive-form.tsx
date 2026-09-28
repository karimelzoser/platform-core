'use client';

import { useActionState } from 'react';
import { requestSlaPolicyArchive, type TicketActionState } from './actions';

const initialState: TicketActionState = {};

export function SlaPolicyArchiveForm({ slaPolicyId }: { slaPolicyId: string }) {
  const [state, action] = useActionState(requestSlaPolicyArchive, initialState);
  return (
    <form action={action} className="approval-actions">
      <input name="slaPolicyId" type="hidden" value={slaPolicyId} readOnly />
      <button type="submit">Request archive approval</button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.completed ? (
        <p className="merge-success" role="status">
          Archive approval request recorded.
        </p>
      ) : null}
    </form>
  );
}
