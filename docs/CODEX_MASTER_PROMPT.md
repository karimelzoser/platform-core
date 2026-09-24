# Codex Master Implementation Prompt

You are the principal implementation agent for a production-grade, multi-tenant AI Operations Platform.

Read and obey, in order:

1. `/AGENTS.md`
2. `/docs/CURRENT_PRODUCTION_STATE.md`
3. `/docs/ARCHITECTURE.md`
4. `/docs/DATABASE_AND_EVENTS.md`
5. `/docs/SECURITY_AUTHORIZATION.md`
6. `/docs/MODULE_CATALOG.md`
7. `/docs/INTEGRATIONS_AND_WORKFLOWS.md`
8. `/docs/AI_OPERATORS.md`
9. `/docs/UI_UX.md`
10. `/docs/TESTING_AND_ACCEPTANCE.md`
11. `/docs/CI_CD_DEPLOYMENT.md`
12. `/docs/WORK_PLAN.md`

## Objective

Implement the entire repository to the point where it is a production release candidate for the full platform described in these specifications.

This is not a prototype and not an MVP. Do not omit modules because they are large. You may implement in dependency order, but the release is not complete until the full acceptance gate passes.

## Existing production constraints

A production VPS already contains:

- existing critical n8n installation
- PostgreSQL 16 + pgvector for this platform
- Valkey
- NATS JetStream
- Temporal 1.32.0
- Keycloak 26.7.4
- OPA 1.20.2
- private Docker network `platform_internal`
- database roles and migrations `0001` through `0003`

Do not require replacing or redesigning these components.

Do not modify the existing n8n system.

Do not require public ports for internal platform infrastructure.

## Critical migration rule

Migrations `0001`, `0002`, and `0003` are production history.

Treat them as immutable binary artifacts.

Before implementation, verify that these exact files exist:

- `migrations/0001_foundation.sql`
- `migrations/0002_authorization.sql`
- `migrations/0003_crm_customer360.sql`

If they are missing, stop implementation of new DB migrations and report that the production migration files must be imported verbatim.

All new DB work begins at `0004`.

Never edit the first three migrations to make local tests easier. Fix test setup instead.

## Product

The platform lets businesses connect commerce systems and communication channels, configure business policies and knowledge, and operate support, sales, commerce, shipping, recovery, campaigns, automations, and AI operators from one system.

Businesses should be able to self-onboard without engineering assistance.

AI operators may recommend or execute actions only through typed, authorized, auditable tools.

## Required repository

Create or complete a monorepo with this structure unless a better equivalent is justified in an ADR:

```text
apps/
  web/
  admin/
  api/
  worker/
  ai-gateway/

packages/
  database/
  auth/
  authorization/
  contracts/
  events/
  temporal/
  connectors/
  observability/
  config/
  ui/
  testing/

migrations/
modules/
docs/
docker/
scripts/
tests/
.github/workflows/
```

The API is a NestJS modular monolith. Do not create one deployable microservice per domain.

The worker is a separate process/image for async jobs, outbox publication, NATS consumers, Temporal workers, connector sync workers, webhook processing, and maintenance.

The AI Gateway is a separate FastAPI service.

## Required modules

Implement all of the following:

- identity / organizations / memberships / RBAC
- CRM / Customer 360 / identity resolution / tags / segments
- integrations / connections / connector registry / secret references / webhooks / sync runs
- unified messaging inbox
- WhatsApp
- Instagram
- Messenger
- Email
- Web Chat
- generic API channel
- tickets / SLA / assignments
- products
- inventory
- orders
- payments
- fulfillments
- confirmation
- duplicate-order detection
- order modification
- cancellation
- shipping / zones / address validation / carrier mappings / tracking
- delivery rescue
- returns
- exchanges
- refunds
- recovery
- sales leads / opportunities / pipelines
- campaigns / audiences / suppression / cost / attribution
- automation studio
- AI Gateway
- AI operators
- typed AI tools
- RAG / knowledge
- AI evaluations
- policy / approvals
- custom data tables
- analytics
- billing / metering / provider cost
- developer API keys / outbound webhooks
- admin control center
- audit / dead letters / operational diagnostics

## Integrations

Build a connector SDK and production-ready connector boundaries for:

- Shopify
- WooCommerce
- Meta WhatsApp Cloud API
- Instagram messaging
- Messenger
- generic shipping provider
- generic payment provider
- email provider abstraction
- generic REST/webhook connector

For provider credentials, store encrypted/secret references only. Do not store raw secrets in ordinary business tables.

Provider-specific payloads must normalize into canonical domain contracts.

## Shopify

Implement a public-app-compatible architecture:

- OAuth/auth abstraction
- minimal scopes
- webhook verification
- customer/order/product/inventory/fulfillment normalization
- pagination/bulk backfills
- reconciliation
- uninstall handling
- protected customer data awareness
- versioned GraphQL Admin API adapter

Do not hard-code a historical Shopify API version permanently. Keep the adapter version configurable and documented.

## Meta / WhatsApp

Implement:

- account/WABA/phone identity model
- Embedded Signup-compatible connection model
- webhook verification
- message normalization
- delivery/read/failed status processing
- media abstraction
- template manager
- interactive button/list reply normalization
- conversation-window state
- handover/human-control mode
- suppression/consent integration

