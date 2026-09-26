'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createTemplate, type TemplateState } from './actions';
const initial: TemplateState = {};
export function TemplateForm() {
  const [state, action] = useActionState(createTemplate, initial);
  return (
    <form action={action} className="customer-form">
      <label>
        Name
        <input name="name" maxLength={100} required />
      </label>
      <label>
        Language
        <select name="locale" defaultValue="en">
          <option value="en">English</option>
          <option value="ar">Arabic</option>
        </select>
      </label>
      <label>
        Body
        <textarea name="body" maxLength={20000} required />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.created ? (
        <p className="merge-success" role="status">
          Template created. Refresh to use it.
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Create template'}
    </button>
  );
}
