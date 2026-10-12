'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';

const activities = [
  {
    label: 'Refund approval required',
    detail: 'EGP 8,400 refund is waiting for a finance decision.',
    module: 'approvals',
    tone: 'warning',
  },
  {
    label: 'Email provider degraded',
    detail: 'Latency is above the review threshold; canonical state remains available.',
    module: 'integrations',
    tone: 'danger',
  },
  {
    label: 'Campaign ready for launch',
    detail: 'Audience snapshot is frozen and 4,820 recipients are eligible.',
    module: 'campaigns',
    tone: 'success',
  },
  {
    label: 'Workflow retry recovered',
    detail: 'Recovery workflow resumed after one provider activity retry.',
    module: 'workflows',
    tone: 'info',
  },
] as const;

export function ReviewActivityMenu() {
  const [read, setRead] = useState<readonly number[]>([]);
  const unread = activities.length - read.length;

  return (
    <details className="review-activity">
      <summary aria-label={`Activity center, ${String(unread)} unread`}>
        <span>Activity</span>
        {unread > 0 ? <strong>{unread}</strong> : null}
      </summary>
      <div className="review-activity__panel">
        <header>
          <div>
            <span className="ds-eyebrow">ATTENTION CENTER</span>
            <h2>What needs attention</h2>
          </div>
          <button onClick={() => setRead(activities.map((_, index) => index))} type="button">
            Mark all read
          </button>
        </header>
        <ul>
          {activities.map((activity, index) => {
            const seen = read.includes(index);
            return (
              <li data-read={seen || undefined} key={activity.label}>
                <span className="review-activity__tone" data-tone={activity.tone} aria-hidden="true" />
                <div>
                  <strong>{activity.label}</strong>
                  <span>{activity.detail}</span>
                  <Link
                    href={`/review/${activity.module}` as Route}
                    onClick={() => setRead((current) => [...new Set([...current, index])])}
                  >
                    Open {activity.module.replaceAll('-', ' ')}
                  </Link>
                </div>
                {!seen ? <span className="review-activity__unread" aria-label="Unread" /> : null}
              </li>
            );
          })}
        </ul>
        <footer>Representative review events · no live notifications are queried.</footer>
      </div>
    </details>
  );
}
