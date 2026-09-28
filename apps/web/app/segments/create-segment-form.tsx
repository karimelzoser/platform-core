'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createDynamicSegment,
  createStaticSegment,
  evaluateDynamicSegment,
  type CreateSegmentState,
  type EvaluateSegmentState,
} from './actions';

const initialState: CreateSegmentState = {};
const initialEvaluationState: EvaluateSegmentState = {};

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
      <Submit label="Create static segment" />
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
      <Submit label="Create dynamic segment" />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.created ? (
        <p className="merge-success" role="status">
          Dynamic segment created. Use its evaluation control below to update rule members.
        </p>
      ) : null}
    </form>
  );
}

export function EvaluateDynamicSegmentForm({ segmentId }: { segmentId: string }) {
  const [state, action] = useActionState(evaluateDynamicSegment, initialEvaluationState);
  return (
    <form action={action} className="inline-action-form">
      <input type="hidden" name="segmentId" value={segmentId} />
      <EvaluateSubmit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.memberCount !== undefined ? (
        <p className="merge-success" role="status">
          Rule evaluated: {state.memberCount} matching customer{state.memberCount === 1 ? '' : 's'}.
        </p>
      ) : null}
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Creating…' : label}
    </button>
  );
}

function EvaluateSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Evaluating…' : 'Evaluate tag rule'}
    </button>
  );
}
