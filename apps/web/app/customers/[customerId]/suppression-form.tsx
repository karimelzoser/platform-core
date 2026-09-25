'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { suppressCustomerChannel, type SuppressionState } from './suppression-actions';

const initialState: SuppressionState = {};

export function SuppressionForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState(suppressCustomerChannel, initialState);
  const [submissionId, setSubmissionId] = useState('');

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  return (
    <form action={action} className="customer-form">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="submissionId" value={submissionId} readOnly />
      <label>
        Channel
        <select name="channel" defaultValue="" required>
          <option disabled value="">
            Select a channel
          </option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="MESSENGER">Messenger</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="PUSH">Push</option>
        </select>
      </label>
      <label>
        Opt-out reason
        <textarea name="reason" minLength={3} maxLength={500} required />
      </label>
      <Submit disabled={!submissionId} />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.suppressed ? (
        <p className="merge-success" role="status">
          Opt-out recorded. Unverified opt-in is intentionally unavailable.
        </p>
      ) : null}
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={disabled || pending}>
      {pending ? 'Recording…' : 'Record opt-out'}
    </button>
  );
}
