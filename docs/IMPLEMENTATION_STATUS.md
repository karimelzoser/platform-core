# Implementation Status

**Last updated:** 2026-10-07

**Authoritative architecture baseline:** PR #4 / ADR 0004 / `PLATFORM_EXECUTION_BLUEPRINT.md`

**Latest completed repository gate on `main`:** Identity / Team / Organization PR #7, merge `63bdb1bf5127684f2d15fb2a4dc05157af724617`

**Active workstream:** `codex/onboarding-production-closure-20261007` — Basic self-service onboarding

**Release status:** IN PROGRESS — not a release candidate.

`CODEX_EXECUTION_QUEUE.md` is the authoritative execution ledger. A repository-scope
`COMPLETE` never waives later production-provider, product-wide UX, security,
performance, deployment or complete-release acceptance.

## Current assessment

The repository has verified foundations for tenant isolation, authorization, canonical
commands, approvals, audit/outbox, connector orchestration, CRM, Messaging/Tickets,
Commerce/Orders, Shipping, cross-cutting metering/telemetry/design contracts and now
Identity / Team / Organization lifecycle closure. The next dependency-ready task is the
canonical self-service onboarding/business-profile layer.

Architecture invariants remain unchanged:

- PostgreSQL is canonical state and every tenant-owned write follows tenant-qualified
  relationships plus RLS;
- humans, APIs, automations, Temporal, configuration and AI converge on canonical typed
  domain commands and the same authorization/approval path;
- external side effects are post-commit through typed connectors/outbox;
- provider fixtures are CI emulators, not production adapters;
- long-running processes use Temporal and must remain replay/retry safe;
- tests and preview environments must not touch the production VPS or existing n8n stack.

## Verified foundation status

| Area                                 | State                                          | Objective evidence / remaining boundary                                                                                            |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Immutable migrations / disposable CI | COMPLETE foundation                            | Checksum verification, isolated PostgreSQL/Keycloak/OPA/NATS/Temporal test stack and exact-head CI.                                |
| Tenant/RLS                           | COMPLETE foundation                            | Two-tenant SQL and application lifecycle evidence; every future domain must extend it.                                             |
| Auth/RBAC/OPA/approvals              | COMPLETE foundation + Identity closure         | PR #7 adds invitation/org/member/role/MFA-policy closure; future modules still add their own permissions and risk policy.          |
| Idempotency/audit/outbox             | COMPLETE foundation                            | Canonical command execution and immutable evidence established.                                                                    |
| Connector SDK                        | COMPLETE repository foundation                 | Real provider network adapters remain mandatory under Production Connector Closure.                                                |
| Temporal                             | COMPLETE foundation / platform closure pending | Restart durability is proven; platform-wide retries/timeouts/signals/cancellation/replay/versioning remain later.                  |
| Metering / usage source ledger       | COMPLETE shared foundation                     | PR #6 established versioned meters and append-only tenant usage records; commercial billing remains later.                         |
| Observability contracts              | COMPLETE shared foundation                     | Correlation/trace/safe error/structured operational envelope exists; production telemetry backend/alerts remain later.             |
| Design system primitives             | COMPLETE shared foundation                     | Direction-safe/a11y-aware primitives exist; full product UX closure remains later.                                                 |
| Hosted preview                       | IN PROGRESS                                    | Railway isolated preview infrastructure is being validated. It is not the production VPS and does not constitute release evidence. |

## Platform workstreams

