Object.assign(surfaces, {
  workflows: moduleSurface(
    'Workflow operations',
    'TEMPORAL OPERATIONS',
    'Operate durable workflow executions, task queues, retries, signals, cancellations, approvals, and restart-safe long-running business processes.',
    [['Running workflows', '386'], ['Waiting timers', '214'], ['Retrying activities', '7'], ['Stuck workflows', '0']],
    [
      ['Running', 'info', ['order-confirmation/10431', 'recovery/8801', 'campaign/oct-weekend']],
      ['Waiting', 'warning', ['refund/2031 · approval', 'recovery/8784 · 3h timer', 'shipping/10402 · provider']],
      ['Completed', 'success', ['confirmation/10402', 'return/2008', 'campaign/vip-1009']],
    ],
    [
      ['recovery/8784', 'Recovery sequence v7', 'Waiting', 'warning', 'Timer wakes in 2h 41m · attempt 1/2'],
      ['order-confirmation/10431', 'Order confirmation v12', 'Running', 'info', 'Activity: customer contact · retry policy 3 attempts'],
      ['refund/2031', 'High-value refund v3', 'Approval', 'warning', 'Action digest frozen · approver required'],
    ],
    ['Workflow IDs are deterministic per business aggregate and purpose.', 'Retries, timeouts, cancellation, and version markers are explicit.', 'Restart evidence prevents duplicate side effects after worker or server restarts.'],
    ['Inspect workflow history', 'Send workflow signal', 'Review retry policy'],
  ),
  configuration: moduleSurface(
    'Configuration studio',
    'VERSIONED CONFIGURATION',
    'Compile business profile, policies, templates, automation settings, and operational defaults into versioned, diffable, approvable tenant configuration.',
    [['Published version', 'v42'], ['Draft changes', '11'], ['Needs approval', '3'], ['Rollback points', '12']],
    [
      ['Inputs', 'info', ['Business profile', 'Support policy', 'Campaign defaults']],
      ['Validation', 'warning', ['2 policy conflicts', '1 missing template', '8 valid changes']],
      ['Published', 'success', ['v42 · current', 'v41 · rollback-ready', 'v40 · archived']],
    ],
    [
      ['Support SLA policy', 'Draft change', 'Valid', 'success', 'First response 5m → 4m'],
      ['Refund threshold', 'Draft change', 'Approval', 'warning', 'EGP 2,000 → EGP 3,000'],
      ['Campaign quiet hours', 'Draft change', 'Conflict', 'danger', 'Overlaps regional send window'],
    ],
    ['Published configuration is immutable and addressable by version.', 'Diff and validation happen before apply.', 'Rollback restores a known published version rather than replaying mutation scripts.'],
    ['Review configuration diff', 'Validate draft', 'Prepare publish approval'],
  ),
  simulation: moduleSurface(
    'Configuration simulation',
    'SAFE DRY RUN',
    'Run synthetic events through policy, automation, AI-tool, approval, and provider-intent planning without mutating tenant state or calling real providers.',
    [['Scenarios', '18'], ['Policy decisions', '42'], ['Planned actions', '27'], ['Provider calls', '0']],
    [
      ['Synthetic event', 'info', ['COD order EGP 4,600', 'VIP recovery cart', 'High-value refund']],
      ['Plan', 'warning', ['Approval required', '2 typed actions', '1 durable wait']],
      ['Outcome', 'success', ['No mutation', 'No provider call', 'Trace generated']],
    ],
    [
      ['SIM-2044', 'COD order EGP 4,600', 'Needs approval', 'warning', 'Would contact customer, wait 30m, then re-evaluate'],
      ['SIM-2041', 'Recovery opportunity', 'Safe', 'success', 'Would suppress because a newer order exists'],
      ['SIM-2038', 'Refund EGP 6,200', 'Blocked', 'danger', 'Missing finance approval evidence'],
    ],
    ['Simulation uses synthetic context only.', 'Expected commands, approvals, timers, provider intents, and estimated cost are shown before publish.', 'The simulation path cannot use production connector credentials.'],
    ['Run scenario', 'Compare draft vs published', 'Export simulation trace'],
  ),
  'ai-tools': moduleSurface(
    'AI tool registry',
    'TYPED AI ACTIONS',
    'Review versioned tool schemas, permission requirements, risk, approval rules, sensitivity, retries, and canonical command mappings exposed to AI operators.',
    [['Registered tools', '46'], ['Read-only tools', '19'], ['Approval-gated', '14'], ['Critical tools', '6']],
    [
      ['Read', 'info', ['customers.search', 'orders.get', 'knowledge.retrieve']],
      ['Mutate', 'warning', ['tickets.assign', 'orders.confirm', 'campaigns.draft']],
      ['Critical', 'danger', ['refunds.issue', 'billing.plan.change', 'developer.key.rotate']],
    ],
    [
      ['orders.confirm@1', 'Canonical order command', 'Medium risk', 'warning', 'commerce.orders.confirm · idempotency required'],
      ['knowledge.retrieve@2', 'Scoped retrieval', 'Read only', 'success', 'Tenant/resource filters · citations returned'],
      ['refunds.issue@1', 'Canonical refund command', 'Critical', 'danger', 'Approval + MFA + finance permission'],
    ],
    ['AI receives typed schemas rather than SQL, shell, or raw HTTP access.', 'Tool authorization uses the same tenant, permission, risk, approval, and idempotency model as human commands.', 'Every invocation records tool version, decision, latency, result summary, and cost correlation.'],
    ['Inspect tool schema', 'Review operator allowlists', 'Run safety evaluation'],
  ),
  'ai-routing': moduleSurface(
    'AI gateway & routing',
    'MODEL CONTROL PLANE',
    'Route workloads across deterministic, local, economical, strong, and human paths using language, capability, risk, latency, cost, and context policies.',
    [['Requests 24h', '84.2k'], ['Local-model share', '63%'], ['Fallback rate', '2.8%'], ['P95 latency', '1.9s']],
    [
      ['Fast/local', 'success', ['Intent classification', 'Moderation', 'Entity extraction']],
      ['Economical', 'info', ['Support drafting', 'Lead qualification', 'Summaries']],
      ['Strong/human', 'warning', ['Complex reasoning', 'High-risk recommendation', 'Escalation']],
    ],
    [
      ['support.reply', 'Arabic customer support', 'Economical', 'info', 'Primary model + local moderation · max 2.2s'],
      ['moderation.message', 'Inbound safety', 'Local', 'success', 'Deterministic/local route · no external model cost'],
      ['refund.recommendation', 'High-risk reasoning', 'Human gate', 'warning', 'Strong model advisory only'],
    ],
    ['Routing policy is workload- and risk-aware rather than a single-model default.', 'Local models absorb repetitive classification and extraction when evaluation thresholds are met.', 'Fallbacks, latency, token usage, and tenant cost are measured centrally.'],
    ['Inspect routing policy', 'Compare model quality', 'Review provider spend'],
  ),
  'custom-data': moduleSurface(
    'Custom data',
    'TENANT DATA MODEL',
    'Create governed tenant tables, typed fields, records, validation, indexes, permissions, import/export, automation triggers, and AI tools without arbitrary tenant SQL.',
    [['Custom tables', '8'], ['Records', '24.7k'], ['Indexed fields', '17'], ['Automations', '12']],
    [
      ['Schema', 'info', ['Retail branches', 'Supplier scorecards', 'Warranty claims']],
      ['Validation', 'warning', ['2 required-field warnings', '1 index suggestion', '0 permission leaks']],
      ['Ready', 'success', ['Store visits', 'B2B accounts', 'Field service jobs']],
    ],
    [
      ['retail_branches', '2,184 records', 'Active', 'success', '9 fields · 3 indexes · row permissions'],
      ['supplier_scorecards', '486 records', 'Active', 'success', 'Automation event on score change'],
      ['warranty_claims', 'Draft schema', 'Review', 'warning', 'Missing index on serial_number'],
    ],
    ['Tenant-defined schemas map to governed metadata rather than raw database DDL.', 'Row and field permissions are explicit and testable.', 'Imports, APIs, automation events, and AI tools reuse the same schema validation.'],
    ['Open schema designer', 'Import records', 'Review permissions'],
  ),
  admin: moduleSurface(
    'Admin control center',
    'PLATFORM OPERATIONS',
    'Operate tenant, integration, workflow, webhook, outbox, dead-letter, AI, usage, billing, and system health with safe audited remediation controls.',
    [['Healthy tenants', '98.7%'], ['Degraded integrations', '7'], ['Dead letters', '14'], ['Critical alerts', '0']],
    [
      ['Healthy', 'success', ['API', 'Temporal workers', 'Outbox dispatcher']],
      ['Attention', 'warning', ['7 provider connections', '14 dead letters', '2 cost spikes']],
      ['Remediation', 'info', ['Retry delivery', 'Reconcile connection', 'Suspend tenant']],
    ],
    [
      ['Tenant acme-egypt', 'Integration health', 'Degraded', 'warning', 'WhatsApp token validation failed'],
      ['Outbox partition 14', 'Delivery pipeline', 'Healthy', 'success', 'Lag 1.2s · 0 poison events'],
      ['AI spend anomaly', 'Tenant delta-retail', 'Review', 'warning', '+38% vs 7-day baseline'],
    ],
    ['Admin remediation is typed and audited rather than direct database editing.', 'Tenant suspension preserves data and audit evidence.', 'Health views correlate workflow, provider, queue, AI, usage, and billing signals.'],
    ['Open incident view', 'Inspect dead letters', 'Review tenant health'],
  ),
  governance: moduleSurface(
    'Data governance',
    'RETENTION & PRIVACY',
    'Control retention, export, deletion, anonymization, consent, media lifecycle, AI traces, raw webhook cleanup, secret rotation, suspension, and tenant deletion evidence.',
    [['Retention policies', '12'], ['Pending exports', '3'], ['Deletion jobs', '1'], ['Rotation due', '4']],
    [
      ['Policies', 'info', ['Audit: retained', 'Raw webhooks: 30d', 'Media: tenant policy']],
      ['Requests', 'warning', ['3 exports', '1 deletion', '2 anonymization reviews']],
      ['Compliant', 'success', ['Consent ledger', 'AI trace cleanup', 'Secret rotation history']],
    ],
    [
      ['GOV-882', 'Customer export request', 'Processing', 'info', 'Customer 360 + messages + orders'],
      ['GOV-879', 'Customer deletion request', 'Approval', 'warning', 'Legal retention exceptions detected'],
      ['Webhook cleanup', 'Raw delivery bodies', 'Healthy', 'success', '30-day policy · next run 02:00 UTC'],
    ],
    ['Deletion and anonymization respect legal and audit retention boundaries.', 'Exports are tenant-scoped, access-controlled, time-bounded, and auditable.', 'Provider secrets and sensitive traces have explicit rotation and cleanup lifecycles.'],
    ['Review retention policies', 'Open privacy requests', 'Inspect secret rotations'],
  ),
});

