'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { assignCustomerToSegment, type SegmentAssignmentState } from './segment-actions';

const initialState: SegmentAssignmentState = {};

interface StaticSegment {
  id: string;
  name: string;
}

export function SegmentAssignmentForm({
  customerId,
  segments,
}: {
  customerId: string;
  segments: readonly StaticSegment[];
}) {
  const [state, action] = useActionState(assignCustomerToSegment, initialState);
  if (!segments.length) return <p className="muted">No active static segments are available.</p>;

  return (
    <form action={action} className="customer-form">
      <input type="hidden" name="customerId" value={customerId} />
      <label>
        Add to static segment
        <select name="segmentId" defaultValue="" required>
          <option disabled value="">
            Select a segment
          </option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name}
            </option>
          ))}
        </select>
      </label>
      <Submit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.assigned !== undefined ? (
        <p className="merge-success" role="status">
          {state.assigned
            ? 'Customer added to the static segment.'
            : 'Customer is already in that segment.'}
        </p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add customer'}
    </button>
  );
}
