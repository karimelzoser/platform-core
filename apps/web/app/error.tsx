'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { LocalizedText } from './display-locale';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('PRENEURA route error', error);
  }, [error]);

  return (
    <main className="global-state" role="alert">
      <div className="global-state__copy">
        <p className="ds-eyebrow">
          <LocalizedText en="RECOVERABLE ERROR" ar="خطأ قابل للاستعادة" />
        </p>
        <h1>
          <LocalizedText en="This workspace could not finish loading" ar="تعذر إكمال تحميل مساحة العمل" />
        </h1>
        <p>
          <LocalizedText
            en="Your current product context is preserved. Retry the view, or return to the safe product review home."
            ar="تم الحفاظ على سياق العمل الحالي. أعد محاولة تحميل العرض أو ارجع إلى الرئيسية الآمنة لمراجعة المنتج."
          />
        </p>
        {error.digest ? <code className="global-state__digest">Reference: {error.digest}</code> : null}
      </div>
      <div className="global-state__actions">
        <button className="ds-button ds-button--primary" onClick={reset} type="button">
          <LocalizedText en="Try again" ar="إعادة المحاولة" />
        </button>
        <Link className="ds-button ds-button--secondary" href="/">
          <LocalizedText en="Product review home" ar="رئيسية مراجعة المنتج" />
        </Link>
      </div>
    </main>
  );
}
