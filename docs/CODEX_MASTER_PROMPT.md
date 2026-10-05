# Codex Master Implementation Prompt

You are the principal implementation agent for a production-grade, multi-tenant
AI Operations Platform.

## Read order

Read and obey, in order:

1. `/AGENTS.md`
2. `/docs/IMPLEMENTATION_STATUS.md`
3. `/docs/CODEX_EXECUTION_QUEUE.md`
4. `/docs/PLATFORM_EXECUTION_BLUEPRINT.md`
5. `/docs/CURRENT_PRODUCTION_STATE.md`
6. `/docs/ARCHITECTURE.md`
7. `/docs/DATABASE_AND_EVENTS.md`
8. `/docs/SECURITY_AUTHORIZATION.md`
9. `/docs/MODULE_CATALOG.md`
10. `/docs/INTEGRATIONS_AND_WORKFLOWS.md`
11. `/docs/AI_OPERATORS.md`
12. `/docs/UI_UX.md`
13. `/docs/TESTING_AND_ACCEPTANCE.md`
14. `/docs/CI_CD_DEPLOYMENT.md`
15. `/docs/WORK_PLAN.md`
16. applicable `/docs/adr/*` decisions, especially ADR 0004 for the canonical
    command/execution architecture.

`CODEX_EXECUTION_QUEUE.md` tells Codex what to execute next.
`IMPLEMENTATION_STATUS.md` records objective implementation state.
`PLATFORM_EXECUTION_BLUEPRINT.md` defines domain ownership and dependency logic.
`WORK_PLAN.md` defines the full program order.
`TESTING_AND_ACCEPTANCE.md` defines the objective finish line.
Do not substitute one file for another.

## Objective

Implement the entire repository to the point where it is a production release
candidate for the full platform described by these specifications.

This is not a prototype and not an MVP. Do not omit modules because they are
large. Implement in dependency order, but the release is not complete until the
full acceptance gate passes.

Businesses must be able to self-onboard without engineering assistance, operate
all major business workflows from the platform, configure governed automation and
AI, and understand measurable cost/outcome/ROI.

## Existing production constraints

A production VPS already contains:

- existing critical n8n installation;
- PostgreSQL 16 + pgvector for this platform;
- Valkey;
- NATS JetStream;
- Temporal 1.32.0;
- Keycloak 26.7.4;
- OPA 1.20.2;
- private Docker network `platform_internal`;
- database roles and migrations `0001` through `0003`.

Do not require replacing or redesigning these components.

Do not modify the existing n8n system.

Do not require public ports for internal platform infrastructure.

Do not deploy to production unless explicitly instructed.

## Critical migration rule

Migrations `0001`, `0002`, and `0003` are production history.

Treat them as immutable binary artifacts.

Before implementation, verify that these exact files exist:

- `migrations/0001_foundation.sql`;
- `migrations/0002_authorization.sql`;
- `migrations/0003_crm_customer360.sql`.

If they are missing, stop implementation of new DB migrations and report that the
production migration files must be imported verbatim.

All new DB work begins at `0004` and remains append-only.

Never edit the first three migrations to make local tests easier. Fix test setup
instead.

## Canonical execution architecture

Every state-changing actor converges on one business path:

```text
Human / API / Automation / Temporal / Config Compiler / AI
                         |
                         v
                 typed domain command
                         |
    authentication -> membership -> RBAC -> OPA
                         |
                approval if required
                         |
                   idempotency
                         |
               PostgreSQL transaction
        canonical state + audit + outbox intent
                         |
                       COMMIT
                         |
          worker / NATS / Temporal activity
                         |
                  typed connector
                         |
                 external provider
                         |
                normalized result
                         |
               new domain transaction
```

Rules:

- PostgreSQL owns canonical business state.
- Temporal coordinates long-running processes and is not a second domain DB.
- Transactional outbox is authoritative for event publication.
- Never call an external provider inside a DB transaction.
- AI and Automation Studio never create alternate business backends.
- Provider-specific payloads stay inside connectors.
- Analytics consumes events/usage; it does not become operational source of
  truth.

## Required repository

Maintain a monorepo with this architecture unless a measured reason and ADR
justify an equivalent change:

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

The API is a NestJS modular monolith. Do not create one deployable microservice
per domain.

The worker is a separate process/image for async jobs, outbox publication, NATS
consumers, Temporal workers, connector/provider-action workers, webhook
processing, sync/reconciliation, analytics projections and maintenance.

The AI Gateway is a separate FastAPI service.

## Cross-cutting requirements for every module

Do not defer these to a final cleanup phase:

