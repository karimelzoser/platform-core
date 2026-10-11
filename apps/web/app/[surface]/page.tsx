import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LocalizedText } from '../display-locale';
import {
  isPlatformPreviewSurface,
  platformPreviewSurfaces,
} from '../preview-platform-surfaces';
import { isPreviewSurface, previewSurfaces, type PreviewSurface } from '../preview-surfaces';
import {
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';

const surfaceLabels = {
  inbox: ['Unified inbox', 'صندوق الوارد الموحد'],
  customers: ['Customer 360', 'ملف العميل 360'],
  tickets: ['Tickets', 'التذاكر'],
  orders: ['Orders', 'الطلبات'],
  confirmation: ['Order confirmation', 'تأكيد الطلبات'],
  shipping: ['Shipping', 'الشحن'],
  recovery: ['Recovery', 'استرداد المبيعات'],
  returns: ['Returns & refunds', 'المرتجعات والاسترداد'],
  sales: ['Sales', 'المبيعات'],
  campaigns: ['Campaigns', 'الحملات'],
  automation: ['Automation studio', 'استوديو الأتمتة'],
  operators: ['AI operators', 'مشغلو الذكاء الاصطناعي'],
  approvals: ['Approvals', 'الموافقات'],
  integrations: ['Integrations', 'التكاملات'],
  knowledge: ['Knowledge', 'المعرفة'],
  analytics: ['Analytics & ROI', 'التحليلات والعائد'],
  billing: ['Billing & usage', 'الفوترة والاستخدام'],
  developer: ['Developer platform', 'منصة المطورين'],
  team: ['Team & roles', 'الفريق والأدوار'],
  settings: ['Organization settings', 'إعدادات المؤسسة'],
  onboarding: ['Onboarding', 'الإعداد الأولي'],
  configuration: ['Configuration', 'الإعدادات'],
  simulation: ['Configuration simulation', 'محاكاة الإعدادات'],
  'custom-data': ['Custom data', 'البيانات المخصصة'],
  admin: ['Admin control center', 'مركز تحكم الإدارة'],
  runtime: ['Workflow runtime', 'تشغيل مسارات العمل'],
} as const;

type Surface = keyof typeof surfaceLabels;

function isSurface(value: string): value is Surface {
  return value in surfaceLabels;
}

function previewFor(surface: string): PreviewSurface | undefined {
  if (isPreviewSurface(surface)) return previewSurfaces[surface];
  if (isPlatformPreviewSurface(surface)) return platformPreviewSurfaces[surface];
  return undefined;
}

export default async function SurfacePage({ params }: { params: Promise<{ surface: string }> }) {
  const { surface } = await params;
  if (!isSurface(surface)) notFound();

  const config = previewFor(surface);
  if (!config) {
    return (
      <PageShell aria-labelledby="surface-title">
        <Stack gap="spacious">
          <PageHeader
            eyebrow={<LocalizedText en="TENANT WORKSPACE" ar="مساحة عمل المؤسسة" />}
            title={
              <span id="surface-title">
                <LocalizedText en={surfaceLabels[surface][0]} ar={surfaceLabels[surface][1]} />
              </span>
            }
            description={
              <LocalizedText
                en="This module is backed by a dedicated application route when its implementation is available."
                ar="تستخدم هذه الوحدة مسار تطبيق مخصص عند اكتمال تنفيذها."
              />
            }
            actions={
              <Link className="ds-button ds-button--secondary" href="/">
                <LocalizedText en="Platform home" ar="الرئيسية" />
              </Link>
            }
          />
          <SurfaceCard>
            <p className="preview-muted">
              <LocalizedText
                en="Use the main navigation to open the implemented operational surface. Backend-independent preview data is available only for modules still under implementation."
                ar="استخدم شريط التنقل لفتح الواجهات المنفذة. تظهر البيانات التجريبية المستقلة عن الخلفية فقط في الوحدات التي ما زالت قيد التنفيذ."
              />
            </p>
          </SurfaceCard>
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell aria-labelledby="surface-title" className="preview-workspace">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={config.eyebrow}
          title={<span id="surface-title">{config.label}</span>}
          description={config.description}
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href="/">
                <LocalizedText en="Platform home" ar="الرئيسية" />
              </Link>
              <Link className="ds-button ds-button--primary" href="/onboarding">
                <LocalizedText en="Organization setup" ar="إعداد المؤسسة" />
              </Link>
            </>
          }
        />

        <div className="preview-mode-banner" role="note">
          <div>
            <strong>
              <LocalizedText
                en="Backend-independent product preview"
                ar="معاينة المنتج بدون اعتماد على الخلفية"
              />
            </strong>
            <span>
              <LocalizedText
                en="This screen uses deterministic sample data so product structure, workflows, responsive behavior, and RTL can be reviewed before the live backend is connected."
                ar="تستخدم هذه الشاشة بيانات تجريبية ثابتة لمراجعة هيكل المنتج ومسارات العمل والاستجابة للشاشات واتجاه RTL قبل توصيل الخلفية الحية."
              />
            </span>
          </div>
          <StatusBadge tone="info">
            <LocalizedText en="Preview data" ar="بيانات تجريبية" />
          </StatusBadge>
        </div>

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
              {config.lanes.map((lane) => (
                <section className="preview-lane" key={lane.title}>
                  <div className="preview-lane__heading">
                    <h3>{lane.title}</h3>
                    <StatusBadge tone={lane.tone}>{lane.items.length}</StatusBadge>
                  </div>
                  <ul>
                    {lane.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
                {config.rows.map((row) => (
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
                disabled
                key={action}
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
          <p className="preview-muted preview-footnote">
            <LocalizedText
              en="Controls are intentionally disabled in backend-independent preview mode. Their visual and interaction states are present now; live actions will bind to canonical typed commands as each backend workstream is completed."
              ar="تم تعطيل الأزرار عمداً في وضع المعاينة المستقل عن الخلفية. حالات العرض والتفاعل موجودة الآن، وسترتبط الإجراءات الحية بالأوامر القياسية عند اكتمال كل مسار خلفي."
            />
          </p>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}
