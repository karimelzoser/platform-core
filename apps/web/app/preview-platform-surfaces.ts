import type { PreviewSurface } from './preview-surfaces';

export const platformPreviewSurfaces = {
  configuration: {
    label: 'Configuration',
    eyebrow: 'TENANT CONFIGURATION',
    description:
      'Review versioned tenant configuration bundles, validation, diffs, approvals, publishing, rollback, and the business policies that compile into platform behavior.',
    metrics: [
      { label: 'Published version', value: 'v18', detail: 'Preview sample' },
      { label: 'Draft changes', value: '12', detail: 'Preview sample' },
      { label: 'Approval required', value: '3', detail: 'Preview sample' },
      { label: 'Validation', value: 'Pass', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Inputs', tone: 'info', items: ['Business profile', 'Policies', 'Templates'] },
      { title: 'Compiler', tone: 'warning', items: ['Schema validation', 'Policy expansion', 'Diff generation'] },
      { title: 'Publish', tone: 'success', items: ['Approval gate', 'Idempotent apply', 'Rollback point'] },
    ],
    rows: [
      { primary: 'v19 draft', secondary: '12 changes across 4 domains', status: 'Draft', tone: 'neutral', meta: 'Created from v18' },
      { primary: 'Refund policy', secondary: 'Threshold EGP 2,500 → 3,000', status: 'Approval', tone: 'warning', meta: 'Finance policy impact' },
      { primary: 'v18', secondary: 'Current published configuration', status: 'Active', tone: 'success', meta: 'Published 6 days ago' },
    ],
    insightTitle: 'Configuration guarantees',
    insights: ['Published configuration is immutable and addressable by version.', 'High-risk diffs require approval before apply.', 'Runtime consumers use compiled canonical configuration rather than ad-hoc settings.'],
    nextActions: ['Review draft diff', 'Validate configuration', 'Publish approved version'],
  },
  simulation: {
    label: 'Configuration simulation',
    eyebrow: 'SAFE DRY RUN',
    description:
      'Simulate synthetic events against draft configuration and workflows without mutating production state or calling real providers.',
    metrics: [
      { label: 'Scenarios', value: '16', detail: 'Preview sample' },
      { label: 'Passing', value: '14', detail: 'Preview sample' },
      { label: 'Warnings', value: '5', detail: 'Preview sample' },
      { label: 'Provider calls', value: '0', detail: 'Guaranteed in simulation' },
    ],
    lanes: [
      { title: 'Synthetic event', tone: 'info', items: ['COD order EGP 4,200', 'VIP return request', 'Abandoned cart'] },
      { title: 'Decision trace', tone: 'warning', items: ['Policy matched', 'Approval requested', 'Workflow planned'] },
      { title: 'Expected state', tone: 'success', items: ['No mutation', 'Provider intent previewed', 'Cost estimated'] },
    ],
    rows: [
      { primary: 'High-value COD', secondary: 'Order confirmation scenario', status: 'Pass', tone: 'success', meta: 'Approval + WhatsApp intent expected' },
      { primary: 'Refund threshold', secondary: 'EGP 3,200 refund', status: 'Warning', tone: 'warning', meta: 'Finance approval required' },
      { primary: 'Recovery suppression', secondary: 'Customer purchased after abandon', status: 'Pass', tone: 'success', meta: 'Outreach suppressed' },
    ],
    insightTitle: 'Simulation contract',
    insights: ['Simulation cannot mutate tenant production records.', 'No connector or provider transport is invoked.', 'The trace shows policies, tools, approvals, state transitions, and estimated cost.'],
    nextActions: ['Run scenario', 'Compare draft vs published', 'Export simulation trace'],
  },
  'custom-data': {
    label: 'Custom data',
    eyebrow: 'EXTENSIBLE DATA',
    description:
      'Model tenant-defined tables, fields, validation, permissions, records, imports, exports, events, automation triggers, and AI access without arbitrary SQL.',
    metrics: [
      { label: 'Custom tables', value: '8', detail: 'Preview sample' },
      { label: 'Custom records', value: '12.4k', detail: 'Preview sample' },
      { label: 'Indexed fields', value: '17', detail: 'Preview sample' },
      { label: 'Automation uses', value: '6', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Schema', tone: 'info', items: ['Stores', 'Suppliers', 'Warranty claims'] },
      { title: 'Permissions', tone: 'warning', items: ['Row rules', 'Field visibility', 'Write roles'] },
      { title: 'Consumers', tone: 'success', items: ['Automation', 'Analytics', 'AI tools'] },
    ],
    rows: [
      { primary: 'Suppliers', secondary: '2,180 records · 14 fields', status: 'Active', tone: 'success', meta: 'Indexed: supplier_code, country' },
      { primary: 'Warranty claims', secondary: '742 records · 11 fields', status: 'Active', tone: 'success', meta: 'Automation trigger enabled' },
      { primary: 'Legacy stores', secondary: '5,900 records · 22 fields', status: 'Review', tone: 'warning', meta: '2 fields unused for 90 days' },
    ],
    insightTitle: 'Extensibility rules',
    insights: ['Tenant schemas are represented as controlled metadata, never executable SQL.', 'Row and field permissions are enforced independently from UI visibility.', 'Automation and AI use registered typed access paths.'],
    nextActions: ['Create table', 'Review permissions', 'Import records'],
  },
  admin: {
    label: 'Admin control center',
    eyebrow: 'OPERATIONS & GOVERNANCE',
    description:
      'Operate tenant health, integrations, workflows, webhooks, queues, dead letters, AI usage, spend, billing, retention, export, deletion, and audited remediation.',
    metrics: [
      { label: 'Tenants healthy', value: '98.7%', detail: 'Preview sample' },
      { label: 'Dead letters', value: '11', detail: 'Preview sample' },
      { label: 'Degraded connectors', value: '4', detail: 'Preview sample' },
      { label: 'Governance actions', value: '7', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Platform health', tone: 'success', items: ['API healthy', 'Workers healthy', 'Temporal healthy'] },
      { title: 'Attention', tone: 'warning', items: ['4 connectors degraded', '11 dead letters', '2 spend alerts'] },
      { title: 'Governance', tone: 'info', items: ['Retention', 'Data export', 'Tenant suspension'] },
    ],
    rows: [
      { primary: 'Tenant Delta Retail', secondary: 'Connector health', status: 'Degraded', tone: 'warning', meta: 'WhatsApp token refresh required' },
      { primary: 'Provider actions', secondary: 'Dead-letter queue', status: '11', tone: 'warning', meta: 'Oldest 42 minutes' },
      { primary: 'Tenant Cairo Home', secondary: 'Data export request', status: 'Approval', tone: 'info', meta: 'Requested by Owner' },
    ],
    insightTitle: 'Operational boundaries',
    insights: ['Remediation actions are typed, tenant-scoped, and fully audited.', 'Governance workflows separate retention, export, anonymization, and deletion.', 'Operational health exposes queues, providers, workflows, AI spend, and billing state without secret leakage.'],
    nextActions: ['Open incident queue', 'Review dead letters', 'Review governance requests'],
  },
  runtime: {
    label: 'Workflow runtime',
    eyebrow: 'TEMPORAL OPERATIONS',
    description:
      'Inspect durable workflow families, task queues, run state, signals, retries, cancellation, versioning, replay evidence, and worker health.',
    metrics: [
      { label: 'Running workflows', value: '1,284', detail: 'Preview sample' },
      { label: 'Retrying', value: '23', detail: 'Preview sample' },
      { label: 'Stuck > 15m', value: '2', detail: 'Preview sample' },
      { label: 'Replay status', value: 'Clean', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Business queues', tone: 'info', items: ['orders', 'shipping', 'recovery'] },
      { title: 'Signals', tone: 'warning', items: ['approval decided', 'provider callback', 'customer reply'] },
      { title: 'Durability', tone: 'success', items: ['restart tested', 'replay clean', 'versioned'] },
    ],
    rows: [
      { primary: 'recovery-expiry', secondary: '421 running workflows', status: 'Healthy', tone: 'success', meta: 'p95 task age 1.8s' },
      { primary: 'order-confirmation', secondary: '616 running workflows', status: 'Healthy', tone: 'success', meta: '8 currently retrying' },
      { primary: 'shipping-rescue', secondary: '247 running workflows', status: 'Attention', tone: 'warning', meta: '2 runs > 15m' },
    ],
    insightTitle: 'Durability posture',
    insights: ['Workflow history stores identifiers and deterministic state, not provider secrets.', 'Retries and timeouts are bounded per activity contract.', 'Release acceptance requires replay and restart evidence for every durable workflow family.'],
    nextActions: ['Inspect task queues', 'Open retrying workflows', 'Review replay evidence'],
  },
} as const satisfies Record<string, PreviewSurface>;

export type PlatformPreviewSurfaceKey = keyof typeof platformPreviewSurfaces;

export function isPlatformPreviewSurface(value: string): value is PlatformPreviewSurfaceKey {
  return value in platformPreviewSurfaces;
}