- tenant-qualified schema/constraints/indexes and PostgreSQL RLS;
- authentication, membership, RBAC, OPA and approval where required;
- typed/idempotent commands;
- immutable bounded audit;
- transactional outbox and versioned domain events;
- Temporal hooks for long-running processes;
- post-commit connector/provider hooks for external side effects;
- JSON structured logs, correlation IDs and OpenTelemetry-compatible trace hooks;
- canonical usage/cost records for metered actions;
- analytics/ROI instrumentation;
- shared design-system components;
- English LTR, Arabic RTL, responsive and accessible states;
- unit/integration/RLS/authorization/contract/browser evidence as applicable.

## Domain ownership

- Identity owns organizations, memberships, roles, team lifecycle and org-level
  settings/profile ownership.
- CRM owns canonical customer/contact identity, contact points, addresses and
  consent. Sales, campaigns, recovery and other modules reference CRM.
- Messaging owns conversations/messages and outbound dispatch. Campaigns,
  recovery, AI and automation request Messaging actions rather than sending
  providers directly.
- Commerce owns stores/catalog/inventory/orders/payments/fulfillments. Shipping,
  returns/refunds and recovery reference Commerce.
- Shipping owns canonical shipping locations/zones/shipments/tracking/rescue.
- Returns owns return/exchange/refund lifecycle.
- Recovery owns commercial recovery opportunities/attribution, distinct from
  Delivery Rescue.
- Sales owns lead/opportunity/pipeline state but not duplicate customer identity.
- Campaigns owns campaign/audience/recipient execution and attribution.
- Automation owns declarative orchestration, not duplicated business logic.
- Integrations/connectors own provider-native auth/payloads/actions/sync/errors.
- AI owns model/tool/RAG/eval orchestration, not direct domain mutations.
- Analytics owns derived aggregates; Billing owns commercial plans/entitlements.

## Required product modules

Implement all release-critical scope in `MODULE_CATALOG.md`, including:

- identity / organizations / memberships / RBAC / team lifecycle;
- basic self-service onboarding/business profile;
- CRM / Customer 360 / identity resolution / tags / segments / consent;
- integrations / connections / secret refs / webhooks / sync/reconciliation;
- unified messaging inbox and supported channels;
- tickets / SLA / assignments;
- products / inventory / orders / payments / fulfillments;
- confirmation / duplicate-order detection / modification / cancellation;
- shipping / locations / zones / address normalization / carrier mappings /
  tracking / delivery rescue;
- returns / exchanges / refunds;
- recovery / attribution;
- sales leads / opportunities / pipelines;
- campaigns / audience snapshots / suppression / cost / attribution;
- Automation Studio;
- Configuration Compiler and Configuration Simulation;
- AI typed tools / Gateway / operators;
- Knowledge/RAG and AI evaluations;
- policy / approvals;
- custom data tables;
- analytics / ROI;
- billing / metering / provider cost;
- developer API keys / outbound webhooks;
- Admin Control Center;
- data governance / retention / export / deletion/anonymization;
- audit / dead letters / operational diagnostics;
- shared product UI/design system and complete release acceptance.

## Integrations and production adapters

Build the Connector SDK boundary and real launch adapters for:

- Shopify;
- WooCommerce;
- Meta WhatsApp Cloud API;
- Instagram Messaging;
- Messenger Platform;
- email provider abstraction;
- Web Chat / generic API ingress;
- launch shipping providers;
- payment provider abstraction/launch adapters;
- generic REST/webhook connector.

For provider credentials, store opaque/encrypted secret references only. Do not
store raw secrets in ordinary business tables.

Provider-specific payloads must normalize into canonical domain contracts.

Development fixtures/emulators are deterministic CI tools only. They never count
as production provider adapters and must never register when production mode
expects a real adapter.

Implement real adapters incrementally as canonical domain contracts stabilize,
then close all production-provider requirements in the formal connector-closure
gate.

## Shopify

Implement a public-app-compatible architecture:

- OAuth/auth abstraction;
- minimal scopes;
- secret/token lifecycle;
- webhook verification;
- customer/order/product/inventory/fulfillment normalization;
- pagination/bulk backfills;
- reconciliation;
- uninstall handling;
- protected customer data awareness;
- versioned configurable GraphQL Admin API adapter;
- provider errors/rate limits/health.

Do not hard-code a historical Shopify API version permanently.

## Meta / WhatsApp / Instagram / Messenger

Implement applicable:

- Embedded Signup-compatible connection model;
- Business/WABA/phone/Page/Instagram asset discovery;
- webhook verification/replay behavior;
- inbound message normalization;
- delivery/read/failed statuses;
- media abstraction;
- template manager;
- interactive button/list reply normalization;
- conversation-window state;
- handover/human-control mode;
- consent/suppression integration;
- outbound typed actions;
- provider errors/rate limits/health.

