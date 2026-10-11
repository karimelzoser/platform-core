import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LocalizedText } from '../display-locale';
import {
  isPlatformPreviewSurface,
  platformPreviewSurfaces,
} from '../preview-platform-surfaces';
import { isPreviewSurface, previewSurfaces, type PreviewSurface } from '../preview-surfaces';
import { PreviewWorkspaceClient } from '../preview-workspace-client';
import { PageHeader, PageShell, Stack, StatusBadge, SurfaceCard } from '../ui-primitives';

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

        <PreviewWorkspaceClient config={config} />
      </Stack>
    </PageShell>
  );
}
