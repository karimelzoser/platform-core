'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDynamicSegment, createStaticSegment, type CreateSegmentState } from './actions';

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

export function CreateDynamicSegmentForm() {
  const [state, action] = useActionState(createDynamicSegment, initialState);
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
      <label>
        Required tag IDs (comma separated)
        <input name="allTagIds" required />
      </label>
      <p className="muted">A customer qualifies only when it has every listed tenant tag.</p>
      <Submit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.created ? (
        <p className="merge-success" role="status">
          Dynamic segment created. Evaluate it through the API until scheduled evaluation is
          implemented.
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
