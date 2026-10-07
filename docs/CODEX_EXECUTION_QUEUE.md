# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a verified
repository/release gate, not for the existence of a schema, endpoint, or page.

The full dependency model is defined in `PLATFORM_EXECUTION_BLUEPRINT.md` and ADR 0004.
`WORK_PLAN.md` defines the program order. This file tells the implementation agent what
to execute now.

Invariant: unless `BLOCKED` contains the only remaining mandatory work, `CURRENT` must
contain exactly one executable workstream. Completing `CURRENT` triggers validation,
status/documentation updates, promotion of the next dependency-ready item, and immediate
implementation action. A green feature PR is not a public release authorization.

## ALWAYS-ON REQUIREMENTS

Every current/future module must integrate these while it is built; they are not allowed
to become end-of-project retrofits:

- tenant-qualified schema/relationships and PostgreSQL RLS;
- authentication, membership, RBAC, OPA, approval where required;
- idempotent typed commands, immutable audit, transactional outbox events;
- post-commit provider execution through typed connectors only;
- Temporal workflow/activity hooks for long-running business processes;
- structured logs, correlation/trace context, bounded operational metrics;
- analytics event/dimension instrumentation;
- canonical usage/cost records for metered actions;
- shared design-system components, English LTR, Arabic RTL, responsive and accessible states;
- unit/integration/RLS/authorization/contract/browser evidence as applicable.

Humans, APIs, automations, Temporal workflows, the configuration compiler, and AI must
converge on the same canonical domain-command/security path. No subsystem may implement a
second business backend.

## CURRENT

- **Basic self-service onboarding** — build the canonical tenant business profile and guided
  first-run experience on top of the merged Identity / Team / Organization foundation.
  Required persisted data includes business/company identity, country, default currency,
  timezone, language/locale, industry, B2B/B2C orientation, commerce model, order/contact/
  conversation volume bands, business goals, initial-team progress and first-integration
  progress. The profile must be reusable by later configuration, automation, analytics,
  billing and AI layers. Onboarding must be resumable, idempotent, tenant-isolated, audited,
  responsive, English LTR + Arabic RTL, and covered by two-tenant and protected browser
  evidence. It may recommend the next setup action but must not generate opaque workflows or
  bypass canonical connector setup, approvals or authorization.

## VERIFICATION PENDING

- **Ticket visual acceptance:** the protected ticket UI has build/type evidence; exhaustive
  browser E2E, RTL/LTR, responsive, and accessibility evidence remains part of the later
  product-wide UX gate unless it becomes necessary earlier for a dependent change.

## NEXT

1. **Returns / Exchanges / Refunds** — distinct return/refund/exchange aggregates,
   eligibility, inspection, resolution, restock, approval-sensitive financial execution,
   provider contracts, workflow hooks, UI, RLS and tests.
2. **Recovery** — commercial recovery opportunities, eligibility/suppression,
   attempts/offers, Messaging integration, expiry, recovered-order linking,
   attribution/value, Temporal workflow, ROI events, UI and isolation tests.
3. **Sales** — CRM-referenced leads, qualification, pipelines/stages, opportunities,
   activities/tasks, expected value/probability, typed commands, AI-ready structured
   signals, UI and tests. Do not duplicate CRM identity.
4. **Campaigns** — consent/suppression, frozen audience and recipient snapshots,
   scheduling/timezones, deterministic send identity, batching, retries without duplicate
   successful sends, receipts, cost/metering, conversion/attribution, approvals, Temporal
   workflow and UI tests.
5. **Temporal platform closure** — standardize task queues, workflow IDs, search attributes,
   activity contracts, retries/timeouts/heartbeats, cancellation, signals/updates,
   approval/external-state handling, replay/versioning, worker and server restart evidence
   across release-critical workflows already created by their domain workstreams.
6. **Automation Studio** — declarative typed triggers/conditions/branches/waits, versions,
   draft/publish, durable runs, approvals, typed canonical actions, metering/telemetry, UI
   builder and Temporal timers. No arbitrary SQL, HTTP, JavaScript, Python, or other
   untrusted code execution.
