# Production Readiness Matrix

This matrix distinguishes repository implementation from deployment and final production acceptance. A green branch or preview is evidence for its own gate only.

**Overall release state:** IN PROGRESS

**Reviewed `main`:** `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f` — Recovery production closure merged.

**Recovery exact-head evidence:** PR #15 head `0a6ddaa8c216fa1b9bc6369af327f2d7acb7c1a5`, CI #550 (`38151157082`), all seven mandatory jobs green.

**Current product workstream:** Sales — PR #18.

## Status vocabulary

- **COMPLETE repository gate** — defined repository scope passed exact-revision evidence.
- **FOUNDATION** — reusable substrate exists; production closure remains.
- **IN PROGRESS** — active implementation/verification remains.
- **NOT STARTED** — no release-acceptable closure yet.
- **EXTERNAL** — real credential/certification/commercial/legal/deployment input is required and cannot be fabricated.

## Core platform

| Capability | Repository state | Deployment/production boundary |
| --- | --- | --- |
| PostgreSQL / migrations / tenant RLS | FOUNDATION | Previous-release upgrade, backup/restore/PITR and production capacity evidence remain |
| RBAC / OPA / approvals | FOUNDATION | Product-wide adversarial authorization and privileged admin closure remain |
| Idempotency / audit / outbox | FOUNDATION | Operational remediation, concurrency and ambiguous-provider closure remain |
| Temporal | FOUNDATION | Recovery expiry is a verified business workflow; complete workflow family/replay/versioning closure remains |
| Usage / metering source ledger | FOUNDATION | Commercial plans/quotas/invoicing/enforcement remain |
| Observability contracts | FOUNDATION | Real dashboards/alerts/SLO ownership/runbooks remain |
| Shared design system | FOUNDATION | Complete product adoption, translation and accessibility remain |
| Dependency / image security | FOUNDATION | Mandatory audit/image gates exist; every later candidate must pass them |

## Business capabilities

| Capability | Repository state | Remaining boundary |
| --- | --- | --- |
| CRM / Customer 360 | FOUNDATION | Final maintenance/identity-resolution/search/bulk/UX/governance closure |
| Inbox / Messaging / Tickets / SLA | FOUNDATION | Real provider channels, final support/SLA behavior and dedicated browser closure |
| Commerce / Orders | COMPLETE repository gate | Real Shopify/WooCommerce/payment/provider execution and commercial edge cases |
| Shipping | COMPLETE repository gate | Real carriers/labels/tracking/address data and durable production workflow closure |
| Identity / Team / Organization | COMPLETE repository gate | Production browser session/MFA/invitation-delivery and product-wide identity UX |
| Self-service onboarding | COMPLETE repository gate | Config compiler/simulation, final Arabic copy and production acquisition-to-activation journey |
| Returns / Exchanges / Refunds | COMPLETE repository gate | Real payment/provider transports and complete durable process closure |
| Recovery | COMPLETE repository gate | Real messaging/payment/provider transports plus later full analytics/ROI/product UX gates |
| Sales | IN PROGRESS — CURRENT | PR #18 implements canonical Sales domain/API/UI/evidence; exact final head still must pass mandatory CI/security review |
| Campaigns | NOT STARTED | After Sales |

## Orchestration and configuration

- **Business Temporal closure — FOUNDATION:** infrastructure/restart evidence and Recovery expiry workflow exist; the complete registered business workflow family remains open.
- **Automation Studio — NOT STARTED.**
- **Configuration compiler — NOT STARTED.**
- **Configuration simulation — NOT STARTED.**

## Integrations

- **Connector/webhook/sync/provider-action infrastructure — FOUNDATION.**
- **Development fixtures — IMPLEMENTED for deterministic CI only; never production evidence.**
- **Protected secret resolver/storage/rotation — NOT COMPLETE.**
- **Production Meta / WhatsApp / Instagram / Messenger / Email / Web Chat / API transports — NOT COMPLETE.**
- **Production Shopify / WooCommerce — NOT COMPLETE.**
- **Launch carriers / payment providers — EXTERNAL selection/credentials plus implementation/staging proof required.**

## AI

- **AI typed tools — NOT STARTED as a production registry.**
- **AI Gateway — FOUNDATION only.**
- **Knowledge / RAG — NOT STARTED.**
- **AI evaluation — NOT STARTED as release gate.**
- **AI Operators — NOT STARTED as production operators.**

## Commercial/data platform

- **Custom Data — NOT STARTED.**
- **Analytics / ROI — FOUNDATION source contracts; reporting/attribution products open.**
- **Billing / Metering — FOUNDATION source ledger; subscriptions/entitlements/quotas/overages/invoices open.**
- **Developer Platform — NOT STARTED.**
- **Admin Control Center — FOUNDATION skeleton; operational APIs/remediation/tests open.**
- **Data Governance — NOT STARTED as a complete gate.**

## Product / operations

- **English / Arabic UX — FOUNDATION:** direction-safe/responsive patterns exist; complete translation/localization/bidi/a11y/error-state closure remains.
- **Production browser authentication — INCOMPLETE:** production-grade session/refresh/logout, MFA enrollment/recovery and invitation delivery remain.
- **Adversarial application security — FOUNDATION:** formal BOLA/IDOR, approval concurrency, webhook forgery/replay, SSRF/injection/upload/API-key and AI misuse closure remains.
- **Development Railway preview — VERIFIED DEVELOPMENT FOUNDATION:** isolated public preview/provenance/login checks exist. This is not production acceptance.
- **Production observability — FOUNDATION.**
- **Performance / SLO / capacity — NOT STARTED as release benchmark.**
- **Backup / restore / rollback — NOT STARTED as release drill.**
- **Immutable production topology/images — FOUNDATION only.**
- **Complete release acceptance — NOT STARTED on a final candidate.**

## Exact repository evidence

- Identity merged baseline: `63bdb1bf5127684f2d15fb2a4dc05157af724617`.
- Onboarding merged baseline: `9728098275ff42cf7397ea153a6b5a5026bf1a66`; main CI #505 green.
- Returns PR #12 exact head: `17a05bf3fc9ceba8b8b6304202bfd922459d897b`; CI #527 green; merged `01b48010b749bc780bfbd21afb464e91553b26d5`.
- Recovery PR #15 exact head: `0a6ddaa8c216fa1b9bc6369af327f2d7acb7c1a5`; CI #550 green; merged `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`.
- Sales: PR #18, branch `codex/sales-production-closure-20261011`; exact-head completion evidence pending.

## Release blockers

PRENEURA is not production-ready while any of these remain true:

1. a mandatory product workstream is open;
2. an advertised provider exists only as a fixture;
3. actual long-running business paths lack executed Temporal workflow/activity evidence;
4. production browser authentication/session/MFA flows are incomplete;
5. AI tools/providers/operators lack typed authorization/evaluation gates;
6. EN/AR responsive/a11y release journeys are incomplete;
7. critical/high dependency/image/application-security blockers remain;
8. realistic SLO/load/soak/failure evidence is absent;
9. production observability/alerts/runbooks are incomplete;
10. backup/restore/upgrade/rollback/UAT/immutable release evidence is incomplete.

Every workstream closure must update this matrix and `CAPABILITY_EVIDENCE_MATRIX.md` with exact evidence without inflating production claims.
