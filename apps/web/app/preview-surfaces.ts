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

function makeSurface(input: {
  label: string;
  eyebrow: string;
  description: string;
  metrics: readonly [string, string][];
  queue: readonly [string, string, string, PreviewTone, string][];
  insights: readonly string[];
  actions: readonly string[];
}): PreviewSurface {
  const rows = input.queue.map(([primary, secondary, status, tone, meta]) => ({
    primary,
    secondary,
    status,
    tone,
    meta,
  }));
  return {
    label: input.label,
    eyebrow: input.eyebrow,
    description: input.description,
    metrics: input.metrics.map(([label, value]) => ({
      label,
      value,
      detail: 'Representative review data',
    })),
    lanes: [
      {
        title: 'New',
        tone: 'info',
        items: rows.slice(0, 2).map((row) => `${row.primary} · ${row.status}`),
      },
      {
        title: 'Needs attention',
        tone: 'warning',
        items: rows.slice(1, 3).map((row) => `${row.primary} · ${row.secondary}`),
      },
      {
        title: 'Healthy',
        tone: 'success',
        items: rows.slice(-2).map((row) => `${row.primary} · ${row.status}`),
      },
    ],
    rows,
    insightTitle: `${input.label} signals`,
    insights: input.insights,
    nextActions: input.actions,
  };
}

