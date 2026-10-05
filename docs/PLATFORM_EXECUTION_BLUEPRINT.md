# Platform Execution Blueprint

This document defines the dependency architecture for completing the full platform. It does not reduce scope and it is not an MVP plan. Public production release remains blocked until every release-critical module and the complete acceptance gate pass.

`CODEX_EXECUTION_QUEUE.md` remains the authoritative current/next ledger. This blueprint defines how workstreams depend on each other and the architectural rules that every workstream must preserve.

## 1. Product objective

Build a production-grade multi-tenant AI Operations Platform that lets a business:

- create and administer an organization and team;
- connect commerce, messaging, shipping, payment, email, and generic integrations;
- operate CRM, inbox, tickets, commerce, shipping, returns, recovery, sales, and campaigns;
- define governed automations without arbitrary code execution;
- configure business policies and knowledge;
- self-onboard through a versioned configuration compiler and simulation flow;
- use AI operators through typed, permissioned, approval-aware tools;
- measure operational performance, provider cost, AI cost, recovery, conversion, and ROI;
- expose controlled developer APIs and outbound webhooks;
- operate the platform safely through an audited control center.

## 2. Canonical platform path

All actors use the same business rule path.

```text
Human / API / Automation / Temporal / Config Compiler / AI
                         |
                         v
                 Typed domain command
                         |
        authentication + tenant membership
                         |
                      RBAC
                         |
                       OPA
                         |
                approval if required
                         |
                   idempotency
                         |
               PostgreSQL transaction
           /             |              \
  canonical state   immutable audit   outbox
                         |
                       COMMIT
                         |
          worker / NATS / Temporal activity
                         |
                  typed connector
                         |
                 provider network
                         |
                normalized result
                         |
               new domain transaction
```

Rules:

- PostgreSQL is authoritative business state.
- Temporal coordinates long-running processes; it is not a duplicate domain database.
- NATS publication starts from the transactional outbox after commit.
- Provider calls never occur inside a domain transaction.
- Provider-specific payloads never become canonical business models.
- AI and automation never create alternate execution paths.

## 3. Domain ownership map

### Identity / Organization

Owns users, organizations, memberships, roles, permissions, team lifecycle, organization selection, locale/timezone, and organization business profile ownership.

### CRM / Customer 360

Owns canonical customer/contact identity, contact points, addresses, consent/preferences, tags, segments, merge history, and customer timeline identity.

Sales, messaging, tickets, campaigns, recovery, commerce, and AI reference CRM identity instead of maintaining competing authoritative customer copies.

### Messaging

Owns conversations, participants, normalized messages, media references, outbound dispatch, delivery states, handover, assignment, and channel conversation state.

Campaigns, recovery, AI, and automation request outbound messages through Messaging rather than implementing provider sends independently.

### Tickets / SLA

Owns ticket lifecycle, ticket work, assignment, comments/tasks, SLA clocks, escalation, and ticket/customer/conversation links.

### Commerce

Owns stores, catalog, variants, inventory, orders, lines, discounts, taxes, payments, fulfillments, order timeline, confirmation, duplicate handling, modifications, and cancellations.

### Shipping

Owns canonical shipping locations/zones, carrier configuration references, shipments, packages, labels/reference metadata, tracking, delivery attempts, failure reasons, and delivery rescue.

Shipping references Commerce order/fulfillment state and provider mappings without embedding carrier-native state into Commerce.

### Returns / Exchanges / Refunds

Owns return requests/lines, inspection, resolution, exchanges, refunds, restock decisions, and related approval/execution state. A return and a refund are related but independent aggregates.

### Recovery

Owns revenue-recovery opportunities, eligibility, suppression, attempts, offers, expiry, recovered conversion, and attribution. Delivery Rescue remains operational shipping recovery; Recovery remains commercial revenue recovery.

### Sales

Owns leads, qualification, pipelines, stages, opportunities, activities, tasks, expected value, probability, and conversion. CRM remains customer identity source of truth.

### Campaigns

