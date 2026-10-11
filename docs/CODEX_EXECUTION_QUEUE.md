# Codex Execution Queue

This is the authoritative dependency-ordered implementation queue for PRENEURA. A repository gate marked **COMPLETE** means its defined code/test evidence passed on an exact revision; it does **not** mean the full platform is production-ready.

## Execution discipline

- Keep one dependency-ready product workstream current.
- PostgreSQL remains canonical business state. Tenant relationships stay tenant-qualified and RLS-protected.
- Humans, APIs, workers, Temporal workflows, Automation, Configuration and AI use the same typed command / RBAC / OPA / approval / idempotency / audit / outbox path.
- Provider calls happen after canonical commit. Development fixtures never count as real provider adapters.
- Long-running business coordination belongs in Temporal, not polling loops or a second business database.
- Do not mark a schema, endpoint, page, fixture, preview deployment or green old-SHA CI as completion.
- Production VPS, customer databases/provider accounts and the existing n8n installation are outside automated repository/preview testing.

## Verified baseline

Current reviewed `main`: `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`, the merge of Recovery production closure.

The repository baseline before Sales includes verified Identity / Team / Organization, self-service onboarding, Returns / Exchanges / Refunds and Recovery repository gates plus the existing CRM, Messaging/Tickets, Commerce/Orders, Shipping, connector/webhook, usage/metering, security and hosted-preview foundations. The Railway project `preneura-platform-preview` remains an isolated development preview and is not production/customer/provider evidence.

## CURRENT — Sales

Sales is the first unfinished dependency-ready product workstream after merged Recovery. Closure requires:

- CRM-referenced leads without a duplicate customer identity model;
- structured qualification outcomes/signals, ownership and assignment to active tenant memberships;
- tenant-configurable pipelines and ordered OPEN/WON/LOST stages;
- opportunities with expected value, currency, probability, expected close date and explicit win/loss semantics;
- one qualified lead converting into at most one opportunity under concurrency;
- canonical Commerce order linkage for won opportunities, with same-customer/currency and confirmed/closed-state validation;
- activities/tasks/follow-up and an append-only sales timeline;
- tenant-qualified schema/RLS/relationship guards, permissions, OPA, idempotency, audit and outbox;
- protected operator API/UI with responsive EN/LTR + AR/RTL direction evidence;
- two-tenant lifecycle, cross-tenant relationship, idempotency and browser acceptance evidence.

Current implementation branch: `codex/sales-production-closure-20261011`, PR #18. It contains migration `0046_sales.sql`, Sales API/service, operator board/detail UI, deterministic preview fixtures, adversarial RLS checks, two-tenant command lifecycle and protected browser acceptance. It remains **IN PROGRESS** until the exact final head passes all mandatory CI/security gates and final review.

## Completed repository gates

- Tenant / migration / RLS foundation — FOUNDATION COMPLETE.
- RBAC / OPA / approvals — FOUNDATION COMPLETE.
- Idempotency / immutable audit / transactional outbox — FOUNDATION COMPLETE.
- Connector / webhook / sync / provider-action infrastructure with deterministic development fixtures — FOUNDATION COMPLETE.
- CRM / Customer 360 — STRONG FOUNDATION; final closure remains later.
- Unified Messaging / Tickets / SLA — STRONG FOUNDATION; final closure remains later.
- Commerce / Orders — COMPLETE repository gate.
- Shipping — COMPLETE repository gate.
- Usage / metering / telemetry / shared UI contracts — FOUNDATION COMPLETE.
- Identity / Team / Organization — COMPLETE repository gate; merged baseline `63bdb1bf5127684f2d15fb2a4dc05157af724617`.
- Self-service onboarding — COMPLETE repository gate; merged baseline `9728098275ff42cf7397ea153a6b5a5026bf1a66`, main CI #505 green.
- Returns / Exchanges / Refunds — COMPLETE repository gate; PR #12 head `17a05bf3fc9ceba8b8b6304202bfd922459d897b` passed CI #527 and merged as `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 green.
- Recovery — COMPLETE repository gate; PR #15 exact head `0a6ddaa8c216fa1b9bc6369af327f2d7acb7c1a5` passed CI #550 (`38151157082`) across all seven mandatory jobs and merged as `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`.

Repository completion for these domains does not waive later real-provider, full durable-process, complete EN/AR UX, security, performance, governance or release gates.

## Remaining dependency order

