# Production Readiness Matrix

This matrix separates repository implementation from deployment and final production acceptance. A green branch or preview is evidence only for its own gate.

**Overall release state:** IN PROGRESS

**Reviewed `main`:** `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f` — merged Recovery production closure; Continuous Integration #551 (`38153985259`) green.

**Current product workstream:** Sales (`codex/sales-production-closure-20261012`).

**Requested Render preview:** EXTERNAL/BLOCKED — isolated Postgres creation in the connected Render workspace currently requires payment information. No Render URL is claimed until a real deployment exists.

## Status vocabulary

- **COMPLETE repository gate** — defined repository scope passed exact-revision evidence.
- **FOUNDATION** — reusable substrate exists; production closure remains.
- **IN PROGRESS** — active implementation/verification remains.
- **NOT STARTED** — no release-acceptable closure yet.
- **EXTERNAL** — credential/certification/commercial/legal/hosting/deployment input is required and cannot be fabricated.

## Core platform

| Capability | Repository state | Deployment/production boundary |
| --- | --- | --- |
| PostgreSQL / migrations / tenant RLS | FOUNDATION | previous-release upgrade, backup/restore/PITR and capacity evidence remain |
| RBAC / OPA / approvals | FOUNDATION | product-wide adversarial authorization and privileged admin closure remain |
| Idempotency / audit / outbox | FOUNDATION | operational remediation, concurrency and ambiguous-provider closure remain |
| Temporal | FOUNDATION | selected Recovery orchestration exists; complete business workflow family/replay/versioning remains |
| Usage / metering source ledger | FOUNDATION | commercial plans/quotas/invoicing/enforcement remain |
| Observability contracts | FOUNDATION | production dashboards/alerts/SLO ownership/runbooks remain |
| Shared design system | FOUNDATION | complete product adoption, translation and accessibility remain |
| Dependency / image security | FOUNDATION | every release candidate must repeat mandatory dependency/image gates |

## Business capabilities

| Capability | Repository state | Remaining boundary |
| --- | --- | --- |
| CRM / Customer 360 | FOUNDATION | final maintenance/identity-resolution/search/bulk/UX/governance closure |
| Inbox / Messaging / Tickets / SLA | FOUNDATION | real channels, final support/SLA behavior and dedicated browser closure |
| Commerce / Orders | COMPLETE repository gate | real Shopify/WooCommerce/payment/provider execution and commercial edge cases |
| Shipping | COMPLETE repository gate | real carriers/labels/tracking/address data and complete durable workflows |
| Identity / Team / Organization | COMPLETE repository gate | production browser session/MFA/invitation-delivery and product-wide identity UX |
| Self-service onboarding | COMPLETE repository gate | config compiler/simulation, final AR copy and production activation journey |
| Returns / Exchanges / Refunds | COMPLETE repository gate | real payment/provider transports and complete durable orchestration |
| Recovery | COMPLETE repository gate | real delivery/provider staging, cross-product analytics/ROI and release-wide hardening |
| Sales | IN PROGRESS — CURRENT | exact-head CI/security/browser review and merge; real downstream provider/AI/analytics remain later |
| Campaigns | NOT STARTED | after Sales |

## Orchestration and configuration

- **Business Temporal closure — FOUNDATION:** infrastructure + selected Recovery workflow evidence exist; complete business workflow family remains.
- **Automation Studio — NOT STARTED.**
- **Configuration compiler — NOT STARTED.**
- **Configuration simulation — NOT STARTED.**

## Integrations

- **Connector/webhook/sync/provider-action infrastructure — FOUNDATION.**
- **Development fixtures — deterministic CI only; never production evidence.**
- **Protected production secret resolver/storage/rotation — NOT COMPLETE.**
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

- **English / Arabic UX — FOUNDATION:** complete translation/localization/bidi/responsive/a11y/error-state closure remains.
- **Production browser authentication — INCOMPLETE:** authorization-code/PKCE, refresh/expiry/logout, CSRF/origin, MFA enrollment/recovery and invitation delivery remain.
- **Adversarial application security — FOUNDATION:** formal BOLA/IDOR, approval concurrency, webhook replay/forgery, SSRF/injection/upload/API-key, AI-tool/prompt/RAG/admin misuse closure remains.
- **Render development preview — EXTERNAL/BLOCKED:** connected workspace is available, but creating the requested isolated Postgres currently returns `402 Payment information is required`; no deployment is claimed.
- **Production observability — FOUNDATION.**
- **Performance / SLO / capacity — NOT STARTED as release benchmark.**
- **Backup / restore / rollback — NOT STARTED as release drill.**
- **Immutable production topology/images — FOUNDATION only.**
- **Complete release acceptance — NOT STARTED on a final candidate.**

## Exact repository evidence

- Identity merged baseline: `63bdb1bf5127684f2d15fb2a4dc05157af724617`.
- Onboarding merged baseline: `9728098275ff42cf7397ea153a6b5a5026bf1a66`; main CI #505 green.
- Returns merged baseline: `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 green.
- Recovery merged baseline/current reviewed main: `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`; main CI #551 (`38153985259`) green.
- Sales active branch: `codex/sales-production-closure-20261012`; exact-head CI evidence pending.

## Release blockers

PRENEURA is not production-ready while any of these remain true:

1. a mandatory product workstream is open;
2. an advertised provider exists only as a fixture;
3. required long-running paths lack complete Temporal workflow/activity evidence;
4. production browser authentication/session/MFA flows are incomplete;
5. AI tools/providers/operators lack typed authorization/evaluation gates;
6. EN/AR responsive/a11y release journeys are incomplete;
7. critical/high dependency/image/application-security blockers remain;
8. realistic SLO/load/soak/failure evidence is absent;
9. production observability/alerts/runbooks are incomplete;
10. backup/restore/upgrade/rollback/UAT/immutable release evidence is incomplete.

Every workstream closure must update this matrix and `CAPABILITY_EVIDENCE_MATRIX.md` with exact evidence without inflating production claims.
