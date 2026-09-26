'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendConversationMessage, type SendConversationMessageState } from './actions';

const initialState: SendConversationMessageState = {};

export function MessageComposeForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendConversationMessage, initialState);
  const [submissionId, setSubmissionId] = useState('');

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (!state.queued) return;
    setSubmissionId(crypto.randomUUID());
  }, [state.queued]);

  return (
    <form action={action} className="customer-form" key={submissionId}>
      <input name="conversationId" type="hidden" value={conversationId} readOnly />
      <input name="submissionId" type="hidden" value={submissionId} readOnly />
      <label>
        Reply
        <textarea
          name="body"
          maxLength={20_000}
          placeholder="Write a reply…"
          required
          disabled={!submissionId}
        />
      </label>
      <p className="muted">
        The message is queued securely and dispatched by the worker after the database commit.
      </p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.queued ? (
        <p className="merge-success" role="status">
          Message queued for delivery.
        </p>
      ) : null}
      <SendSubmit disabled={!submissionId} />
    </form>
  );
}

function SendSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={disabled || pending}>
      {pending ? 'Queueing message…' : 'Queue message'}
    </button>
  );
}
