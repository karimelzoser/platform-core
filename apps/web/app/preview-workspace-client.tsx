'use client';

import { useMemo, useState } from 'react';
import type { PreviewRow, PreviewSurface } from './preview-surfaces';

interface PreviewWorkspaceClientProps {
  config: PreviewSurface;
}

type View = 'board' | 'queue' | 'insights';

export function PreviewWorkspaceClient({ config }: PreviewWorkspaceClientProps) {
  const [view, setView] = useState<View>('board');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selected, setSelected] = useState<PreviewRow | null>(config.rows[0] ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const statuses = useMemo(
    () => ['ALL', ...Array.from(new Set(config.rows.map((row) => row.status)))],
    [config.rows],
  );
  const filteredRows = useMemo(() => {
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
    setNotice(`${action} simulated locally. No backend state or provider was changed.`);
  }

  return (
    <div className="preview-console">
      <div className="preview-console__toolbar">
        <div className="preview-tabs" role="tablist" aria-label={`${config.label} views`}>
          {(['board', 'queue', 'insights'] as const).map((item) => (
            <button
              aria-selected={view === item}
              className="preview-tab"
              data-active={view === item || undefined}
              key={item}
              onClick={() => setView(item)}
              role="tab"
              type="button"
            >
              {item === 'board' ? 'Workflow' : item === 'queue' ? 'Work queue' : 'Signals'}
            </button>
          ))}
        </div>
        <div className="preview-console__filters">
          <label>
            <span className="sr-only">Search current items</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items…"
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
        <div className="preview-local-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss preview notice" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      {view === 'board' ? (
        <section className="preview-grid preview-grid--main" aria-label={`${config.label} workflow`}>
          <div className="ds-surface-card preview-board-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">WORKFLOW</p>
                <h2>Operational board</h2>
              </div>
              <span className="preview-mode-pill">Local state</span>
            </div>
            <div className="preview-board">
              {config.lanes.map((lane) => (
                <section className="preview-lane" key={lane.title}>
                  <div className="preview-lane__heading">
                    <h3>{lane.title}</h3>
                    <span className="preview-count">{lane.items.length}</span>
                  </div>
                  <ul>
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
          </div>

          <aside className="ds-surface-card preview-insight-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">TODAY</p>
                <h2>Operator focus</h2>
              </div>
            </div>
            <div className="preview-focus-stack">
              {config.metrics.slice(0, 3).map((metric, index) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <div className="preview-progress" aria-hidden="true">
                    <span style={{ width: `${74 - index * 17}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      {view === 'queue' ? (
        <section className="preview-queue-layout">
          <div className="ds-surface-card preview-queue-card">
            <div className="preview-section-heading">
              <div>
                <p className="ds-eyebrow">WORK QUEUE</p>
                <h2>Current items</h2>
              </div>
              <span className="preview-muted">{filteredRows.length} visible</span>
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
                  {filteredRows.map((row) => (
                    <tr data-selected={selected?.primary === row.primary || undefined} key={row.primary}>
                      <td data-label="Item">
                        <button className="preview-row-button" onClick={() => setSelected(row)} type="button">
                          {row.primary}
                        </button>
                      </td>
                      <td data-label="Context">{row.secondary}</td>
                      <td data-label="Status">
                        <span className="preview-status" data-tone={row.tone}>
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
              {filteredRows.length === 0 ? (
                <div className="preview-empty-state">No preview items match the current filters.</div>
              ) : null}
            </div>
          </div>

          <aside className="ds-surface-card preview-detail-panel" aria-live="polite">
            {selected ? (
              <>
                <p className="ds-eyebrow">DETAIL</p>
                <h2>{selected.primary}</h2>
                <p className="preview-detail-panel__context">{selected.secondary}</p>
                <span className="preview-status" data-tone={selected.tone}>
                  {selected.status}
                </span>
                <dl>
                  <div>
                    <dt>Operational context</dt>
                    <dd>{selected.meta}</dd>
                  </div>
                  <div>
                    <dt>Data source</dt>
                    <dd>Deterministic product-review fixture</dd>
                  </div>
                  <div>
                    <dt>Mutation mode</dt>
                    <dd>Local simulation only</dd>
                  </div>
                </dl>
                <div className="preview-detail-actions">
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
              <p>Select an item to inspect its product-review detail state.</p>
            )}
          </aside>
        </section>
      ) : null}

      {view === 'insights' ? (
        <section className="preview-grid preview-grid--signals">
          <div className="ds-surface-card">
            <p className="ds-eyebrow">SIGNALS</p>
            <h2>{config.insightTitle}</h2>
            <ul className="preview-insight-list">
              {config.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </div>
          <div className="ds-surface-card">
            <p className="ds-eyebrow">SIMULATION</p>
            <h2>Available product controls</h2>
            <div className="preview-actions-grid">
              {config.nextActions.map((action, index) => (
                <button
                  className={
                    index === 0 ? 'ds-button ds-button--primary' : 'ds-button ds-button--secondary'
                  }
                  key={action}
                  onClick={() => simulate(action)}
                  type="button"
                >
                  {action}
                </button>
              ))}
            </div>
            <p className="preview-muted preview-footnote">
              Preview actions exercise interaction states only. They intentionally cannot call APIs,
              mutate tenant data, or invoke providers.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
