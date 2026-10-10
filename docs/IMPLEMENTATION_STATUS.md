# Implementation Status

**Last updated:** 2026-10-10

**Authoritative architecture:** ADR 0004, `PLATFORM_EXECUTION_BLUEPRINT.md`, and `WORK_PLAN.md`

**Current `main` baseline:** `63bdb1bf5127684f2d15fb2a4dc05157af724617` — Identity / Team /
Organization closure

**Active workstream:** Self-service onboarding production closure

**Active workstream state:** IMPLEMENTED / EXACT-HEAD VERIFICATION PENDING

**Overall release state:** IN PROGRESS — not a release candidate

`CODEX_EXECUTION_QUEUE.md` is the authoritative implementation queue. A repository-scope
closure is not equivalent to public production readiness when later provider, UX, AI, security,
performance, governance, deployment, or full-release gates remain open.

## Current assessment

PRENEURA has a strong canonical platform foundation and verified repository gates for the core
tenant/security substrate, CRM and communications foundations, Commerce/Order operations,
Shipping, cross-cutting metering/telemetry/design contracts, and Identity/Team/Organization.
The commercial platform is still incomplete and must not be launched until the entire work plan
and final release acceptance are complete.

The current onboarding workstream has been deliberately rebuilt as a clean domain branch on top
of the current `main` baseline. Earlier experimental Returns, Recovery, Sales, Campaigns, package
upgrade, and preview-infrastructure changes are not part of onboarding closure and must be
implemented or reviewed in their own branches.

## Architecture invariants

- PostgreSQL is canonical business state.
- Every tenant-owned relationship is tenant-qualified and protected by RLS.
- Humans, APIs, automations, Temporal, configuration, and AI use the same canonical typed
  domain-command path.
- Authorization, approval, idempotency, audit, and outbox semantics are shared controls rather
  than per-feature alternatives.
- External provider side effects execute after canonical commit through typed connectors.
- Temporal coordinates durable processes but does not become another business-state database.
- AI and Automation never receive arbitrary SQL, unrestricted network access, or provider
  secrets.
- Development fixtures are deterministic CI emulators, not production adapters.
- Automated tests and preview environments must not modify the production VPS or existing n8n
  deployment.

## Verified foundations on `main`

### Tenant and migration foundation — COMPLETE foundation

The repository has canonical PostgreSQL tenant context, append-only migration history,
transaction-scoped access patterns, and two-tenant negative testing conventions. Every future
domain must extend those controls.

### Authorization / RBAC / OPA / approvals — COMPLETE foundation

Canonical command authorization and digest-bound approval semantics exist. Identity / Team /
Organization closure added invitation, membership, role, last-owner, tenant-MFA policy, and
privileged-role safety evidence.

### Idempotency / audit / transactional outbox — COMPLETE foundation

Protected writes use the canonical command executor so idempotency reservation, approved-action
consumption, domain mutation, immutable audit, and outbox publication share a transaction.

### Connector SDK / webhook / sync / provider-action foundation — COMPLETE repository foundation

Typed connector boundaries, webhook ingress, sync/reconciliation, provider actions, retry/dead
letter mechanics, and deterministic development fixtures exist. Real production network
adapters remain a mandatory later closure gate.

### CRM / Customer 360 — STRONG FOUNDATION

Customer identity, import/create, tags, segments, timeline, consent/suppression, merge controls,
and protected UI/testing foundations exist. Final product-wide UX/governance closure remains
later.

### Unified Messaging / Tickets / SLA — STRONG FOUNDATION

Conversation/message state, media, assignment/handover, outbound dispatch/receipts, templates,
ticket lifecycle, SLA foundation, tenant isolation, and protected UI exist. Real Meta/email
network adapters and final product UX closure remain later.

### Commerce / Orders — COMPLETE repository gate

Canonical stores/catalog/inventory/orders/payments/fulfillments/mappings and order workflow
controls are established with typed commands, tenant isolation, workflow durability evidence,
and protected browser acceptance. Real Shopify/WooCommerce adapters remain later.

### Shipping — COMPLETE repository gate

Canonical shipping configuration, routing/address intelligence, shipments/packages/labels,
tracking, delivery attempts, rescue state, provider-action references, operational UI, tenant
isolation, and browser evidence exist. Real carrier adapters remain later.

### Cross-cutting usage / telemetry / design contracts — COMPLETE shared foundation

The repository has canonical meter/usage records, explicit provider-cost semantics, bounded
analytics dimensions, correlation/trace and safe-error contracts, structured observability
envelopes, and reusable direction-safe/a11y-aware UI primitives.

### Identity / Team / Organization — COMPLETE repository gate

PR #7 exact head `7a05569d630dbfc7deb411d82f7df41779d5a5e2` passed all required CI jobs before
merging to `main` as `63bdb1bf5127684f2d15fb2a4dc05157af724617`. The closure includes organization
creation/selection, invitations, profile/locale/timezone, role management, membership lifecycle,
last-owner safeguards, privileged-role guards, and Keycloak-assurance tenant MFA policy.

## Current onboarding implementation

The clean onboarding closure implements the following repository surface.

### Canonical persistence

Migration `0041_self_service_onboarding.sql` adds:

