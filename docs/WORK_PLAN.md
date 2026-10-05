# Codex Work Plan

This is the dependency-aware program order for completing the full platform. It
is not an MVP sequence and it is not a partial-launch plan. Public launch requires
the complete release gate.

`PLATFORM_EXECUTION_BLUEPRINT.md` defines the architectural rationale and domain
ownership rules. `CODEX_EXECUTION_QUEUE.md` is the authoritative current/next
ledger and may only promote work that is dependency ready.

Codex may parallelize genuinely independent workstreams in separate branches or
worktrees, but it must not bypass shared contracts or create temporary alternate
architectures that later require replacement.

## Program invariants

- PostgreSQL is canonical business state.
- Every state-changing actor uses the same typed domain-command authorization,
  approval, idempotency, audit and outbox path.
- External provider calls execute after commit through typed connectors.
- Temporal coordinates long-running processes; it is not a second domain store.
- AI and Automation Studio reuse canonical commands; neither receives arbitrary
  SQL, unrestricted HTTP, or provider secrets.
- Observability, analytics instrumentation, usage/cost metering, tenant security,
  and design-system usage are implemented with each module rather than deferred.
- Production provider fixtures never count as real production adapters.
- Release-wide visual/security/performance/deployment acceptance remains mandatory
  after individual workstreams are green.

## 0 — Preserve and verify the production baseline

- keep exact immutable migrations `0001-0003`;
- migration registry/checksum validation;
- typed DB access and transaction-local request context;
- disposable integration environment and CI;
- Keycloak, OPA, NATS, Temporal, PostgreSQL/pgvector and Valkey compatibility;
- preserve existing n8n and public-port constraints.

## 1 — Core security and execution foundation

- Keycloak JWT and user projection;
- organizations/memberships/effective permissions;
- RBAC/OPA;
- digest-bound approvals;
- idempotent shared command execution;
- immutable audit;
- transactional outbox and NATS delivery;
- secret references;
- webhook persistence/dedupe;
- connector SDK.

This phase is substantially implemented; future work must reuse it.

## 2 — Cross-cutting contracts

Establish or reinforce before further broad module expansion:

- versioned event contracts and event taxonomy;
- structured logging, correlation IDs and OpenTelemetry-compatible trace context;
- canonical usage/cost ledger and meter taxonomy;
- analytics dimensions/events needed for later ROI;
- common bounded error contracts;
- shared design-system tokens/components and direction-aware primitives;
- shared test helpers for two-tenant, authorization, provider and browser gates.

These contracts continue evolving additively as domains mature.

## 3 — Existing customer/communication/commerce foundation

The current repository already implements substantial scope here. Continue to
repair and close defects as dependent work reveals them.

- CRM / Customer 360;
- Messaging / Unified Inbox;
- Tickets / SLA;
- Integration SDK;
- Commerce / Orders / confirmation / duplicate handling / modification/cancel.

Do not create duplicate customer, message, or order ownership in later modules.

## 4 — Shipping closure

- canonical country/region/city/district locations;
- raw + normalized addresses with validation state/confidence;
- zones and carrier/service eligibility;
- carrier location mappings;
- shipments, line allocation, packages, labels/provider references;
- tracking, attempts/failure reasons;
- delivery rescue;
- provider-action result handling;
- RLS/relationship isolation;
- operational UI and browser acceptance.

## 5 — Identity / Team / Organization closure

Move this earlier than later business modules because self-service setup,
approvals, ownership, publishing, administration and billing all depend on it.

- onboarding shell;
- invitations/accept/revoke;
- organization selector;
- user profile/locale/timezone;
- membership/suspension lifecycle;
- custom role editor and system role display;
- MFA integration boundary;
- organization business settings;
- approval visibility and auth/security E2E.

## 6 — Basic self-service onboarding

Capture durable business profile data without generating opaque workflow state:

- country/currency/timezone/languages;
- industry/business type;
- B2B/B2C;
- commerce model;
- order/support volume bands;
- business objectives;
- initial team;
- first integration connection.

The resulting business profile becomes input to the later configuration compiler.

## 7 — Returns / Exchanges / Refunds

- distinct return/refund/exchange aggregates;
- return request/lines and evidence;
- eligibility and inspection;
- resolution and exchange;
- refund requests/execution;
- restock decisions;
- approval-sensitive financial actions;
- provider/payment hooks;
- Temporal hooks, events, UI and isolation tests.

## 8 — Recovery

