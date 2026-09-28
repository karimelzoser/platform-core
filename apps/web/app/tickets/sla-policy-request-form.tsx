'use client';

import { useActionState } from 'react';
import { requestSlaPolicy, type TicketActionState } from './actions';

const initialState: TicketActionState = {};

export function SlaPolicyRequestForm() {
  const [state, action] = useActionState(requestSlaPolicy, initialState);
  return (
    <section className="customer-card" aria-labelledby="sla-policy-heading">
      <h2 id="sla-policy-heading">Request SLA policy</h2>
      <p className="muted">
        Creating an SLA policy requires approval from another authorized member.
      </p>
      <form action={action} className="customer-form">
        <label>
          Policy name
          <input name="name" maxLength={120} required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="NORMAL">
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
        </label>
        <label>
          First response minutes
          <input
            name="firstResponseMinutes"
            type="number"
            min="1"
            max="10080"
            defaultValue="60"
            required
          />
        </label>
        <label>
          Resolution minutes
          <input
            name="resolutionMinutes"
            type="number"
            min="1"
            max="43200"
            defaultValue="480"
            required
          />
        </label>
        <label>
          Escalation minutes after breach (optional)
          <input name="escalationMinutes" type="number" min="1" max="43200" />
        </label>
        <button className="action" type="submit">
          Request approval
        </button>
        {state.error ? (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.completed ? (
          <p className="merge-success" role="status">
            Approval request recorded.
          </p>
        ) : null}
      </form>
    </section>
  );
}