Owns campaign definitions, audience snapshots, recipient snapshots, suppression decisions, schedules, batches, send/conversion attribution, cost, and execution state. Campaign execution never repeatedly re-evaluates a mutable live audience.

### Automation

Owns declarative definitions/versions, typed trigger/action graphs, publication, durable runs, node state, cancellation, and execution visibility. It does not own domain business rules.

### Integrations

Owns provider connections, secret references, provider assets, webhooks, sync/reconciliation, typed provider actions, provider error mapping, throttling/rate-limit behavior, and production network adapters.

### AI

Owns provider/model routing, prompt/operator versions, tool proposal protocol, model telemetry, RAG orchestration, evals, and AI usage/cost. Domain mutations remain owned by their domain services.

### Knowledge

Owns tenant knowledge bases, sources, versions, documents, chunks, embeddings, retrieval metadata, freshness, and citations.

### Custom Data

Owns tenant-defined table schemas, typed fields, records, validation, row/field permissions, import/export, and typed actions. It never exposes arbitrary SQL.

### Analytics / Billing

Analytics owns aggregates and reporting projections; Billing owns plans, entitlements, quotas, commercial periods, overages, invoice references, and suspension hooks. Neither becomes source of truth for operational domains.

## 4. Cross-cutting contracts that start early

The following are not late cleanup projects. Every new workstream must integrate them while it is implemented.

### 4.1 Events

Every material domain mutation that another subsystem may react to must emit a versioned tenant-preserving event through the transactional outbox. Event contracts preserve actor, resource, correlation, causation, and source.

### 4.2 Observability

Use shared structured logging, correlation IDs, OpenTelemetry-compatible trace context, metric helpers, sanitized errors, and bounded tenant/resource metadata. Full production dashboards/alerts remain a later hardening task, but instrumentation begins with each module.

### 4.3 Usage and cost

Create/use a canonical usage ledger for metered actions such as messages, AI requests/tokens, automation executions, campaign recipients, storage, and provider actions. Billing is later; metering starts when the consuming feature is implemented.

### 4.4 Analytics instrumentation

Emit enough canonical events/measurements to calculate operational KPIs, recovery, conversion, provider cost, AI cost, automation outcomes, and ROI later without reconstructing history from raw tables.

### 4.5 Shared UI system

Use shared tokens and components for forms, tables, status, metrics, dialogs, drawers, activity timelines, filters, errors, loading, empty states, approvals, and responsive navigation. English LTR and Arabic RTL are first-class from component creation onward.

### 4.6 Security and tenancy

Every tenant-owned capability requires tenant-qualified relationships, RLS, RBAC, OPA, approval where required, idempotency, audit, and two-tenant verification.

## 5. Execution gates

### Gate 0 — Architecture and specification synchronization

Align authoritative docs and ADRs on the canonical command path, post-commit providers, domain ownership, Temporal role, configuration compiler, early metering/observability, AI/tool ordering, and production adapter closure.

Exit: no authoritative document contradicts the execution model.

### Gate 1 — Shared contracts reinforcement

Close gaps in versioned domain event families, observability interfaces, usage/cost ledger contracts, analytics dimensions, shared error/correlation contracts, and design-system primitives.

Exit: new modules can instrument events, metering, telemetry, and UI consistently without bespoke foundations.

### Gate 2 — Shipping closure

Complete canonical location hierarchy, address normalization with raw+normalized values and confidence/state, zones, carrier location mappings, carrier/service eligibility, shipment/package/line allocation, labels/reference lifecycle, tracking, attempts/failure reasons, rescue, provider result handling, operational UI, RLS, relationship guards, contract tests, and browser acceptance.

Exit: Shipping satisfies the module Definition of Done; production carrier adapters may remain separately tracked under connector closure.

### Gate 3 — Identity / Team / Organization lifecycle closure

Complete organization onboarding shell, invitations, accept/revoke, organization selection, profile, membership lifecycle, suspension, custom-role editor, system-role display, locale/timezone/business settings, MFA integration boundary, approval visibility, and auth/security E2E.

Exit: organization/team ownership is complete enough to support self-service configuration, publishing, approvals, and commercial ownership.

