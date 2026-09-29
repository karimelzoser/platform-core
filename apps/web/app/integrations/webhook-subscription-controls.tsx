'use client';

import { useActionState } from 'react';
import {
  requestWebhookSubscription,
  requestWebhookUnsubscription,
  type IntegrationActionState,
} from './actions';

interface Subscription {
  id: string;
  callbackUrl: string;
  state: string;
}

const initialState: IntegrationActionState = {};

export function WebhookSubscriptionControls({
  connectionId,
  subscriptions,
}: {
  connectionId: string;
  subscriptions: readonly Subscription[];
}) {
  const [subscribeState, subscribeAction] = useActionState(
    requestWebhookSubscription,
    initialState,
  );
  const [unsubscribeState, unsubscribeAction] = useActionState(
    requestWebhookUnsubscription,
    initialState,
  );
  const active = subscriptions.filter((subscription) => subscription.state === 'ACTIVE');
  return (
    <section className="customer-form" aria-label="Webhook subscriptions">
      <h2>Webhook subscription</h2>
      <p className="muted">Only use a public HTTPS callback controlled by this integration.</p>
      <form action={subscribeAction} className="approval-actions">
        <input type="hidden" name="connectionId" value={connectionId} />
        <label>
          Callback URL
          <input name="callbackUrl" type="url" inputMode="url" required />
        </label>
        <button type="submit">Request webhook</button>
      </form>
      {active.length ? (
        <ul className="detail-list">
          {active.map((subscription) => (
            <li key={subscription.id}>
              <span>{subscription.callbackUrl}</span>
              <form action={unsubscribeAction}>
                <input type="hidden" name="connectionId" value={connectionId} />
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <button type="submit">Request removal</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {subscribeState.error || unsubscribeState.error ? (
        <p className="form-error" role="alert">
          {subscribeState.error ?? unsubscribeState.error}
        </p>
      ) : null}
      {subscribeState.completed || unsubscribeState.completed ? (
        <p className="merge-success" role="status">
          {subscribeState.completed ?? unsubscribeState.completed}
        </p>
      ) : null}
    </section>
  );
}
