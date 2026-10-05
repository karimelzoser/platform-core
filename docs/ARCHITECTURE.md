# System Architecture

The platform is a modular monolith for synchronous business APIs with separate
worker and AI Gateway deployables. Do not create one microservice per business
domain.

ADR 0004 and `PLATFORM_EXECUTION_BLUEPRINT.md` define the canonical execution and
dependency architecture for the remaining product.

## Deployables

### web

Customer-facing platform UI.

### admin

Internal/platform operational UI. Administrative actions remain scoped,
permissioned and audited; this is not an unrestricted database console.

### api

NestJS modular monolith for synchronous domain reads, typed commands, policy
checks and tenant-scoped transactions.

### worker

Runs:

- transactional outbox publisher;
- NATS consumers;
- Temporal workers/activities;
- webhook processors;
- provider-action workers;
- provider sync/backfill/reconciliation;
- scheduled maintenance;
- analytics aggregation/projection work;
- bounded operational cleanup.

### ai-gateway

FastAPI service for:

- provider/model routing;
- typed tool-call protocol;
- RAG orchestration;
- AI telemetry/usage/cost;
- evaluation hooks;
- local/external model adapters.

The AI Gateway does not own domain mutations and never calls providers or SQL
outside approved typed platform tools.

## Infrastructure

```text
Browser
  |
Traefik / HTTPS
  |
  +------------------+
  |                  |
Web/Admin            API
                       |
       +---------------+---------------+
       |               |               |
   PostgreSQL        Keycloak          OPA
       |
 transactional
   outbox
       |
     Worker
       |
      NATS <----> Temporal
       |
 typed connectors / providers

API/Worker <----> AI Gateway
```

## Sources of truth

- PostgreSQL: canonical business state, permissions, audit, outbox, configuration,
  usage/metering and durable application records;
- Temporal: durable orchestration history and workflow coordination, not canonical
  customer/order/shipment/domain state;
- NATS: versioned event delivery, not authoritative event creation;
- Valkey: ephemeral acceleration/coordination only;
- Keycloak: authentication identity;
- application DB: tenant membership, RBAC, resource ownership and business state;
- OPA: policy decision;
- connector/secret abstraction: provider boundary and secret references;
- media abstraction: binary objects and metadata references.

## Canonical actor path

Humans, APIs, Automation Studio, Temporal orchestration, the configuration
compiler and AI operators converge on the same application command path.

```text
actor intent
 -> typed domain command
 -> JWT/service identity
 -> active tenant membership/context
 -> effective permissions
 -> OPA decision
 -> approval if policy requires
 -> idempotency validation
 -> domain transaction
 -> canonical state mutation
 -> audit
 -> transactional outbox
 -> commit
```

PostgreSQL RLS remains mandatory even after application authorization succeeds.
No frontend, AI, automation or worker path may implement a weaker parallel rule.

## External action path

Provider execution is intentionally split across transactions. Never hold a
domain transaction open while calling a provider.

```text
domain command
 -> authorization / OPA / approval / idempotency
 -> transaction records canonical intent + audit + outbox/provider-action row
 -> COMMIT
 -> worker/Temporal activity claims committed intent
 -> resolve tenant-scoped connector + secret reference
 -> typed provider API call
 -> normalized bounded provider result/error
 -> new tenant-scoped transaction
 -> canonical result state + audit + outbox
 -> COMMIT
```

This is the authoritative external-action pattern. AI and Automation Studio only
request the same canonical commands and cannot skip this path.

## Webhook path

```text
Provider
 -> webhook endpoint
 -> body-size/content checks
 -> signature/timestamp/replay verification
 -> account/tenant resolution
 -> raw/sanitized delivery persistence
 -> dedupe
 -> immediate provider acknowledgement
 -> async worker processing
 -> connector normalization
 -> canonical domain command/event
```

No large sync or provider side effect belongs inside the webhook request.

## Long-running process path

Temporal coordinates multi-step processes whose state spans time, retries, human
decisions or external providers.

```text
canonical event/command
 -> deterministic workflow ID
 -> Temporal workflow
 -> activities for DB/provider/network side effects
 -> signals/updates for human/provider state
 -> canonical domain commands for state changes
```

Workflow history is orchestration evidence; canonical domain state remains in
PostgreSQL.

## Integration boundary

Only connectors understand provider-native auth, payloads, IDs, errors, rate
limits and network APIs. Provider-specific JSON must not escape into canonical
domain services.

Typical mapping:

```text
canonical command/result
 <-> connector contract
 <-> Shopify / Meta / carrier / payment / email / generic provider
```

Canonical tables may store bounded provider mappings/references, but provider
payloads never become the business model.

## Domain ownership

- Identity owns organizations/memberships/roles/team lifecycle.
- CRM owns customer/contact identity, contact points, addresses and consent.
- Messaging owns conversations/messages and outbound send execution.
- Tickets owns ticket/SLA work.
- Commerce owns stores/catalog/inventory/orders/payments/fulfillments.
- Shipping owns shipping locations/zones/shipments/tracking/rescue.
- Returns owns return/exchange/refund lifecycle.
- Recovery owns commercial recovery opportunities/attribution.
- Sales owns lead/opportunity/pipeline state while referencing CRM identity.
- Campaigns owns campaign/audience/recipient execution and attribution.
- Automation owns declarative orchestration definitions, not duplicated domain
  business rules.
- Integrations owns provider connections/actions/sync and provider mapping.
- AI owns model/orchestrator concerns, not business mutations.
- Analytics owns derived aggregates; Billing owns commercial entitlements and
  periods; neither replaces operational sources of truth.

## Cross-cutting contracts

Every new module integrates at implementation time:

- tenant/RLS and authorization;
- audit/outbox/events;
- Temporal hooks when long-running;
- post-commit connectors when external;
- structured logs/correlation/trace hooks;
- canonical usage/cost metering when applicable;
- analytics/ROI instrumentation;
- shared UI/design-system primitives;
- English LTR and Arabic RTL behavior;
- appropriate unit/integration/RLS/contract/E2E evidence.

## Self-service configuration architecture

Basic onboarding captures durable business profile data. The later configuration
compiler creates a versioned declarative tenant configuration bundle and supports:

`compile -> validate -> diff -> simulate -> approve when required -> idempotent publish/apply -> version/rollback`

The compiler selects approved policies, blueprints, automations, operator profiles
and settings. It does not generate arbitrary executable source code.

## Scaling principle

Prefer the existing modular-monolith/worker/PostgreSQL/NATS/Temporal architecture
until measured load demonstrates a real bottleneck. Add infrastructure or split a
service only with evidence and an ADR. Do not pre-emptively introduce Kubernetes,
microservice-per-domain deployment, or a separate analytics database without a
measured requirement.
