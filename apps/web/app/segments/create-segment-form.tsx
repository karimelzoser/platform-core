'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createStaticSegment, type CreateSegmentState } from './actions';

const initialState: CreateSegmentState = {};

export function CreateSegmentForm() {
  const [state, action] = useActionState(createStaticSegment, initialState);
  return (
    <form action={action} className="customer-form">
      <label>
        Segment name
        <input name="name" maxLength={100} required />
      </label>
      <label>
        Description (optional)
        <textarea name="description" maxLength={500} />
      </label>
      <Submit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.created ? (
        <p className="merge-success" role="status">
          Static segment created. Refresh this page to see it in the list.
        </p>
      ) : null}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create static segment'}
    </button>
  );
}
