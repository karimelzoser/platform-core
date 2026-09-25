'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { assignBulkTag, type BulkTagState } from './actions';

const initialState: BulkTagState = {};

interface Customer {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
}

export function BulkTagForm({
  customers,
  tags,
}: {
  customers: readonly Customer[];
  tags: readonly Tag[];
}) {
  const [state, action] = useActionState(assignBulkTag, initialState);
  const [submissionId, setSubmissionId] = useState('');
  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  if (!customers.length || !tags.length) {
    return <p className="muted">Create a customer and a tag before using bulk assignment.</p>;
  }
  return (
    <form action={action} className="customer-form">
      <input type="hidden" name="submissionId" value={submissionId} readOnly />
      <label>
        Tag
        <select name="tagId" defaultValue="" required>
          <option disabled value="">
            Select a tag
          </option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Select up to 100 customers</legend>
        <ul className="detail-list">
          {customers.map((customer) => (
            <li key={customer.id}>
              <label>
                <input name="customerId" type="checkbox" value={customer.id} /> {customer.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Submit disabled={!submissionId} />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.assignedCount !== undefined ? (
        <p className="merge-success" role="status">
          {state.assignedCount} customer(s) tagged; {state.alreadyAssignedCount ?? 0} already had
          the tag.
        </p>
      ) : null}
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={disabled || pending}>
      {pending ? 'Assigning tags…' : 'Assign tag to selected customers'}
    </button>
  );
}
