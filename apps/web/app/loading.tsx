import { LocalizedText } from './display-locale';

export default function Loading() {
  return (
    <main className="global-state" aria-busy="true" aria-live="polite">
      <div className="global-state__copy">
        <p className="ds-eyebrow">
          <LocalizedText en="PRENEURA PLATFORM" ar="منصة PRENEURA" />
        </p>
        <h1>
          <LocalizedText en="Preparing your workspace" ar="جارٍ تجهيز مساحة العمل" />
        </h1>
        <p>
          <LocalizedText
            en="Loading the current view and preserving your product context."
            ar="جارٍ تحميل العرض الحالي مع الحفاظ على سياق العمل."
          />
        </p>
      </div>
      <div className="global-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
