# Codex Execution Queue

This is the authoritative implementation queue for PRENEURA. `COMPLETE` means the repository
closure gate for that workstream has objective evidence on the exact code being evaluated. It
does not mean the overall platform is production-ready.

The full architecture and release order remain defined by `WORK_PLAN.md`,
`PLATFORM_EXECUTION_BLUEPRINT.md`, ADR 0004, and `TESTING_AND_ACCEPTANCE.md`.

## Execution discipline

- Keep exactly one product workstream current unless the only remaining work is externally
  blocked.
- Finish the complete branch before updating its Git ref. Do not use GitHub Actions as an
  iterative development shell.
- After the complete branch is published, the exact head must pass every mandatory CI gate
  before merge.
- Do not mix later domains into the current workstream merely because schema or service
  scaffolding already exists.
- A schema, endpoint, page, fixture, or partial test is not module completion.
- Production provider fixtures never count as production network adapters.
- Automated tests and preview infrastructure must never modify the production VPS or the
  existing n8n installation.

## Always-on requirements

Every domain must be built with the following rather than retrofitting them later:

- tenant-qualified relationships and PostgreSQL RLS;
- authenticated tenant context, RBAC/OPA, and approval policy where required;
- typed canonical domain commands;
- idempotency, immutable audit evidence, and transactional outbox events;
- post-commit provider execution through typed connector boundaries;
- Temporal durability for long-running processes where applicable;
- structured logs, correlation/trace context, and bounded operational metrics;
- canonical analytics/usage/cost instrumentation where applicable;
- shared design-system primitives and direction-safe UI behavior;
- unit, integration, RLS, authorization, contract, and browser evidence as applicable.

Humans, APIs, automations, Temporal workflows, configuration compilation, and AI must converge
on the same canonical business-command and security path. No subsystem may create a second
business backend.

## Current

### Self-service onboarding — IMPLEMENTED, VERIFICATION PENDING

The clean onboarding closure branch is limited to onboarding and its direct integration points.
It must prove all of the following on its exact head before merge:

- canonical reusable organization business profile;
- country, currency, timezone, locale, industry, customer model, commerce model, volume bands,
  and business goals;
- resumable setup state without duplicating Team or Integration domain state;
- Team status derived from active memberships and pending invitations;
- Integration status derived from canonical connection state;
- explicit defer/reopen dispositions for Team and first Integration;
- typed, authorized, idempotent commands with audit and outbox evidence;
- tenant RLS and two-tenant application isolation;
- invalid-input rollback and idempotency-conflict evidence;
- protected responsive onboarding browser acceptance with LTR/RTL direction behavior;
- migration verification, build, lint, typecheck, unit/integration tests, images, secret scan,
  and every other required CI job green on the exact head.

A pending invitation is `INVITED`, not completed Team setup. Integration setup distinguishes
`CONNECTED`, `DEGRADED`, `ACTION_REQUIRED`, `SKIPPED`, and `PENDING`. Workspace readiness is
reached only after the business profile is complete and the remaining setup steps are either
operationally usable or explicitly deferred.

The current onboarding branch must not include Returns, Recovery, Sales, or Campaigns domain
implementation. Those are separate closure branches below.

## Verification pending outside the current branch

- Full product-wide EN/AR translation, responsive/accessibility closure, and all error/empty
  states remain part of the later full-product UX gate.
- Production provider network verification remains part of Production Connector Closure.
- Complete Temporal retry/replay/cancellation/versioning standardization remains a dedicated
  platform-wide gate after release-critical domain workflows exist.

## Next workstreams

1. **Returns / Exchanges / Refunds** — distinct aggregates; eligibility; authorization;
   inspection; resolution; restock; approval-sensitive financial commands; payment/carrier
   hooks; workflow durability; API/UI; RLS; audit; outbox; usage/analytics; tests.
2. **Recovery** — commercial recovery opportunities; suppression/eligibility; attempts and
   offers; channel execution; expiry; recovered-order linkage; attribution/value; Temporal;
   ROI events; UI; tenant isolation.
3. **Sales** — CRM-referenced leads; qualification; pipelines/stages; opportunities;
   activities/tasks; expected value/probability; typed commands; structured AI-ready signals;
   UI and tests without duplicating CRM identity.
4. **Campaigns** — consent/suppression; immutable audience snapshots; deterministic recipients
   and sends; scheduling/timezones; batching; retries; delivery/read receipts; cost/metering;
   conversion/attribution; approvals; Temporal; UI and isolation tests.
5. **CRM / Customer 360 / Unified Inbox / Tickets / SLA final closure** — close remaining
   product behavior and UX on the existing strong foundation before higher-level orchestration
   depends on it.
6. **Temporal platform closure** — standard workflow IDs/task queues/search attributes,
   activity contracts, retry taxonomy, timeouts, heartbeats, cancellation, signals/updates,
   external-state handling, replay/versioning, worker restart, and server restart evidence.
7. **Automation Studio** — declarative triggers, conditions, branches, waits, approvals,
   versions, durable runs, typed canonical actions, telemetry/metering, and a safe builder. No
   arbitrary SQL, unrestricted HTTP, JavaScript, Python, or untrusted code execution.
8. **Configuration model/compiler** — versioned declarative tenant configuration; profile and
   policy inputs; compile; validate; diff; approval; idempotent publish/apply; version history;
   rollback.