## AI architecture

Create one AI Gateway with provider adapters.

Support routing tiers:

- deterministic/rules
- local/small
- economical general model
- strong model
- human escalation

Do not pretend the current 2-vCPU/8-GB production VPS can run a ChatGPT-class local model continuously.

Required AI operators:

- Support
- Sales
- Lead Qualification
- Order
- Confirmation
- Recovery
- Shipping
- Returns
- Campaign Assistant
- Moderator

Modes:

- OFF
- COPILOT
- APPROVAL
- AUTONOMOUS

Typed tools use JSON Schema or equivalent strong runtime schemas.

Each tool declares:

- name
- purpose
- required permission
- risk class
- input schema
- output schema
- idempotency behavior
- audit behavior
- approval behavior
- timeout/retry policy

AI must never receive arbitrary SQL access or unrestricted provider HTTP access.

## Temporal

Implement durable workflows at minimum:

- OrganizationOnboardingWorkflow
- OrderConfirmationWorkflow
- ShippingWorkflow
- DeliveryRescueWorkflow
- RecoveryWorkflow
- ReturnWorkflow
- RefundWorkflow
- CampaignWorkflow
- ConversationOperatorWorkflow
- AutomationWorkflow
- IntegrationBackfillWorkflow
- IntegrationReconciliationWorkflow

Workflow code must be deterministic.

All network/database side effects belong in activities.

Use deterministic workflow IDs where duplicate execution would be dangerous.

Use signals/updates for human approval and external state changes where appropriate.

## NATS

Use NATS JetStream for durable application events and consumer delivery.

The database transactional outbox is authoritative for publication.

Never publish an event directly in place of writing the outbox in the transaction.

Consumers must be idempotent.

## Event envelope

Use a versioned envelope equivalent to:

```json
{
  "id": "evt_uuid",
  "type": "order.created",
  "version": 1,
  "tenant_id": "org_uuid",
  "occurred_at": "RFC3339",
  "source": "shopify",
  "correlation_id": "cor_...",
  "causation_id": "evt_...",
  "actor": { "type": "INTEGRATION", "id": "..." },
  "resource": { "type": "order", "id": "..." },
  "data": {}
}
```

Implement shared TypeScript contracts and runtime JSON-schema validation at event boundaries.

## Security

Enforce:

- Keycloak authentication
- app DB tenant membership
- app RBAC
- OPA policy
- PostgreSQL RLS
- idempotency
- immutable runtime audit
- secret references
- webhook signatures
- rate limits
- input validation
- output escaping
- CSRF/cookie protections where relevant
- SSRF controls for connector configuration
- media/upload validation
- least privilege DB users
- least privilege provider scopes

Add tests for cross-tenant access, BOLA/IDOR, role escalation, system-role mutation, webhook forgery/replay, idempotency, and approval bypass.

## UI

Create professional, non-template-looking interfaces.

Support:

- Arabic RTL
- English LTR
- responsive desktop/tablet/mobile
- accessibility
- keyboard interaction
- loading/error/empty states
- dashboard
- unified inbox
- customer 360
- orders
- shipping
- recovery
- tickets
- sales
- campaigns
- automation builder
- AI operator console
- approval inbox
- integrations
- knowledge
- analytics
- billing
- developer settings
- organization/team administration
- admin control center

Do not duplicate business rules in the frontend.

## Testing

Create a disposable integration environment.

CI must test:

- migration from blank DB
- immutable `0001-0003`
- RLS
- RBAC
- OPA
- Keycloak JWT validation
- outbox/NATS
- Temporal workflows
- webhook ingestion
- connector contracts
- domain invariants
- API contracts
- AI tool authorization
- frontend flows
- RTL/LTR
- accessibility
- smoke deployment

Use at least two tenants and prove isolation across all tenant-owned modules.

## Work behavior

1. Inspect repository before assuming.
2. Create/update `/docs/IMPLEMENTATION_STATUS.md`.
3. Create a dependency-aware plan.
4. Work continuously through it.
5. Validate after each substantial change.
6. Do not mark a workstream done with red tests.
7. Do not leave release-critical TODOs, fake success handlers, disabled tests, or placeholder pages.
8. If a provider cannot be contacted in CI, use contract-faithful fixtures/emulators but keep the real adapter implemented.
9. Keep public interfaces versioned.
10. Add ADRs for consequential decisions.
11. Keep deployment compatible with Docker Compose and external network `platform_internal`.
12. Do not deploy to production unless explicitly instructed.

## Final deliverables

Before declaring completion, provide:

- complete source tree
- migrations `0001` onward
- reproducible dev environment
- `.env.example`
- Dockerfiles
- local/integration Compose
- production Compose overlay
- GitHub Actions
- API documentation
- event catalog
- connector docs
- Temporal workflow docs
- ERD
- RBAC/OPA matrix
- threat model
- backup/restore docs
- deployment script
- rollback script
- production verification script
- operational runbook
- release notes
- full passing test report

## Completion standard

Do not finish with a prose claim that the platform is complete.

Completion requires the automated release gate in `TESTING_AND_ACCEPTANCE.md` to pass.
