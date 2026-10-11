# Codex Execution Queue

This is the authoritative dependency-ordered implementation queue for PRENEURA. A repository gate marked **COMPLETE** means its defined code/test evidence passed on an exact revision; it does **not** mean the full platform is production-ready.

## Execution discipline

- Keep one dependency-ready product workstream current. Bounded release/security repairs may temporarily precede it when they protect every later workstream.
- PostgreSQL remains canonical business state. Tenant relationships stay tenant-qualified and RLS-protected.
- All humans, APIs, workers, Temporal workflows, Automation, Configuration and AI use the same typed command / RBAC / OPA / approval / idempotency / audit / outbox path.
- Provider calls happen after canonical commit. Development fixtures never count as real provider adapters.
- Long-running business coordination belongs in Temporal, not polling loops or a second business database.
- Do not mark a schema, endpoint, page, fixture, preview deployment or green old-SHA CI as completion.
- Production VPS, customer databases/provider accounts and the existing n8n installation are outside automated repository/preview testing.

## Bounded stabilization — VERIFIED BASELINE

Current reviewed `main`: `86facdbfe89b69d6859cabed9c670f9471bdf62a`
(merged security/preview/tooling and approval-expiry stabilization). Main CI #546 passed all seven jobs,
including dependency/image security. Railway deployment
`451a935c-7ee7-4519-83ed-0907917801f2` reports this SHA, and its public health
endpoint returned HTTP 200 with matching provenance and development environment.
Real Keycloak login, public redirects, protected customer/order reads and visible
LTR/RTL order layout were also verified. Full Arabic translation is not complete.

The merged stabilization closed:

1. close the known Web/Admin dependency advisories using supported patched Next.js/React versions and current transitive fixes;
2. keep dependency and container-image vulnerability scans in CI;
3. repair and externally verify the isolated Railway development preview, including listener/domain/health agreement and exact deployed SHA provenance;
4. keep the preview isolated from real production/customer/provider state;
5. reconcile this queue, implementation status and readiness/evidence matrices with exact repository/deployment evidence.

This stabilization is not a substitute for product implementation and must remain bounded.

## CURRENT — Recovery

Recovery is the next dependency-ready domain after merged Returns. Closure requires:

- recovery opportunities derived from canonical abandoned/lost commercial state rather than duplicate order/customer state;
- eligibility, suppression, consent and expiration rules;
- bounded attempts/offers and approval thresholds for incentives/discounts;
- deterministic recipient/send identities so retries never duplicate successful sends;
- Messaging integration through canonical outbound commands;
- recovered-order linkage and deterministic attribution/confidence;
- recovered value, channel/provider cost and later ROI source events;
- tenant-qualified schema/RLS/relationship guards, permissions, OPA, approval, idempotency, audit and outbox;
- durable Temporal coordination for waits/retries/expiry where applicable;
- operator API/UI with truthful pending/suppressed/expired/recovered states;
- two-tenant, retry/idempotency, authorization and protected browser evidence.

Delivery rescue remains a Shipping responsibility and must not be duplicated in Recovery.

The continuation branch now implements protected expiry commands, a registered
Temporal expiry workflow and a durable committed-event bridge. Contract/build
checks pass locally; new runtime/tenant/browser evidence remains pending the
substantial batch's CI. CURRENT stays Recovery until dispatch consent/linkage,
delivery state, attribution/cost, approval UX and complete applicable acceptance
are closed. Do not promote Sales from workflow IDs or infrastructure alone.

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
- Identity / Team / Organization — COMPLETE repository gate.
- Self-service onboarding — COMPLETE repository gate; merged as `9728098275ff42cf7397ea153a6b5a5026bf1a66`, main CI #505 green.
- Returns / Exchanges / Refunds — COMPLETE repository gate; PR #12 head `17a05bf3fc9ceba8b8b6304202bfd922459d897b` passed CI #527 and merged as `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 green.

Repository completion for those domains does not waive later real-provider, real-Temporal, full EN/AR UX, security, performance, governance or release gates.

## Remaining dependency order

