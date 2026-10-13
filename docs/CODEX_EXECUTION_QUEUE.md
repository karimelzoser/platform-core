# Codex Execution Queue

This is the authoritative dependency-ordered implementation queue for PRENEURA. A repository gate marked **COMPLETE** means its defined code/test evidence passed on an exact revision; it does **not** mean the full platform is production-ready.

## Execution discipline

- Keep one dependency-ready product workstream current.
- PostgreSQL remains canonical business state. Tenant relationships stay tenant-qualified and RLS-protected.
- Humans, APIs, workers, Temporal, Automation, Configuration and AI use the same typed command / RBAC / OPA / approval / idempotency / audit / outbox path.
- Provider calls happen after canonical commit. Development fixtures never count as production provider adapters.
- Long-running coordination belongs in Temporal, not polling loops or a second business database.
- A schema, endpoint, page, preview, old-SHA CI or workflow ID alone is never completion evidence.
- Production VPS/customer databases/provider accounts and the existing n8n installation are outside automated repository testing.

## Verified baseline

**Reviewed `main`:** `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f` — merged Recovery production closure.

**Exact repository evidence:** Continuous Integration #551 (`38153985259`) passed on that merged SHA. Scheduled development-preview availability also passed on the same repository generation. Recovery is therefore promoted to COMPLETE repository gate.

A separate live preview is being moved to Render. Render currently blocks creation of the isolated Postgres resource with account-level `402 Payment information is required`; this is an external hosting/account gate and is not repository completion evidence.

## CURRENT — Sales

Branch: `codex/sales-production-closure-20261012`, based on green Recovery main `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`.

Sales closure requires:

- CRM-referenced leads without copying customer/contact identity;
- qualification score/grade/status and disqualification evidence;
- tenant-scoped configurable pipelines and ordered stages;
- opportunity value/currency/probability/expected-close lifecycle;
- owner assignment through canonical memberships;
- activities/tasks and completion state;
- pipeline-consistent stage transitions and explicit won/lost terminal semantics;
- optional Commerce-order linkage for won opportunities without duplicating order state;
- append-only stage history;
- tenant-qualified schema/RLS/relationship guards;
- permissions/OPA/idempotency/audit/outbox through canonical commands;
- protected API and responsive EN/AR-direction-safe operator UI;
- two-tenant RLS, application lifecycle, retry/idempotency and browser evidence;
- exact-head seven-job CI and merge/main verification before promotion.

