import type { PreviewSurface } from './preview-surfaces';

export const extraPreviewSurfaces = {
  workflows: {
    label: 'Workflow operations',
    eyebrow: 'TEMPORAL OPERATIONS',
    description:
      'Operate durable workflow executions, task queues, retries, signals, cancellations, approvals, and restart-safe long-running business processes.',
    metrics: [
      { label: 'Running workflows', value: '386', detail: 'Preview sample' },
      { label: 'Waiting timers', value: '214', detail: 'Preview sample' },
      { label: 'Retrying activities', value: '7', detail: 'Preview sample' },
      { label: 'Stuck workflows', value: '0', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Running',
        tone: 'info',
        items: ['order-confirmation/10431', 'recovery/8801', 'campaign/oct-weekend'],
      },
      {
        title: 'Waiting',
        tone: 'warning',
        items: ['refund/2031 · approval', 'recovery/8784 · 3h timer', 'shipping/10402 · provider'],
      },
      {
        title: 'Completed',
        tone: 'success',
        items: ['confirmation/10402', 'return/2008', 'campaign/vip-1009'],
      },
    ],
    rows: [
      {
        primary: 'recovery/8784',
        secondary: 'Recovery sequence v7',
        status: 'Waiting',
        tone: 'warning',
        meta: 'Timer wakes in 2h 41m · attempt 1/2',
      },
      {
        primary: 'order-confirmation/10431',
        secondary: 'Order confirmation v12',
        status: 'Running',
        tone: 'info',
        meta: 'Activity: customer contact · retry policy 3 attempts',
      },
      {
        primary: 'refund/2031',
        secondary: 'High-value refund v3',
        status: 'Approval',
        tone: 'warning',
        meta: 'Action digest frozen · approver required',
      },
    ],
    insightTitle: 'Durability posture',
    insights: [
      'Workflow IDs are deterministic per business aggregate and purpose.',
      'Retries, timeouts, cancellation, and version markers are explicit rather than implicit worker behavior.',
      'Restart evidence proves workflows survive worker and Temporal server restarts without duplicate side effects.',
    ],
    nextActions: ['Inspect workflow history', 'Send workflow signal', 'Review retry policy'],
  },
  configuration: {
    label: 'Configuration studio',
    eyebrow: 'VERSIONED CONFIGURATION',
    description:
      'Compile business profile, policies, templates, automation settings, and operational defaults into versioned, diffable, approvable tenant configuration.',
    metrics: [
      { label: 'Published version', value: 'v42', detail: 'Preview sample' },
      { label: 'Draft changes', value: '11', detail: 'Preview sample' },
      { label: 'Needs approval', value: '3', detail: 'Preview sample' },
      { label: 'Rollback points', value: '12', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Inputs',
        tone: 'info',
        items: ['Business profile', 'Support policy', 'Campaign defaults'],
      },
      {
        title: 'Validation',
        tone: 'warning',
        items: ['2 policy conflicts', '1 missing template', '8 valid changes'],
      },
      {
        title: 'Published',
        tone: 'success',
        items: ['v42 · current', 'v41 · rollback-ready', 'v40 · archived'],
      },
    ],
    rows: [
      {
        primary: 'Support SLA policy',
        secondary: 'Draft change',
        status: 'Valid',
        tone: 'success',
        meta: 'First response 5m → 4m · no approval required',
      },
      {
        primary: 'Refund threshold',
        secondary: 'Draft change',
        status: 'Approval',
        tone: 'warning',
        meta: 'EGP 2,000 → EGP 3,000 · finance policy impact',
      },
      {
        primary: 'Campaign quiet hours',
        secondary: 'Draft change',
        status: 'Conflict',
        tone: 'danger',
        meta: 'Overlaps regional send window for Asia/Riyadh',
      },
    ],
    insightTitle: 'Compiler guarantees',
    insights: [
      'Published configuration is immutable and addressable by version.',
      'Diff and validation happen before any apply operation.',
      'Rollback restores a known published version rather than replaying arbitrary mutation scripts.',
    ],
    nextActions: ['Review configuration diff', 'Validate draft', 'Prepare publish approval'],
  },
  simulation: {
    label: 'Configuration simulation',
    eyebrow: 'SAFE DRY RUN',
    description:
      'Run synthetic business events through policy, automation, AI-tool, approval, and provider-intent planning without mutating tenant state or calling real providers.',
    metrics: [
      { label: 'Scenarios', value: '18', detail: 'Preview sample' },
      { label: 'Policy decisions', value: '42', detail: 'Preview sample' },
      { label: 'Planned actions', value: '27', detail: 'Preview sample' },
      { label: 'Provider calls', value: '0', detail: 'Hard guarantee' },
    ],
    lanes: [
      {
        title: 'Synthetic event',
        tone: 'info',
        items: ['COD order EGP 4,600', 'VIP recovery cart', 'High-value refund'],
      },
      {
        title: 'Plan',
        tone: 'warning',
        items: ['Approval required', '2 typed actions', '1 durable wait'],
      },
      {
        title: 'Outcome',
        tone: 'success',
        items: ['No mutation', 'No provider call', 'Trace generated'],
      },
    ],
    rows: [
      {
        primary: 'SIM-2044',
        secondary: 'COD order EGP 4,600',
        status: 'Needs approval',
        tone: 'warning',
        meta: 'Would contact customer, wait 30m, then re-evaluate',
      },
      {
        primary: 'SIM-2041',
        secondary: 'Recovery opportunity',
        status: 'Safe',
        tone: 'success',
        meta: 'Would suppress because a newer order exists',
      },
      {
        primary: 'SIM-2038',
        secondary: 'Refund EGP 6,200',
        status: 'Blocked',
        tone: 'danger',
        meta: 'Missing finance approval evidence',
      },
    ],
    insightTitle: 'Simulation evidence',
    insights: [
      'Simulation executes policy and planning logic against synthetic context only.',
      'Expected commands, approvals, timers, provider intents, and estimated cost are shown before publish.',
      'The simulation runtime cannot write production tables or use production connector credentials.',
    ],
    nextActions: ['Run scenario', 'Compare draft vs published', 'Export simulation trace'],
  },
  'ai-tools': {
    label: 'AI tool registry',
    eyebrow: 'TYPED AI ACTIONS',
    description:
      'Review versioned tool schemas, permission requirements, risk, approval rules, sensitivity, retries, and canonical command mappings exposed to AI operators.',
    metrics: [
      { label: 'Registered tools', value: '46', detail: 'Preview sample' },
      { label: 'Read-only tools', value: '19', detail: 'Preview sample' },
      { label: 'Approval-gated', value: '14', detail: 'Preview sample' },
      { label: 'Critical tools', value: '6', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Read',
        tone: 'info',
        items: ['customers.search', 'orders.get', 'knowledge.retrieve'],
      },
      {
        title: 'Mutate',
        tone: 'warning',
        items: ['tickets.assign', 'orders.confirm', 'campaigns.draft'],
      },
      {
        title: 'Critical',
        tone: 'danger',
        items: ['refunds.issue', 'billing.plan.change', 'developer.key.rotate'],
      },
    ],
    rows: [
      {
        primary: 'orders.confirm@1',
        secondary: 'Canonical order command',
        status: 'Medium risk',
        tone: 'warning',
        meta: 'commerce.orders.confirm · idempotency required',
      },
      {
        primary: 'knowledge.retrieve@2',
        secondary: 'Scoped retrieval',
        status: 'Read only',
        tone: 'success',
        meta: 'Tenant/resource filters mandatory · citations returned',
      },
      {
        primary: 'refunds.issue@1',
        secondary: 'Canonical refund command',
        status: 'Critical',
        tone: 'danger',
        meta: 'Approval + MFA + finance permission required',
      },
    ],
    insightTitle: 'Tool safety model',
    insights: [
      'AI receives typed schemas rather than arbitrary SQL, shell, or raw HTTP access.',
      'Tool authorization is evaluated with the same tenant, permission, risk, approval, and idempotency model as human commands.',
      'Every invocation records tool version, inputs, decision, latency, result summary, and cost correlation.',
    ],
    nextActions: ['Inspect tool schema', 'Review operator allowlists', 'Run safety evaluation'],
  },
  'ai-routing': {
    label: 'AI gateway & routing',
    eyebrow: 'MODEL CONTROL PLANE',
    description:
      'Route workloads across deterministic, local, economical, strong, and human paths using language, capability, risk, latency, cost, and context policies.',
    metrics: [
      { label: 'Requests 24h', value: '84.2k', detail: 'Preview sample' },
      { label: 'Local-model share', value: '63%', detail: 'Preview sample' },
      { label: 'Fallback rate', value: '2.8%', detail: 'Preview sample' },
      { label: 'P95 latency', value: '1.9s', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Fast/local',
        tone: 'success',
        items: ['Intent classification', 'Moderation', 'Entity extraction'],
      },
      {
        title: 'Economical',
        tone: 'info',
        items: ['Support drafting', 'Lead qualification', 'Summaries'],
      },
      {
        title: 'Strong/human',
        tone: 'warning',
        items: ['Complex reasoning', 'High-risk recommendation', 'Escalation'],
      },
    ],
    rows: [
      {
        primary: 'support.reply',
        secondary: 'Arabic customer support',
        status: 'Economical',
        tone: 'info',
        meta: 'Primary model + local moderation · max 2.2s',
      },
      {
        primary: 'moderation.message',
        secondary: 'Inbound safety',
        status: 'Local',
        tone: 'success',
        meta: 'Deterministic/local route · no external model cost',
      },
      {
        primary: 'refund.recommendation',
        secondary: 'High-risk reasoning',
        status: 'Human gate',
        tone: 'warning',
        meta: 'Strong model advisory only · typed action still approval-gated',
      },
    ],
    insightTitle: 'Routing policy',
    insights: [
      'Routing policy is workload- and risk-aware rather than a single-model default.',
      'Local models absorb repetitive classification and extraction when evaluation thresholds are met.',
      'Fallbacks, provider errors, latency, token usage, and tenant cost are measured centrally.',
    ],
    nextActions: ['Inspect routing policy', 'Compare model quality', 'Review provider spend'],
  },
  'custom-data': {
    label: 'Custom data',
    eyebrow: 'TENANT DATA MODEL',
    description:
      'Create governed tenant tables, typed fields, records, validation, indexes, permissions, import/export, automation triggers, and AI tools without arbitrary tenant SQL.',
    metrics: [
      { label: 'Custom tables', value: '8', detail: 'Preview sample' },
      { label: 'Records', value: '24.7k', detail: 'Preview sample' },
      { label: 'Indexed fields', value: '17', detail: 'Preview sample' },
      { label: 'Automations', value: '12', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Schema',
        tone: 'info',
        items: ['Retail branches', 'Supplier scorecards', 'Warranty claims'],
      },
      {
        title: 'Validation',
        tone: 'warning',
        items: ['2 required-field warnings', '1 index suggestion', '0 permission leaks'],
      },
      {
        title: 'Ready',
        tone: 'success',
        items: ['Store visits', 'B2B accounts', 'Field service jobs'],
      },
    ],
    rows: [
      {
        primary: 'retail_branches',
        secondary: '2,184 records',
        status: 'Active',
        tone: 'success',
        meta: '9 fields · 3 indexes · row permissions enabled',
      },
      {
        primary: 'supplier_scorecards',
        secondary: '486 records',
        status: 'Active',
        tone: 'success',
        meta: 'Automation event on score change',
      },
      {
        primary: 'warranty_claims',
        secondary: 'Draft schema',
        status: 'Review',
        tone: 'warning',
        meta: 'Missing index on serial_number',
      },
    ],
    insightTitle: 'Custom-data boundaries',
    insights: [
      'Tenant-defined schemas map to governed platform metadata rather than raw database DDL.',
      'Row and field permissions are explicit and testable.',
      'Imports, API access, automation events, and AI tools reuse the same schema validation.',
    ],
    nextActions: ['Open schema designer', 'Import records', 'Review permissions'],
  },
  admin: {
    label: 'Admin control center',
    eyebrow: 'PLATFORM OPERATIONS',
    description:
      'Operate tenant, integration, workflow, webhook, outbox, dead-letter, AI, usage, billing, and system health with safe audited remediation controls.',
    metrics: [
      { label: 'Healthy tenants', value: '98.7%', detail: 'Preview sample' },
      { label: 'Degraded integrations', value: '7', detail: 'Preview sample' },
      { label: 'Dead letters', value: '14', detail: 'Preview sample' },
      { label: 'Critical alerts', value: '0', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Healthy',
        tone: 'success',
        items: ['API', 'Temporal workers', 'Outbox dispatcher'],
      },
      {
        title: 'Attention',
        tone: 'warning',
        items: ['7 provider connections', '14 dead letters', '2 cost spikes'],
      },
      {
        title: 'Remediation',
        tone: 'info',
        items: ['Retry delivery', 'Reconcile connection', 'Suspend tenant'],
      },
    ],
    rows: [
      {
        primary: 'Tenant acme-egypt',
        secondary: 'Integration health',
        status: 'Degraded',
        tone: 'warning',
        meta: 'WhatsApp token validation failed · no data loss',
      },
      {
        primary: 'Outbox partition 14',
        secondary: 'Delivery pipeline',
        status: 'Healthy',
        tone: 'success',
        meta: 'Lag 1.2s · 0 poison events',
      },
      {
        primary: 'AI spend anomaly',
        secondary: 'Tenant delta-retail',
        status: 'Review',
        tone: 'warning',
        meta: '+38% vs 7-day baseline',
      },
    ],
    insightTitle: 'Safe operations',
    insights: [
      'Admin remediation is typed and audited rather than direct database editing.',
      'Tenant suspension preserves data and immutable audit evidence.',
      'Health views correlate workflow, provider, queue, AI, usage, and billing signals.',
    ],
    nextActions: ['Open incident view', 'Inspect dead letters', 'Review tenant health'],
  },
  governance: {
    label: 'Data governance',
    eyebrow: 'RETENTION & PRIVACY',
    description:
      'Control retention, export, deletion, anonymization, consent, media lifecycle, AI traces, raw webhook cleanup, secret rotation, suspension, and tenant deletion evidence.',
    metrics: [
      { label: 'Retention policies', value: '12', detail: 'Preview sample' },
      { label: 'Pending exports', value: '3', detail: 'Preview sample' },
      { label: 'Deletion jobs', value: '1', detail: 'Preview sample' },
      { label: 'Rotation due', value: '4', detail: 'Preview sample' },
    ],
    lanes: [
      {
        title: 'Policies',
        tone: 'info',
        items: ['Audit: retained', 'Raw webhooks: 30d', 'Media: tenant policy'],
      },
      {
        title: 'Requests',
        tone: 'warning',
        items: ['3 exports', '1 deletion', '2 anonymization reviews'],
      },
      {
        title: 'Compliant',
        tone: 'success',
        items: ['Consent ledger', 'AI trace cleanup', 'Secret rotation history'],
      },
    ],
    rows: [
      {
        primary: 'GOV-882',
        secondary: 'Customer export request',
        status: 'Processing',
        tone: 'info',
        meta: 'Customer 360 + messages + orders · encrypted archive',
      },
      {
        primary: 'GOV-879',
        secondary: 'Customer deletion request',
        status: 'Approval',
        tone: 'warning',
        meta: 'Legal retention exceptions detected',
      },
      {
        primary: 'Webhook cleanup',
        secondary: 'Raw delivery bodies',
        status: 'Healthy',
        tone: 'success',
        meta: '30-day policy · next run 02:00 UTC',
      },
    ],
    insightTitle: 'Governance guarantees',
    insights: [
      'Deletion and anonymization respect legal/audit retention boundaries rather than blind cascading deletes.',
      'Exports are tenant-scoped, access-controlled, time-bounded, and auditable.',
      'Provider secrets and sensitive traces have explicit rotation and cleanup lifecycles.',
    ],
    nextActions: ['Review retention policies', 'Open privacy requests', 'Inspect secret rotations'],
  },
} as const satisfies Record<string, PreviewSurface>;

export type ExtraPreviewSurfaceKey = keyof typeof extraPreviewSurfaces;
