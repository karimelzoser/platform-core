export type PreviewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface PreviewMetric {
  label: string;
  value: string;
  detail: string;
}

export interface PreviewLane {
  title: string;
  tone: PreviewTone;
  items: readonly string[];
}

export interface PreviewRow {
  primary: string;
  secondary: string;
  status: string;
  tone: PreviewTone;
  meta: string;
}

export interface PreviewSurface {
  label: string;
  eyebrow: string;
  description: string;
  metrics: readonly PreviewMetric[];
  lanes: readonly PreviewLane[];
  rows: readonly PreviewRow[];
  insightTitle: string;
  insights: readonly string[];
  nextActions: readonly string[];
}

export const previewSurfaces = {
  confirmation: {
    label: 'Order confirmation',
    eyebrow: 'COMMERCE OPERATIONS',
    description:
      'Review confirmation readiness, customer contact outcomes, duplicate risk, and orders that require a human decision before shipping.',
    metrics: [
      { label: 'Awaiting contact', value: '24', detail: 'Preview sample' },
      { label: 'Confirmed today', value: '118', detail: 'Preview sample' },
      { label: 'Duplicate review', value: '7', detail: 'Preview sample' },
      { label: 'SLA at risk', value: '5', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['ORD-10431 · WhatsApp', 'ORD-10428 · Phone', 'ORD-10417 · Messenger'] },
      { title: 'Waiting customer', tone: 'warning', items: ['ORD-10399 · retry in 45m', 'ORD-10388 · second attempt', 'ORD-10371 · address question'] },
      { title: 'Ready', tone: 'success', items: ['ORD-10402 · confirmed', 'ORD-10396 · payment verified', 'ORD-10391 · shipping-ready'] },
    ],
    rows: [
      { primary: 'ORD-10431', secondary: 'Mona Ahmed · Cairo', status: 'Contact due', tone: 'warning', meta: 'EGP 1,840 · WhatsApp preferred' },
      { primary: 'ORD-10428', secondary: 'Youssef Ali · Giza', status: 'New', tone: 'info', meta: 'EGP 2,410 · COD' },
      { primary: 'ORD-10402', secondary: 'Nour Hassan · Alexandria', status: 'Confirmed', tone: 'success', meta: 'EGP 990 · card paid' },
    ],
    insightTitle: 'Confirmation signals',
    insights: ['High-value COD orders are concentrated in Cairo.', 'Two duplicate candidates share phone and delivery address.', 'Five contacts will breach the confirmation SLA within one hour.'],
    nextActions: ['Open confirmation queue', 'Review duplicate candidates', 'Inspect SLA policy'],
  },
  sales: {
    label: 'Sales',
    eyebrow: 'PIPELINE',
    description:
      'Qualify CRM-backed leads, manage pipelines and opportunities, coordinate next actions, and expose structured AI signals without duplicating customer identity.',
    metrics: [
      { label: 'Open pipeline', value: 'EGP 1.84m', detail: 'Preview sample' },
      { label: 'Qualified leads', value: '64', detail: 'Preview sample' },
      { label: 'Due today', value: '17', detail: 'Preview sample' },
      { label: 'Weighted forecast', value: 'EGP 742k', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Qualified', tone: 'info', items: ['LEAD-219 · 82 score', 'LEAD-214 · 78 score', 'LEAD-207 · 74 score'] },
      { title: 'Proposal', tone: 'warning', items: ['OPP-118 · EGP 140k', 'OPP-114 · EGP 85k', 'OPP-109 · EGP 61k'] },
      { title: 'Commit', tone: 'success', items: ['OPP-103 · 90%', 'OPP-098 · 85%', 'OPP-091 · 80%'] },
    ],
    rows: [
      { primary: 'OPP-118', secondary: 'Nile Commerce Group', status: 'Proposal', tone: 'warning', meta: 'EGP 140k · 60% · owner: Salma' },
      { primary: 'OPP-103', secondary: 'Delta Retail', status: 'Commit', tone: 'success', meta: 'EGP 220k · 90% · next call today' },
      { primary: 'LEAD-219', secondary: 'Cairo Home', status: 'Qualified', tone: 'info', meta: 'Score 82 · WhatsApp + website activity' },
    ],
    insightTitle: 'Sales signals',
    insights: ['Three high-value opportunities have no next action after today.', 'Lead qualification is CRM-referenced rather than a duplicate contact store.', 'AI recommendations are advisory and remain typed, auditable signals.'],
    nextActions: ['Open pipeline board', 'Review due activities', 'Inspect lead scoring'],
  },
  campaigns: {
    label: 'Campaigns',
    eyebrow: 'OUTBOUND',
    description:
      'Build frozen audiences, enforce consent and suppression, launch deterministic batches, and measure receipts, cost, conversion, and attribution.',
    metrics: [
      { label: 'Draft campaigns', value: '6', detail: 'Preview sample' },
      { label: 'Scheduled recipients', value: '4,820', detail: 'Preview sample' },
      { label: 'Suppressed', value: '312', detail: 'Preview sample' },
      { label: 'Attributed revenue', value: 'EGP 96.4k', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Draft', tone: 'neutral', items: ['Winter launch', 'VIP reactivation', 'COD confirmation nurture'] },
      { title: 'Scheduled', tone: 'info', items: ['Weekend offer · 18:00', 'Loyalty reminder · 20:00', 'B2B newsletter · Tue'] },
      { title: 'Running', tone: 'success', items: ['October WhatsApp · 68%', 'Email cross-sell · 91%', 'Recovery assist · 43%'] },
    ],
    rows: [
      { primary: 'October WhatsApp', secondary: '3,200 frozen recipients', status: 'Running', tone: 'success', meta: '2,176 sent · 36 conversions' },
      { primary: 'Weekend offer', secondary: '940 frozen recipients', status: 'Scheduled', tone: 'info', meta: 'Africa/Cairo · 18:00' },
      { primary: 'VIP reactivation', secondary: '420 estimated audience', status: 'Draft', tone: 'neutral', meta: 'Approval required before launch' },
    ],
    insightTitle: 'Campaign controls',
    insights: ['Audience snapshots are immutable after launch.', 'Successful recipients are never duplicated on retry.', 'Suppression and consent checks run before provider intent is created.'],
    nextActions: ['Open campaign builder', 'Review suppression', 'Inspect attribution'],
  },
  automation: {
    label: 'Automation studio',
    eyebrow: 'ORCHESTRATION',
    description:
      'Design durable typed workflows using triggers, conditions, branches, waits, approvals, and canonical platform actions—without arbitrary tenant code execution.',
    metrics: [
      { label: 'Published workflows', value: '14', detail: 'Preview sample' },
      { label: 'Running now', value: '286', detail: 'Preview sample' },
      { label: 'Awaiting approval', value: '9', detail: 'Preview sample' },
      { label: 'Failed 24h', value: '3', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Triggers', tone: 'info', items: ['Order created', 'Message received', 'Recovery eligible'] },
      { title: 'Decisions', tone: 'warning', items: ['COD > threshold', 'Customer opted out?', 'Approval required?'] },
      { title: 'Actions', tone: 'success', items: ['Send template', 'Create shipment', 'Update canonical status'] },
    ],
    rows: [
      { primary: 'Order confirmation', secondary: 'v12 · published', status: 'Healthy', tone: 'success', meta: '128 active runs · Temporal-backed waits' },
      { primary: 'Recovery sequence', secondary: 'v7 · published', status: 'Healthy', tone: 'success', meta: '41 active runs · 2 approvals' },
      { primary: 'High-value refund', secondary: 'v3 · draft', status: 'Draft', tone: 'neutral', meta: 'Policy gate not published' },
    ],
    insightTitle: 'Execution model',
    insights: ['Only registered typed actions can mutate platform state.', 'Durable waits and retries belong to Temporal rather than browser state.', 'Approvals bind to the exact action digest before execution.'],
    nextActions: ['Open workflow builder', 'Review active runs', 'Inspect failed executions'],
  },
  operators: {
    label: 'AI operators',
    eyebrow: 'TRUSTWORTHY AI',
    description:
      'Configure specialized operators with scoped knowledge, typed tool allowlists, evaluation thresholds, spend controls, and explicit autonomy modes.',
    metrics: [
      { label: 'Configured operators', value: '9', detail: 'Preview sample' },
      { label: 'Copilot mode', value: '4', detail: 'Preview sample' },
      { label: 'Approval mode', value: '3', detail: 'Preview sample' },
      { label: 'Autonomous mode', value: '2', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Customer ops', tone: 'info', items: ['Support operator', 'Order operator', 'Returns operator'] },
      { title: 'Revenue', tone: 'warning', items: ['Sales operator', 'Recovery operator', 'Campaign assistant'] },
      { title: 'Control', tone: 'success', items: ['Moderator', 'Lead qualification', 'Shipping operator'] },
    ],
    rows: [
      { primary: 'Support operator', secondary: 'COPILOT', status: 'Eval 96%', tone: 'success', meta: '8 tools · support knowledge scope' },
      { primary: 'Recovery operator', secondary: 'APPROVAL', status: 'Eval 94%', tone: 'success', meta: '5 tools · offer actions gated' },
      { primary: 'Campaign assistant', secondary: 'COPILOT', status: 'Eval 91%', tone: 'warning', meta: 'No direct send permission' },
    ],
    insightTitle: 'AI safety model',
    insights: ['Operators never write directly to the database or providers.', 'Mode changes do not bypass command risk or approval policy.', 'Prompt, model, tool, latency, and cost evidence remain auditable.'],
    nextActions: ['Review operator policies', 'Inspect eval results', 'Open tool registry'],
  },
  knowledge: {
    label: 'Knowledge',
    eyebrow: 'RAG & CONTENT',
    description:
      'Manage tenant-scoped sources, ingestion freshness, access controls, retrieval quality, and citation-ready knowledge for users and AI operators.',
    metrics: [
      { label: 'Indexed sources', value: '42', detail: 'Preview sample' },
      { label: 'Documents', value: '3,184', detail: 'Preview sample' },
      { label: 'Fresh < 7d', value: '91%', detail: 'Preview sample' },
      { label: 'Retrieval pass', value: '95%', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Sources', tone: 'info', items: ['Help center', 'Policies', 'Product catalog'] },
      { title: 'Ingestion', tone: 'warning', items: ['2 sources stale', '1 parser warning', '7 queued documents'] },
      { title: 'Ready', tone: 'success', items: ['Arabic FAQ', 'Shipping policy', 'Returns policy'] },
    ],
    rows: [
      { primary: 'Support handbook', secondary: '1,246 chunks', status: 'Fresh', tone: 'success', meta: 'Updated 2h ago · support scope' },
      { primary: 'Return policy', secondary: '84 chunks', status: 'Fresh', tone: 'success', meta: 'Updated yesterday · commerce scope' },
      { primary: 'Legacy catalog', secondary: '612 chunks', status: 'Stale', tone: 'warning', meta: 'Last synced 12 days ago' },
    ],
    insightTitle: 'Retrieval controls',
    insights: ['Every retrieval is tenant- and resource-scoped.', 'Citations preserve source identity and freshness metadata.', 'Prompt-injection and cross-tenant retrieval tests remain mandatory gates.'],
    nextActions: ['Review stale sources', 'Run retrieval evaluation', 'Inspect access scopes'],
  },
  analytics: {
    label: 'Analytics & ROI',
    eyebrow: 'MEASUREMENT',
    description:
      'Measure customer operations, commerce, recovery, campaigns, automation, AI usage, provider cost, and business outcomes from canonical events.',
    metrics: [
      { label: 'Revenue influenced', value: 'EGP 412k', detail: 'Preview sample' },
      { label: 'Support containment', value: '61%', detail: 'Preview sample' },
      { label: 'Recovery ROI', value: '7.4×', detail: 'Preview sample' },
      { label: 'AI cost / outcome', value: 'EGP 3.80', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Customer ops', tone: 'info', items: ['First response 4m', 'SLA pass 96%', 'CSAT 4.6/5'] },
      { title: 'Revenue', tone: 'success', items: ['Recovery +12%', 'Campaign ROAS 5.2×', 'Pipeline +8%'] },
      { title: 'Cost', tone: 'warning', items: ['AI EGP 18.4k', 'Provider EGP 42.1k', 'Automation EGP 6.7k'] },
    ],
    rows: [
      { primary: 'Recovery', secondary: 'Attributed revenue', status: '+12.4%', tone: 'success', meta: 'EGP 134k influenced' },
      { primary: 'Campaigns', secondary: 'Attributed revenue', status: '5.2× ROAS', tone: 'success', meta: 'EGP 96.4k influenced' },
      { primary: 'AI operators', secondary: 'Provider + model cost', status: 'Within budget', tone: 'info', meta: 'EGP 18.4k · 84% budget' },
    ],
    insightTitle: 'Measurement principles',
    insights: ['Dashboards consume canonical events and usage records, not screen-scraped state.', 'Cost is allocated by tenant, provider, model, and bounded dimensions.', 'ROI metrics link operational actions to measurable business outcomes.'],
    nextActions: ['Open executive dashboard', 'Inspect cost allocation', 'Review attribution model'],
  },
  billing: {
    label: 'Billing & usage',
    eyebrow: 'COMMERCIAL',
    description:
      'Review plan entitlements, measured usage, quotas, provider cost allocation, overages, subscription state, and invoices from the canonical usage ledger.',
    metrics: [
      { label: 'Current plan', value: 'Growth', detail: 'Preview sample' },
      { label: 'Monthly usage', value: '72%', detail: 'Preview sample' },
      { label: 'Provider cost', value: 'EGP 42.1k', detail: 'Preview sample' },
      { label: 'Projected overage', value: 'EGP 4.8k', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Entitlements', tone: 'info', items: ['50 team seats', '250k messages', '20 AI operators'] },
      { title: 'Usage', tone: 'warning', items: ['Messages 78%', 'AI tokens 69%', 'Storage 54%'] },
      { title: 'State', tone: 'success', items: ['Subscription active', 'No suspension', 'Invoice current'] },
    ],
    rows: [
      { primary: 'Messaging', secondary: '195,400 / 250,000', status: '78%', tone: 'warning', meta: 'Reset in 19 days' },
      { primary: 'AI usage', secondary: 'Canonical meter family', status: '69%', tone: 'info', meta: 'Provider cost EGP 18.4k' },
      { primary: 'Team seats', secondary: '18 / 50', status: '36%', tone: 'success', meta: 'No overage risk' },
    ],
    insightTitle: 'Commercial controls',
    insights: ['Billing reads the append-only canonical usage ledger.', 'Entitlements gate features independently from UI visibility.', 'Suspension hooks never delete tenant data or audit history.'],
    nextActions: ['Review plan', 'Inspect usage ledger', 'Open invoices'],
  },
  developer: {
    label: 'Developer platform',
    eyebrow: 'APIS & WEBHOOKS',
    description:
      'Manage scoped API keys, outbound webhooks, delivery logs, rate limits, signing, rotation, revocation, and developer documentation.',
    metrics: [
      { label: 'Active API keys', value: '7', detail: 'Preview sample' },
      { label: 'Webhook endpoints', value: '5', detail: 'Preview sample' },
      { label: 'Deliveries 24h', value: '18.2k', detail: 'Preview sample' },
      { label: 'Failed deliveries', value: '14', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'API keys', tone: 'info', items: ['ERP read/write', 'BI read-only', 'Warehouse integration'] },
      { title: 'Webhooks', tone: 'success', items: ['orders.*', 'customers.updated', 'shipping.updated'] },
      { title: 'Attention', tone: 'warning', items: ['1 key rotation due', '14 webhook failures', '2 rate-limit spikes'] },
    ],
    rows: [
      { primary: 'ERP integration', secondary: 'orders:read orders:write', status: 'Active', tone: 'success', meta: 'Rotated 21 days ago' },
      { primary: 'Analytics warehouse', secondary: 'analytics:read', status: 'Active', tone: 'success', meta: 'Rate limit 300 rpm' },
      { primary: 'orders.updated', secondary: 'Webhook endpoint', status: 'Degraded', tone: 'warning', meta: '11 retries · signed delivery' },
    ],
    insightTitle: 'Developer controls',
    insights: ['API key secrets are shown only at creation and stored hashed.', 'Webhook deliveries are signed, retried, and dead-lettered deterministically.', 'Scopes map to canonical platform permissions and tenant boundaries.'],
    nextActions: ['Manage API keys', 'Review webhook logs', 'Open API documentation'],
  },
  settings: {
    label: 'Organization settings',
    eyebrow: 'TENANT CONTROL',
    description:
      'Configure organization identity, locale, timezone, security policy, business profile, operational defaults, and governance boundaries.',
    metrics: [
      { label: 'Configuration status', value: '92%', detail: 'Preview sample' },
      { label: 'MFA policy', value: 'Privileged', detail: 'Preview sample' },
      { label: 'Active members', value: '18', detail: 'Preview sample' },
      { label: 'Connected systems', value: '6', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Organization', tone: 'info', items: ['Locale: English / Arabic', 'Timezone: Africa/Cairo', 'Currency: EGP'] },
      { title: 'Security', tone: 'success', items: ['Privileged MFA required', 'Last-owner protection', 'Approval policy active'] },
      { title: 'Governance', tone: 'warning', items: ['Retention review due', '1 secret rotation due', '2 stale integrations'] },
    ],
    rows: [
      { primary: 'Business profile', secondary: 'Egypt · EGP · E-commerce', status: 'Complete', tone: 'success', meta: 'Updated this month' },
      { primary: 'Security policy', secondary: 'MFA for privileged actions', status: 'Enforced', tone: 'success', meta: 'Approval required to change' },
      { primary: 'Data retention', secondary: 'Operational events', status: 'Review', tone: 'warning', meta: 'Policy review due in 12 days' },
    ],
    insightTitle: 'Governance posture',
    insights: ['Security-sensitive changes remain canonical commands.', 'Locale and timezone feed downstream automation and campaign behavior.', 'Configuration is designed to become versioned, diffable, approvable, and rollbackable.'],
    nextActions: ['Edit organization profile', 'Review security', 'Open governance settings'],
  },
} as const satisfies Record<string, PreviewSurface>;

export type PreviewSurfaceKey = keyof typeof previewSurfaces;

export function isPreviewSurface(value: string): value is PreviewSurfaceKey {
  return value in previewSurfaces;
}
