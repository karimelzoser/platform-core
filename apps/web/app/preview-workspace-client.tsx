'use client';

import { useMemo, useState } from 'react';
import { LocalizedText, useDisplayLocale } from './display-locale';
import type { PreviewSurface } from './preview-surfaces';
import { MetricCard, StatusBadge, SurfaceCard } from './ui-primitives';

export function PreviewWorkspaceClient({ config }: { config: PreviewSurface }) {
  const { locale } = useDisplayLocale();
  const [query, setQuery] = useState('');
  const [activeLane, setActiveLane] = useState<string>('ALL');
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const lanes = useMemo(
    () =>
      config.lanes
        .filter((lane) => activeLane === 'ALL' || lane.title === activeLane)
        .map((lane) => ({
          ...lane,
          items: normalizedQuery
            ? lane.items.filter((item) => item.toLocaleLowerCase().includes(normalizedQuery))
            : lane.items,
        })),
    [activeLane, config.lanes, normalizedQuery],
  );

  const rows = useMemo(
    () =>
      normalizedQuery
        ? config.rows.filter((row) =>
            [row.primary, row.secondary, row.status, row.meta]
              .join(' ')
              .toLocaleLowerCase()
              .includes(normalizedQuery),
          )
        : config.rows,
    [config.rows, normalizedQuery],
  );

  function simulateAction(action: string) {
    setNotice(
      locale === 'ar'
        ? `معاينة فقط: «${action}». لم يتم حفظ أي تغيير أو استدعاء أي خدمة خلفية.`
        : `Preview only: “${action}”. No change was persisted and no backend service was called.`,
    );
  }

  return (
    <>
      <div className="ds-metric-grid preview-metrics">
        {config.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
          />
        ))}
      </div>

      <SurfaceCard className="preview-toolbar-card">
        <div className="preview-toolbar">
          <label className="preview-search">
            <span>
              <LocalizedText en="Search preview" ar="بحث في المعاينة" />
            </span>
            <input
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={locale === 'ar' ? 'ابحث عن عنصر أو حالة…' : 'Find an item or status…'}
              type="search"
              value={query}
            />
          </label>
          <div className="preview-filter-group" aria-label="Workflow lane filter">
            <button
              className="preview-filter"
              data-active={activeLane === 'ALL'}
              onClick={() => {
                setActiveLane('ALL');
              }}
              type="button"
            >
              <LocalizedText en="All lanes" ar="كل المراحل" />
            </button>
            {config.lanes.map((lane) => (
              <button
                className="preview-filter"
                data-active={activeLane === lane.title}
                key={lane.title}
                onClick={() => {
                  setActiveLane(lane.title);
                }}
                type="button"
              >
                {lane.title}
              </button>
            ))}
          </div>
        </div>
        <div className="preview-toolbar__summary" aria-live="polite">
          <span>
            <LocalizedText en="Visible queue items" ar="العناصر الظاهرة" />: <strong>{rows.length}</strong>
          </span>
          {query ? (
            <button
              className="preview-clear"
              onClick={() => {
                setQuery('');
                setActiveLane('ALL');
              }}
              type="button"
            >
              <LocalizedText en="Clear filters" ar="مسح التصفية" />
            </button>
          ) : null}
        </div>
      </SurfaceCard>

      <section className="preview-grid preview-grid--main" aria-label={`${config.label} workflow`}>
        <SurfaceCard className="preview-board-card">
          <div className="preview-section-heading">
            <div>
              <p className="ds-eyebrow">
                <LocalizedText en="WORKFLOW" ar="سير العمل" />
              </p>
              <h2>
                <LocalizedText en="Operational board" ar="لوحة العمليات" />
              </h2>
            </div>
            <StatusBadge tone="neutral">
              <LocalizedText en="Sample state" ar="حالة تجريبية" />
            </StatusBadge>
          </div>
          <div className="preview-board">
            {lanes.map((lane) => (
              <section className="preview-lane" key={lane.title}>
                <div className="preview-lane__heading">
                  <h3>{lane.title}</h3>
                  <StatusBadge tone={lane.tone}>{lane.items.length}</StatusBadge>
                </div>
                {lane.items.length ? (
                  <ul>
                    {lane.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="preview-lane__empty">
                    <LocalizedText en="No matching items." ar="لا توجد عناصر مطابقة." />
                  </p>
                )}
              </section>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="preview-insight-card">
          <div className="preview-section-heading">
            <div>
              <p className="ds-eyebrow">
                <LocalizedText en="SIGNALS" ar="المؤشرات" />
              </p>
              <h2>{config.insightTitle}</h2>
            </div>
          </div>
          <ul className="preview-insight-list">
            {config.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      <SurfaceCard>
        <div className="preview-section-heading">
          <div>
            <p className="ds-eyebrow">
              <LocalizedText en="WORK QUEUE" ar="قائمة العمل" />
            </p>
            <h2>
              <LocalizedText en="Current items" ar="العناصر الحالية" />
            </h2>
          </div>
          <span className="preview-muted">
            <LocalizedText en="Representative data only" ar="بيانات تمثيلية فقط" />
          </span>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                <th>
                  <LocalizedText en="Item" ar="العنصر" />
                </th>
                <th>
                  <LocalizedText en="Context" ar="السياق" />
                </th>
                <th>
                  <LocalizedText en="Status" ar="الحالة" />
                </th>
                <th>
                  <LocalizedText en="Details" ar="التفاصيل" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.primary}-${row.secondary}`}>
                  <td data-label="Item / العنصر">
                    <strong>{row.primary}</strong>
                  </td>
                  <td data-label="Context / السياق">{row.secondary}</td>
                  <td data-label="Status / الحالة">
                    <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
                  </td>
                  <td data-label="Details / التفاصيل" className="preview-muted">
                    {row.meta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="preview-no-results" role="status">
              <strong>
                <LocalizedText en="No matching queue items" ar="لا توجد عناصر مطابقة" />
              </strong>
              <span>
                <LocalizedText
                  en="Change the search or clear the active filters."
                  ar="غيّر البحث أو امسح عوامل التصفية الحالية."
                />
              </span>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="preview-section-heading">
          <div>
            <p className="ds-eyebrow">
              <LocalizedText en="NEXT ACTIONS" ar="الإجراءات التالية" />
            </p>
            <h2>
              <LocalizedText en="Product controls" ar="أدوات المنتج" />
            </h2>
          </div>
        </div>
        <div className="preview-actions-grid">
          {config.nextActions.map((action, index) => (
            <button
              className={
                index === 0 ? 'ds-button ds-button--primary' : 'ds-button ds-button--secondary'
              }
              key={action}
              onClick={() => {
                simulateAction(action);
              }}
              type="button"
            >
              {action}
            </button>
          ))}
        </div>
        {notice ? (
          <p className="preview-action-notice" role="status">
            {notice}
          </p>
        ) : (
          <p className="preview-muted preview-footnote">
            <LocalizedText
              en="These controls are safe local simulations. They let you test interaction and feedback now without persisting data or calling backend services."
              ar="هذه الأدوات محاكاة محلية آمنة تتيح اختبار التفاعل والرسائل الآن بدون حفظ بيانات أو استدعاء خدمات الخلفية."
            />
          </p>
        )}
      </SurfaceCard>
    </>
  );
}