The active branch currently contains migration `0046_sales.sql`, protected Sales API/service, operator UI, configurable pipeline builder, two-tenant RLS/application lifecycle tests and protected browser acceptance. Sales remains CURRENT until those gates pass on the exact revision being merged.

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
- Identity / Team / Organization — COMPLETE repository gate; merged `63bdb1bf5127684f2d15fb2a4dc05157af724617`.
- Self-service onboarding — COMPLETE repository gate; merged `9728098275ff42cf7397ea153a6b5a5026bf1a66`; main CI #505 green.
- Returns / Exchanges / Refunds — COMPLETE repository gate; merged `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 green.
- Recovery — COMPLETE repository gate; merged `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`; main CI #551 green.

Repository completion does not waive later real-provider, complete Temporal, EN/AR UX, security, performance, governance or final release gates.

## Remaining dependency order

1. **Sales — CURRENT.**
2. **Campaigns** — consent/suppression, immutable audiences/recipients, scheduling/timezones/send windows, batching/rate limits, receipts, pause/cancel, cost/metering, conversion attribution and approvals.
3. **CRM / Customer 360 / Unified Inbox / Tickets / SLA final closure** — remaining maintenance, identity-resolution, search/filter/bulk, inbox/media/read, templates, ticket task/category/link, business-hours/escalation/notification and dedicated browser gaps.
4. **Business durability / Temporal closure** — integration reconciliation, orders, shipping/rescue, returns/refunds, recovery, campaigns, support/operator and later automation workflow/activity families; retries/timeouts/heartbeats/cancellation/signals/updates/duplicate starts/replay/evolution/restarts.
5. **Automation Studio** — safe declarative versioned triggers/conditions/branches/waits/actions and durable runs; no arbitrary JS/Python/SQL/raw HTTP.
6. **Configuration compiler** — versioned blueprints/bundles, normalize/compile/validate/diff/approve/apply/publish/history/rollback.
7. **Configuration simulation** — side-effect-free synthetic traces sharing runtime policy semantics.
8. **Production Connector Closure** — protected secrets plus real Meta/WhatsApp/Instagram/Messenger/Email/Web Chat/API, Shopify, WooCommerce and selected launch carrier/payment transports.
9. **AI typed-tool platform** — versioned allowlisted tools mapped only to canonical commands with actor/tenant/resource/permission/risk/approval/idempotency/audit/usage contracts.
10. **AI Gateway production closure** — authenticated routing, providers/models/capability policy/budgets/fallback/telemetry/cost.
11. **Knowledge/RAG + AI evaluation** — access-scoped ingestion/retrieval/citations/freshness/deletion plus repeatable EN/AR/dialect security/quality/latency/cost tests.
12. **AI Operators** — Support, Sales, Lead Qualification, Order, Confirmation, Recovery, Shipping, Returns, Campaign Assistant and Moderator with controlled modes and hard safety gates.
13. **Custom Data** — typed tenant tables/fields/records/permissions/import/export/UI/events/automation/AI tools; no arbitrary SQL.
14. **Analytics / ROI** — idempotent projections/rebuilds and attribution/cost dashboards with measured performance.
15. **Billing / Metering commercial closure** — plans/subscriptions/entitlements/quotas/trials/periods/overages/provider-cost allocation/invoice references/suspension.
16. **Developer Platform** — scoped hashed API keys and signed outbound canonical-event webhooks with rate limits/retries/DLQ/logs/docs/UI/audit.
17. **Admin Control Center** — privileged operational visibility and audited remediation.
18. **Data Governance** — retention/export/deletion/anonymization/consent/media/raw-webhook/AI-trace cleanup/secret lifecycle/suspension/deletion propagation.
19. **Full product UX closure** — one design system, complete EN LTR + AR RTL translations/formatting/bidi, desktop/tablet/mobile, keyboard/focus/reduced-motion, practical WCAG 2.2 AA and complete application states.
20. **Security hardening** — BOLA/IDOR/tenant escape, privilege escalation, approval replay/substitution/concurrency, webhook forgery/replay, SSRF/injection/upload/API-key abuse, prompt/tool/RAG/admin misuse, dependency/image/SBOM closure.
21. **Observability operations** — production logs/metrics/traces/dashboards/alerts/runbooks.
22. **Performance / SLO / capacity** — normal/peak/burst/provider-slowdown/restart/saturation/backpressure/soak evidence.
23. **Production deployment / disaster recovery** — explicit dev/staging/prod topology, immutable images, migration job, private infrastructure, durable media/secrets, backup/restore/PITR, upgrade/rollback drills and deploy provenance.
24. **Immutable full release acceptance** — one release candidate passes clean install, migration chain, tenant/adversarial tests, actual workflows, authorized real staging providers, EN/AR/responsive/a11y, load/failure, backup/restore/upgrade/rollback, UAT and launch verification.

## External prerequisites

Repository engineering continues while production provider credentials/certification, launch geography/provider selection, carrier/payment commercial access, jurisdiction-specific review, Render billing for the requested isolated preview, and final production deployment authority are pending. These inputs stay explicit and are never fabricated with fixtures.

## Release evidence rule

PRENEURA remains **IN PROGRESS** until every mandatory workstream above is closed and the complete release gate passes on one immutable candidate. Update `IMPLEMENTATION_STATUS.md`, `PRODUCTION_READINESS_MATRIX.md` and `CAPABILITY_EVIDENCE_MATRIX.md` whenever a workstream is promoted.
