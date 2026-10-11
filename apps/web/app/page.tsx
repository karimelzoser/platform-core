import Link from 'next/link';
import { LocalizedText } from './display-locale';

const moduleGroups = [
  {
    title: ['Customer operations', 'عمليات العملاء'],
    description: [
      'Daily customer-facing work and service control.',
      'العمل اليومي مع العملاء وإدارة عمليات الخدمة.',
    ],
    modules: [
      ['inbox', 'Unified inbox', 'صندوق الوارد الموحد', 'live'],
      ['customers', 'Customer 360', 'ملف العميل 360', 'live'],
      ['tickets', 'Tickets', 'التذاكر', 'live'],
      ['confirmation', 'Order confirmation', 'تأكيد الطلبات', 'preview'],
      ['returns', 'Returns & refunds', 'المرتجعات والاسترداد', 'live'],
      ['recovery', 'Recovery', 'استرداد المبيعات', 'live'],
    ],
  },
  {
    title: ['Commerce & revenue', 'التجارة والإيرادات'],
    description: [
      'Orders, fulfillment, sales motion, campaigns, and business outcomes.',
      'الطلبات والتنفيذ والمبيعات والحملات ونتائج الأعمال.',
    ],
    modules: [
      ['orders', 'Orders', 'الطلبات', 'live'],
      ['shipping', 'Shipping', 'الشحن', 'live'],
      ['sales', 'Sales', 'المبيعات', 'preview'],
      ['campaigns', 'Campaigns', 'الحملات', 'preview'],
      ['analytics', 'Analytics & ROI', 'التحليلات والعائد', 'preview'],
      ['billing', 'Billing & usage', 'الفوترة والاستخدام', 'preview'],
    ],
  },
  {
    title: ['Automation & intelligence', 'الأتمتة والذكاء'],
    description: [
      'Durable workflows, controlled AI, knowledge, and governed actions.',
      'مسارات عمل موثوقة وذكاء اصطناعي مضبوط ومعرفة وإجراءات محكومة.',
    ],
    modules: [
      ['automation', 'Automation studio', 'استوديو الأتمتة', 'preview'],
      ['operators', 'AI operators', 'مشغلو الذكاء الاصطناعي', 'preview'],
      ['knowledge', 'Knowledge', 'المعرفة', 'preview'],
      ['approvals', 'Approvals', 'الموافقات', 'live'],
      ['integrations', 'Integrations', 'التكاملات', 'live'],
      ['runtime', 'Workflow runtime', 'تشغيل مسارات العمل', 'preview'],
    ],
  },
  {
    title: ['Platform engineering', 'هندسة المنصة'],
    description: [
      'Versioned configuration, safe simulation, extensibility, APIs, and operational control.',
      'إعدادات بإصدارات ومحاكاة آمنة وقابلية توسع وواجهات برمجية وتحكم تشغيلي.',
    ],
    modules: [
      ['configuration', 'Configuration', 'الإعدادات', 'preview'],
      ['simulation', 'Configuration simulation', 'محاكاة الإعدادات', 'preview'],
      ['custom-data', 'Custom data', 'البيانات المخصصة', 'preview'],
      ['developer', 'Developer platform', 'منصة المطورين', 'preview'],
      ['admin', 'Admin control center', 'مركز تحكم الإدارة', 'preview'],
      ['settings', 'Organization settings', 'إعدادات المؤسسة', 'preview'],
    ],
  },
  {
    title: ['Organization control', 'إدارة المؤسسة'],
    description: [
      'Tenant setup, access control, security, and reusable business configuration.',
      'تهيئة مساحة العمل والتحكم في الوصول والأمان وإعدادات الأعمال القابلة لإعادة الاستخدام.',
    ],
    modules: [
      ['onboarding', 'Onboarding', 'الإعداد الأولي', 'live'],
      ['team', 'Team & roles', 'الفريق والأدوار', 'live'],
      ['organizations', 'Organizations', 'المؤسسات', 'live'],
    ],
  },
] as const;

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
          <strong>27</strong>
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
        {moduleGroups.map((group) => (
          <section className="platform-module-group" key={group.title[0]}>
            <div className="platform-module-group__heading">
              <div>
                <p className="eyebrow">
                  <LocalizedText en="WORKSPACE" ar="مساحة العمل" />
                </p>
                <h2>
                  <LocalizedText en={group.title[0]} ar={group.title[1]} />
                </h2>
              </div>
              <p>
                <LocalizedText en={group.description[0]} ar={group.description[1]} />
              </p>
            </div>
            <nav aria-label={group.title[0]} className="platform-module-grid">
              {group.modules.map(([slug, labelEn, labelAr, status]) => (
                <Link className="platform-module-card" href={`/review/${slug}`} key={slug}>
                  <span
                    className="platform-module-card__status"
                    data-preview={status === 'preview'}
                  >
                    <LocalizedText
                      en={status === 'preview' ? 'Frontend preview' : 'Implemented module'}
                      ar={status === 'preview' ? 'معاينة واجهة' : 'وحدة منفذة'}
                    />
                  </span>
                  <strong>
                    <LocalizedText en={labelEn} ar={labelAr} />
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