### Gate 4 — Basic self-service onboarding

Create the initial business profile and guided setup shell: country, timezone, currency, language, industry, B2B/B2C, commerce model, volume bands, goals, initial team, and first integration. Persist canonical answers instead of directly generating opaque workflow state.

Exit: a new organization can enter the product without engineering assistance and leaves a reusable business profile.

### Gate 5 — Returns / Exchanges / Refunds

Implement return request/lines, eligibility, evidence, inspection, resolutions, exchange records, refund requests/execution, restock decisions, financial approval, audit/events, provider-action boundaries, Temporal hooks, UI, RLS, and tests.

Exit: returns and refunds are canonical provider-neutral domains with safe financial execution.

### Gate 6 — Recovery

Implement recoverable-opportunity creation from abandoned/failed commercial states, eligibility/suppression, attempts, offers/coupons, expiry, message requests through Messaging, recovered-order linking, attribution confidence/value, Temporal workflow, analytics events, UI, and isolation tests.

Exit: recovered revenue can be traced from opportunity through intervention to conversion.

### Gate 7 — Sales

Implement leads/qualification, source, owner, pipeline/stages, opportunities, activities/tasks, next action, expected value/probability, CRM identity references, audit/events, UI, automation hooks, AI-ready structured signals, and tests.

Exit: sales does not duplicate CRM identity and exposes stable typed commands/events.

### Gate 8 — Campaigns

Implement campaigns, template/creative refs, consent/suppression, frozen audience snapshots, deterministic recipient identity, batching, schedules/timezones, retries without duplicate successful sends, cost, receipts, conversion/attribution, provider actions, approvals, Temporal workflow, UI, metering, and tests.

Exit: campaign results are reproducible, idempotent, attributable, and costed.

### Gate 9 — Temporal platform closure

By this gate, prior domains already add their required workflows. Standardize workflow IDs, task queues, search attributes, activity contracts, retry taxonomy, timeouts, heartbeats, cancellation, signals/updates, human approval, external-state updates, replay/versioning, worker restart, and server restart evidence.

Required release-critical workflows include OrganizationOnboarding, IntegrationBackfill, IntegrationReconciliation, OrderConfirmation, Shipping, DeliveryRescue, Return, Refund, Recovery, Campaign, ConversationOperator, and Automation.

Exit: every release-critical workflow passes deterministic replay and lifecycle acceptance.

### Gate 10 — Automation Studio

Implement typed triggers, conditions, branching, timers/waits, approvals, typed actions, versions, draft/publish, durable runs, retries/cancellation, visibility, event and usage records, UI builder, and Temporal-backed timers. Reuse canonical domain commands; no arbitrary SQL/HTTP/source-code execution.

Exit: governed no-code automation can orchestrate the existing platform without bypassing its business/security layers.

### Gate 11 — Configuration model and compiler

Create a versioned declarative `TenantConfigurationBundle` or equivalent containing business profile references, policies, integration choices, automation blueprints, operator profiles, notifications, limits, and dashboard presets.

Pipeline: answers/templates -> policy resolution -> blueprint selection -> compile -> validate -> diff -> simulation -> approval if required -> publish/apply. Publication is idempotent/audited; configuration versions support rollback/reconfiguration.

Exit: setup is reproducible and versioned rather than a sequence of opaque wizard side effects.

### Gate 12 — Configuration simulation

Create a safe dry-run engine using synthetic events and non-side-effecting planning paths. Show conditions, policy decisions, approval requirements, proposed automation/tool/provider actions, expected state transitions, estimated costs where available, warnings, and trace evidence. Never call production providers or mutate canonical production state in simulation.

Exit: a tenant can understand and verify expected behavior before publishing a configuration.

### Gate 13 — Production connector implementation and closure

Implement real adapters incrementally behind the existing SDK and formally close them here.

Priority: Shopify, WooCommerce, WhatsApp Cloud API, Instagram, Messenger, Email, Web Chat/API ingress, shipping providers, payment providers, generic REST.