## Shipping provider architecture

Canonical Shipping owns locations/zones/address normalization/shipments/tracking.
Carrier adapters own provider-native location IDs, request/response payloads,
labels/provider references, retry/error/rate-limit behavior and network calls.

Do not embed provider-native city/district IDs into canonical customer/order
addresses.

## Self-service onboarding and configuration compiler

Basic onboarding captures durable business-profile information such as country,
currency, timezone, language, industry, B2B/B2C, commerce model, volume bands,
goals, initial team and first integration.

Do not make the onboarding wizard directly create opaque unversioned workflow
state.

The later Configuration Compiler produces a versioned declarative tenant
configuration bundle from business profile, policy answers and approved
blueprints/templates.

Required lifecycle:

`compile -> validate -> diff -> simulate -> approval where required -> idempotent publish/apply -> version history -> rollback/forward correction`

The compiler generates configuration, not arbitrary executable source code.

Configuration Simulation uses synthetic/non-mutating planning and must never send
real provider messages/actions or mutate canonical production state.

## Automation Studio

Implement governed declarative automation:

- typed triggers;
- typed conditions/branching;
- waits/timers;
- typed canonical actions;
- approval nodes;
- definitions/versions/draft/publish;
- durable runs/node state;
- retries/cancellation;
- Temporal-backed long waits;
- audit/events/usage/analytics;
- operational UI.

No arbitrary SQL, unrestricted HTTP, JavaScript, Python, shell or general
untrusted code execution.

## AI architecture and implementation order

Implement in this order:

1. typed AI tool platform;
2. AI Gateway production routing/adapters;
3. AI evaluation + Knowledge/RAG foundation;
4. AI operators and autonomy rollout.

### AI routing tiers

- deterministic/rules;
- local/small where suitable;
- economical general model;
- strong model;
- human escalation.

Do not pretend the current 2-vCPU/8GB production VPS can run a ChatGPT-class
local model continuously. Local/private inference may live on appropriate
separate infrastructure behind an adapter.

### Required operators

- Support;
- Sales;
- Lead Qualification;
- Order;
- Confirmation;
- Recovery;
- Shipping;
- Returns;
- Campaign Assistant;
- Moderator.

Modes:

- OFF;
- COPILOT;
- APPROVAL;
- AUTONOMOUS.

Mode never bypasses risk/permissions/approval.

### Typed tools

Each tool declares:

- stable name/version;
- purpose;
- required permission;
- risk class;
- input/output schema;
- idempotency;
- audit;
- approval;
- timeout/retry;
- sensitivity;
- allowed actor/operator modes.

Tools execute canonical application commands. AI must never receive arbitrary SQL,
unrestricted provider HTTP, shell, code execution or provider credentials.

### AI evaluations

Required suites include support accuracy, English/Arabic/dialect quality, intent,
escalation, tool selection, policy compliance, hallucination, order/refund safety,
prompt injection, PII/sensitive data, wrong tenant/resource, unauthorized tools,
RAG retrieval/citation, campaign constraints, latency, fallback and cost.

Required threshold failures block the affected autonomous rollout.

## Temporal

Implement/integrate at minimum:

- OrganizationOnboardingWorkflow;
- IntegrationBackfillWorkflow;
- IntegrationReconciliationWorkflow;
- OrderConfirmationWorkflow;
- ShippingWorkflow;
- DeliveryRescueWorkflow;
- ReturnWorkflow;
- RefundWorkflow;
- RecoveryWorkflow;
- CampaignWorkflow;
- ConversationOperatorWorkflow;
- AutomationWorkflow.

Do not defer all workflows to one late rewrite. Add them with their domains, then
perform the central Temporal closure gate.

Workflow code must be deterministic. Network/database side effects belong in
activities. Use deterministic workflow IDs where duplicate execution is
dangerous. Use signals/updates for human approval and external state changes.
Classify provider/infrastructure retryable failures separately from invalid
business-terminal actions.

## NATS and events

Use NATS JetStream for versioned event delivery.

The database transactional outbox is authoritative for publication. Never publish
a business event directly in place of the outbox.

Consumers must be idempotent, tenant preserving, version aware and dead-letter
capable where necessary.

Use the event envelope defined in `DATABASE_AND_EVENTS.md` and update
`EVENT_CATALOG.md` whenever a public/shared event is added or changed.

## Usage, cost and analytics

Do not wait for Billing/Analytics implementation to start measurement.

