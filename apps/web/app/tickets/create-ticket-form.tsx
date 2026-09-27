'use client';

import { useActionState } from 'react';
import { createTicket, type TicketActionState } from './actions';

const initialState: TicketActionState = {};

export function CreateTicketForm() {
  const [state, action] = useActionState(createTicket, initialState);
  return (
    <section className="customer-card customer-card-wide" aria-labelledby="create-ticket-heading">
      <h2 id="create-ticket-heading">Create ticket</h2>
      <form action={action} className="customer-form">
        <label>
          Title
          <input maxLength={500} name="title" required />
        </label>
        <label>
          Priority
          <select defaultValue="NORMAL" name="priority">
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
        </label>
        <label>
          Customer ID (optional)
          <input name="customerId" />
        </label>
        <label>
          Conversation ID (optional)
          <input name="conversationId" />
        </label>
        <p className="muted">Links must belong to this organization.</p>
        <button className="action" type="submit">
          Create ticket
        </button>
        {state.error ? (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.completed ? (
          <p className="merge-success" role="status">
            Ticket created. Refresh the list to view it.
          </p>
        ) : null}
      </form>
    </section>
  );
}
