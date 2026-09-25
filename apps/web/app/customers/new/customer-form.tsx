'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCustomer, type CustomerCreationState } from './actions';

const initialState: CustomerCreationState = {};

export function CustomerForm() {
  const [state, formAction] = useActionState(createCustomer, initialState);
  const [submissionId, setSubmissionId] = useState('');

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  return (
    <form action={formAction} className="customer-form">
      <input name="submissionId" type="hidden" value={submissionId} readOnly />
      <div className="customer-form-grid">
        <label>
          Display name
          <input name="displayName" autoComplete="name" maxLength={300} />
        </label>
        <label>
          Company
          <input name="companyName" autoComplete="organization" maxLength={300} />
        </label>
        <label>
          First name
          <input name="firstName" autoComplete="given-name" maxLength={150} />
        </label>
        <label>
          Last name
          <input name="lastName" autoComplete="family-name" maxLength={150} />
        </label>
        <label>
          Email
          <input name="email" autoComplete="email" inputMode="email" type="email" maxLength={320} />
        </label>
        <label>
          Phone
          <input
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+201234567890"
            maxLength={32}
          />
        </label>
        <label>
          Preferred language
          <select name="preferredLanguage" defaultValue="">
            <option value="">Not set</option>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </label>
        <label>
          Timezone
          <input name="timezone" autoComplete="off" placeholder="Africa/Cairo" maxLength={100} />
        </label>
      </div>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <CustomerSubmit disabled={!submissionId} />
    </form>
  );
}

function CustomerSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={disabled || pending}>
      {pending ? 'Creating customer…' : 'Create customer'}
    </button>
  );
}
