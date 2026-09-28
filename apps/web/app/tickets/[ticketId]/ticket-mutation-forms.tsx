'use client';

import { useActionState } from 'react';
import {
  addTicketComment,
  assignTicket,
  setTicketResolution,
  setTicketSlaStatus,
  updateTicket,
  type TicketActionState,
} from '../actions';

const initialState: TicketActionState = {};

export function TicketMutationForms({
  ticket,
  permissions,
  assignees,
}: {
  ticket: {
    id: string;
    title: string;
    priority: string;
    status: string;
    assignedTo: string | null;
    slaPolicyId: string | null;
    slaPausedAt: string | null;
  };
  permissions: readonly string[];
  assignees: readonly {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }[];
}) {
  const [updateState, updateAction] = useActionState(updateTicket, initialState);
  const [assignmentState, assignmentAction] = useActionState(assignTicket, initialState);
  const [resolutionState, resolutionAction] = useActionState(setTicketResolution, initialState);
  const [slaState, slaAction] = useActionState(setTicketSlaStatus, initialState);
  const [commentState, commentAction] = useActionState(addTicketComment, initialState);
  const resolve = ticket.status !== 'RESOLVED';
  const canUpdate = permissions.includes('tickets.update');
  const canAssign = permissions.includes('tickets.assign');
  const canResolve = permissions.includes('tickets.close');
  const hasSla = ticket.slaPolicyId !== null;
  const canManageSlaClock = canUpdate && hasSla && ['OPEN', 'PENDING'].includes(ticket.status);
  if (!canUpdate && !canAssign && !canResolve)
    return <p className="muted">You have read-only access to this ticket.</p>;

  return (
    <>
      {canUpdate ? (
        <section className="customer-card" aria-labelledby="ticket-update-heading">
          <h2 id="ticket-update-heading">Ticket details</h2>
          <form action={updateAction} className="customer-form">
            <input name="ticketId" type="hidden" value={ticket.id} readOnly />
            <label>
              Title
              <input defaultValue={ticket.title} maxLength={500} name="title" required />
            </label>
            <label>
              Priority
              <select defaultValue={ticket.priority} name="priority">
                <option value="LOW">LOW</option>
                <option value="NORMAL">NORMAL</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </label>
            <button className="action" type="submit">
              Save ticket details
            </button>
            <FormState state={updateState} success="Ticket details saved." />
          </form>
        </section>
      ) : null}

      {canAssign ? (
        <section className="customer-card" aria-labelledby="ticket-assignment-heading">
          <h2 id="ticket-assignment-heading">Assignment</h2>
          <form action={assignmentAction} className="customer-form">
            <input name="ticketId" type="hidden" value={ticket.id} readOnly />
            <label>
              Tenant member
              <select defaultValue={ticket.assignedTo ?? ''} name="assigneeId">
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assigneeName(assignee)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">Only active members of this organization are available.</p>
            <button className="action" type="submit">
              Save assignment
            </button>
            <FormState state={assignmentState} success="Ticket assignment saved." />
          </form>
        </section>
      ) : null}

      {canResolve ? (
        <section className="customer-card" aria-labelledby="ticket-resolution-heading">
          <h2 id="ticket-resolution-heading">Resolution</h2>
          <form action={resolutionAction} className="customer-form">
            <input name="ticketId" type="hidden" value={ticket.id} readOnly />
            <input name="status" type="hidden" value={resolve ? 'RESOLVED' : 'OPEN'} readOnly />
            <p className="muted">
              {resolve
                ? 'Resolve this ticket when the customer issue is complete.'
                : 'Reopen this ticket if more work is needed.'}
            </p>
            <button className="action" type="submit">
              {resolve ? 'Resolve ticket' : 'Reopen ticket'}
            </button>
            <FormState state={resolutionState} success="Ticket resolution saved." />
          </form>
        </section>
      ) : null}

      {canManageSlaClock ? (
        <section className="customer-card" aria-labelledby="ticket-sla-control-heading">
          <h2 id="ticket-sla-control-heading">SLA clock</h2>
          <form action={slaAction} className="customer-form">
            <input name="ticketId" type="hidden" value={ticket.id} readOnly />
            <input
              name="status"
              type="hidden"
              value={ticket.slaPausedAt ? 'OPEN' : 'PENDING'}
              readOnly
            />
            <p className="muted">
              {ticket.slaPausedAt
                ? 'This SLA clock is paused. Resume it when active work continues.'
                : 'Pause this SLA clock only while the ticket is formally pending.'}
            </p>
            <button className="action" type="submit">
              {ticket.slaPausedAt ? 'Resume SLA clock' : 'Pause SLA clock'}
            </button>
            <FormState state={slaState} success="SLA clock updated." />
          </form>
        </section>
      ) : null}

      {canUpdate ? (
        <section
          className="customer-card customer-card-wide"
          aria-labelledby="ticket-comment-heading"
        >
          <h2 id="ticket-comment-heading">Add comment</h2>
          <form action={commentAction} className="customer-form">
            <input name="ticketId" type="hidden" value={ticket.id} readOnly />
            <label>
              Note
              <textarea maxLength={20_000} name="body" required />
            </label>
            <label>
              Visibility
              <select defaultValue="INTERNAL" name="visibility">
                <option value="INTERNAL">Internal</option>
                <option value="CUSTOMER_VISIBLE">Customer visible</option>
              </select>
            </label>
            <button className="action" type="submit">
              Add comment
            </button>
            <FormState state={commentState} success="Comment recorded." />
          </form>
        </section>
      ) : null}
    </>
  );
}

function assigneeName(assignee: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fullName = [assignee.firstName, assignee.lastName].filter(Boolean).join(' ');
  return fullName || assignee.email || assignee.id;
}

function FormState({ state, success }: { state: TicketActionState; success: string }) {
  if (state.error)
    return (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    );
  if (state.completed)
    return (
      <p className="merge-success" role="status">
        {success}
      </p>
    );
  return null;
}