- commercial recovery opportunity model;
- abandoned cart/checkout/order and failed-commercial-state sources;
- eligibility/suppression;
- attempts/offers/coupon references;
- Messaging integration;
- expiry;
- recovered order/conversion link;
- attribution confidence/value;
- Temporal workflow, ROI events and UI.

Delivery Rescue remains a Shipping concern; Recovery remains a revenue concern.

## 9 — Sales

- CRM-referenced leads and qualification;
- sources/owners;
- pipelines/stages;
- opportunities;
- activities/tasks/notes/next action;
- expected value/probability/conversion;
- audit/events/automation hooks;
- AI-ready structured signals;
- operational UI and tests.

CRM remains the canonical contact/customer identity source.

## 10 — Campaigns

- campaign/channel definitions;
- templates/creative references;
- consent/suppression;
- frozen audience snapshots;
- deterministic recipient snapshots/identity;
- scheduling/timezones;
- batching/rate limits;
- retries without duplicate successful sends;
- delivery receipts/failures;
- cost and usage records;
- conversion/attribution;
- approvals, Temporal workflow and UI.

## 11 — Temporal platform closure

Long-running domains already add workflows while they are built. This phase
standardizes and proves them rather than introducing Temporal late.

- task queues;
- deterministic workflow IDs;
- search attributes;
- versioned activity contracts;
- retry/error taxonomy;
- timeouts/heartbeats;
- cancellation;
- signals/updates;
- approval/external-state handling;
- deterministic replay/versioning;
- worker restart and Temporal server restart evidence.

Release-critical workflows: OrganizationOnboarding, IntegrationBackfill,
IntegrationReconciliation, OrderConfirmation, Shipping, DeliveryRescue, Return,
Refund, Recovery, Campaign, ConversationOperator and Automation.

## 12 — Automation Studio

- declarative definitions/versions;
- typed event/schedule/webhook/manual triggers;
- typed conditions/branches/waits;
- canonical typed actions;
- approval nodes;
- draft/publish;
- durable Temporal-backed timers/runs;
- retries/cancellation/visibility;
- metering/analytics/audit;
- UI builder.

Do not build a general untrusted code execution platform.

## 13 — Configuration model and compiler

Create a versioned declarative tenant configuration bundle. It may include:

- business profile references;
- tenant policies;
- integration selections/settings;
- approved automation blueprints;
- operator profiles/modes;
- notifications;
- plan/limit references;
- dashboard presets.

Pipeline:

`answers/templates -> policy resolution -> blueprint selection -> compile -> validate -> diff -> simulate -> approval when required -> idempotent publish/apply -> version history/rollback`

The compiler generates configuration, not arbitrary source code.

## 14 — Configuration simulation

- synthetic events/records;
- non-mutating policy evaluation;
- automation graph traversal;
- proposed AI tool/provider intent planning;
- approval requirements;
- expected state transitions;
- warnings and trace;
- estimated provider/AI cost where known;
- no production side effects or canonical-state mutation.

## 15 — Production connector implementation and closure

Implement real adapters incrementally as their canonical domains stabilize, then
perform the formal closure here.

Priority:

1. Shopify;
2. WooCommerce;
3. WhatsApp Cloud API;
4. Instagram Messaging;
5. Messenger Platform;
6. Email;
7. Web Chat/generic API ingress;
8. launch shipping carriers;
9. payment providers;
10. generic REST/webhook.

Applicable connector capabilities include auth/OAuth, refresh/rotation,
disconnect/uninstall, asset discovery, webhooks, initial/incremental sync,
reconciliation, typed actions, error mapping, rate limits and health.

Finalize production secret storage behind opaque secret references.

## 16 — AI typed tool platform

Before autonomous operators:

- versioned stable tool IDs;
- JSON Schema or equivalent input/output validation;
- required permissions;
- risk and approval policy;
- idempotency;
- timeout/retry;
- data sensitivity;
- allowed actor/operator modes;
- audit/usage fields;
- execution exclusively through canonical domain commands.

## 17 — AI Gateway production foundation

- external/economical/strong provider adapters;
- OpenAI-compatible/local adapter boundary where appropriate;
- model capability catalog;
- deterministic/rules tier;
- risk/language/capability/latency/cost/context-aware routing;
- embeddings/reranker boundary;
- fallback/availability policy;
- model request telemetry and cost.

Do not assume the current 2-vCPU/8GB VPS hosts a frontier-class local model.

## 18 — AI evaluation + Knowledge/RAG foundation