- `identity.organization_business_profiles`;
- `identity.organization_onboarding_progress`;
- automatic progress-row initialization for new organizations;
- backfill for existing organizations;
- tenant RLS and application grants.

The business profile persists country, currency, industry, customer model, commerce model,
monthly order-volume band, monthly conversation-volume band, and business goals. Locale and
timezone continue to live on the canonical organization record rather than being duplicated.

The progress table stores only explicit setup disposition (`PENDING` or `SKIPPED`). It does not
copy member, invitation, connector, credential, or provider-health state.

### Derived Team state

Team status is derived from canonical Identity state:

- `COMPLETE` when another active member exists in addition to the owner;
- `INVITED` when there is a valid pending invitation but no second active member;
- `SKIPPED` when explicitly deferred and no stronger canonical team evidence exists;
- `PENDING` otherwise.

A pending invitation is intentionally not considered completed Team setup.

### Derived Integration state

First-integration status is derived from canonical `integrations.connections` state:

- `CONNECTED` when at least one connection is connected;
- `DEGRADED` when no connected connection exists but a degraded connection exists;
- `ACTION_REQUIRED` when the configured connection state is pending, disconnected, or failed;
- `SKIPPED` when explicitly deferred and no stronger canonical connection evidence exists;
- `PENDING` when no connection exists and no explicit defer disposition is stored.

`CONNECTED`, `DEGRADED`, and `SKIPPED` satisfy onboarding readiness. `DEGRADED` remains visibly
operationally unhealthy and must not be hidden from later observability/admin surfaces.

### Workspace readiness

The onboarding workspace is `READY` only when:

1. the canonical business profile exists;
2. Team is `COMPLETE` or explicitly `SKIPPED`;
3. Integration is `CONNECTED`, `DEGRADED`, or explicitly `SKIPPED`.

This means "setup ready," not "every PRENEURA capability configured."

### Command/API behavior

The onboarding API uses existing `organization.read` / `organization.update` permissions and the
canonical command executor. Mutations require idempotency keys and produce immutable audit and
outbox evidence. Profile timezone validation occurs inside the same transaction as the profile
and organization update so invalid input cannot leave partial canonical state.

The controller follows the repository's Nest/Fastify parsed-JSON convention, enforces tenant
membership through `AuthenticatedContextService`, preserves tenant-MFA behavior, and maps input,
authorization, and command conflicts to bounded HTTP failures.

### Browser behavior

The onboarding surface contains:

- resumable business profile entry;
- Team status and navigation;
- Integration status and navigation;
- explicit defer/reopen controls;
- workspace readiness state;
- desktop/tablet/mobile acceptance;
- LTR/RTL direction acceptance and keyboard-focus evidence.

Complete Arabic product translation remains a later full-product UX gate; direction behavior in
this repository closure is not a claim that all final Arabic copy is finished.

## Onboarding verification target before merge

The onboarding branch must not be marked `COMPLETE` until its exact head proves:

- formatting;
- immutable migration verification;
- clean migration application including migration `0041`;
- RLS and two-tenant SQL negatives;
- two-tenant application lifecycle behavior;
- invalid timezone rollback;
- idempotent replay and changed-payload conflict;
- Team `INVITED` versus `COMPLETE` semantics;
- Integration `ACTION_REQUIRED`, `DEGRADED`, and `CONNECTED` semantics;
- audit/outbox evidence;
- repository builds, lint, typecheck, and unit tests;
- protected disposable browser E2E;
- required image builds;
- Temporal durability regression gate;
- AI gateway regression gate;
- secret scan and every other mandatory CI job.

No verification result should be recorded here until it exists on the exact published branch
head.

## Workstreams not included in onboarding

Returns / Exchanges / Refunds, Recovery, Sales, and Campaigns remain separate workstreams. Prior
experimental schema/service scaffolding for those domains is not considered merged, complete,
or part of onboarding evidence.

## Remaining platform program

After onboarding, the required order is:

1. Returns / Exchanges / Refunds;
2. Recovery;
3. Sales;
4. Campaigns;
5. CRM / Customer 360 / Inbox / Tickets / SLA final closure;
6. Temporal platform closure;
7. Automation Studio;
8. Configuration model/compiler;
9. Configuration simulation;
10. Production Connector Closure;
11. AI typed tools;
12. AI Gateway production closure;
13. AI evaluation + Knowledge/RAG;
14. AI Operators;
15. Custom Data;
16. Analytics / ROI;
17. Billing / Metering commercial closure;
18. Developer Platform;
19. Admin Control Center;
20. Data Governance;
21. complete EN/AR product UX;
22. security hardening;
23. observability operations;
24. performance/SLO/capacity;
25. production deployment/disaster recovery;
26. immutable complete release acceptance.

See `CODEX_EXECUTION_QUEUE.md` for the detailed acceptance content of each item.

## Production boundary

The platform is not production-ready while any mandatory workstream or release gate remains
open. In particular, public launch still requires real advertised provider adapters, complete
Temporal workflow semantics, configuration compilation/simulation, AI authorization/evaluation,
full EN/AR UX, production telemetry/alerts, realistic capacity evidence, adversarial security,
data governance, backup/restore/rollback drills, deployment runbooks, and a fully green immutable
release candidate.
