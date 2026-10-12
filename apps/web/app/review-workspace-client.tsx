'use client';

import { useMemo, useState } from 'react';
import type { PreviewRow, PreviewSurface } from './preview-surfaces';
import { ReviewSpecialty } from './review-specialty';

type View = 'workflow' | 'queue' | 'signals';

export function ReviewWorkspaceClient({
  config,
  surface,
}: {
  config: PreviewSurface;
  surface: string;
}) {
  const [view, setView] = useState<View>('workflow');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selected, setSelected] = useState<PreviewRow | null>(config.rows[0] ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const statuses = useMemo(
    () => ['ALL', ...Array.from(new Set(config.rows.map((row) => row.status)))],
    [config.rows],
  );
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return config.rows.filter((row) => {
      const matchesStatus = status === 'ALL' || row.status === status;
      const matchesQuery =
        !needle ||
        [row.primary, row.secondary, row.status, row.meta].some((value) =>
          value.toLowerCase().includes(needle),
        );
      return matchesStatus && matchesQuery;
    });
  }, [config.rows, query, status]);

  function simulate(action: string) {
    setNotice(`${action} simulated locally. No API, tenant state, workflow, or provider was changed.`);
  }

  return (
    <div className="review-console">
      <div className="review-console__toolbar">
        <div className="review-console__tabs" role="tablist" aria-label={`${config.label} review views`}>
          {(['workflow', 'queue', 'signals'] as const).map((item) => (
            <button
              aria-selected={view === item}
              className="review-console__tab"
              data-active={view === item || undefined}
              key={item}
              onClick={() => setView(item)}
              role="tab"
              type="button"
            >
              {item === 'workflow' ? 'Workflow' : item === 'queue' ? 'Work queue' : 'Signals'}
            </button>
          ))}
        </div>
        <div className="review-console__filters">
          <label>
            <span className="sr-only">Search review records</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this workspace…"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item === 'ALL' ? 'All statuses' : item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {notice ? (
        <div className="review-console__notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss simulated action notice" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      <ReviewSpecialty surface={surface} />

      {view === 'workflow' ? (
        <section className="review-console__workflow" aria-label={`${config.label} workflow review`}>
          <article className="review-console__board">
            <div className="review-console__section-heading">
              <div>
                <p className="ds-eyebrow">OPERATIONS</p>
                <h2>Workflow board</h2>
              </div>
              <span className="review-console__local-pill">Local state</span>
            </div>
            <div className="preview-board">
              {config.lanes.map((lane) => (
                <section className="preview-lane" key={lane.title}>
                  <div className="preview-lane__heading">
                    <h3>{lane.title}</h3>
                    <span className="review-console__count">{lane.items.length}</span>
                  </div>
                  <ul className="review-console__lane-list">
                    {lane.items.map((item) => (
                      <li key={item}>
                        <button onClick={() => simulate(`Opened ${item}`)} type="button">
                          <strong>{item}</strong>
                          <span>Open preview detail</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>

          <aside className="review-console__focus">
            <p className="ds-eyebrow">TODAY</p>
            <h2>Operator focus</h2>
            <div className="review-console__focus-stack">
              {config.metrics.slice(0, 3).map((metric, index) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <div className="review-console__progress" aria-hidden="true">
                    <span style={{ width: `${78 - index * 18}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      {view === 'queue' ? (
        <section className="review-console__queue-layout">
          <article className="review-console__queue">
            <div className="review-console__section-heading">
              <div>
                <p className="ds-eyebrow">WORK QUEUE</p>
                <h2>Current items</h2>
              </div>
              <span className="preview-muted">{visibleRows.length} visible</span>
            </div>
            <div className="preview-table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Context</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr data-selected={selected?.primary === row.primary || undefined} key={`${row.primary}-${row.secondary}`}>
                      <td data-label="Item">
                        <button className="review-console__row-button" onClick={() => setSelected(row)} type="button">
                          {row.primary}
                        </button>
                      </td>
                      <td data-label="Context">{row.secondary}</td>
                      <td data-label="Status">
                        <span className="review-console__status" data-tone={row.tone}>
                          {row.status}
                        </span>
                      </td>
                      <td data-label="Details" className="preview-muted">
                        {row.meta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleRows.length === 0 ? (
                <div className="review-console__empty">No review items match these filters.</div>
              ) : null}
            </div>
          </article>

          <aside className="review-console__detail" aria-live="polite">
            {selected ? (
              <>
                <p className="ds-eyebrow">DETAIL</p>
                <h2>{selected.primary}</h2>
                <p className="review-console__detail-context">{selected.secondary}</p>
                <span className="review-console__status" data-tone={selected.tone}>
                  {selected.status}
                </span>
                <dl>
                  <div>
                    <dt>Operational context</dt>
                    <dd>{selected.meta}</dd>
                  </div>
                  <div>
                    <dt>Review data</dt>
                    <dd>Deterministic local fixture</dd>
                  </div>
                  <div>
                    <dt>Mutation boundary</dt>
                    <dd>Local simulation only</dd>
                  </div>
                </dl>
                <div className="review-console__detail-actions">
                  {config.nextActions.slice(0, 2).map((action) => (
                    <button
                      className="ds-button ds-button--secondary"
                      key={action}
                      onClick={() => simulate(`${action} for ${selected.primary}`)}
                      type="button"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p>Select a row to inspect its review state.</p>
            )}
          </aside>
        </section>
      ) : null}

      {view === 'signals' ? (
        <section className="review-console__signals">
          <article>
            <p className="ds-eyebrow">SIGNALS</p>
            <h2>{config.insightTitle}</h2>
            <ul className="preview-insight-list">
              {config.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </article>
          <article>
            <p className="ds-eyebrow">SIMULATED CONTROLS</p>
            <h2>Review interaction states</h2>
            <div className="preview-actions-grid">
              {config.nextActions.map((action, index) => (
                <button
                  className={index === 0 ? 'ds-button ds-button--primary' : 'ds-button ds-button--secondary'}
                  key={action}
                  onClick={() => simulate(action)}
                  type="button"
                >
                  {action}
                </button>
              ))}
            </div>
            <p className="preview-muted preview-footnote">
              Simulated controls never call APIs, mutate tenant data, start workflows, or invoke providers.
            </p>
          </article>
        </section>
      ) : null}
    </div>
  );
}
