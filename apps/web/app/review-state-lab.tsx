'use client';

import { useState } from 'react';

type ReviewState = 'loading' | 'empty' | 'forbidden' | 'recoverable' | 'fatal';

const states: readonly { key: ReviewState; label: string }[] = [
  { key: 'loading', label: 'Loading' },
  { key: 'empty', label: 'Empty' },
  { key: 'forbidden', label: 'Forbidden' },
  { key: 'recoverable', label: 'Recoverable error' },
  { key: 'fatal', label: 'Fatal error' },
];

export function ReviewStateLab({ moduleLabel }: { moduleLabel: string }) {
  const [state, setState] = useState<ReviewState>('loading');
  const [retryCount, setRetryCount] = useState(0);

  return (
    <section className="review-state-lab" aria-labelledby="review-state-lab-title">
      <header className="review-state-lab__heading">
        <div>
          <p className="ds-eyebrow">UX STATE LAB</p>
          <h2 id="review-state-lab-title">Production states for {moduleLabel}</h2>
          <p>
            Inspect non-happy-path behavior without waiting for a real API response. These controls
            are local review fixtures only.
          </p>
        </div>
        <div className="review-state-lab__controls" role="group" aria-label="Choose review state">
          {states.map((item) => (
            <button
              className="review-state-lab__state-button"
              data-active={state === item.key || undefined}
              key={item.key}
              onClick={() => setState(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="review-state-lab__stage" data-state={state}>
        {state === 'loading' ? <LoadingState /> : null}
        {state === 'empty' ? <EmptyState moduleLabel={moduleLabel} /> : null}
        {state === 'forbidden' ? <ForbiddenState moduleLabel={moduleLabel} /> : null}
        {state === 'recoverable' ? (
          <RecoverableState retryCount={retryCount} onRetry={() => setRetryCount((count) => count + 1)} />
        ) : null}
        {state === 'fatal' ? <FatalState moduleLabel={moduleLabel} /> : null}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="review-state-card review-state-card--loading" role="status" aria-label="Loading workspace">
      <div className="review-state-card__title-skeleton" />
      <div className="review-state-card__line-skeleton" />
      <div className="review-state-card__line-skeleton review-state-card__line-skeleton--short" />
      <div className="review-state-card__rows">
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">Loading workspace data…</span>
    </div>
  );
}

function EmptyState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="review-state-card" role="status">
      <span className="review-state-card__icon" aria-hidden="true">
        0
      </span>
      <h3>No {moduleLabel.toLowerCase()} records yet</h3>
      <p>
        The workspace is ready. The primary action explains how to create the first record without
        showing a misleading error state.
      </p>
      <button className="ds-button ds-button--primary" type="button">
        Create first record
      </button>
    </div>
  );
}

function ForbiddenState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="review-state-card" role="status">
      <span className="review-state-card__icon" aria-hidden="true">
        403
      </span>
      <h3>Access to {moduleLabel} is restricted</h3>
      <p>
        The signed-in user is authenticated, but their tenant role does not include the required
        permission. The state does not expose hidden record details.
      </p>
      <button className="ds-button ds-button--secondary" type="button">
        Review role requirements
      </button>
    </div>
  );
}

function RecoverableState({ retryCount, onRetry }: { retryCount: number; onRetry: () => void }) {
  return (
    <div className="review-state-card review-state-card--warning" role="alert">
      <span className="review-state-card__icon" aria-hidden="true">
        !
      </span>
      <h3>Provider data could not be refreshed</h3>
      <p>
        Canonical platform state remains available. The operator can retry the external read without
        repeating a successful mutation.
      </p>
      <div className="review-state-card__actions">
        <button className="ds-button ds-button--primary" onClick={onRetry} type="button">
          Retry safely
        </button>
        <span aria-live="polite">{retryCount ? `Local retry simulated ${String(retryCount)}×.` : 'No retry attempted.'}</span>
      </div>
    </div>
  );
}

function FatalState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="review-state-card review-state-card--danger" role="alert">
      <span className="review-state-card__icon" aria-hidden="true">
        ×
      </span>
      <h3>{moduleLabel} is temporarily unavailable</h3>
      <p>
        The application cannot safely render this workspace. A correlation reference is shown to the
        operator while technical detail stays out of the user-facing error message.
      </p>
      <dl className="review-state-card__reference">
        <div>
          <dt>Correlation</dt>
          <dd>review-demo-7f4c</dd>
        </div>
        <div>
          <dt>Tenant state</dt>
          <dd>Not modified</dd>
        </div>
      </dl>
      <button className="ds-button ds-button--secondary" type="button">
        Return to platform home
      </button>
    </div>
  );
}