1. **Recovery** — commercial recovery eligibility/suppression/attempts/offers/sends/expiry/attribution/value/Temporal/UI/isolation.
2. **Sales** — CRM-referenced leads, qualification, pipelines/stages, opportunities, activities/tasks, value/probability, win/loss and order/customer linkage without duplicating CRM identity.
3. **Campaigns** — consent/suppression, immutable audiences/recipients, scheduling/timezones/send windows, batching/rate limits, receipts, pause/cancel, cost/metering, conversion attribution and approvals.
4. **CRM / Customer 360 / Unified Inbox / Tickets / SLA final closure** — complete remaining maintenance, identity-resolution, search/filter/bulk, inbox/media/read, templates, ticket task/category/link, business-hours/escalation/notification and dedicated browser gaps.
5. **Business durability / Temporal closure** — real registered workers and workflow/activity definitions for integration reconciliation, order confirmation, shipping/rescue, returns/refunds, recovery, campaigns, support/operator and later automation; prove retries, timeouts, heartbeats, cancellation, signals/updates, duplicate starts, replay/evolution and restarts.
6. **Automation Studio** — declarative versioned triggers/conditions/branches/waits/actions, immutable publish, durable runs and safe builder; no unrestricted code/SQL/network.
7. **Configuration compiler** — versioned blueprints/bundles, normalize/compile/validate/diff/approve/apply/publish/history/rollback.
8. **Configuration simulation** — synthetic side-effect-free traces of rules/policy/approvals/proposed commands/provider intents/waits/warnings/cost.
9. **Production Connector Closure** — real protected secrets plus Meta/WhatsApp/Instagram/Messenger/Email/Web Chat/API, Shopify, WooCommerce and selected launch carrier/payment transports; OAuth/token/signature/rate-limit/reconcile/uninstall evidence.
10. **AI typed-tool platform** — versioned allowlisted tools mapped only to canonical commands with actor/tenant/resource, permissions/risk/approval, schemas, idempotency, sensitivity, timeout/retry, audit and usage.
11. **AI Gateway production closure** — authenticated internal model/provider routing, capability catalog, policy, budgets/fallback, embeddings/reranker interfaces, telemetry and cost.
12. **Knowledge/RAG + AI evaluation** — access-scoped ingestion/retrieval/citations/freshness/deletion and repeatable EN/AR/dialect security/quality/latency/cost tests.
13. **AI Operators** — Support, Sales, Lead Qualification, Order, Confirmation, Recovery, Shipping, Returns, Campaign Assistant and Moderator with versioned instructions, knowledge/tool scope, budgets, thresholds, escalation and controlled modes.
14. **Custom Data** — typed tenant tables/fields/records, permissions, import/export, safe evolution/indexes, API/UI/events/automation/AI tools; no arbitrary SQL.
15. **Analytics / ROI** — idempotent projections/rebuilds and attribution/cost dashboards across operational domains with measured lag/query performance.
16. **Billing / Metering commercial closure** — plans/subscriptions/entitlements/quotas/trials/periods/overages/provider-cost allocation/invoice references/suspension consuming canonical usage.
17. **Developer Platform** — scoped hashed API keys, show-once secret, expiry/revoke/rotate, rate limits and signed outbound canonical-event webhooks with retries/DLQ/logs/docs/UI/audit.
18. **Admin Control Center** — explicit privileged identity, tenant/integration/workflow/provider/outbox/webhook/DLQ/usage/spend/billing visibility and audited remediation.
19. **Data Governance** — retention/export/deletion/anonymization/consent evidence, media/raw-webhook/AI-trace cleanup, secret rotation, suspension/deletion and derived-data propagation.
20. **Full product UX closure** — one real design system, complete EN LTR + AR RTL translations/formatting/bidi, desktop/tablet/mobile, keyboard/focus/reduced-motion, practical WCAG 2.2 AA and complete loading/empty/forbidden/pending/recoverable/fatal states.
21. **Security hardening** — BOLA/IDOR/tenant escape, privilege escalation, approval replay/substitution/concurrency, webhook forgery/replay, SSRF/injection/upload/API-key abuse, prompt injection/tool abuse, cross-tenant RAG/admin misuse, dependency/image/SBOM closure.
22. **Observability operations** — production logs/metrics/traces, dashboards/alerts/runbooks for API, DB, outbox, webhooks, providers, workers, workflows, AI, projections and billing.
23. **Performance / SLO / capacity** — measurable normal/peak/burst/provider-slowdown/restart/saturation/backpressure/soak evidence against representative tenant/data sizes.
24. **Production deployment / disaster recovery** — explicit dev/staging/prod topology, immutable Web/Admin/API/AI/worker images, migration job, private infrastructure, durable media/secrets, backup/restore/PITR, upgrade/rollback drills and deploy provenance.
25. **Immutable full release acceptance** — one release candidate passes clean install, full migration chain, two-tenant/adversarial tests, actual business workflows, authorized real staging-provider proof, EN/AR/responsive/a11y, load/failure evidence, backup/restore/upgrade/rollback, UAT and launch verification.

## External prerequisites

Repository engineering continues while production provider credentials/certification, launch geography/provider selection, payment/carrier commercial access, jurisdiction-specific review and final production deployment authority are pending. These inputs must remain explicit and may never be fabricated with fixtures.

## Release evidence rule

PRENEURA remains **IN PROGRESS** until every mandatory workstream above is closed and the complete release gate passes on one immutable candidate. Update `IMPLEMENTATION_STATUS.md`, `PRODUCTION_READINESS_MATRIX.md` and `CAPABILITY_EVIDENCE_MATRIX.md` whenever a workstream is promoted.
