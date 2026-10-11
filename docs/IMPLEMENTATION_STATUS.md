# Implementation Status

**Last reconciled:** 2026-10-12

**Overall release state:** IN PROGRESS — engineering alpha, not a production release candidate.

**Reviewed `main`:** `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f` — merged Recovery production closure.

**Main CI evidence:** Continuous Integration #551 (`38153985259`) passed the mandatory repository gates on that exact merged SHA. Scheduled development-preview availability also passed for this repository generation.

**Current product workstream:** Sales on `codex/sales-production-closure-20261012`.

**Requested Render preview:** not provisioned yet. The connected Render account exposes workspace `Preneura`, but isolated Postgres creation currently returns account-level `402 Payment information is required`. Repository implementation continues independently; this external hosting condition is not production or repository evidence.

## Evidence hierarchy

Repository state, exact-SHA CI and deployed runtime evidence override prose. A merged repository gate does not imply production acceptance. Development fixtures, static demos and development previews never count as production-provider proof.

## Verified repository gates

### Identity / Team / Organization — COMPLETE repository gate

Merged as `63bdb1bf5127684f2d15fb2a4dc05157af724617` after tenant/RLS, authorization, privileged-role, last-owner, browser and seven-job CI evidence.

### Self-service onboarding — COMPLETE repository gate

Merged as `9728098275ff42cf7397ea153a6b5a5026bf1a66`; main CI #505 passed. The reusable organization business profile, derived Team/Integration readiness, tenant-safe API/UI and protected browser journey are present. Configuration compilation/simulation, complete Arabic copy and production acquisition-to-activation remain later gates.

### Returns / Exchanges / Refunds — COMPLETE repository gate

Merged as `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 green. Repository scope includes policies/requests/lines/inspection/disposition/refunds/exchanges/timeline, approval-sensitive financial commands, provider-intent boundaries, API/UI, tenant/RLS lifecycle and browser evidence. Real payment/provider transports and complete durable orchestration remain later gates.

### Recovery — COMPLETE repository gate

Merged as `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`; main CI #551 (`38153985259`) green. Repository scope includes eligibility/suppression/consent, opportunities/offers/attempts/timeline, Messaging linkage, attribution/value semantics, protected expiry commands, registered Temporal expiry orchestration, retry/duplicate-start/signal/cancel/replay/restart evidence, API/UI, tenant/RLS lifecycle and protected browser acceptance.

Real provider delivery transports, production consent/provider policy evidence and final cross-product ROI/analytics remain later program gates.

## Sales — IN PROGRESS / CURRENT

Branch `codex/sales-production-closure-20261012` is based on green Recovery main.

Implemented on the branch so far:

- migration `0046_sales.sql` with tenant-scoped pipelines, stages, leads, opportunities, activities and append-only stage history;
- composite tenant-qualified links to canonical `crm.customers`, `identity.memberships` and optional `commerce.orders`;
- stage/pipeline and terminal-state database guards;
- FORCE RLS and tenant-isolation policies across the Sales domain;
- protected `SalesService` / `SalesController` command surface for pipeline creation, lead qualification, opportunity lifecycle and activities;
- idempotency/audit/outbox through the canonical `CommandExecutor` path;
- responsive `/sales` operator workspace with configurable pipeline builder;
- two-tenant RLS test, application lifecycle test and protected browser journey.

Sales is not complete until exact-head migrations/RLS, build/type/lint, lifecycle, protected browser, image/security, AI and secret-scan jobs are green and the reviewed PR is merged, followed by main verification.

## Strong foundations already on main

- PostgreSQL canonical tenant state and SQL-first migrations.
- Keycloak/JWT tenant authentication substrate and MFA assurance boundary.
- RBAC/OPA, digest-bound approvals, idempotency, immutable audit and transactional outbox.
- Connector/webhook/sync/provider-action ledgers with leases/retries/dead letters and deterministic development fixtures.
- CRM / Customer 360 strong foundation.
- Unified Messaging / Tickets / SLA strong foundation.
- Commerce / Orders complete repository gate.
- Shipping complete repository gate.
- Usage/metering, telemetry/error and shared direction-safe UI contracts.
- Early AI Gateway routing substrate only; not a production AI execution platform.

## Production boundaries still open

### Business domains

- Sales — CURRENT.
- Campaigns.
- Final CRM / Customer 360 / Unified Inbox / Tickets / SLA closure.
- Commerce/Shipping real-provider and complete operator gaps beyond existing repository gates.

### Durable processes

Temporal infrastructure and selected Recovery orchestration are verified. Complete workflow/activity families, failure operations and replay/versioning evidence remain open across integrations, commerce, shipping, returns, campaigns, support and future automation.

### Automation and configuration

Automation Studio, Configuration Compiler and side-effect-free Configuration Simulation remain open.

### Real providers and secrets

Development connectors do not count as production adapters. Protected production secret resolution, OAuth/token lifecycle, signed provider account/webhook verification, transport rate limits/reconciliation and authorized staging evidence remain mandatory.

### AI and knowledge

Typed tool registry, production model/provider routing, RAG/knowledge ingestion/retrieval/citations, bilingual safety/quality evaluation and controlled AI Operators remain open.

### Commercial/data platform

Custom Data, Analytics/ROI products, commercial Billing/Entitlements, Developer Platform, operational Admin and formal Governance remain open.

### Product and operations

Complete EN/AR UX, production authentication/session/MFA journeys, adversarial security, production observability/alerts, capacity/SLOs, immutable service topology, durable media/secrets, backup/restore/PITR, previous-release upgrade/rollback drills, UAT and launch verification remain open.

## Promotion rule

A workstream is promoted only when schema/domain/service/API/worker/UI responsibilities, tenant/authorization/approval/idempotency/audit/outbox evidence, required durable orchestration and applicable browser/security gates pass on the exact revision being merged. PRENEURA must not be called production-ready until one immutable release candidate satisfies the complete acceptance specification.
