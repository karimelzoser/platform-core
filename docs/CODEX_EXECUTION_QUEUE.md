# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a verified
repository/release gate, not for the existence of a schema, endpoint, or page.

The full dependency model is defined in `PLATFORM_EXECUTION_BLUEPRINT.md` and ADR
0004. `WORK_PLAN.md` defines the program order. This file tells the implementation
agent what to execute now.

Invariant: unless `BLOCKED` contains the only remaining mandatory work, `CURRENT`
must contain exactly one executable workstream. Completing `CURRENT` triggers
validation, status/documentation updates, promotion of the next dependency-ready
item, and immediate implementation action. A green feature PR is not a public
release authorization.

## ALWAYS-ON REQUIREMENTS

Every current/future module must integrate these while it is built; they are not
allowed to become end-of-project retrofits:

- tenant-qualified schema/relationships and PostgreSQL RLS;
- authentication, membership, RBAC, OPA, approval where required;
- idempotent typed commands, immutable audit, transactional outbox events;
- post-commit provider execution through typed connectors only;
- Temporal workflow/activity hooks for long-running business processes;
- structured logs, correlation/trace context, bounded operational metrics;
- analytics event/dimension instrumentation;
- canonical usage/cost records for metered actions;
- shared design-system components, English LTR, Arabic RTL, responsive and
  accessible states;
- unit/integration/RLS/authorization/contract/browser evidence as applicable.

Humans, APIs, automations, Temporal workflows, the configuration compiler, and AI
must converge on the same canonical domain-command/security path. No subsystem may
implement a second business backend.

## CURRENT

- **Shipping closure:** finish the active Shipping workstream without changing
  canonical Commerce ownership or the post-commit connector boundary. In addition
  to the existing shipment/tracking/rescue implementation, the complete Shipping
  gate includes canonical country/region/city/district location data, raw plus
  normalized address state, validation/confidence, zones, carrier location
  mappings, carrier/service eligibility, label/provider-reference lifecycle,
  attempts/failure reasons, rescue, operational UI, two-tenant relationship/RLS
  evidence, browser LTR/RTL/responsive/accessibility evidence, and bounded
  provider-action retry/dead-letter behavior. Real launch carrier adapters remain
  separately verified under Production Connector Closure.

## VERIFICATION PENDING

- **Ticket visual acceptance:** the protected ticket UI has build/type evidence;
  exhaustive browser E2E, RTL/LTR, responsive, and accessibility evidence remains
  part of the later product-wide UX gate unless it becomes necessary earlier for
  a dependent change.

## NEXT

1. **Cross-cutting contract reinforcement** — shared observability interface,
   canonical usage/cost ledger, analytics/event dimensions, common error and
   correlation contracts, and design-system primitives. This is a bounded
   foundation pass, not a feature rewrite.
2. **Identity / Team / Organization closure** — onboarding shell, invitations,
   organization selector, membership/suspension lifecycle, profile/locale/timezone,
   custom-role editor, system-role display, MFA boundary, approval visibility,
   and auth/security E2E.
3. **Basic self-service onboarding** — canonical business profile, country,
   currency, timezone, language, industry, B2B/B2C, commerce model, volume bands,
   goals, initial team and first integration. Persist reusable profile data; do
   not directly generate opaque workflows.
4. **Returns / Exchanges / Refunds** — distinct return/refund/exchange aggregates,
   eligibility, inspection, resolution, restock, approval-sensitive financial
   execution, provider contracts, workflow hooks, UI, RLS and tests.
5. **Recovery** — commercial recovery opportunities, eligibility/suppression,
   attempts/offers, Messaging integration, expiry, recovered-order linking,
   attribution/value, Temporal workflow, ROI events, UI and isolation tests.
6. **Sales** — CRM-referenced leads, qualification, pipelines/stages,
   opportunities, activities/tasks, expected value/probability, typed commands,
   AI-ready structured signals, UI and tests. Do not duplicate CRM identity.
7. **Campaigns** — consent/suppression, frozen audience and recipient snapshots,
   scheduling/timezones, deterministic send identity, batching, retries without
   duplicate successful sends, receipts, cost/metering, conversion/attribution,
   approvals, Temporal workflow and UI tests.
8. **Temporal platform closure** — standardize task queues, workflow IDs, search
   attributes, activity contracts, retries/timeouts/heartbeats, cancellation,
   signals/updates, approval/external-state handling, replay/versioning, worker and
   server restart evidence across all release-critical workflows already created
   by their domain workstreams.
9. **Automation Studio** — declarative typed triggers/conditions/branches/waits,
   versions, draft/publish, durable runs, approvals, typed canonical actions,
   metering/telemetry, UI builder and Temporal timers. No arbitrary SQL, HTTP,
   JavaScript, Python, or other untrusted code execution.
10. **Configuration model/compiler** — versioned declarative tenant configuration
    bundle; business profile/policies/templates -> compile -> validate -> diff ->
    approval where required -> idempotent publish/apply -> version/rollback.
11. **Configuration simulation** — synthetic-event dry run with no canonical
    production mutation/provider call; show policy decisions, automation/tool
    plans, approvals, provider intents, expected state, warnings, trace and
    estimated cost where available.
12. **Production Connector Closure** — implement/verify real Shopify, WooCommerce,
    WhatsApp, Instagram, Messenger, Email, Web Chat/API ingress, launch shipping,
    payment and generic REST adapters as applicable; finalize production secret
    backend, OAuth/token lifecycle, assets, webhooks, sync/reconcile, typed actions,
    errors/rate limits/health/uninstall. Development fixtures are CI emulators,
    never production adapters.
