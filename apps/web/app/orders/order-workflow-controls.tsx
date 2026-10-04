'use client';

import { useActionState } from 'react';
import {
  evaluateOrderDuplicates,
  queueOrderProviderAction,
  requestOrderCancellation,
  requestOrderConfirmation,
  requestOrderModification,
  respondOrderConfirmation,
  reviewOrderCancellation,
  reviewOrderDuplicate,
  reviewOrderModification,
  type OrderActionState,
} from './actions';

const initialState: OrderActionState = {};

interface DuplicateCandidate {
  id: string;
  candidateOrderId: string;
  score: number;
  reasons: readonly string[];
  state: string;
}

interface ChangeRequest {
  id: string;
  kind: string;
  state: string;
  patch: Record<string, unknown>;
  reason: string | null;
}

interface Workflow {
  confirmationState: string;
  duplicateState: string;
  modificationState: string;
  cancellationState: string;
  providerSyncState: string;
  duplicates: readonly DuplicateCandidate[];
  changeRequests: readonly ChangeRequest[];
}

interface OrderWorkflowControlsProps {
  orderId: string;
  storeId: string;
  workflow: Workflow;
  permissions: readonly string[];
}

export function OrderWorkflowControls({
  orderId,
  storeId,
  workflow,
  permissions,
}: OrderWorkflowControlsProps) {
  const canConfirm = permissions.includes('commerce.orders.confirm');
  const canUpdate = permissions.includes('commerce.orders.update');
  const canCancel = permissions.includes('commerce.orders.cancel');
  const [confirmationState, confirmationAction] = useActionState(
    requestOrderConfirmation,
    initialState,
  );
  const [responseState, responseAction] = useActionState(respondOrderConfirmation, initialState);
  const [duplicateState, duplicateAction] = useActionState(evaluateOrderDuplicates, initialState);
  const [duplicateReviewState, duplicateReviewAction] = useActionState(
    reviewOrderDuplicate,
    initialState,
  );
  const [modificationState, modificationAction] = useActionState(
    requestOrderModification,
    initialState,
  );
  const [modificationReviewState, modificationReviewAction] = useActionState(
    reviewOrderModification,
    initialState,
  );
  const [cancellationState, cancellationAction] = useActionState(
    requestOrderCancellation,
    initialState,
  );
  const [cancellationReviewState, cancellationReviewAction] = useActionState(
    reviewOrderCancellation,
    initialState,
  );
  const [providerState, providerAction] = useActionState(queueOrderProviderAction, initialState);

  return (
    <div className="order-workflow-grid">
      <section className="customer-card" aria-labelledby="order-confirmation-heading">
        <div className="order-card-heading">
          <div>
            <p className="eyebrow">CONFIRMATION</p>
            <h2 id="order-confirmation-heading">Customer confirmation</h2>
          </div>
          <span className="status-pill">{workflow.confirmationState}</span>
        </div>
        {canConfirm ? (
          <>
            <form action={confirmationAction} className="order-inline-actions">
              <OrderContext orderId={orderId} storeId={storeId} />
              <button className="action" type="submit">
                Request confirmation
              </button>
            </form>
            <form action={responseAction} className="order-inline-actions">
              <OrderContext orderId={orderId} storeId={storeId} />
              <button className="action" name="response" type="submit" value="CONFIRMED">
                Mark confirmed
              </button>
              <button className="secondary-action" name="response" type="submit" value="DECLINED">
                Mark declined
              </button>
            </form>
            <ActionMessage state={confirmationState} />
            <ActionMessage state={responseState} />
          </>
        ) : (
          <p className="muted">You have read-only access to confirmation state.</p>
        )}
      </section>

      <section className="customer-card" aria-labelledby="duplicate-heading">
        <div className="order-card-heading">
          <div>
            <p className="eyebrow">DUPLICATES</p>
            <h2 id="duplicate-heading">Duplicate protection</h2>
          </div>
          <span className="status-pill">{workflow.duplicateState}</span>
        </div>
        {canUpdate ? (
          <form action={duplicateAction} className="order-inline-actions">
            <OrderContext orderId={orderId} storeId={storeId} />
            <button className="action" type="submit">
              Scan previous 5 days
            </button>
          </form>
        ) : null}
        <ActionMessage state={duplicateState} />
        {workflow.duplicates.length ? (
          <ul className="detail-list">
            {workflow.duplicates.map((candidate) => (
              <li key={candidate.id}>
                <strong>{candidate.candidateOrderId}</strong>
                <span>
                  Score {candidate.score}% · {candidate.reasons.join(', ')}
                </span>
                <small>{candidate.state}</small>
                {canUpdate && candidate.state === 'OPEN' ? (
                  <form action={duplicateReviewAction} className="order-inline-actions">
                    <OrderContext orderId={orderId} storeId={storeId} />
                    <input name="candidateId" type="hidden" value={candidate.candidateOrderId} />
                    <button
                      className="secondary-action"
                      name="decision"
                      type="submit"
                      value="DISMISS"
                    >
                      Dismiss
                    </button>
                    <button
                      className="danger-action"
                      name="decision"
                      type="submit"
                      value="CONFIRM_DUPLICATE"
                    >
                      Confirm duplicate
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No duplicate candidates are currently recorded.</p>
        )}
        <ActionMessage state={duplicateReviewState} />
      </section>

      <section className="customer-card" aria-labelledby="modification-heading">
        <div className="order-card-heading">
          <div>
            <p className="eyebrow">MODIFICATION</p>
            <h2 id="modification-heading">Order changes</h2>
          </div>
          <span className="status-pill">{workflow.modificationState}</span>
        </div>
        {canUpdate ? (
          <form action={modificationAction} className="customer-form">
            <OrderContext orderId={orderId} storeId={storeId} />
            <label>
              Customer email
              <input name="customerEmail" type="email" />
            </label>
            <label>
              Customer phone
              <input name="customerPhone" />
            </label>
            <label>
              Internal/order note
              <textarea maxLength={10000} name="note" rows={3} />
            </label>
            <label>
              Reason
              <input maxLength={4000} name="reason" />
            </label>
            <button className="action" type="submit">
              Request modification
            </button>
          </form>
        ) : null}
        <ActionMessage state={modificationState} />
        <ChangeRequests
          action={modificationReviewAction}
          canAct={canUpdate}
          kind="MODIFICATION"
          orderId={orderId}
          requests={workflow.changeRequests}
          storeId={storeId}
        />
        <ActionMessage state={modificationReviewState} />
      </section>

      <section className="customer-card" aria-labelledby="cancellation-heading">
        <div className="order-card-heading">
          <div>
            <p className="eyebrow">CANCELLATION</p>
            <h2 id="cancellation-heading">Protected cancellation</h2>
          </div>
          <span className="status-pill">{workflow.cancellationState}</span>
        </div>
        {canCancel ? (
          <form action={cancellationAction} className="customer-form">
            <OrderContext orderId={orderId} storeId={storeId} />
            <label>
              Cancellation reason
              <textarea maxLength={4000} name="reason" required rows={3} />
            </label>
            <button className="danger-action" type="submit">
              Request cancellation
            </button>
          </form>
        ) : null}
        <ActionMessage state={cancellationState} />
        <ChangeRequests
          action={cancellationReviewAction}
          canAct={canCancel}
          kind="CANCELLATION"
          orderId={orderId}
          requests={workflow.changeRequests}
          showApproval
          storeId={storeId}
        />
        <ActionMessage state={cancellationReviewState} />
      </section>

      <section className="customer-card customer-card-wide" aria-labelledby="provider-sync-heading">
        <div className="order-card-heading">
          <div>
            <p className="eyebrow">PROVIDER SYNC</p>
            <h2 id="provider-sync-heading">External commerce execution</h2>
          </div>
          <span className="status-pill">{workflow.providerSyncState}</span>
        </div>
        <p className="muted">
          Canonical state changes are committed first. This control queues a typed, durable provider
          action against an already mapped Shopify/WooCommerce connection.
        </p>
        {canUpdate || canConfirm || canCancel ? (
          <form action={providerAction} className="customer-form order-provider-form">
            <OrderContext orderId={orderId} storeId={storeId} />
            <label>
              Connection ID
              <input name="connectionId" required />
            </label>
            <label>
              Operation
              <select defaultValue="CONFIRM" name="operation">
                <option value="CONFIRM">CONFIRM</option>
                <option value="MODIFY">MODIFY</option>
                <option value="CANCEL">CANCEL</option>
              </select>
            </label>
            <label>
              Applied modification request ID (for MODIFY)
              <input name="changeRequestId" />
            </label>
            <label>
              Approval ID (when policy requires it)
              <input name="approvalId" />
            </label>
            <button className="action" type="submit">
              Queue provider action
            </button>
          </form>
        ) : null}
        <ActionMessage state={providerState} />
      </section>
    </div>
  );
}

function OrderContext({ orderId, storeId }: { orderId: string; storeId: string }) {
  return (
    <>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="storeId" type="hidden" value={storeId} />
    </>
  );
}

function ChangeRequests({
  action,
  canAct,
  kind,
  orderId,
  requests,
  showApproval = false,
  storeId,
}: {
  action: (payload: FormData) => void;
  canAct: boolean;
  kind: 'MODIFICATION' | 'CANCELLATION';
  orderId: string;
  requests: readonly ChangeRequest[];
  showApproval?: boolean;
  storeId: string;
}) {
  const pending = requests.filter(
    (request) => request.kind === kind && request.state === 'REQUESTED',
  );
  if (!pending.length) return <p className="muted">No pending {kind.toLowerCase()} requests.</p>;
  return (
    <ul className="detail-list">
      {pending.map((request) => (
        <li key={request.id}>
          <strong>{request.id}</strong>
          <span>{request.reason ?? 'No reason supplied'}</span>
          <small>{JSON.stringify(request.patch)}</small>
          {canAct ? (
            <form action={action} className="order-review-form">
              <OrderContext orderId={orderId} storeId={storeId} />
              <input name="requestId" type="hidden" value={request.id} />
              {showApproval ? (
                <label>
                  Approval ID
                  <input name="approvalId" />
                </label>
              ) : null}
              <div className="order-inline-actions">
                <button className="action" name="decision" type="submit" value="APPROVE">
                  Approve
                </button>
                <button className="secondary-action" name="decision" type="submit" value="REJECT">
                  Reject
                </button>
              </div>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ActionMessage({ state }: { state: OrderActionState }) {
  if (state.error)
    return (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    );
  if (state.completed)
    return (
      <p className="merge-success" role="status">
        Operation accepted. The workspace has been refreshed.
      </p>
    );
  return null;
}
