export type ProductGroupKey =
  | 'customer-operations'
  | 'commerce-revenue'
  | 'automation-intelligence'
  | 'platform-engineering'
  | 'organization-control';

export interface ProductGroup {
  key: ProductGroupKey;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}

export interface ProductModule {
  slug: string;
  labelEn: string;
  labelAr: string;
  group: ProductGroupKey;
  implementation: 'implemented' | 'preview';
  navigation?: 'primary' | 'secondary';
}

export const productGroups: readonly ProductGroup[] = [
  {
    key: 'customer-operations',
    titleEn: 'Customer operations',
    titleAr: 'عمليات العملاء',
    descriptionEn: 'Daily customer-facing work and service control.',
    descriptionAr: 'العمل اليومي مع العملاء وإدارة عمليات الخدمة.',
  },
  {
    key: 'commerce-revenue',
    titleEn: 'Commerce & revenue',
    titleAr: 'التجارة والإيرادات',
    descriptionEn: 'Orders, fulfillment, sales motion, campaigns, and business outcomes.',
    descriptionAr: 'الطلبات والتنفيذ والمبيعات والحملات ونتائج الأعمال.',
  },
  {
    key: 'automation-intelligence',
    titleEn: 'Automation & intelligence',
    titleAr: 'الأتمتة والذكاء',
    descriptionEn: 'Durable workflows, controlled AI, knowledge, and governed actions.',
    descriptionAr: 'مسارات عمل موثوقة وذكاء اصطناعي مضبوط ومعرفة وإجراءات محكومة.',
  },
  {
    key: 'platform-engineering',
    titleEn: 'Platform engineering',
    titleAr: 'هندسة المنصة',
    descriptionEn:
      'Versioned configuration, safe simulation, extensibility, APIs, and operational control.',
    descriptionAr: 'إعدادات بإصدارات ومحاكاة آمنة وقابلية توسع وواجهات برمجية وتحكم تشغيلي.',
  },
  {
    key: 'organization-control',
    titleEn: 'Organization control',
    titleAr: 'إدارة المؤسسة',
    descriptionEn: 'Tenant setup, access control, security, and reusable business configuration.',
    descriptionAr:
      'تهيئة مساحة العمل والتحكم في الوصول والأمان وإعدادات الأعمال القابلة لإعادة الاستخدام.',
  },
] as const;

export const productModules: readonly ProductModule[] = [
  { slug: 'inbox', labelEn: 'Unified inbox', labelAr: 'صندوق الوارد الموحد', group: 'customer-operations', implementation: 'implemented', navigation: 'primary' },
  { slug: 'customers', labelEn: 'Customer 360', labelAr: 'ملف العميل 360', group: 'customer-operations', implementation: 'implemented', navigation: 'primary' },
  { slug: 'tickets', labelEn: 'Tickets', labelAr: 'التذاكر', group: 'customer-operations', implementation: 'implemented' },
  { slug: 'confirmation', labelEn: 'Order confirmation', labelAr: 'تأكيد الطلبات', group: 'customer-operations', implementation: 'preview' },
  { slug: 'returns', labelEn: 'Returns & refunds', labelAr: 'المرتجعات والاسترداد', group: 'customer-operations', implementation: 'implemented', navigation: 'primary' },
  { slug: 'recovery', labelEn: 'Recovery', labelAr: 'استرداد المبيعات', group: 'customer-operations', implementation: 'implemented', navigation: 'primary' },

  { slug: 'orders', labelEn: 'Orders', labelAr: 'الطلبات', group: 'commerce-revenue', implementation: 'implemented', navigation: 'primary' },
  { slug: 'shipping', labelEn: 'Shipping', labelAr: 'الشحن', group: 'commerce-revenue', implementation: 'implemented', navigation: 'primary' },
  { slug: 'sales', labelEn: 'Sales', labelAr: 'المبيعات', group: 'commerce-revenue', implementation: 'preview', navigation: 'primary' },
  { slug: 'campaigns', labelEn: 'Campaigns', labelAr: 'الحملات', group: 'commerce-revenue', implementation: 'preview', navigation: 'primary' },
  { slug: 'analytics', labelEn: 'Analytics & ROI', labelAr: 'التحليلات والعائد', group: 'commerce-revenue', implementation: 'preview', navigation: 'primary' },
  { slug: 'billing', labelEn: 'Billing & usage', labelAr: 'الفوترة والاستخدام', group: 'commerce-revenue', implementation: 'preview' },

  { slug: 'automation', labelEn: 'Automation studio', labelAr: 'استوديو الأتمتة', group: 'automation-intelligence', implementation: 'preview', navigation: 'primary' },
  { slug: 'operators', labelEn: 'AI operators', labelAr: 'مشغلو الذكاء الاصطناعي', group: 'automation-intelligence', implementation: 'preview', navigation: 'primary' },
  { slug: 'knowledge', labelEn: 'Knowledge', labelAr: 'المعرفة', group: 'automation-intelligence', implementation: 'preview' },
  { slug: 'approvals', labelEn: 'Approvals', labelAr: 'الموافقات', group: 'automation-intelligence', implementation: 'implemented', navigation: 'secondary' },
  { slug: 'integrations', labelEn: 'Integrations', labelAr: 'التكاملات', group: 'automation-intelligence', implementation: 'implemented', navigation: 'secondary' },
  { slug: 'runtime', labelEn: 'Workflow runtime', labelAr: 'تشغيل مسارات العمل', group: 'automation-intelligence', implementation: 'preview' },

  { slug: 'configuration', labelEn: 'Configuration', labelAr: 'الإعدادات', group: 'platform-engineering', implementation: 'preview' },
  { slug: 'simulation', labelEn: 'Configuration simulation', labelAr: 'محاكاة الإعدادات', group: 'platform-engineering', implementation: 'preview' },
  { slug: 'custom-data', labelEn: 'Custom data', labelAr: 'البيانات المخصصة', group: 'platform-engineering', implementation: 'preview' },
  { slug: 'developer', labelEn: 'Developer platform', labelAr: 'منصة المطورين', group: 'platform-engineering', implementation: 'preview' },
  { slug: 'admin', labelEn: 'Admin control center', labelAr: 'مركز تحكم الإدارة', group: 'platform-engineering', implementation: 'preview' },
  { slug: 'settings', labelEn: 'Organization settings', labelAr: 'إعدادات المؤسسة', group: 'platform-engineering', implementation: 'preview', navigation: 'secondary' },

  { slug: 'onboarding', labelEn: 'Onboarding', labelAr: 'الإعداد الأولي', group: 'organization-control', implementation: 'implemented' },
  { slug: 'team', labelEn: 'Team & roles', labelAr: 'الفريق والأدوار', group: 'organization-control', implementation: 'implemented', navigation: 'secondary' },
  { slug: 'organizations', labelEn: 'Organizations', labelAr: 'المؤسسات', group: 'organization-control', implementation: 'implemented' },
] as const;

export function productModule(slug: string): ProductModule | undefined {
  return productModules.find((module) => module.slug === slug);
}

export function modulesForGroup(group: ProductGroupKey): readonly ProductModule[] {
  return productModules.filter((module) => module.group === group);
}

export function navigationModules(kind: 'primary' | 'secondary'): readonly ProductModule[] {
  return productModules.filter((module) => module.navigation === kind);
}
