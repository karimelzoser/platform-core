# Production Readiness Matrix

This document is the release-control companion to `CODEX_EXECUTION_QUEUE.md` and
`IMPLEMENTATION_STATUS.md`. A capability is promoted only when objective evidence exists on the
exact code being evaluated. Repository completion is not equivalent to public production
readiness when provider, deployment, security, performance, governance, or full acceptance work
remains outstanding.

**Overall release state:** IN PROGRESS

**Current workstream:** Self-service onboarding — IMPLEMENTED / VERIFICATION PENDING

**Current `main` baseline:** `63bdb1bf5127684f2d15fb2a4dc05157af724617`

## Readiness vocabulary

- **COMPLETE repository gate:** the workstream's defined repository acceptance evidence passed.
- **FOUNDATION:** reusable substrate exists, but later production closure remains mandatory.
- **IN PROGRESS:** active implementation or verification work remains.
- **NOT STARTED:** no release-acceptable implementation yet.
- **EXTERNAL:** depends on real provider credentials, certification, approval, or launch access
  that must not be fabricated.

## Core platform

- **Migration / tenant foundation — FOUNDATION:** canonical migrations, tenant context, RLS test
  patterns, and disposable integration infrastructure exist. Production upgrade/rollback drills
  remain a final release gate.
- **RBAC / OPA / approvals — FOUNDATION:** canonical permission and approval controls exist;
  every new domain still adds its own permissions/risk policy and negative tests.
- **Idempotency / audit / outbox — FOUNDATION:** canonical command path established. Later Admin
  and observability work must operationalize stuck/dead-letter evidence.
- **Temporal — FOUNDATION:** infrastructure and restart durability exist. Platform-wide retry,
  timeout, heartbeat, signal/update, cancellation, replay, and versioning closure remains open.
- **Usage / metering source ledger — FOUNDATION:** canonical source contracts exist. Commercial
  billing remains open.
- **Observability contracts — FOUNDATION:** correlation/trace/safe-error/log contracts exist.
  Production backends, SLO dashboards, alerts, and runbooks remain open.
- **Shared design system — FOUNDATION:** reusable direction-safe/a11y-aware primitives exist.
  Complete product conversion remains open.

## Business capabilities

- **CRM / Customer 360 — FOUNDATION:** strong canonical repository foundation exists; final
  product UX/governance closure remains open.
- **Unified Inbox / Messaging / Tickets / SLA — FOUNDATION:** strong repository foundation exists;
  real launch messaging/email adapters and final UX closure remain open.
- **Commerce / Orders — COMPLETE repository gate:** real Shopify/WooCommerce network adapters
  remain open under Production Connector Closure.
- **Shipping — COMPLETE repository gate:** real carrier network adapters remain open under
  Production Connector Closure.
- **Identity / Team / Organization — COMPLETE repository gate:** merged exact-head evidence exists.
- **Self-service onboarding — IN PROGRESS:** implementation is complete in the closure candidate;
  exact-head CI verification is required before promotion to COMPLETE.
- **Returns / Exchanges / Refunds — NOT STARTED:** separate branch after onboarding.
- **Recovery — NOT STARTED:** separate branch after Returns.
- **Sales — NOT STARTED:** separate branch after Recovery.
- **Campaigns — NOT STARTED:** separate branch after Sales.

## Orchestration and configuration

- **Temporal platform closure — FOUNDATION:** dedicated platform closure remains open.
- **Automation Studio — NOT STARTED.**
- **Configuration compiler — NOT STARTED.**
- **Configuration simulation — NOT STARTED.**

## Integrations

- **Connector SDK / webhook / sync / provider-action infrastructure — FOUNDATION:** typed contracts
  and deterministic fixtures exist.
- **Production connectors — NOT STARTED as a complete launch gate:** real Shopify, WooCommerce,
  Meta messaging, Email, Web Chat/API ingress, shipping, payments, and generic adapters must be
  implemented and verified for every provider advertised at launch.
- **Provider credentials/certification — EXTERNAL:** never fake these in repository tests.

## AI

