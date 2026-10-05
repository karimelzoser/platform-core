# Database and Event Contracts

## SQL-first

Canonical schema is PostgreSQL SQL migrations.

Use a typed query layer in TypeScript, but never allow ORM tooling to rewrite
production schema history.

## IDs

Use UUID primary keys. Prefer UUIDv7 in application code for new public/domain
IDs when supported. Do not rewrite historical migrations just to change ID
generation.

## Tenant-owned tables

Normally include:

- `id`;
- `tenant_id`;
- timestamps;
- status/version/metadata where applicable;
- tenant-qualified unique constraints;
- tenant-leading indexes;
- RLS.

For cross-table tenant safety, prefer foreign keys that include `(tenant_id, id)`
where appropriate.

## Runtime context

Use existing transaction-local request context functions.

Never set session-global tenant context on pooled connections.

## RLS

Every tenant-owned table must use PostgreSQL RLS.

Tests prove:

- no unauthorized tenant rows;
- tenant A cannot read tenant B;
- tenant A cannot write/update/delete tenant B;
- tenant A cannot bind references to tenant B;
- SECURITY DEFINER helpers expose only explicitly intended cross-tenant data.

## Migration discipline

- `0001-0003` immutable;
- future migrations append-only;
- migration registry row written in the same transaction where possible;
- checksum recorded;
- CI validates historical checksums;
- destructive evolution uses expand/migrate/contract;
- new modules document upgrade/rollback implications.

## Transactional outbox

Domain change and outbox insert occur in the same transaction.

Publisher requirements:

- safe row claiming;
- bounded retries;
- dead letter;
- idempotency;
- correlation/causation;
- lag metric;
- retention cleanup.

A rolled-back transaction emits no domain event. Direct NATS publication is never
a substitute for a transactional outbox record.

## Event envelope

```json
{
  "id": "evt_uuid",
  "type": "domain.event",
  "version": 1,
  "tenant_id": "org_uuid",
  "occurred_at": "RFC3339",
  "source": "platform",
  "correlation_id": "cor_...",
  "causation_id": "evt_...",
  "actor": {
    "type": "USER|AI|SYSTEM|SERVICE|INTEGRATION",
    "id": "..."
  },
  "resource": {
    "type": "order",
    "id": "..."
  },
  "data": {}
}
```

Event schemas are versioned in the contracts package. Preserve tenant,
correlation, causation, actor and resource identity through consumers and derived
records.

## Event taxonomy

Use stable domain-oriented families rather than provider-native event names.
Examples:

- `identity.*`;
- `crm.*`;
- `messaging.*`;
- `tickets.*`;
- `commerce.*`;
- `shipping.*`;
- `returns.*`;
- `recovery.*`;
- `sales.*`;
- `campaigns.*`;
- `automation.*`;
- `configuration.*`;
- `ai.*`;
- `knowledge.*`;
- `custom_data.*`;
- `billing.*`;
- `developer.*`;
- `platform.*`.

Provider webhook payloads are normalized before they become domain events.
Provider-specific JSON must not be the event contract consumed by business
modules.

## Event design for analytics and ROI

Do not postpone measurement design until dashboard implementation. Material
business events should retain enough bounded dimensions to attribute outcomes
without reconstructing behavior from raw provider payloads later.

Where applicable, preserve references such as:

- automation/run;
- workflow;
- campaign/recipient;
- recovery opportunity;
- AI operator/tool request;
- provider/connection/action;
- order/opportunity/conversion;
- actor/source;
- correlation/causation.

Do not put unbounded payloads, secrets, raw prompts, provider credentials, or PII
copies into event metadata merely for analytics convenience.

## Usage and cost ledger

Metering begins when a metered feature is implemented; commercial billing may be
implemented later.

Use a canonical append-only/idempotent usage record model equivalent to:

```text
usage_record
- id
- tenant_id
- meter_key
- quantity
- unit
- occurred_at
- source_type/source_id
- resource_type/resource_id
- provider_key where applicable
- estimated_cost/currency where applicable
- correlation_id
- idempotency_key
- bounded metadata
```

Likely meter families include:

- outbound/inbound provider messages where commercially relevant;
- campaign recipients/sends;
- AI requests and input/output units/tokens;
- automation executions/node work where commercially relevant;
- provider actions;
- integration sync volume where commercially relevant;
- storage/media bytes where commercially relevant.

Usage writes must be tenant-scoped, idempotent and attributable. Do not double
count retries that do not represent a new billable/meaningful unit. Billing and
analytics consume usage records; they do not invent usage retroactively.

## Analytics projections

Operational domain tables remain source of truth. Reporting may use aggregate or
materialized projection tables maintained from canonical events/usage records.

Projection consumers must be:

- idempotent;
- tenant preserving;
- rebuildable where practical;
- version aware;
- observable for lag/failure.

Do not introduce a separate analytics database until measured workload justifies
it and an ADR records the decision.

## Audit

Runtime audit records are append-only.

Audit at minimum:

- admin/auth changes;
- membership/role changes;
- integration connection changes;
- configuration publication/rollback;
- order modification/cancellation;
- shipping/fulfillment;
- returns/refunds;
- campaigns;
- AI tool invocation;
- approvals;
- automation publication/execution;
- API keys;
- custom-data schema changes;
- privileged admin remediation;
- data-governance operations.

Never put raw secrets/tokens or unbounded sensitive payloads in audit JSON.

## Dead letters

Dead letters must be tenant-attributed where relevant, visible and recoverable in
admin tooling.

Retry must be idempotent and audited. Recovery/replay may not bypass the original
authorization, tenant, approval, schema, or provider boundaries required by the
operation.