export const previewSurfaces = {
  confirmation: makeSurface({
    label: 'Order confirmation',
    eyebrow: 'COMMERCE OPERATIONS',
    description:
      'Review confirmation readiness, customer contact outcomes, duplicate risk, and orders that require a human decision before shipping.',
    metrics: [
      ['Awaiting contact', '24'],
      ['Confirmed today', '118'],
      ['Duplicate review', '7'],
      ['SLA at risk', '5'],
    ],
    queue: [
      [
        'ORD-10431',
        'Mona Ahmed · Cairo',
        'Contact due',
        'warning',
        'EGP 1,840 · WhatsApp preferred',
      ],
      ['ORD-10428', 'Youssef Ali · Giza', 'New', 'info', 'EGP 2,410 · COD'],
      ['ORD-10402', 'Nour Hassan · Alexandria', 'Confirmed', 'success', 'EGP 990 · card paid'],
    ],
    insights: [
      'High-value COD orders are concentrated in Cairo.',
      'Two duplicate candidates share phone and delivery address.',
      'Five contacts will breach the confirmation SLA within one hour.',
    ],
    actions: ['Open confirmation queue', 'Review duplicate candidates', 'Inspect SLA policy'],
  }),
  returns: makeSurface({
    label: 'Returns & refunds',
    eyebrow: 'POST-PURCHASE',
    description:
      'Operate return, exchange, inspection, resolution, restock, and refund decisions without mixing them into the original order aggregate.',
    metrics: [
      ['Open requests', '18'],
      ['Awaiting inspection', '6'],
      ['Refund approvals', '4'],
      ['Exchange value', 'EGP 12.8k'],
    ],
    queue: [
      ['RET-2031', 'Order ORD-10377', 'Eligible', 'success', 'Exchange · 1 item · EGP 780'],
      ['RET-2028', 'Order ORD-10355', 'Inspection', 'warning', 'Refund · damage evidence attached'],
      [
        'RET-2019',
        'Order ORD-10312',
        'Approval',
        'warning',
        'EGP 2,950 · finance approval required',
      ],
    ],
    insights: [
      'Size-related exchanges are the largest request category.',
      'One SKU has repeated damage reports and should be reviewed.',
      'Refunds over threshold remain approval-gated.',
    ],
    actions: ['Review eligibility queue', 'Open inspection workspace', 'Audit refund approvals'],
  }),
  recovery: makeSurface({
    label: 'Recovery',
    eyebrow: 'REVENUE RECOVERY',
    description:
      'Prioritize eligible abandoned journeys, suppress unsafe outreach, coordinate attempts and offers, and attribute recovered revenue to the exact opportunity.',
    metrics: [
      ['Eligible now', '73'],
      ['In sequence', '41'],
      ['Recovered today', 'EGP 34.6k'],
      ['Suppressed', '19'],
    ],
    queue: [
      [
        'REC-8801',
        'Cart value EGP 2,740',
        'Qualified',
        'info',
        'WhatsApp consent valid · no recent order',
      ],
      [
        'REC-8784',
        'Cart value EGP 1,320',
        'Attempt 1',
        'warning',
        'Offer: free shipping · expires in 3h',
      ],
      [
        'REC-8768',
        'Recovered order ORD-10420',
        'Recovered',
        'success',
        'Attributed value EGP 3,680',
      ],
    ],
    insights: [
      'Suppression blocks outreach after a later purchase.',
      'Recovered orders remain linked to the originating opportunity.',
      'Channel cost and conversion stay visible together.',
    ],
    actions: [
      'Review eligible opportunities',
      'Inspect suppression reasons',
      'Open attribution report',
    ],
  }),
  sales: makeSurface({
    label: 'Sales',
    eyebrow: 'PIPELINE',
    description:
      'Qualify CRM-backed leads, manage pipelines and opportunities, coordinate next actions, and expose structured AI signals without duplicating customer identity.',
    metrics: [
      ['Open pipeline', 'EGP 1.84m'],
      ['Qualified leads', '64'],
      ['Due today', '17'],
      ['Weighted forecast', 'EGP 742k'],
    ],
    queue: [
      ['OPP-118', 'Nile Commerce Group', 'Proposal', 'warning', 'EGP 140k · 60% · owner: Salma'],
      ['OPP-103', 'Delta Retail', 'Commit', 'success', 'EGP 220k · 90% · next call today'],
      ['LEAD-219', 'Cairo Home', 'Qualified', 'info', 'Score 82 · WhatsApp + website activity'],
    ],
    insights: [
      'Three high-value opportunities have no next action after today.',
      'Lead qualification references CRM identity.',
      'AI recommendations remain advisory and auditable.',
    ],
    actions: ['Open pipeline board', 'Review due activities', 'Inspect lead scoring'],
  }),
  campaigns: makeSurface({
    label: 'Campaigns',
    eyebrow: 'OUTBOUND',
    description:
      'Build frozen audiences, enforce consent and suppression, launch deterministic batches, and measure receipts, cost, conversion, and attribution.',
    metrics: [
      ['Draft campaigns', '6'],
      ['Scheduled recipients', '4,820'],
      ['Suppressed', '312'],
      ['Attributed revenue', 'EGP 96.4k'],
    ],
    queue: [
      [
        'October WhatsApp',
        '3,200 frozen recipients',
        'Running',
        'success',
        '2,176 sent · 36 conversions',
      ],
      ['Weekend offer', '940 frozen recipients', 'Scheduled', 'info', 'Africa/Cairo · 18:00'],
      [
        'VIP reactivation',
        '420 estimated audience',
        'Draft',
        'neutral',
        'Approval required before launch',
      ],
    ],
    insights: [
      'Audience snapshots are immutable after launch.',
      'Successful recipients are never duplicated on retry.',
      'Consent and suppression run before provider intent.',
    ],
    actions: ['Open campaign builder', 'Review suppression', 'Inspect attribution'],
  }),
  automation: makeSurface({
    label: 'Automation studio',
    eyebrow: 'ORCHESTRATION',
    description:
      'Design durable typed workflows using triggers, conditions, branches, waits, approvals, and canonical platform actions without arbitrary tenant code execution.',
    metrics: [
      ['Published workflows', '14'],
      ['Running now', '286'],
      ['Awaiting approval', '9'],
      ['Failed 24h', '3'],
    ],
    queue: [
      [
        'Order confirmation',
        'v12 · published',
        'Healthy',
        'success',
        '128 active runs · Temporal-backed waits',
      ],
      ['Recovery sequence', 'v7 · published', 'Healthy', 'success', '41 active runs · 2 approvals'],
      ['High-value refund', 'v3 · draft', 'Draft', 'neutral', 'Policy gate not published'],
    ],
    insights: [
      'Only registered typed actions can mutate platform state.',
      'Durable waits and retries belong to Temporal.',
      'Approvals bind to exact action digests.',
    ],
    actions: ['Open workflow builder', 'Review active runs', 'Inspect failed executions'],
  }),
  operators: makeSurface({
    label: 'AI operators',
    eyebrow: 'TRUSTWORTHY AI',
    description:
      'Configure specialized operators with scoped knowledge, typed tool allowlists, evaluation thresholds, spend controls, and explicit autonomy modes.',
    metrics: [
      ['Configured operators', '9'],
      ['Copilot mode', '4'],
      ['Approval mode', '3'],
      ['Autonomous mode', '2'],
    ],
    queue: [
      ['Support operator', 'COPILOT', 'Eval 96%', 'success', '8 tools · support knowledge scope'],
      ['Recovery operator', 'APPROVAL', 'Eval 94%', 'success', '5 tools · offer actions gated'],
      ['Campaign assistant', 'COPILOT', 'Eval 91%', 'warning', 'No direct send permission'],
    ],
    insights: [
      'Operators never write directly to databases or providers.',
      'Autonomy mode never bypasses policy.',
      'Prompt, model, tool, latency, and cost remain auditable.',
    ],
    actions: ['Review operator policies', 'Inspect eval results', 'Open tool registry'],
  }),
  knowledge: makeSurface({
    label: 'Knowledge',
    eyebrow: 'RAG & CONTENT',
    description:
      'Manage tenant-scoped sources, ingestion freshness, access controls, retrieval quality, and citation-ready knowledge for users and AI operators.',
    metrics: [
      ['Indexed sources', '42'],
      ['Documents', '3,184'],
      ['Fresh < 7d', '91%'],
      ['Retrieval pass', '95%'],
    ],
    queue: [
      [
        'Help center',
        'Public support content',
        'Healthy',
        'success',
        '1,240 documents · synced 2h ago',
      ],
      ['Policies', 'Restricted operations', 'Healthy', 'success', '418 documents · ACL scoped'],
      ['Product catalog', 'Commerce knowledge', 'Stale', 'warning', 'Last full sync 8d ago'],
    ],
    insights: [
      'Retrieval remains tenant and access scoped.',
      'Citations expose source provenance.',
      'Stale sources are visible before operator use.',
    ],
    actions: ['Add knowledge source', 'Inspect retrieval quality', 'Review stale sources'],
  }),
  analytics: makeSurface({
    label: 'Analytics & ROI',
    eyebrow: 'BUSINESS OUTCOMES',
    description:
      'Measure operational throughput, provider cost, automation value, AI cost, conversion, recovery, and attributable revenue from canonical events.',
    metrics: [
      ['Revenue influenced', 'EGP 1.26m'],
      ['Recovered revenue', 'EGP 214k'],
      ['Automation savings', '386h'],
      ['AI/provider cost', 'EGP 18.7k'],
    ],
    queue: [
      [
        'Customer operations',
        'Support + tickets',
        'Healthy',
        'success',
        'FRT down 22% month over month',
      ],
      ['Recovery', 'Attributed orders', 'Growing', 'success', 'EGP 214k recovered'],
      ['AI operators', 'Usage + spend', 'Watch', 'warning', 'Cost/order increased 6%'],
    ],
    insights: [
      'ROI uses measured canonical events rather than estimated counters.',
      'Provider cost is separated from platform value.',
      'Attribution keeps source workflow and order evidence.',
    ],
    actions: ['Open executive dashboard', 'Review cost drivers', 'Export report'],
  }),
  billing: makeSurface({
    label: 'Billing & usage',
    eyebrow: 'COMMERCIAL CONTROL',
    description:
      'Review plan entitlements, canonical meter usage, quota state, overages, provider cost allocation, invoices, and suspension boundaries.',
    metrics: [
      ['Plan', 'Growth'],
      ['Usage period', '68%'],
      ['Projected overage', 'EGP 2.4k'],
      ['Provider cost', 'EGP 18.7k'],
    ],
    queue: [
      ['Messages', '1.2m / 1.5m', 'Healthy', 'success', '80% quota consumed'],
      ['AI tool calls', '88k / 100k', 'Watch', 'warning', '88% quota consumed'],
      ['Automation runs', '241k / 500k', 'Healthy', 'success', '48% quota consumed'],
    ],
    insights: [
      'Billing consumes the canonical usage ledger.',
      'Entitlements gate capabilities before execution.',
      'Suspension hooks remain explicit and auditable.',
    ],
    actions: ['Review usage', 'Compare plans', 'Inspect invoice'],
  }),
  developer: makeSurface({
    label: 'Developer platform',
    eyebrow: 'APIS & WEBHOOKS',
    description:
      'Manage scoped API keys, rotation, revocation, rate limits, signed outbound webhooks, delivery retries, logs, and developer documentation.',
    metrics: [
      ['Active API keys', '8'],
      ['Webhook endpoints', '12'],
      ['Deliveries 24h', '18.4k'],
      ['Failed deliveries', '23'],
    ],
    queue: [
      ['Production API', 'orders:read customers:read', 'Active', 'success', 'Rotates in 21d'],
      ['ERP webhook', 'order.updated', 'Healthy', 'success', '99.98% delivery success'],
      ['Warehouse webhook', 'shipment.created', 'Degraded', 'warning', '23 retrying deliveries'],
    ],
    insights: [
      'API keys are hashed, scoped, rotatable, and revocable.',
      'Outbound webhook signatures are verifiable.',
      'Dead-lettered deliveries remain inspectable and retryable.',
    ],
    actions: ['Create API key', 'Add webhook', 'Inspect delivery logs'],
  }),
  settings: makeSurface({
    label: 'Organization settings',
    eyebrow: 'TENANT CONFIGURATION',
    description:
      'Review business profile, locale, timezone, security, notification, data-governance, and platform behavior settings in one governed workspace.',
    metrics: [
      ['Locale', 'ar-EG'],
      ['Timezone', 'Africa/Cairo'],
      ['MFA policy', 'Privileged'],
      ['Data retention', '365d'],
    ],
    queue: [
      [
        'Business profile',
        'Egypt · EGP · B2C',
        'Configured',
        'success',
        'Onboarding profile complete',
      ],
      ['Security', 'MFA + roles', 'Configured', 'success', 'Privileged actions protected'],
      ['Retention', 'Customer + audit data', 'Review', 'warning', 'One policy awaiting approval'],
    ],
    insights: [
      'High-risk configuration changes use canonical approvals.',
      'Published configuration remains versioned and auditable.',
      'Security policy never lives only in the browser.',
    ],
    actions: ['Edit profile', 'Review security', 'Open governance policy'],
  }),
} satisfies Record<string, PreviewSurface>;

export type PreviewSurfaceKey = keyof typeof previewSurfaces;

export function isPreviewSurface(value: string): value is PreviewSurfaceKey {
  return value in previewSurfaces;
}