- **AI typed tools — NOT STARTED as a production registry.**
- **AI Gateway — FOUNDATION:** early routing substrate exists; production provider/model routing,
  fallback, cost, privacy, and capability policy remain open.
- **Knowledge / RAG — NOT STARTED.**
- **AI evaluation — NOT STARTED as a full release gate.**
- **AI Operators — NOT STARTED as production operators.**

## Data, analytics, and commercial platform

- **Custom Data — NOT STARTED.**
- **Analytics / ROI — FOUNDATION:** canonical event/usage/provider-cost source contracts exist;
  reporting products and performance closure remain open.
- **Billing / Metering — FOUNDATION:** source usage ledger exists; plans, entitlements, quotas,
  subscriptions, overages, invoice references, and suspension remain open.
- **Developer Platform — NOT STARTED.**
- **Admin Control Center — FOUNDATION:** limited skeleton exists; safe audited operational controls
  remain open.
- **Data Governance — NOT STARTED as a formal closure gate.**

## Product and operations

- **Complete English / Arabic UX — FOUNDATION:** partial direction-safe surfaces exist; complete
  translations, RTL/LTR product behavior, responsive states, keyboard support, and practical
  WCAG 2.2 AA remain open.
- **Adversarial application security — FOUNDATION:** strong RLS/auth/approval substrate and
  negative tests exist; formal BOLA/IDOR, tenant escape, approval replay/substitution, webhook
  forgery/replay, SSRF/injection/upload/API-key abuse, AI-tool abuse, prompt injection, and
  cross-tenant RAG gates remain open.
- **Dependency / supply-chain security — FOUNDATION:** locking and secret scanning exist; final
  advisory closure, SBOM, and image scanning remain open.
- **Performance / SLO / capacity — NOT STARTED as a release benchmark.**
- **Production observability operations — FOUNDATION:** instrumentation contracts exist; backend,
  dashboards, alerts, and actionable operating thresholds remain open.
- **Backup / restore / rollback — NOT STARTED as a release drill.**
- **Immutable release engineering — FOUNDATION:** image/Compose substrate exists; previous-release
  upgrade, smoke, rollback, production overlay validation, and runbooks remain open.
- **Complete release acceptance — NOT STARTED:** must run on one immutable release candidate after
  every implementation workstream closes.

## Current onboarding gate

Onboarding can be promoted to **COMPLETE repository gate** only after the exact published branch
head proves:

1. migration `0041` applies cleanly after `0001`–`0040`;
2. business profile and onboarding progress RLS pass two-tenant negatives;
3. authenticated application lifecycle tests pass;
4. profile mutation is atomic for invalid timezone/input;
5. idempotent replay and changed-payload conflict behavior pass;
6. pending invitations produce `INVITED`, not false Team completion;
7. Integration status correctly distinguishes action-required, degraded, and connected states;
8. command audit and outbox evidence pass;
9. protected browser E2E passes for desktop/tablet/mobile and LTR/RTL direction behavior;
10. repository format, build, lint, typecheck, tests, images, Temporal regression, AI gateway
    regression, and secret scan are all green on the same exact head.

## Non-negotiable release blockers

PRENEURA is not production-ready while any of the following is true:

1. an execution-queue workstream remains open;
2. an advertised provider is represented only by a development fixture;
3. exact release-SHA CI or mandatory security tests are red;
4. release-critical Temporal workflows lack retry/replay/cancellation/restart evidence;
5. AI autonomy is enabled without typed-tool authorization and evaluation thresholds;
6. release-critical EN LTR or AR RTL product UX is incomplete;
7. realistic load/SLO evidence or production telemetry/alerting is absent;
8. backup restore, migration upgrade, or rollback drills have not passed;
9. unresolved critical/high security blockers remain;
10. deployment/runbook/release-note/full-acceptance evidence is incomplete.

## Evidence update rule

Every workstream may update this matrix only for gates it objectively changes. Code existence is
not completion. Exact PR/head/run/release evidence belongs in `IMPLEMENTATION_STATUS.md`; this
matrix stays concise enough to audit at a glance.