Build before autonomous rollout:

- eval datasets/results and thresholds;
- English/Arabic/Egyptian/Gulf quality fixtures;
- ambiguity, escalation and hallucination;
- prompt injection and sensitive-data handling;
- wrong tenant/resource and unauthorized tool attempts;
- order/refund safety;
- retrieval quality, latency and cost;
- tenant/access-scoped knowledge bases/sources/document versions/chunks/embeddings;
- freshness, optional reranking and citations;
- pgvector initially.

## 19 — AI Operators

- Support;
- Sales Assistant;
- Lead Qualification;
- Order;
- Confirmation;
- Recovery;
- Shipping;
- Returns;
- Campaign Assistant;
- Moderator.

Each combines versioned prompt/instructions, model policy, tool allowlist,
knowledge scope, mode, escalation, evaluation threshold and usage/cost policy.
Modes: OFF, COPILOT, APPROVAL, AUTONOMOUS. Mode never bypasses risk policy.

## 20 — Custom Data

- tenant tables/fields/records;
- typed field validation;
- row/field/operation permissions;
- indexes;
- imports/exports;
- APIs/UI;
- events;
- automation triggers/actions;
- safe AI tools;
- RLS/two-tenant tests.

No arbitrary SQL and no per-tenant unmanaged schema generation.

## 21 — Analytics / ROI

- event-driven aggregate/materialized reporting models;
- executive/support/commerce/shipping/recovery/sales/campaign/automation/AI/
  provider-cost/operations dashboards;
- recovered revenue, saved orders, duplicate prevention, delivery rescue,
  conversion, automated workload, campaign revenue, provider cost, AI cost and
  automation outcomes;
- measured dashboard performance.

Keep PostgreSQL until measured need justifies a separate analytics store.

## 22 — Billing / Metering commercial closure

Consume the usage records produced since earlier phases:

- plans;
- subscriptions;
- entitlements;
- quotas;
- billing periods;
- usage aggregation;
- overages;
- provider-cost allocation;
- invoice/reference model;
- trials;
- suspension hooks.

Payment execution remains connector abstracted.

## 23 — Developer Platform

- hashed API keys;
- scopes;
- expiry/rotation/revocation;
- rate limits;
- developer docs/UI;
- outbound webhook subscriptions from canonical events;
- signing secrets;
- delivery attempts/retries/dead letters/logs;
- audit.

## 24 — Admin Control Center and data governance

- tenant lookup/health;
- connector/sync/webhook/workflow health;
- stuck outbox/dead letters;
- AI/usage/spend/billing visibility;
- safe audited remediation commands;
- scoped privileged operations rather than unrestricted DB mutation;
- retention policies;
- data export;
- deletion/anonymization;
- consent/evidence retention;
- media cleanup;
- AI trace/raw webhook retention;
- secret rotation;
- tenant suspension/deletion.

## 25 — Full product UI/UX closure

Every required surface becomes real and uses the shared system:

- English LTR and Arabic RTL;
- desktop/laptop/tablet/mobile;
- keyboard operation;
- practical WCAG 2.2 AA behavior;
- loading/empty/forbidden/recoverable/fatal states;
- high-risk action consequence/approval/provider evidence;
- consistent navigation and responsive operational grids;
- no generic placeholder surfaces.

## 26 — Observability / performance / security hardening

- production metrics/traces/logs/alerts;
- workflow/provider/queue/outbox/AI operational telemetry;
- performance thresholds for critical surfaces and workers;
- threat-model refresh;
- dependency/security scanning;
- tenant escape/BOLA/IDOR;
- privilege escalation/approval replay/substitution;
- webhook forgery/replay;
- SSRF/injection/upload/API-key abuse;
- prompt injection/tool abuse/cross-tenant RAG;
- concurrency/backpressure/retry failure-mode verification.

## 27 — Release engineering and complete acceptance

- immutable production images;
- production Compose overlay;
- health/readiness;
- migration from blank and previous-release fixture;
- backup/restore;
- rollback;
- post-deploy smoke;
- deployment verification;
- runbook;
- release notes;
- threat model and docs current;
- execute every mandatory `TESTING_AND_ACCEPTANCE.md` gate;
- inspect objective green release-candidate evidence.

## Stop rule

If validation fails, repair it before marking a workstream complete. Do not skip a
failed dependency by creating an alternate architecture. If the only blocker is
an external credential/certification/deployment decision, move that exact item to
`BLOCKED` and continue other dependency-ready repository work.
