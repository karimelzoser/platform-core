import Link from 'next/link';
import { LocalizedText } from './display-locale';
import { modulesForGroup, productGroups, productModules } from './product-catalog';

export default function HomePage() {
  return (
    <main className="platform-home">
      <header className="platform-hero">
        <div>
          <p className="eyebrow">PRENEURA PLATFORM</p>
          <h1>
            <LocalizedText
              en="One operating system for customer operations and revenue."
              ar="نظام تشغيل واحد لعمليات العملاء والإيرادات."
            />
          </h1>
          <p className="intro">
            <LocalizedText
              en="Review the complete product structure now. Every card opens a backend-independent review workspace; implemented modules keep their real tenant routes separately in the global navigation."
              ar="راجع هيكل المنتج بالكامل الآن. تفتح كل بطاقة مساحة مراجعة مستقلة عن الخلفية، بينما تحتفظ الوحدات المنفذة بمساراتها الحقيقية بشكل منفصل في شريط التنقل العام."
            />
          </p>
        </div>
        <div className="platform-hero__status" role="note">
          <strong>
            <LocalizedText en="Product review mode" ar="وضع مراجعة المنتج" />
          </strong>
          <span>
            <LocalizedText
              en="Frontend work can continue without waiting for the hosted backend."
              ar="يمكن مواصلة تطوير الواجهة بدون انتظار جاهزية الخلفية المستضافة."
            />
          </span>
        </div>
      </header>

      <section className="platform-summary" aria-label="Platform implementation summary">
        <div>
          <strong>{productModules.length}</strong>
          <span>
            <LocalizedText
              en="product and platform surfaces mapped"
              ar="واجهة منتج ومنصة تم تخطيطها"
            />
          </span>
        </div>
        <div>
          <strong>RTL + LTR</strong>
          <span>
            <LocalizedText en="shared interaction direction" ar="اتجاه موحد للتفاعل" />
          </span>
        </div>
        <div>
          <strong>
            <LocalizedText en="Tenant-safe" ar="عزل المؤسسات" />
          </strong>
          <span>
            <LocalizedText
              en="real routes retain canonical auth/RLS"
              ar="المسارات الحقيقية تحتفظ بالمصادقة وعزل البيانات الحقيقي"
            />
          </span>
        </div>
        <div>
          <strong>
            <LocalizedText en="Review-safe" ar="مراجعة آمنة" />
          </strong>
          <span>
            <LocalizedText
              en="sample metrics are explicitly labeled"
              ar="البيانات التجريبية مميزة بوضوح"
            />
          </span>
        </div>
      </section>

      <div className="platform-module-groups">
        {productGroups.map((group) => (
          <section className="platform-module-group" key={group.key}>
            <div className="platform-module-group__heading">
              <div>
                <p className="eyebrow">
                  <LocalizedText en="WORKSPACE" ar="مساحة العمل" />
                </p>
                <h2>
                  <LocalizedText en={group.titleEn} ar={group.titleAr} />
                </h2>
              </div>
              <p>
                <LocalizedText en={group.descriptionEn} ar={group.descriptionAr} />
              </p>
            </div>
            <nav aria-label={group.titleEn} className="platform-module-grid">
              {modulesForGroup(group.key).map((module) => (
                <Link
                  className="platform-module-card"
                  href={`/review/${module.slug}`}
                  key={module.slug}
                >
                  <span
                    className="platform-module-card__status"
                    data-preview={module.implementation === 'preview'}
                  >
                    <LocalizedText
                      en={
                        module.implementation === 'preview'
                          ? 'Frontend preview'
                          : 'Implemented module'
                      }
                      ar={module.implementation === 'preview' ? 'معاينة واجهة' : 'وحدة منفذة'}
                    />
                  </span>
                  <strong>
                    <LocalizedText en={module.labelEn} ar={module.labelAr} />
                  </strong>
                  <span>
                    <LocalizedText en="Open safe review" ar="فتح المراجعة الآمنة" />
                  </span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
      </div>
    </main>
  );
}
