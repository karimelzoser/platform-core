import Link from 'next/link';
import { LocalizedText } from './display-locale';

export default function NotFound() {
  return (
    <main className="global-state">
      <div className="global-state__copy">
        <p className="ds-eyebrow">404</p>
        <h1>
          <LocalizedText en="Workspace not found" ar="مساحة العمل غير موجودة" />
        </h1>
        <p>
          <LocalizedText
            en="The requested product route is not part of the current platform map. Use the review home to choose an available module."
            ar="المسار المطلوب ليس ضمن خريطة المنصة الحالية. استخدم الرئيسية لاختيار وحدة متاحة للمراجعة."
          />
        </p>
      </div>
      <div className="global-state__actions">
        <Link className="ds-button ds-button--primary" href="/">
          <LocalizedText en="Open product review" ar="فتح مراجعة المنتج" />
        </Link>
      </div>
    </main>
  );
}