7. **Configuration model/compiler** — versioned declarative tenant configuration bundle;
   business profile/policies/templates -> compile -> validate -> diff -> approval where
   required -> idempotent publish/apply -> version/rollback.
8. **Configuration simulation** — synthetic-event dry run with no canonical production
   mutation/provider call; show policy decisions, automation/tool plans, approvals, provider
   intents, expected state, warnings, trace and estimated cost where available.
9. **Production Connector Closure** — implement/verify real Shopify, WooCommerce, WhatsApp,
   Instagram, Messenger, Email, Web Chat/API ingress, launch shipping, payment and generic
   REST adapters as applicable; finalize production secret backend, OAuth/token lifecycle,
   assets, webhooks, sync/reconcile, typed actions, errors/rate limits/health/uninstall.
   Development fixtures are CI emulators, never production adapters.
10. **AI typed tool platform** — stable/versioned tool registry mapping only to canonical
    platform commands, with schemas, permissions, risk, approval, idempotency, sensitivity,
    timeout/retry and audit contracts.
11. **AI Gateway production foundation** — model/provider adapters, capability catalog,
    deterministic/local/economical/strong/human routing, language/risk/latency/cost/context-
    aware policy, embeddings/reranker boundaries, fallback, model telemetry and usage cost.
12. **AI evaluation + Knowledge/RAG foundation** — tenant/access-scoped ingestion, pgvector
    retrieval/citations/freshness plus repeatable English/Arabic/dialect, prompt-injection,
    PII, tenant/resource, tool-safety, hallucination, retrieval/latency/cost evaluation
    thresholds before autonomous rollout.
13. **AI Operators** — Support, Sales, Lead Qualification, Order, Confirmation, Recovery,
    Shipping, Returns, Campaign Assistant and Moderator with prompt versions, knowledge
    scope, tool allowlists, eval thresholds, usage/cost, escalation and
    OFF/COPILOT/APPROVAL/AUTONOMOUS modes. Mode never bypasses risk or approvals.
14. **Custom Data** — tenant tables/fields/records, typed validation, row/field permissions,
    import/export, indexes, API/UI, events, automation hooks, safe AI tools, RLS and
    two-tenant tests; no arbitrary SQL/tenant schema generation.
15. **Analytics / ROI** — event-driven aggregates/materialized reporting for executive,
    support, commerce, shipping, recovery, sales, campaigns, automation, AI, provider cost
    and operations; measured dashboard performance.
16. **Billing / Metering commercial closure** — plans, entitlements, quotas, periods,
    overages, trials, subscription state, invoice/reference model, provider-cost allocation
    and suspension hooks consuming the existing usage ledger rather than reconstructing
    usage later.
17. **Developer Platform** — hashed/scoped tenant API keys, rotation/revocation, rate limits,
    canonical-event outbound webhooks, signatures, retries/dead letters, logs, developer
    UI/docs and audit.
18. **Admin Control Center + data governance** — tenant/integration/workflow/webhook/outbox/
    dead-letter health, AI/usage/spend/billing visibility, safe audited remediation;
    retention, export, deletion/anonymization, consent, media/AI trace/raw-webhook cleanup,
    secret rotation, suspension/deletion.
19. **Full product UX closure** — every real surface through the shared design system;
    English LTR, Arabic RTL, desktop/laptop/tablet/mobile, keyboard, practical WCAG 2.2 AA,
    loading/empty/forbidden/recoverable/fatal states, high-risk action evidence, consistent
    navigation and no placeholder pages.
20. **Observability / performance / security hardening** — production logs, traces,
    metrics/alerts, workflow/provider/queue/outbox/AI instrumentation, threat-model refresh,
    dependency/security scanning, realistic benchmarks, BOLA/IDOR, tenant escape, approval
    replay/substitution, webhook replay/forgery, SSRF/injection/upload/API-key/AI-tool/
    prompt-injection/cross-tenant-RAG tests.
