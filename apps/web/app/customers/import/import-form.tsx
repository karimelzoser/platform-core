'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { importCustomers, type ImportState } from './actions';
const initialState: ImportState = {};
export function ImportForm() {
  const [state, action] = useActionState(importCustomers, initialState);
  return (
    <form action={action} className="customer-form">
      <label>
        CSV file
        <input name="file" type="file" accept=".csv,text/csv" required />
      </label>
      <p className="muted">
        Header: display_name,first_name,last_name,company_name,email,phone. Maximum 100 rows; no row
        is saved if validation fails.
      </p>
      <Submit />
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.count ? (
        <p className="merge-success" role="status">
          Imported {state.count} customer(s).
        </p>
      ) : null}
    </form>
  );
}
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Importing…' : 'Import CSV'}
    </button>
  );
}
