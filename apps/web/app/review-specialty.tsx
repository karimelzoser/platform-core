interface SpecialtyCard {
  label: string;
  value: string;
  detail: string;
  progress?: number;
}

interface SpecialtyStep {
  label: string;
  detail: string;
  state: 'done' | 'active' | 'next' | 'blocked';
}

interface SpecialtyExperience {
  eyebrow: string;
  title: string;
  description: string;
  cards: readonly SpecialtyCard[];
  steps: readonly SpecialtyStep[];
  facts: readonly string[];
}

const experiences: Record<string, SpecialtyExperience> = {
  sales: {
    eyebrow: 'PIPELINE COMMAND CENTER',
    title: 'Forecast, next actions, and deal quality in one view',
    description:
      'The sales workspace keeps CRM identity canonical while adding qualification, pipeline stage, expected value, probability, activity, and structured AI signals.',
    cards: [
      { label: 'Pipeline coverage', value: '3.1×', detail: 'Against current target', progress: 78 },
      { label: 'Commit confidence', value: '87%', detail: 'Weighted by stage + activity', progress: 87 },
      { label: 'Stale opportunity value', value: 'EGP 184k', detail: 'No next action in 7 days', progress: 29 },
    ],
    steps: [
      { label: 'Lead qualification', detail: 'CRM identity + source + structured score', state: 'done' },
      { label: 'Opportunity shaping', detail: 'Value, probability, owner, expected close', state: 'active' },
      { label: 'Proposal / negotiation', detail: 'Activities and commercial evidence', state: 'next' },
      { label: 'Closed outcome', detail: 'Win/loss reason and attributable revenue', state: 'next' },
    ],
    facts: [
      'Lead records reference CRM customers; they do not duplicate identity.',
      'AI qualification is advisory and versioned, never an untraceable database write.',
      'Pipeline forecasts can be compared with actual attributed revenue later.',
    ],
  },
  campaigns: {
    eyebrow: 'CAMPAIGN CONTROL',
    title: 'Frozen audiences, deterministic delivery, and attribution',
    description:
      'Campaign setup separates audience definition from a frozen launch snapshot, applies consent and suppression before provider intent, and never duplicates a successful recipient on retry.',
    cards: [
      { label: 'Eligible audience', value: '4,820', detail: 'After consent + suppression', progress: 92 },
      { label: 'Delivery success', value: '96.8%', detail: 'Across current batch', progress: 97 },
      { label: 'Attributed conversion', value: '4.3%', detail: 'Within attribution window', progress: 43 },
    ],
    steps: [
      { label: 'Audience definition', detail: 'Dynamic criteria evaluated', state: 'done' },
      { label: 'Frozen snapshot', detail: 'Recipients + timezone + consent evidence', state: 'done' },
      { label: 'Batch delivery', detail: 'Retry without duplicate success', state: 'active' },
      { label: 'Attribution', detail: 'Orders and value linked to recipients', state: 'next' },
    ],
    facts: [
      'Launch snapshots remain immutable after send starts.',
      'Quiet hours and recipient timezones are evaluated per recipient.',
      'Provider cost, delivery receipt, conversion, and attributable revenue stay correlated.',
    ],
  },
  automation: {
    eyebrow: 'AUTOMATION STUDIO',
    title: 'Typed orchestration instead of arbitrary scripts',
    description:
      'The builder composes registered triggers, conditions, typed actions, approvals, waits, and branches. Durable timers and long-running state execute through Temporal.',
    cards: [
      { label: 'Published workflows', value: '31', detail: 'Versioned definitions', progress: 86 },
      { label: 'Runs 24h', value: '18.4k', detail: 'Measured executions', progress: 74 },
      { label: 'Human approvals', value: '2.1%', detail: 'Of action plans', progress: 21 },
    ],
    steps: [
      { label: 'Trigger', detail: 'Order, event, schedule, provider, or human action', state: 'done' },
      { label: 'Decision', detail: 'Typed conditions + policy context', state: 'active' },
      { label: 'Wait / approval', detail: 'Durable timer or protected decision', state: 'next' },
      { label: 'Action', detail: 'Canonical command only', state: 'next' },
    ],
    facts: [
      'No arbitrary tenant JavaScript, Python, SQL, or unrestricted HTTP execution.',
      'Every action resolves to a versioned typed contract with permission and risk metadata.',
      'Draft, publish, run, cancel, retry, and audit are separate explicit states.',
    ],
  },
  workflows: {
    eyebrow: 'TEMPORAL OPERATIONS',
    title: 'Durable business execution with explicit recovery semantics',
    description:
      'Operators can see workflow IDs, task queues, activities, waits, retries, signals, cancellations, and versioning evidence without treating worker memory as state.',
    cards: [
      { label: 'Workflow success', value: '99.94%', detail: 'Rolling 24h sample', progress: 99 },
      { label: 'Retry recovery', value: '96%', detail: 'Recovered without human action', progress: 96 },
      { label: 'Oldest waiting timer', value: '17h', detail: 'Expected campaign wait', progress: 34 },
    ],
    steps: [
      { label: 'Workflow start', detail: 'Deterministic workflow ID', state: 'done' },
      { label: 'Activity execution', detail: 'Bounded timeout + retry', state: 'active' },
      { label: 'Signal / wait', detail: 'Durable state across restart', state: 'next' },
      { label: 'Terminal state', detail: 'Completed, canceled, or failed', state: 'next' },
    ],
    facts: [
      'Worker restarts do not discard business state.',
      'Provider side effects remain behind replay-safe activity contracts.',
      'Workflow version markers preserve replay compatibility as logic evolves.',
    ],
  },
  configuration: {
    eyebrow: 'CONFIGURATION COMPILER',
    title: 'Turn business intent into validated, publishable configuration',
    description:
      'Tenant settings are compiled into a versioned bundle with schema validation, semantic validation, diff, risk classification, approval requirements, publish, and rollback.',
    cards: [
      { label: 'Draft validity', value: '91%', detail: '10 of 11 changes valid', progress: 91 },
      { label: 'Risk-gated changes', value: '3', detail: 'Need approval', progress: 27 },
      { label: 'Rollback readiness', value: '100%', detail: 'Current + prior version retained', progress: 100 },
    ],
    steps: [
      { label: 'Source intent', detail: 'Business profile + policies + templates', state: 'done' },
      { label: 'Compile', detail: 'Canonical versioned bundle', state: 'done' },
      { label: 'Validate + diff', detail: 'Conflicts and risk surfaced', state: 'active' },
      { label: 'Publish / rollback', detail: 'Idempotent apply by version', state: 'next' },
    ],
    facts: [
      'Published versions are immutable.',
      'Risky diffs carry approval evidence before apply.',
      'Rollback selects a known version; it does not reverse-engineer arbitrary mutations.',
    ],
  },
  simulation: {
    eyebrow: 'SAFE SIMULATION',
    title: 'See what the platform would do before publishing it',
    description:
      'Synthetic inputs exercise policies, automation plans, AI tools, approvals, waits, provider intents, and estimated cost while hard-blocking production mutation and provider calls.',
    cards: [
      { label: 'Mutation calls', value: '0', detail: 'Hard simulation boundary', progress: 0 },
      { label: 'Policy paths covered', value: '14/16', detail: 'Current scenario set', progress: 88 },
      { label: 'Estimated action cost', value: 'EGP 4.20', detail: 'Scenario estimate', progress: 42 },
    ],
    steps: [
      { label: 'Synthetic event', detail: 'Controlled scenario context', state: 'done' },
      { label: 'Policy evaluation', detail: 'Permissions, risk, suppression', state: 'done' },
      { label: 'Action plan', detail: 'Typed tools + waits + approvals', state: 'active' },
      { label: 'Trace review', detail: 'Expected outcome + warnings + cost', state: 'next' },
    ],
    facts: [
      'Simulation has no production database write capability.',
      'Provider credentials are unavailable to the simulation execution path.',
      'Trace output can be compared across configuration versions before publish.',
    ],
  },
  operators: {
    eyebrow: 'AI OPERATORS',
    title: 'Role-specific AI with explicit autonomy levels',
    description:
      'Each operator combines a prompt version, tenant knowledge scope, typed tool allowlist, evaluation threshold, escalation policy, usage/cost limits, and a controlled operating mode.',
    cards: [
      { label: 'Operators enabled', value: '8', detail: 'Across tenant workflows', progress: 80 },
      { label: 'Copilot share', value: '54%', detail: 'Human confirms actions', progress: 54 },
      { label: 'Escalation rate', value: '7.2%', detail: 'Quality or policy escalation', progress: 28 },
    ],
    steps: [
      { label: 'Understand', detail: 'Scoped context + retrieval', state: 'done' },
      { label: 'Plan', detail: 'Allowed typed tools only', state: 'active' },
      { label: 'Policy gate', detail: 'Risk + approval independent of mode', state: 'next' },
      { label: 'Act / escalate', detail: 'Execute safe tools or hand over', state: 'next' },
    ],
    facts: [
      'OFF, COPILOT, APPROVAL, and AUTONOMOUS modes never override command risk policy.',
      'Operators cannot directly mutate database or provider state.',
      'Quality, safety, latency, usage, cost, and escalation are evaluated per operator version.',
    ],
  },
  'ai-tools': {
    eyebrow: 'TYPED TOOL REGISTRY',
    title: 'Every AI action is a registered platform capability',
    description:
      'Tool definitions bind schema, command mapping, permissions, risk, approval requirements, sensitivity, timeout, retry, audit, and version compatibility.',
    cards: [
      { label: 'Schema coverage', value: '100%', detail: 'Input and result contracts', progress: 100 },
      { label: 'Approval-gated', value: '14', detail: 'High/critical actions', progress: 30 },
      { label: 'Deprecated versions', value: '2', detail: 'Still replay-compatible', progress: 8 },
    ],
    steps: [
      { label: 'Tool selection', detail: 'Operator allowlist', state: 'done' },
      { label: 'Schema validation', detail: 'Typed input only', state: 'done' },
      { label: 'Authorization', detail: 'Tenant + permission + risk + approval', state: 'active' },
      { label: 'Command execution', detail: 'Canonical mutation boundary', state: 'next' },
    ],
    facts: [
      'Tools never expose unrestricted SQL, shell, or raw HTTP.',
      'Tool versions remain stable for replay, audit, and evaluation.',
      'Sensitive inputs/results are classified before telemetry and trace storage.',
    ],
  },
  'ai-routing': {
    eyebrow: 'MODEL CONTROL PLANE',
    title: 'Route each workload to the cheapest model that meets its quality bar',
    description:
      'Routing considers capability, language, tenant policy, risk, privacy, latency, cost, context size, provider health, evaluation quality, and human fallback.',
    cards: [
      { label: 'Local route share', value: '63%', detail: 'Classification/extraction/moderation', progress: 63 },
      { label: 'Strong-model share', value: '8%', detail: 'Complex reasoning only', progress: 8 },
      { label: 'Cost avoided', value: 'EGP 31k', detail: 'Estimated monthly vs strong-only', progress: 68 },
    ],
    steps: [
      { label: 'Classify workload', detail: 'Capability + risk + language', state: 'done' },
      { label: 'Select route', detail: 'Local / economical / strong / human', state: 'active' },
      { label: 'Fallback', detail: 'Provider/quality/latency policy', state: 'next' },
      { label: 'Measure', detail: 'Quality + latency + cost + safety', state: 'next' },
    ],
    facts: [
      'No single model is the default for every task.',
      'Local models are used only after workload-specific evaluation thresholds pass.',
      'Provider fallback never bypasses data-handling or risk constraints.',
    ],
  },
  knowledge: {
    eyebrow: 'TENANT KNOWLEDGE',
    title: 'Scoped retrieval with citations, freshness, and access boundaries',
    description:
      'Knowledge ingestion produces tenant-scoped chunks, embeddings, access metadata, freshness state, and citations that are enforced at retrieval time.',
    cards: [
      { label: 'Indexed sources', value: '184', detail: 'Tenant-scoped', progress: 82 },
      { label: 'Citation coverage', value: '98.6%', detail: 'Evaluated answers', progress: 99 },
      { label: 'Stale sources', value: '7', detail: 'Need refresh', progress: 12 },
    ],
    steps: [
      { label: 'Ingest', detail: 'Source + ACL + freshness metadata', state: 'done' },
      { label: 'Index', detail: 'Chunk + embedding + searchable metadata', state: 'done' },
      { label: 'Retrieve', detail: 'Tenant/resource filter + rerank', state: 'active' },
      { label: 'Answer', detail: 'Citation-bound response', state: 'next' },
    ],
    facts: [
      'Cross-tenant retrieval is denied before ranking.',
      'Citations reference retrievable evidence rather than model memory.',
      'Prompt-injection and stale-content cases belong in the repeatable eval suite.',
    ],
  },
  analytics: {
    eyebrow: 'ANALYTICS & ROI',
    title: 'Tie operating metrics and platform cost to business outcomes',
    description:
      'Event-driven aggregates connect support, commerce, shipping, recovery, sales, campaigns, automation, AI, provider cost, and operational health.',
    cards: [
      { label: 'Revenue influenced', value: 'EGP 1.26m', detail: 'Measured attribution', progress: 84 },
      { label: 'Hours automated', value: '386h', detail: 'Estimated human work avoided', progress: 72 },
      { label: 'AI + provider cost', value: 'EGP 18.7k', detail: 'Allocated by tenant/workload', progress: 34 },
    ],
    steps: [
      { label: 'Canonical events', detail: 'Measured operational facts', state: 'done' },
      { label: 'Dimensions', detail: 'Tenant + channel + module + campaign', state: 'done' },
      { label: 'Aggregates', detail: 'Bounded materialized reports', state: 'active' },
      { label: 'ROI decision', detail: 'Outcome compared with cost', state: 'next' },
    ],
    facts: [
      'ROI separates attribution from raw correlation.',
      'Provider/model costs use the canonical usage ledger.',
      'Dashboard queries consume bounded aggregates rather than scanning event history.',
    ],
  },
  billing: {
    eyebrow: 'COMMERCIAL CONTROL',
    title: 'Entitlements, quotas, usage, overages, and provider cost in one model',
    description:
      'Billing consumes canonical usage records and combines them with plan entitlements, quota periods, trials, subscriptions, overages, invoices, and suspension hooks.',
    cards: [
      { label: 'Plan utilization', value: '72%', detail: 'Current billing period', progress: 72 },
      { label: 'AI included usage', value: '81%', detail: 'Before overage', progress: 81 },
      { label: 'Projected invoice', value: 'EGP 18,900', detail: 'Base + forecast overage', progress: 63 },
    ],
    steps: [
      { label: 'Entitlement check', detail: 'Feature + quota policy', state: 'done' },
      { label: 'Usage ledger', detail: 'Canonical append-only meters', state: 'done' },
      { label: 'Period rating', detail: 'Included + overage + provider cost', state: 'active' },
      { label: 'Invoice / suspension', detail: 'Commercial lifecycle', state: 'next' },
    ],
    facts: [
      'Product modules do not maintain private billing counters.',
      'Provider cost and billable usage are distinct concepts.',
      'Quota/suspension behavior is explicit and auditable.',
    ],
  },
  developer: {
    eyebrow: 'DEVELOPER PLATFORM',
    title: 'Scoped APIs and reliable outbound webhooks for customer extensions',
    description:
      'Tenant developers manage hashed API keys, scopes, rotation/revocation, rate limits, signed outbound webhooks, retries, dead letters, delivery logs, and documentation.',
    cards: [
      { label: 'Active API keys', value: '7', detail: 'Metadata only; secrets never re-readable', progress: 35 },
      { label: 'Webhook success', value: '99.2%', detail: 'Rolling 24h', progress: 99 },
      { label: 'Rate-limit headroom', value: '64%', detail: 'Peak current tenant usage', progress: 64 },
    ],
    steps: [
      { label: 'Authenticate', detail: 'Hashed scoped key', state: 'done' },
      { label: 'Authorize', detail: 'Tenant + scope + rate limit', state: 'done' },
      { label: 'Execute', detail: 'Canonical API command/read', state: 'active' },
      { label: 'Deliver event', detail: 'Signed webhook + retry', state: 'next' },
    ],
    facts: [
      'API key secrets are shown once, stored hashed, and independently revocable.',
      'Outbound webhook signatures and delivery IDs support replay-safe consumers.',
      'Retries end in inspectable dead-letter state rather than infinite loops.',
    ],
  },
  'custom-data': {
    eyebrow: 'CUSTOM DATA',
    title: 'Tenant-defined records without arbitrary database access',
    description:
      'Custom data provides governed tables, typed fields, validation, indexes, row/field permissions, import/export, API access, events, automation integration, and AI tools.',
    cards: [
      { label: 'Schema health', value: '94%', detail: 'Index + validation recommendations', progress: 94 },
      { label: 'Permission coverage', value: '100%', detail: 'All tables row-scoped', progress: 100 },
      { label: 'Records', value: '24.7k', detail: 'Across 8 tables', progress: 69 },
    ],
    steps: [
      { label: 'Schema design', detail: 'Typed field metadata', state: 'done' },
      { label: 'Validation + indexes', detail: 'Bounded storage model', state: 'active' },
      { label: 'Permissions', detail: 'Row + field access', state: 'next' },
      { label: 'Expose', detail: 'API + automation + AI tool', state: 'next' },
    ],
    facts: [
      'Tenant custom schemas cannot execute arbitrary SQL.',
      'Field validation is shared by UI, import, API, automation, and AI tools.',
      'Two-tenant isolation remains mandatory for every custom table/record operation.',
    ],
  },
  admin: {
    eyebrow: 'ADMIN CONTROL CENTER',
    title: 'One place to see health and perform safe remediation',
    description:
      'Administration correlates tenant health, integrations, workflows, webhooks, outbox, dead letters, AI usage, cost, billing, and operational alerts.',
    cards: [
      { label: 'Healthy services', value: '17/18', detail: 'One degraded provider', progress: 94 },
      { label: 'Dead-letter backlog', value: '14', detail: 'Across three tenants', progress: 18 },
      { label: 'Open incidents', value: '2', detail: 'No critical incident', progress: 12 },
    ],
    steps: [
      { label: 'Detect', detail: 'Metrics + logs + workflow/provider signals', state: 'done' },
      { label: 'Correlate', detail: 'Tenant/resource/trace context', state: 'active' },
      { label: 'Remediate', detail: 'Typed safe admin action', state: 'next' },
      { label: 'Audit', detail: 'Before/after + actor + reason', state: 'next' },
    ],
    facts: [
      'Admin UX does not expose direct production SQL mutation.',
      'Remediation actions are permissioned, typed, idempotent where relevant, and audited.',
      'Tenant suspension and deletion are distinct governed lifecycles.',
    ],
  },
  governance: {
    eyebrow: 'DATA GOVERNANCE',
    title: 'Retention, privacy, consent, deletion, and secret lifecycle evidence',
    description:
      'Governance makes retention and deletion policies executable and inspectable across customer records, media, raw webhooks, AI traces, consent, exports, secrets, and tenant lifecycle.',
    cards: [
      { label: 'Policy coverage', value: '100%', detail: 'Governed storage classes', progress: 100 },
      { label: 'Privacy requests', value: '4', detail: 'Three export · one delete', progress: 24 },
      { label: 'Secrets rotation due', value: '4', detail: 'Within 14 days', progress: 31 },
    ],
    steps: [
      { label: 'Request / policy', detail: 'Purpose + scope + legal basis', state: 'done' },
      { label: 'Discover data', detail: 'Tenant/resource inventory', state: 'active' },
      { label: 'Apply exception', detail: 'Retention + audit obligations', state: 'next' },
      { label: 'Export/delete/anonymize', detail: 'Evidence retained', state: 'next' },
    ],
    facts: [
      'Deletion is not a blind cascade when legal/audit retention applies.',
      'Exports are scoped, time-bounded, authorized, and auditable.',
      'Raw webhook payloads and AI traces have independent cleanup policies.',
    ],
  },
};

export function ReviewSpecialty({ surface }: { surface: string }) {
  const experience = experiences[surface];
  if (!experience) return null;

  return (
    <section className="review-specialty" aria-label={`${experience.title} product deep dive`}>
      <header className="review-specialty__heading">
        <div>
          <p className="ds-eyebrow">{experience.eyebrow}</p>
          <h2>{experience.title}</h2>
          <p>{experience.description}</p>
        </div>
        <span>Module-specific review</span>
      </header>

      <div className="review-specialty__metrics">
        {experience.cards.map((card) => (
          <article key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
            {typeof card.progress === 'number' ? (
              <div className="review-specialty__progress" aria-label={`${card.label} ${String(card.progress)} percent`}>
                <span style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }} />
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="review-specialty__body">
        <ol className="review-specialty__steps" aria-label="Representative workflow stages">
          {experience.steps.map((step, index) => (
            <li data-state={step.state} key={step.label}>
              <span className="review-specialty__step-number">{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
        <aside className="review-specialty__facts">
          <p className="ds-eyebrow">DESIGN GUARANTEES</p>
          <ul>
            {experience.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
