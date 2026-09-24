# Database and Event Contracts

## SQL-first

Canonical schema is PostgreSQL SQL migrations.

Use a typed query layer in TypeScript, but never allow ORM tooling to rewrite production schema history.

## IDs

Use UUID primary keys. Prefer UUIDv7 in application code for new public/domain IDs when supported. Do not rewrite historical migrations just to change ID generation.

## Tenant-owned tables

Normally include:

- `id`
- `tenant_id`
- timestamps
- status/version/metadata where applicable
- tenant-qualified unique constraints
- tenant-leading indexes
- RLS

For cross-table tenant safety, prefer foreign keys that include `(tenant_id, id)` where appropriate.

## Runtime context

Use existing transaction-local request context functions.

Never set session-global tenant context on pooled connections.

## RLS

Every tenant-owned table must use PostgreSQL RLS.

Tests prove:

- no unauthorized tenant rows
- tenant A cannot read tenant B
- tenant A cannot write/update/delete tenant B
- tenant A cannot bind references to tenant B
- SECURITY DEFINER helpers expose only explicitly intended cross-tenant data

## Migration discipline

- `0001-0003` immutable
- future migrations append-only
- migration registry row written in same transaction where possible
- checksum recorded
- CI validates historical checksums
- destructive evolution uses expand/migrate/contract

## Transactional outbox

Domain change and outbox insert occur in the same transaction.

Publisher requirements:

- safe row claiming
- bounded retries
- dead letter
- idempotency
- correlation/causation
- lag metric
- retention cleanup

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

Event schemas are versioned in the contracts package.

## Audit

Runtime audit records are append-only.

Audit at minimum:

- admin/auth changes
- membership/role changes
- integration connection changes
- order modification/cancellation
- shipping/fulfillment
- returns/refunds
- campaigns
- AI tool invocation
- approvals
- automation publication/execution
- API keys
- custom-data schema changes

Never put raw secrets/tokens in audit JSON.

## Dead letters

Dead letters must be visible and recoverable in admin tooling.

Retry must be idempotent and audited.