13. **AI typed tool platform** — stable/versioned tool registry mapping only to
    canonical platform commands, with schemas, permissions, risk, approval,
    idempotency, sensitivity, timeout/retry and audit contracts.
14. **AI Gateway production foundation** — model/provider adapters, capability
    catalog, deterministic/local/economical/strong/human routing, language/risk/
    latency/cost/context-aware policy, embeddings/reranker boundaries, fallback,
    model telemetry and usage cost.
15. **AI evaluation + Knowledge/RAG foundation** — tenant/access-scoped ingestion,
    pgvector retrieval/citations/freshness plus repeatable English/Arabic/dialect,
    prompt-injection, PII, tenant/resource, tool-safety, hallucination,
    retrieval/latency/cost evaluation thresholds before autonomous rollout.
16. **AI Operators** — Support, Sales, Lead Qualification, Order, Confirmation,
    Recovery, Shipping, Returns, Campaign Assistant and Moderator with prompt
    versions, knowledge scope, tool allowlists, eval thresholds, usage/cost,
    escalation and OFF/COPILOT/APPROVAL/AUTONOMOUS modes. Mode never bypasses
    risk or approvals.
17. **Custom Data** — tenant tables/fields/records, typed validation, row/field
    permissions, import/export, indexes, API/UI, events, automation hooks, safe AI
    tools, RLS and two-tenant tests; no arbitrary SQL/tenant schema generation.
18. **Analytics / ROI** — event-driven aggregates/materialized reporting for
    executive, support, commerce, shipping, recovery, sales, campaigns,
    automation, AI, provider cost and operations; measured dashboard performance.
19. **Billing / Metering commercial closure** — plans, entitlements, quotas,
    periods, overages, trials, subscription state, invoice/reference model,
    provider-cost allocation and suspension hooks consuming the existing usage
    ledger rather than reconstructing usage later.
20. **Developer Platform** — hashed/scoped tenant API keys, rotation/revocation,
    rate limits, canonical-event outbound webhooks, signatures, retries/dead
    letters, logs, developer UI/docs and audit.
21. **Admin Control Center + data governance** — tenant/integration/workflow/
    webhook/outbox/dead-letter health, AI/usage/spend/billing visibility, safe
    audited remediation; retention, export, deletion/anonymization, consent,
    media/AI trace/raw-webhook cleanup, secret rotation, suspension/deletion.
22. **Full product UX closure** — every real surface through the shared design
    system; English LTR, Arabic RTL, desktop/laptop/tablet/mobile, keyboard,
    practical WCAG 2.2 AA, loading/empty/forbidden/recoverable/fatal states,
    high-risk action evidence, consistent navigation and no placeholder pages.
23. **Observability / performance / security hardening** — production logs,
    traces, metrics/alerts, workflow/provider/queue/outbox/AI instrumentation,
    threat-model refresh, dependency/security scanning, realistic benchmarks,
    BOLA/IDOR, tenant escape, approval replay/substitution, webhook replay/forgery,
    SSRF/injection/upload/API-key/AI-tool/prompt-injection/cross-tenant-RAG tests.
24. **Release engineering + complete release acceptance** — immutable images,
    production Compose overlay, previous-release migration upgrade fixture,
    backup/restore/rollback, smoke tooling, deployment verification, runbook,
    release notes, full `TESTING_AND_ACCEPTANCE.md` execution and objective green
    release-candidate evidence.

## BLOCKED

- None. Production provider credentials, provider certification/approval, and
  deployment access remain external dependencies and must not be faked. Repository
  implementation should proceed with contract-faithful fixtures where live
  accounts are unavailable while still implementing the real adapter code.
- Production VPS/n8n changes remain out of scope until separately and explicitly
  authorized.

## DONE

- Immutable baseline migration checksum verifier and disposable CI stack.
- Keycloak/JWT tenant context, RLS transaction helper, OPA command authorization,
  digest-bound approvals, idempotency, immutable audit and transactional outbox.
- Connector/webhook ingress foundation with persisted/deduplicated deliveries,
  sync/reconciliation, typed provider actions, bounded retries and dead letters.
- CRM Customer 360 foundations including create/import, identity/merge approval,
  tags, segments, timeline, bounded export, verified consent/opt-out and protected
  browser acceptance evidence. Full product-wide UX closure remains later.
- Messaging/ticket foundations including unified conversation/message state,
  media, assignment/handover, outbound dispatch/receipts, templates, ticket
  lifecycle, SLA foundation, two-tenant lifecycle evidence and protected UI.
- Integration SDK repository-scope gate with deterministic development fixtures
  for Meta signup/assets, WhatsApp, Instagram, Messenger, Email, Web Chat, generic
  API, Shopify Public App and WooCommerce; real provider network adapters are not
  falsely claimed by this gate.
- Canonical Commerce through migrations `0027`–`0030`: stores, catalog, inventory,
  orders/lines/discounts/taxes, payments, fulfillments, mappings, order timeline,
  typed commands, RLS/relationship guards and lifecycle evidence.
- Order workflow repository-scope gate: confirmation, duplicate evaluation/review,
  guarded modification/cancellation, payment/fulfillment safety, typed post-commit
  provider actions, sync/timeline evidence, Temporal restart durability and
  protected responsive LTR/RTL Order browser acceptance.

## Release evidence rule

No item above is considered finished by prose claim. The implementation agent must
record objective validation in `IMPLEMENTATION_STATUS.md`. The overall release
remains **IN PROGRESS** until the queue drains and the final acceptance gate in
`TESTING_AND_ACCEPTANCE.md` passes.