renderDashboard = function renderExtendedDashboard() {
  return `${pageHeader(
    'FULL PRODUCT REVIEW',
    'One operating system for customer operations, revenue, automation, and AI',
    'This static workspace lets you inspect the complete product structure without relying on API, database, identity, provider, or worker availability.',
    '<a class="button primary" href="#inbox" data-route="inbox">Start product tour</a>',
  )}
    <div class="review-notice">
      <div><strong>Representative data only</strong><span>Nothing on this site writes to production systems. Backend correctness remains a separate release gate.</span></div>
      ${badge('NO BACKEND REQUIRED', 'info')}
    </div>
    <div class="metrics">
      ${metric('Product surfaces', '30', 'Full planned product map')}
      ${metric('Workspaces', '6', 'Operations · revenue · automation · AI · platform · organization')}
      ${metric('Direction', 'LTR + RTL', 'Persistent browser preference')}
      ${metric('Review mode', 'Static', 'No credentials or provider calls')}
    </div>
    <div class="product-groups">
      ${groupCard('Customer operations', ['inbox','customers','tickets','orders','confirmation','shipping','returns','recovery'])}
      ${groupCard('Revenue & measurement', ['sales','campaigns','analytics','billing'])}
      ${groupCard('Automation & configuration', ['automation','workflows','configuration','simulation','integrations'])}
      ${groupCard('AI & knowledge', ['operators','ai-tools','ai-routing','knowledge'])}
      ${groupCard('Platform & governance', ['custom-data','developer','admin','governance'])}
      ${groupCard('Organization control', ['onboarding','team','approvals','settings','organizations'])}
    </div>
    <section class="card review-contract">
      <div class="card-head"><div><p class="eyebrow">PRODUCT CONTRACT</p><h2>What this preview proves—and what it does not</h2></div>${badge('REVIEW SAFE', 'success')}</div>
      <div class="contract-grid">
        ${contract('UX structure', 'Navigation, information hierarchy, representative states, responsive layout, and RTL/LTR behavior are reviewable here.')}
        ${contract('Review actions', 'Buttons in review mode never mutate server or provider state; they only demonstrate intended operator controls.')}
        ${contract('Backend evidence', 'Tenant isolation, authorization, idempotency, audit, outbox, Temporal, AI safety, and provider behavior remain separate release gates.')}
      </div>
    </section>`;
};

window.addEventListener('keydown', (event) => {
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      event.preventDefault();
      moduleSearch?.focus();
    }
  }
  if (event.key === 'Escape') {
    sidebar?.classList.remove('open');
  }
});
