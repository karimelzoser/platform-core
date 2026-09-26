'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendConversationMessage, type SendConversationMessageState } from './actions';

const initialState: SendConversationMessageState = {};

export interface MessageTemplate {
  id: string;
  name: string;
  locale: 'en' | 'ar';
  channel: string | null;
  body: string;
}

export function MessageComposeForm({
  conversationId,
  templates,
}: {
  conversationId: string;
  templates: readonly MessageTemplate[];
}) {
  const [state, action] = useActionState(sendConversationMessage, initialState);
  const [submissionId, setSubmissionId] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (!state.queued) return;
    setSubmissionId(crypto.randomUUID());
    setBody('');
    setTemplateId('');
  }, [state.queued]);

  return (
    <form action={action} className="customer-form" key={submissionId}>
      <input name="conversationId" type="hidden" value={conversationId} readOnly />
      <input name="submissionId" type="hidden" value={submissionId} readOnly />
      {templates.length ? (
        <label>
          Start from a template
          <select
            value={templateId}
            onChange={(event) => {
              const selectedId = inputValue(event.currentTarget);
              const selected = templates.find((template) => template.id === selectedId);
              setTemplateId(selectedId);
              if (selected) setBody(selected.body);
            }}
          >
            <option value="">Write a custom reply</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.locale.toUpperCase()})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Reply
        <textarea
          name="body"
          maxLength={20_000}
          placeholder="Write a reply…"
          required
          disabled={!submissionId}
          value={body}
          onChange={(event) => {
            setBody(inputValue(event.currentTarget));
          }}
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

function inputValue(element: unknown): string {
  const value = (element as { value?: unknown }).value;
  return typeof value === 'string' ? value : '';
}

function SendSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="action" type="submit" disabled={disabled || pending}>
      {pending ? 'Queueing message…' : 'Queue message'}
    </button>
  );
}