Applicable adapters implement OAuth/auth, token/secret lifecycle, asset discovery, webhooks, backfill, incremental sync, reconcile, typed actions, provider error mapping, rate limits, health, and uninstall/disconnect semantics.

Finalize a production secret backend behind opaque references. Fixtures remain deterministic CI infrastructure and are never registered as production implementations.

Exit: every provider claimed for launch has a real tested adapter and no release-critical feature depends on a development fixture.

### Gate 14 — AI typed tool platform

Create/version a tool registry whose tools map to canonical platform commands. Each tool declares input/output schema, permission, risk, approval policy, idempotency, timeout/retry, sensitivity, actor/operator modes, and audit fields.

Exit: AI can only request actions the normal application can authorize and execute.

### Gate 15 — AI Gateway production foundation

Complete provider adapters, routing tiers, model capability catalog, language/cost/latency/risk-aware routing, embeddings/reranker boundaries, model request telemetry, fallback, availability handling, estimated cost, and tenant policy constraints. Local-model support remains an adapter to suitable inference infrastructure; the current VPS is not assumed to host a frontier-class local model.

Exit: model/vendor selection is centralized and operators do not call vendor SDKs directly.

### Gate 16 — AI evaluation + Knowledge/RAG foundation

Build eval datasets/harness before autonomous operator rollout. Include English, Arabic, Egyptian/Gulf dialects, ambiguity, PII, prompt injection, wrong-tenant/wrong-resource, unauthorized tools, order/refund safety, escalation, retrieval, hallucination, latency, and cost.

Build tenant-scoped source/document/version/chunk/embedding ingestion and retrieval with access metadata and citations using pgvector initially.

Exit: AI changes have measurable release thresholds and RAG proves tenant/access isolation.

### Gate 17 — AI Operators

Implement Support, Sales, Lead Qualification, Order, Confirmation, Recovery, Shipping, Returns, Campaign Assistant, and Moderator using prompt versions, model policy, knowledge scope, tool allowlists, escalation, evaluation thresholds, usage/cost, and OFF/COPILOT/APPROVAL/AUTONOMOUS modes.

Exit: autonomous mode remains governed by the same risk/approval path and required eval thresholds are green.

### Gate 18 — Custom Data

Implement tenant-defined tables/fields/records, typed validation, row/field operation permissions, imports/exports, indexes, API, UI, events, automation triggers/actions, AI-safe tools, RLS, and isolation tests. Do not create tenant SQL schemas or arbitrary SQL execution.

Exit: client-specific structured workflows can be modeled without modifying core business schemas.

### Gate 19 — Analytics / ROI

Create event-driven aggregates/materialized reporting models for executive, support, commerce, shipping, recovery, sales, campaigns, automation, AI, provider cost, and operations dashboards.

ROI measures include recovered revenue, saved orders, prevented duplicates, delivery rescues, conversion, automated workload, campaign revenue, provider cost, AI cost, and automation outcomes.

Exit: dashboards use stable aggregates with measured query performance instead of unbounded joins over hot operational tables.

### Gate 20 — Billing / Metering commercial closure

Consume the already-populated usage ledger to implement plans, entitlements, quotas, usage periods, overages, trials, subscription state, invoice/reference model, provider cost allocation, and suspension hooks. Keep payment provider execution abstract behind connectors.

Exit: plan enforcement and commercial accounting do not depend on reconstructing historical usage.

### Gate 21 — Developer Platform

Implement hashed API keys, scopes, expiry/rotation/revocation, rate limits, developer UI/docs, canonical outbound webhook subscriptions, signatures, retries, dead letters, logs, and audit. Outbound webhooks are produced from canonical versioned events.

Exit: tenant integrations can consume the platform without bypassing authorization or event contracts.

### Gate 22 — Admin Control Center and data governance

Implement tenant lookup/health, connection/sync/webhook/workflow/outbox/dead-letter health, AI/usage/spend, billing status, safe remediation commands, and scoped audited privileged operations rather than unrestricted database writes.

Add retention/deletion/anonymization, consent/evidence retention, export, media cleanup, tenant suspension/deletion, AI trace retention, raw webhook retention, and secret-rotation governance.