9. **Configuration simulation** — synthetic non-mutating dry run showing policy decisions,
   automation/tool plans, approvals, provider intents, expected state, warnings, traces, and
   estimated cost without production mutation or provider calls.
10. **Production Connector Closure** — real Shopify, WooCommerce, WhatsApp Cloud, Instagram,
    Messenger, Email, Web Chat/API ingress, launch shipping carriers, payment providers, and
    generic REST/webhook adapters as applicable; secrets, OAuth/token lifecycle, webhooks,
    sync/reconcile, typed actions, rate limits, health, disconnect, and uninstall.
11. **AI typed-tool platform** — stable/versioned tools mapped only to canonical platform
    commands with schemas, permission/risk/approval policy, idempotency, sensitivity,
    timeout/retry, audit, and usage contracts.
12. **AI Gateway production foundation** — provider/model adapters and capability catalog;
    deterministic/local/economical/strong/human routing; language/risk/latency/cost/context
    policy; fallback; embeddings/reranker boundaries; telemetry and cost attribution.
13. **AI evaluation + Knowledge/RAG** — tenant/access-scoped sources, documents, versions,
    chunks, pgvector retrieval, citations/freshness, optional reranking, and repeatable safety,
    quality, latency, and cost evaluations for English, Arabic, and target dialects.
14. **AI Operators** — Support, Sales Assistant, Lead Qualification, Order, Confirmation,
    Recovery, Shipping, Returns, Campaign Assistant, and Moderator with versioned prompts,
    knowledge scope, tool allowlists, evaluation thresholds, budgets, escalation, and
    OFF/COPILOT/APPROVAL/AUTONOMOUS modes. Mode never bypasses risk policy.
15. **Custom Data** — tenant tables/fields/records, typed validation, permissions,
    import/export, indexes, API/UI, events, automation hooks, safe AI tools, RLS, and
    two-tenant tests; no arbitrary SQL or unmanaged tenant schemas.
16. **Analytics / ROI** — event-driven aggregates and reporting for executive, support,
    commerce, shipping, recovery, sales, campaigns, automation, AI, provider cost, and
    operations with measured dashboard performance.
17. **Billing / Metering commercial closure** — plans, subscriptions, entitlements, quotas,
    periods, overages, trials, provider-cost allocation, invoice references, and suspension
    hooks consuming the existing canonical usage ledger.
18. **Developer Platform** — scoped hashed API keys, expiry/rotation/revocation, rate limits,
    canonical-event outbound webhooks, signing, retries/dead letters, logs, docs/UI, and audit.
19. **Admin Control Center** — tenant/integration/workflow/webhook/outbox/dead-letter health,
    AI/usage/spend/billing visibility, and safe audited operational remediation commands.
20. **Data Governance** — retention, export, deletion/anonymization, consent evidence, media
    cleanup, AI trace/raw-webhook retention, secret rotation, suspension, and tenant deletion.
21. **Full product UX closure** — every release-critical surface through one design system with
    complete English LTR and Arabic RTL product copy, desktop/laptop/tablet/mobile layouts,
    keyboard support, practical WCAG 2.2 AA, and complete loading/empty/forbidden/recoverable/
    fatal states.
22. **Security hardening** — formal BOLA/IDOR and tenant-escape tests; privilege escalation;
    approval replay/substitution; forged/replayed webhooks; SSRF; injection; upload/API-key
    abuse; prompt injection; AI-tool abuse; cross-tenant RAG; dependency/image/SBOM closure.
23. **Observability operations** — production logs, metrics, traces, dashboards, alerts, SLO
    signals, workflow/provider/queue/outbox/AI visibility, and actionable runbooks.
24. **Performance / SLO / capacity** — normal, peak, burst, provider slowdown/failure, database
    restart, worker restart, Temporal restart, and Valkey restart scenarios with backpressure
    and retry-storm protection.
25. **Production deployment / disaster recovery** — dev/staging/prod isolation, immutable
    images, production Compose overlay, controlled migrations, health/readiness, backup,
    restore/PITR where applicable, rollback, smoke, deploy verification, and operational
    runbooks.
26. **Immutable full release acceptance** — clean install, migration chain, seed/base config,
    two-tenant isolation, API contracts, Temporal durability, provider emulators, real staging
    providers, browser E2E, EN/AR, responsive/accessibility, adversarial security, load/soak,
    failure injection, backup/restore, previous-release upgrade, rollback, UAT, release
    candidate, and production verification.

## Blocked external inputs

Repository engineering is not blocked. Production credentials, provider approval/certification,
and launch access are external inputs and must never be fabricated. Contract-faithful fixtures
may be used for deterministic CI, but fixtures cannot be represented as production adapters.

## Completed repository foundations

- canonical PostgreSQL tenant/RLS foundation;
- authentication, membership, RBAC/OPA, approval, and organization security foundation;
- idempotency, immutable audit, and transactional outbox;
- connector/webhook/sync/provider-action repository foundation and deterministic fixtures;
- CRM Customer 360 foundation;
- unified Messaging/Tickets/SLA foundation;
- Commerce and Order workflow repository gates;
- Shipping repository gate;
- cross-cutting usage/metering, telemetry, analytics-dimension, and shared UI contracts;
- Identity / Team / Organization repository closure.

## Release evidence rule

No item becomes `COMPLETE` because prose says so. Record objective exact-head evidence in
`IMPLEMENTATION_STATUS.md`. The platform remains **IN PROGRESS** until this queue drains and the
complete acceptance requirements pass on one immutable release candidate.
