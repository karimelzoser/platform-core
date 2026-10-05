'use client';

import { useActionState } from 'react';
import { updateShippingRescueCase, type ShippingActionState } from './actions';

const initialState: ShippingActionState = {};

interface ShippingRescueControlsProps {
  shipmentId: string;
  storeId: string;
  rescueCaseId: string;
  state: string;
  permissions: readonly string[];
}

export function ShippingRescueControls({
  shipmentId,
  storeId,
  rescueCaseId,
  state,
  permissions,
}: ShippingRescueControlsProps) {
  const [actionState, action] = useActionState(updateShippingRescueCase, initialState);
  const canManage = permissions.includes('shipping.rescue.manage');
  const next =
    state === 'CONTACT_REQUIRED'
      ? {
          state: 'CONTACTED',
          label: 'Mark buyer contacted',
          summary: 'Buyer contacted and delivery details reviewed from the shipping workspace.',
        }
      : state === 'CONTACTED'
        ? {
            state: 'RESOLVED',
            label: 'Resolve rescue case',
            summary: 'Delivery rescue completed from the shipping workspace.',
          }
        : undefined;

  if (!canManage)
    return <p className="muted">You have read-only access to delivery rescue state.</p>;
  if (!next)
    return <p className="muted">No direct rescue transition is available from state {state}.</p>;

  return (
    <>
      <form action={action} className="shipping-rescue-actions">
        <input name="shipmentId" type="hidden" value={shipmentId} />
        <input name="storeId" type="hidden" value={storeId} />
        <input name="rescueCaseId" type="hidden" value={rescueCaseId} />
        <input name="state" type="hidden" value={next.state} />
        <input name="summary" type="hidden" value={next.summary} />
        <button className="action" type="submit">
          {next.label}
        </button>
      </form>
      {actionState.error ? (
        <p className="form-error" role="alert">
          {actionState.error}
        </p>
      ) : null}
      {actionState.completed ? (
        <p className="merge-success" role="status">
          Rescue state updated.
        </p>
      ) : null}
    </>
  );
}