| Workstream                                        | Repository state         | Production boundary / next action                                                                               |
| ------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| CRM / Customer 360                                | FOUNDATION COMPLETE      | Product-wide UX/governance closure later.                                                                       |
| Messaging / Tickets / SLA                         | FOUNDATION COMPLETE      | Real Meta/email adapters and full UX closure later.                                                             |
| Commerce / Order operations                       | COMPLETE repository gate | Real Shopify/WooCommerce adapters pending.                                                                      |
| Shipping                                          | COMPLETE repository gate | Real carrier network adapters pending.                                                                          |
| Cross-cutting usage/telemetry/design contracts    | COMPLETE — PR #6         | Consumed by all later modules.                                                                                  |
| Identity / Team / Organization                    | COMPLETE — PR #7         | Exact-head CI and security review complete; merged to `main`.                                                   |
| Basic self-service onboarding                     | CURRENT                  | Persist canonical reusable business profile; guided resumable setup; team/integration progress; RLS/API/UI/E2E. |
| Returns / Exchanges / Refunds                     | NOT STARTED              | Next after onboarding.                                                                                          |
| Recovery                                          | NOT STARTED              | After returns.                                                                                                  |
| Sales                                             | NOT STARTED              | After recovery.                                                                                                 |
| Campaigns                                         | NOT STARTED              | After sales.                                                                                                    |
| Temporal platform closure                         | FOUNDATION PRESENT       | Standardize release workflow semantics after business workflows exist.                                          |
| Automation Studio                                 | NOT STARTED              | Typed declarative actions only; no untrusted code execution.                                                    |
| Configuration Compiler / Simulation               | NOT STARTED              | Version/diff/approval/publish/rollback plus non-mutating simulation.                                            |
| Production Connector Closure                      | NOT STARTED              | Real launch adapters, secrets/OAuth/webhook/sync/health/uninstall.                                              |
| AI typed tools / Gateway / Eval / RAG / Operators | EARLY FOUNDATION         | Must use canonical commands and pass safety/evaluation thresholds.                                              |
| Custom Data                                       | NOT STARTED              | Typed tenant data, no arbitrary SQL/schema execution.                                                           |
| Analytics / ROI                                   | FOUNDATION STARTED       | Consume canonical events/usage/provider cost.                                                                   |
| Billing / Metering commercial closure             | FOUNDATION STARTED       | Consume canonical usage ledger; plans/quotas/overages/subscription/invoice state later.                         |
| Developer Platform                                | NOT STARTED              | Scoped hashed API keys, rate limits, signed outbound webhooks.                                                  |
| Admin + Data Governance                           | EARLY FOUNDATION         | Operational controls, retention/export/delete/anonymization/secret lifecycle.                                   |
| Full product UX                                   | PARTIAL                  | Final English/Arabic, responsive, keyboard/WCAG, error/empty/loading closure later.                             |
| Security/performance/observability hardening      | PARTIAL                  | Formal adversarial, dependency, load/SLO and alerting gate later.                                               |
| Release engineering / complete acceptance         | FOUNDATION PRESENT       | Immutable release candidate, upgrade/backup/restore/rollback/smoke/runbook still mandatory.                     |

## Identity closure evidence

PR #7 exact head `7a05569d630dbfc7deb411d82f7df41779d5a5e2` passed GitHub Actions run #444 with all seven jobs green:

- hosted preview image build;
- AI gateway lint/tests;
- repository quality: Prettier, migration verification, builds, lint, typecheck and tests;
- API image build;
- protected preview browser E2E;
- isolated integration: migrations, tenant RLS, Temporal restart durability and two-tenant application lifecycles;
- secret scan.

Security review confirmed verified-email binding for organization creation/invitation
acceptance, database guards for privileged role assignment/removal, last-active-owner
protection, Keycloak-derived MFA assurance, CRITICAL approval semantics for tenant MFA
policy changes, tenant-qualified RLS and canonical idempotent audit/outbox paths. PR #7
merged to `main` as `63bdb1bf5127684f2d15fb2a4dc05157af724617`.

## Cross-cutting contract evidence

PR #6 established:

- versioned meter definitions and append-only tenant usage records;
- explicit provider-cost semantics and bounded analytics dimensions;
- correlation/trace and safe operational-error contracts;
- structured observability envelopes and an operational producer;
- reusable direction-safe/a11y-aware design-system primitives;
- two-tenant RLS/idempotency/immutability verification.

These are now mandatory dependencies of each subsequent workstream rather than later
retrofits.

## Current onboarding acceptance target

Onboarding is complete only when the exact branch head proves all of the following:

1. canonical tenant business-profile persistence for country/currency/timezone/language,
   industry, B2B/B2C orientation, commerce model, volume bands and goals;
2. resumable setup progress for business profile, initial team and first integration;
3. typed, idempotent, audited commands with correct permissions and outbox events;
4. RLS and relationship guards with two-tenant negative tests;
5. authenticated API read/write surface and no cross-tenant/profile spoofing path;
6. protected responsive UI with English LTR + Arabic RTL behavior and accessible form/error states;
7. integration discovery/progress that references canonical connector state rather than inventing a second integration backend;
8. no opaque workflow generation and no provider call from simulation/onboarding itself;
9. exact-head repository CI green and status/readiness evidence synchronized.

## Release-wide gates still mandatory

The release remains **IN PROGRESS** until the entire execution queue and
`TESTING_AND_ACCEPTANCE.md` are complete on one immutable release candidate, including real
advertised provider adapters, Temporal replay/cancellation evidence, AI authorization/evals,
production observability and performance thresholds, adversarial security testing, complete
English/Arabic UX, backup/restore/rollback and reproducible deploy/rollback.

Automated tests must never use the production VPS or disturb the existing n8n installation.
