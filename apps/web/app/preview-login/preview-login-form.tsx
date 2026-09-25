'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { previewLogin, type PreviewLoginState } from './actions';
const initialState: PreviewLoginState = {};
export function PreviewLoginForm() {
  const [state, action] = useActionState(previewLogin, initialState);
  return (
    <form action={action} className="customer-form">
      <label>
        Username
        <input name="username" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
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
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