21. **Release engineering + complete release acceptance** — immutable images, production
    Compose overlay, previous-release migration upgrade fixture, backup/restore/rollback,
    smoke tooling, deployment verification, runbook, release notes, full
    `TESTING_AND_ACCEPTANCE.md` execution and objective green release-candidate evidence.

## BLOCKED

- No repository workstream is blocked. Production provider credentials,
  provider certification/approval, and launch credentials remain external dependencies and
  must not be faked. Repository implementation proceeds with contract-faithful fixtures while
  real adapter code and verification gates are still implemented.
- Production VPS/n8n changes remain out of scope until separately and explicitly authorized.
- The Railway environment `preneura-platform-preview` is an isolated test/preview target, not
  the production VPS. Hosted-preview issues must not weaken repository security gates.

## DONE

- Immutable baseline migration checksum verifier and disposable CI stack.
- Keycloak/JWT tenant context, RLS transaction helper, OPA command authorization,
  digest-bound approvals, idempotency, immutable audit and transactional outbox.
- Connector/webhook ingress foundation with persisted/deduplicated deliveries,
  sync/reconciliation, typed provider actions, bounded retries and dead letters.
- CRM Customer 360 foundations including create/import, identity/merge approval, tags,
  segments, timeline, bounded export, verified consent/opt-out and protected browser evidence.
- Messaging/ticket foundations including unified conversation/message state, media,
  assignment/handover, outbound dispatch/receipts, templates, ticket lifecycle, SLA
  foundation, two-tenant lifecycle evidence and protected UI.
- Integration SDK repository-scope gate with deterministic development fixtures for Meta
  signup/assets, WhatsApp, Instagram, Messenger, Email, Web Chat, generic API, Shopify Public
  App and WooCommerce; real provider network adapters are not falsely claimed by this gate.
- Canonical Commerce through migrations `0027`–`0030`: stores, catalog, inventory,
  orders/lines/discounts/taxes, payments, fulfillments, mappings, order timeline, typed
  commands, RLS/relationship guards and lifecycle evidence.
- Order workflow repository-scope gate: confirmation, duplicate evaluation/review, guarded
  modification/cancellation, payment/fulfillment safety, typed post-commit provider actions,
  sync/timeline evidence, Temporal restart durability and protected responsive LTR/RTL Order
  browser acceptance.
- Shipping repository-scope gate through migrations `0031`–`0035`: carrier/service
  configuration, canonical location hierarchy, destination normalization/validation,
  zones/mappings/service eligibility, shipments/lines/packages, labels/provider references,
  append-only tracking, delivery attempts, rescue lifecycle, API/UI, relationship/RLS
  evidence and protected LTR/RTL/responsive browser acceptance. Real carrier adapters remain
  mandatory under Production Connector Closure.
- **Cross-cutting contract reinforcement — COMPLETE.** PR #6 merged the canonical versioned
  meter registry and append-only usage ledger, provider-cost semantics, bounded analytics
  dimensions, correlation/trace/safe-error contracts, structured observability envelope and
  reusable direction-safe/a11y-aware UI primitives with two-tenant evidence and green CI.
- **Identity / Team / Organization closure — COMPLETE.** PR #7 exact head
  `7a05569d630dbfc7deb411d82f7df41779d5a5e2` passed CI run #444 with 7/7 jobs green,
  including migration/RLS verification, two-tenant application lifecycles, Temporal restart
  durability, protected browser E2E, image builds, quality and secret scan. It merged to
  `main` as `63bdb1bf5127684f2d15fb2a4dc05157af724617` with invitations, organization creation/
  selection, profile/locale/timezone, role management, membership lifecycle, last-owner
  safeguards and Keycloak-assurance MFA policy closure.

## Release evidence rule

No item above is considered finished by prose claim. The implementation agent must record
objective validation in `IMPLEMENTATION_STATUS.md` and `PRODUCTION_READINESS_MATRIX.md`.
The overall release remains **IN PROGRESS** until the queue drains and the final acceptance
gate in `TESTING_AND_ACCEPTANCE.md` passes on an immutable release candidate.
