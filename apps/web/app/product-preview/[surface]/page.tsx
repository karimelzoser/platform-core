import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isPreviewSurface, previewGroups, previewSurfaces } from '../preview-data';
import styles from '../preview.module.css';

export default async function ProductPreviewSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface } = await params;
  if (!isPreviewSurface(surface)) notFound();

  const config = previewSurfaces[surface];

  return (
    <main className={styles.shell} aria-labelledby="preview-title">
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Product review navigation">
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark}>P</span>
            <span className={styles.brandCopy}>
              <strong>PRENEURA</strong>
              <span>Product review</span>
            </span>
          </Link>

          <div className={styles.previewBadge}>
            Backend-independent review mode. All values on these screens are deterministic sample data.
          </div>

          {previewGroups.map((group) => (
            <nav className={styles.navGroup} aria-label={group.title} key={group.title}>
              <p className={styles.navGroupTitle}>{group.title}</p>
              <div className={styles.navList}>
                {group.slugs.map((slug) => {
                  const item = previewSurfaces[slug];
                  const active = slug === surface;
                  return (
                    <Link
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                      href={`/product-preview/${slug}`}
                      key={slug}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span>{item.shortLabel}</span>
                      <span className={styles.navDot} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </nav>
          ))}
        </aside>

        <section className={styles.main}>
          <div className={styles.topbar}>
            <div className={styles.breadcrumbs}>
              <Link href="/">Platform</Link>
              <span aria-hidden="true">/</span>
              <span>Product review</span>
              <span aria-hidden="true">/</span>
              <strong>{config.shortLabel}</strong>
            </div>
            <div className={styles.topbarActions}>
              <span className={styles.environment}>Sample tenant · Cairo</span>
              <span className={styles.avatar} aria-label="Preview user">
                KM
              </span>
            </div>
          </div>

          <header className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>{config.eyebrow}</p>
              <h1 id="preview-title">{config.label}</h1>
              <p>{config.description}</p>
            </div>
            <div className={styles.heroActions}>
              <Link className={styles.buttonSecondary} href="/">
                All modules
              </Link>
              {config.liveRoute ? (
                <Link className={styles.button} href={config.liveRoute}>
                  Open live route
                </Link>
              ) : (
                <span className={styles.button} aria-disabled="true">
                  Backend binding pending
                </span>
              )}
            </div>
          </header>

          <div className={styles.previewNotice} role="note">
            <div>
              <strong>Frontend product review — no backend required</strong>
              This workspace is intentionally isolated from production data and external providers. It exists to review information architecture, workflow shape, responsive behavior, RTL, and visual hierarchy while backend work continues separately.
            </div>
            <span className={styles.noticePill}>SAMPLE DATA</span>
          </div>

          <section className={styles.metricGrid} aria-label={`${config.label} key metrics`}>
            {config.metrics.map((metric) => (
              <article className={styles.metricCard} key={metric.label}>
                <span className={styles.metricLabel}>{metric.label}</span>
                <strong className={styles.metricValue}>{metric.value}</strong>
                <span className={styles.metricDetail}>{metric.detail}</span>
              </article>
            ))}
          </section>

          <section className={styles.contentGrid}>
            <div>
              <article className={styles.card}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>WORKFLOW</p>
                    <h2>Operational board</h2>
                  </div>
                  <span>Representative state</span>
                </header>
                <div className={styles.board}>
                  {config.lanes.map((lane) => (
                    <section className={styles.lane} key={lane.title}>
                      <div className={styles.laneHeader}>
                        <h3>{lane.title}</h3>
                        <span className={styles.count}>{lane.items.length}</span>
                      </div>
                      <ul>
                        {lane.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>

              <article className={`${styles.card} ${styles.tableCard}`}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>WORK QUEUE</p>
                    <h2>Current items</h2>
                  </div>
                  <span>Sample records only</span>
                </header>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Context</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.rows.map((row) => (
                        <tr key={`${row.primary}-${row.secondary}`}>
                          <td><strong>{row.primary}</strong></td>
                          <td>{row.secondary}</td>
                          <td>
                            <span className={styles.status} data-tone={row.tone}>
                              {row.status}
                            </span>
                          </td>
                          <td>{row.meta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <aside>
              <article className={styles.card}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>SIGNALS</p>
                    <h2>{config.insightTitle}</h2>
                  </div>
                </header>
                <ul className={styles.insights}>
                  {config.insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              </article>

              <article className={styles.card}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>RECENT ACTIVITY</p>
                    <h2>Workspace timeline</h2>
                  </div>
                </header>
                <ul className={styles.activity}>
                  {config.rows.map((row, index) => (
                    <li key={row.primary}>
                      <span className={styles.activityDot} aria-hidden="true" />
                      <span>
                        <strong>{row.primary}</strong> · {row.status}
                        <br />
                        {index === 0 ? '4 minutes ago' : index === 1 ? '18 minutes ago' : '42 minutes ago'}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.card}>
                <header className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>ACTIONS</p>
                    <h2>Product controls</h2>
                  </div>
                </header>
                <div className={styles.actionGrid}>
                  {config.nextActions.map((action) => (
                    <button className={styles.disabledAction} disabled key={action} type="button">
                      {action}
                    </button>
                  ))}
                </div>
                <p className={styles.footnote}>
                  Controls are intentionally disabled in product-review mode. Live actions will bind to canonical typed commands when their backend workstream is available.
                </p>
              </article>
            </aside>
          </section>
        </section>
      </div>
    </main>
  );
}
