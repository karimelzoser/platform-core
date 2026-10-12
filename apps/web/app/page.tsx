import Link from 'next/link';
import { previewGroups, previewSurfaces } from './product-preview/preview-data';
import styles from './product-preview/preview.module.css';

export default function HomePage() {
  const moduleCount = Object.keys(previewSurfaces).length;

  return (
    <main className={styles.shell}>
      <div className={styles.home}>
        <section className={styles.homeHero} aria-labelledby="platform-title">
          <div className={styles.homeHeroMain}>
            <p className={styles.eyebrow}>PRENEURA PLATFORM · PRODUCT REVIEW</p>
            <h1 id="platform-title">One operating system for customer operations and revenue.</h1>
            <p>
              Review the full product structure without waiting for hosted backend services. Every module below uses deterministic sample data, while the real tenant/API routes remain untouched for backend integration and production acceptance later.
            </p>
          </div>
          <aside className={styles.homeHeroAside}>
            <div>
              <strong>Frontend-first review mode</strong>
              <p>
                No Keycloak, Postgres, Temporal, provider credentials, or API availability is required to inspect these screens.
              </p>
            </div>
            <Link className={styles.buttonSecondary} href="/product-preview/inbox">
              Start product tour
            </Link>
          </aside>
        </section>

        <section className={styles.summaryGrid} aria-label="Product review summary">
          <div className={styles.summaryItem}>
            <strong>{moduleCount} surfaces</strong>
            <span>mapped into one coherent product</span>
          </div>
          <div className={styles.summaryItem}>
            <strong>Backend independent</strong>
            <span>all review screens use sample state</span>
          </div>
          <div className={styles.summaryItem}>
            <strong>RTL + LTR</strong>
            <span>shared direction control remains available</span>
          </div>
          <div className={styles.summaryItem}>
            <strong>Production-safe</strong>
            <span>real routes and canonical command boundaries are unchanged</span>
          </div>
        </section>

        {previewGroups.map((group) => (
          <section className={styles.group} key={group.title}>
            <header className={styles.groupHeading}>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
            </header>
            <nav className={styles.moduleGrid} aria-label={group.title}>
              {group.slugs.map((slug) => {
                const module = previewSurfaces[slug];
                return (
                  <Link className={styles.moduleCard} href={`/product-preview/${slug}`} key={slug}>
                    <div className={styles.moduleCardTop}>
                      <strong>{module.shortLabel}</strong>
                      <span className={styles.status} data-tone={module.liveRoute ? 'success' : 'info'}>
                        {module.liveRoute ? 'Live + preview' : 'Preview'}
                      </span>
                    </div>
                    <p>{module.description}</p>
                    <span className={styles.moduleCardFooter}>Open backend-independent workspace →</span>
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}
      </div>
    </main>
  );
}