1. **Sales — CURRENT** — CRM-referenced leads, qualification, pipelines/stages, opportunities, activities/tasks, value/probability, win/loss and canonical order/customer linkage.
2. **Campaigns** — consent/suppression, immutable audience/recipient snapshots, scheduling/timezones/send windows, deterministic send identity, batching/rate limits, receipts, pause/cancel, cost/metering, conversion attribution and approvals.
3. **CRM / Customer 360 / Unified Inbox / Tickets / SLA final closure** — complete remaining maintenance, identity-resolution, search/filter/bulk, inbox/media/read, templates, ticket task/category/link, business-hours/escalation/notification and dedicated browser gaps.
4. **Business durability / Temporal closure** — registered workers/workflows for integration reconciliation, orders, shipping/rescue, returns/refunds, recovery, campaigns, support/operator and later automation; prove retries, timeouts, heartbeats, cancellation, signals/updates, duplicate starts, replay/evolution and restarts.
5. **Automation Studio** — declarative versioned triggers/conditions/branches/waits/actions, immutable publish, durable runs and safe builder; no unrestricted code/SQL/network.
6. **Configuration compiler** — versioned blueprints/bundles, normalize/compile/validate/diff/approve/apply/publish/history/rollback.
7. **Configuration simulation** — synthetic side-effect-free traces of rules/policy/approvals/proposed commands/provider intents/waits/warnings/cost.
8. **Production Connector Closure** — protected secrets plus real Meta/WhatsApp/Instagram/Messenger/Email/Web Chat/API, Shopify, WooCommerce and selected launch carrier/payment transports; OAuth/token/signature/rate-limit/reconcile/uninstall evidence.
9. **AI typed-tool platform** — versioned allowlisted tools mapped only to canonical commands with actor/tenant/resource, permissions/risk/approval, schemas, idempotency, sensitivity, timeout/retry, audit and usage.
10. **AI Gateway production closure** — authenticated internal model/provider routing, capability catalog, policy, budgets/fallback, embeddings/reranker interfaces, telemetry and cost.
11. **Knowledge/RAG + AI evaluation** — access-scoped ingestion/retrieval/citations/freshness/deletion and repeatable EN/AR/dialect security/quality/latency/cost tests.
12. **AI Operators** — Support, Sales, Lead Qualification, Order, Confirmation, Recovery, Shipping, Returns, Campaign Assistant and Moderator with versioned instructions, knowledge/tool scope, budgets, thresholds, escalation and controlled modes.
13. **Custom Data** — typed tenant tables/fields/records, permissions, import/export, safe evolution/indexes, API/UI/events/automation/AI tools; no arbitrary SQL.
14. **Analytics / ROI** — idempotent projections/rebuilds and attribution/cost dashboards across operational domains with measured lag/query performance.
15. **Billing / Metering commercial closure** — plans/subscriptions/entitlements/quotas/trials/periods/overages/provider-cost allocation/invoice references/suspension consuming canonical usage.
16. **Developer Platform** — scoped hashed API keys, show-once secret, expiry/revoke/rotate, rate limits and signed outbound canonical-event webhooks with retries/DLQ/logs/docs/UI/audit.
17. **Admin Control Center** — explicit privileged identity, tenant/integration/workflow/provider/outbox/webhook/DLQ/usage/spend/billing visibility and audited remediation.
18. **Data Governance** — retention/export/deletion/anonymization/consent evidence, media/raw-webhook/AI-trace cleanup, secret rotation, suspension/deletion and derived-data propagation.
19. **Full product UX closure** — one real design system, complete EN LTR + AR RTL translations/formatting/bidi, desktop/tablet/mobile, keyboard/focus/reduced-motion, practical WCAG 2.2 AA and complete loading/empty/forbidden/pending/recoverable/fatal states.
20. **Security hardening** — BOLA/IDOR/tenant escape, privilege escalation, approval replay/substitution/concurrency, webhook forgery/replay, SSRF/injection/upload/API-key abuse, prompt injection/tool abuse, cross-tenant RAG/admin misuse, dependency/image/SBOM closure.
21. **Observability operations** — production logs/metrics/traces, dashboards/alerts/runbooks for API, DB, outbox, webhooks, providers, workers, workflows, AI, projections and billing.
22. **Performance / SLO / capacity** — measurable normal/peak/burst/provider-slowdown/restart/saturation/backpressure/soak evidence against representative tenant/data sizes.
23. **Production deployment / disaster recovery** — explicit dev/staging/prod topology, immutable Web/Admin/API/AI/worker images, migration job, private infrastructure, durable media/secrets, backup/restore/PITR, upgrade/rollback drills and deploy provenance.
24. **Immutable full release acceptance** — one release candidate passes clean install, full migration chain, two-tenant/adversarial tests, actual business workflows, authorized real staging-provider proof, EN/AR/responsive/a11y, load/failure evidence, backup/restore/upgrade/rollback, UAT and launch verification.

## External prerequisites

Repository engineering continues while production provider credentials/certification, launch geography/provider selection, payment/carrier commercial access, jurisdiction-specific review and final production deployment authority are pending. These inputs must remain explicit and may never be fabricated with fixtures.

## Release evidence rule

PRENEURA remains **IN PROGRESS** until every mandatory workstream above is closed and the complete release gate passes on one immutable candidate. Update `IMPLEMENTATION_STATUS.md`, `PRODUCTION_READINESS_MATRIX.md` and `CAPABILITY_EVIDENCE_MATRIX.md` whenever a workstream is promoted.