Exit: operators can diagnose and remediate the platform without bypassing tenant/security/audit controls.

### Gate 23 — Full product UX closure

Complete every real product surface through the shared design system. Verify English LTR, Arabic RTL, desktop/laptop/tablet/mobile, keyboard, practical WCAG 2.2 AA, loading/empty/forbidden/recoverable/fatal states, high-risk action evidence, consistent navigation, and no generic placeholder surfaces.

Exit: visual and behavioral acceptance is product-wide rather than page-local.

### Gate 24 — Observability, performance, security, release engineering, complete acceptance

Close production logs/traces/metrics/alerts, workflow/provider/queue/outbox/AI instrumentation, realistic performance thresholds, threat model, dependency/security scanning, BOLA/IDOR, tenant escape, approval replay/substitution, webhook forgery/replay, SSRF, injection, upload abuse, API-key abuse, prompt injection/tool abuse, and cross-tenant RAG.

Produce immutable images, production Compose overlay, migration upgrade fixture, backup/restore/rollback validation, smoke scripts, runbook, release notes, deployment verification, and all mandatory evidence in `TESTING_AND_ACCEPTANCE.md`.

Exit: complete release candidate gate passes. Only then may the full platform be called complete.

## 6. Incremental production-adapter policy

The connector closure gate is not permission to postpone all real providers until late. As a domain reaches a stable canonical contract, the highest-priority real provider adapter should be implemented in parallel or immediately afterward when credentials/certification are not required for repository work.

Examples:

- stable Commerce -> Shopify/WooCommerce adapter implementation;
- stable Messaging -> Meta/email production adapters;
- stable Shipping -> launch carrier adapters;
- stable Refunds/Billing -> payment adapter implementation.

The closure gate verifies completeness, certification requirements, provider contract tests, and that no launch-critical route still uses a fixture.

## 7. Temporal implementation policy

Do not create a separate late rewrite named "add Temporal." Long-running domains introduce Temporal workflow/activity contracts as they are built. Gate 9 standardizes and proves all of them together.

Domain state belongs in PostgreSQL. Temporal history records orchestration history; workflow queries/search attributes support operations but are not canonical customer/order/shipment records.

## 8. Self-service configuration policy

Basic onboarding and the configuration compiler are intentionally separate.

Basic onboarding captures durable business identity/profile data and gets the tenant into the platform. The compiler later turns profile/policy/objective/template inputs into a versioned configuration specification.

The compiler must not directly generate arbitrary executable code. It selects/version-controls approved blueprints, policies, automations, operator profiles, and configuration records.

Every publish operation supports:

- validation;
- impact/diff preview;
- simulation;
- approval where policy requires;
- deterministic/idempotent apply;
- audit/outbox evidence;
- version history;
- rollback or forward correction.

## 9. Definition of Done for each module gate

Where applicable, a domain gate is not complete until it has:

- append-only SQL migration and migration notes;
- tenant-qualified schema/indexes/constraints;
- RLS and relationship isolation;
- typed domain model/repository/service/API;
- input/output runtime validation;
- authentication/RBAC/OPA;
- approval for policy-defined HIGH/CRITICAL actions;
- idempotent commands;
- immutable audit;
- versioned outbox events;
- Temporal hooks/workflow where long-running;
- connector/provider hooks where external side effects exist;
- usage/cost records where metered;
- analytics instrumentation;
- structured logs/correlation/trace hooks;
- protected operational UI;
- shared design-system components rather than page-local substitutes;
- English LTR and Arabic RTL behavior;
- responsive/accessibility states;
- unit/integration/RLS/authorization/contract/E2E tests as applicable;
- provider fixtures plus real adapter implementation when the workstream owns one;
- documentation and implementation-status update;
- green relevant CI evidence.

A later release-wide gate may still own exhaustive cross-product visual, performance, security, and deployment acceptance.

## 10. Release rule

No intermediate green workstream is a public launch authorization. The full product remains IN PROGRESS until the final release acceptance succeeds.

The existing production VPS and critical n8n installation remain untouched unless a separate explicit deployment instruction authorizes production changes.