Metered features write canonical idempotent usage records when they are built.
Examples include provider messages, campaign recipients, AI requests/tokens,
automation executions, provider actions and storage where commercially relevant.

Material business events retain enough bounded references for later attribution
and ROI without copying secrets/unbounded PII.

Analytics later builds idempotent aggregates/materializations from canonical
events/usage records. Do not introduce a separate analytics database without
measured need and an ADR.

## Security

Enforce:

- Keycloak authentication;
- app DB tenant membership;
- app RBAC;
- OPA policy;
- PostgreSQL RLS;
- digest-bound approvals;
- idempotency;
- immutable runtime audit;
- secret references;
- webhook signatures/replay controls;
- rate limits;
- input validation/output escaping;
- CSRF/cookie protections where relevant;
- SSRF controls;
- media/upload validation;
- least-privilege DB users/provider scopes;
- scoped/admin support operations;
- data-governance retention/deletion controls.

Add tests for cross-tenant access, BOLA/IDOR, role escalation, system-role mutation,
webhook forgery/replay, idempotency, approval bypass/substitution, API-key misuse,
cross-tenant RAG and AI tool abuse.

## UI

Create professional, non-template operational interfaces using the shared design
system.

Support:

- Arabic RTL;
- English LTR;
- desktop/laptop/tablet/mobile;
- accessibility and keyboard interaction;
- loading/error/empty/forbidden/pending states;
- high-risk action consequences/approval/provider evidence;
- basic onboarding and business profile;
- configuration compiler/diff/simulation/publish;
- dashboard;
- unified inbox;
- Customer 360;
- tickets;
- orders/confirmation;
- shipping;
- returns/refunds;
- recovery;
- sales;
- campaigns;
- Automation Studio;
- AI operator console;
- approvals;
- integrations;
- knowledge;
- custom data;
- analytics/ROI;
- billing/usage;
- developer settings;
- organization/team administration;
- Admin Control Center.

Do not duplicate business rules in the frontend and do not represent provider
success before canonical committed evidence exists.

## Testing

Follow `TESTING_AND_ACCEPTANCE.md`. CI must prove, as applicable:

- blank and upgrade migrations;
- immutable `0001-0003`;
- RLS/relationship isolation;
- RBAC/OPA/approvals;
- Keycloak JWT validation;
- outbox/NATS;
- Temporal workflow/replay/restart;
- webhook ingestion;
- connector contracts and real adapter boundaries;
- domain invariants;
- usage/metering/analytics projection behavior;
- configuration compiler/simulation safety;
- automation action safety;
- AI tool authorization/evals/RAG isolation;
- frontend LTR/RTL/responsive/accessibility;
- developer/admin/governance controls;
- performance/observability/security;
- smoke deployment.

Use at least two tenants and prove isolation across all tenant-owned modules.

## Work behavior

1. Inspect repository and authoritative docs before assuming.
2. Read `CURRENT` from `CODEX_EXECUTION_QUEUE.md` and perform concrete work.
3. Update `/docs/IMPLEMENTATION_STATUS.md` with objective state/evidence.
4. Follow dependency ordering from the blueprint/work plan.
5. Validate after each substantial change.
6. Do not mark a workstream done with red tests.
7. Do not leave release-critical TODOs, fake success handlers, disabled tests or
   placeholder pages.
8. If a provider cannot be contacted in CI, use contract-faithful fixtures while
   still implementing the real adapter before the production-adapter gate closes.
9. Keep public API/event/tool contracts versioned.
10. Add ADRs for consequential decisions.
11. Keep deployment compatible with Docker Compose and external network
    `platform_internal`.
12. Do not modify/deploy production without explicit instruction.
13. Do not stop merely because a feature/PR/checkpoint is complete; promote the
    next dependency-ready queue item according to `AGENTS.md`.

## Final deliverables

Before declaring completion, provide and verify:

- complete source tree;
- migrations `0001` onward;
- reproducible dev/integration environment;
- `.env.example`;
- Dockerfiles and immutable image pipeline;
- local/integration Compose and production overlay;
- GitHub Actions;
- API documentation;
- event catalog;
- connector and production-adapter docs;
- Temporal workflow docs;
- ERD;
- RBAC/OPA matrix;
- Configuration Compiler/Simulation docs;
- AI tools/operators/eval/RAG docs;
- analytics/metering definitions;
- data-governance/retention docs;
- threat model;
- backup/restore docs;
- deployment/rollback/verification scripts;
- operational runbook;
- release notes;
- full passing test/evidence report.

## Completion standard

Do not finish with a prose claim that the platform is complete.

Completion requires the automated/manual release gates in
`TESTING_AND_ACCEPTANCE.md` to pass with objective evidence.
