import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LocalizedText } from '../../display-locale';
import { isReviewSurface, reviewSurface } from '../../preview-registry';
import { PreviewWorkspaceClient } from '../../preview-workspace-client';
import { PageHeader, PageShell, Stack, StatusBadge } from '../../ui-primitives';

export default async function ProductReviewPage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface } = await params;
  if (!isReviewSurface(surface)) notFound();
  const config = reviewSurface(surface);
  if (!config) notFound();

  return (
    <PageShell aria-labelledby="review-surface-title" className="preview-workspace">
      <Stack gap="spacious">
        <PageHeader
          eyebrow={<LocalizedText en="PRODUCT REVIEW" ar="مراجعة المنتج" />}
          title={<span id="review-surface-title">{config.label}</span>}
          description={config.description}
          actions={
            <>
              <Link className="ds-button ds-button--secondary" href="/">
                <LocalizedText en="Review home" ar="رئيسية المراجعة" />
              </Link>
              <Link className="ds-button ds-button--primary" href={`/${surface}`}>
                <LocalizedText en="Open live route" ar="فتح المسار الحي" />
              </Link>
            </>
          }
        />

        <div className="preview-mode-banner" role="note">
          <div>
            <strong>
              <LocalizedText
                en="Safe product-review environment"
                ar="بيئة آمنة لمراجعة المنتج"
              />
            </strong>
            <span>
              <LocalizedText
                en="This route never claims the sample records are live tenant data. Use it to inspect navigation, layout, interaction, responsiveness, and RTL without requiring authentication or backend availability."
                ar="هذا المسار لا يعرض السجلات التجريبية باعتبارها بيانات حقيقية. استخدمه لمراجعة التنقل والتصميم والتفاعل والاستجابة للشاشات وRTL بدون الحاجة إلى المصادقة أو جاهزية الخلفية."
              />
            </span>
          </div>
          <StatusBadge tone="info">
            <LocalizedText en="Review mode" ar="وضع المراجعة" />
          </StatusBadge>
        </div>

        <PreviewWorkspaceClient config={config} />
      </Stack>
    </PageShell>
  );
}
