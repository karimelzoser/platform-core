# Implementation Status

**Last reconciled:** 2026-10-11

**Overall release state:** IN PROGRESS — engineering alpha, not a production release candidate.

**Reviewed `main`:** `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f` — Recovery production closure merged.

**Recovery exact-head CI evidence:** PR #15 head `0a6ddaa8c216fa1b9bc6369af327f2d7acb7c1a5`, Continuous integration #550 (`38151157082`), all seven mandatory jobs green.

**Current product workstream:** Sales — PR #18, branch `codex/sales-production-closure-20261011`.

**Preview boundary:** `preneura-platform-preview` is an isolated development preview. It is not the production VPS and does not represent customer/provider production state.

## Evidence hierarchy

Repository state, exact-SHA CI and deployed runtime evidence override stale prose. A merged repository gate does not imply production acceptance. Development fixtures, the static Pages demo and the Railway development preview are not production provider or launch evidence.

## Verified repository gates

### Identity / Team / Organization — COMPLETE repository gate

Merged as `63bdb1bf5127684f2d15fb2a4dc05157af724617` after exact-head tenant/RLS, authorization, privileged-role, last-owner, browser and seven-job CI evidence.

### Self-service onboarding — COMPLETE repository gate

Merged as `9728098275ff42cf7397ea153a6b5a5026bf1a66`; main CI #505 passed all seven mandatory jobs. The repository includes reusable business profile setup, country/currency/timezone/locale/industry/customer/commerce/volume/goals, derived Team/Integration state, defer/reopen behavior, tenant/RLS lifecycle evidence and protected browser acceptance.

### Returns / Exchanges / Refunds — COMPLETE repository gate

PR #12 exact head `17a05bf3fc9ceba8b8b6304202bfd922459d897b` passed CI #527 and merged as `01b48010b749bc780bfbd21afb464e91553b26d5`; main CI #528 was green. Repository scope includes policies/requests/lines/refunds/exchanges/timeline, eligibility and cumulative guards, inspection/restock disposition, approval-sensitive resolution, post-commit provider intents and reconciliation, replacement-order linkage, API/UI, tenant/RLS lifecycle evidence and protected browser acceptance.

### Recovery — COMPLETE repository gate

PR #15 exact head `0a6ddaa8c216fa1b9bc6369af327f2d7acb7c1a5` passed CI #550 (`38151157082`) across quality, integration, protected preview browser acceptance, API image/security, hosted preview image/security, AI Gateway and secret scan. It merged to `main` as `9c1dfd7d51d8e21f5ab5209c5a413b81105cdf4f`.

Recovery repository scope includes canonical abandoned-order opportunities, policy-bounded eligibility/attempts/offers/expiry, signed-webhook-derived consent guards, Messaging dispatch, recovered-order attribution/value, tenant-qualified schema/RLS, canonical commands/OPA/idempotency/audit/outbox, registered Temporal expiry workflow and protected operator/browser evidence. Real production messaging/payment/provider transports remain later connector/release gates.

## CURRENT — Sales

PR #18 is the active production workstream. The branch currently implements:

- migration `0046_sales.sql` with tenant pipelines/stages, CRM-referenced leads, opportunities, activities/tasks and append-only timeline;
- tenant-qualified CRM/customer, membership/assignee and Commerce won-order relationships;
- active-assignee database guards and a partial unique lead-conversion index preventing concurrent double conversion;
- Sales command service and API using the canonical RBAC/OPA/idempotency/audit/outbox path;
- structured qualification, assignment, pipeline creation, stage progression, opportunity win/loss and task completion;
- won-order validation against the same CRM customer, confirmed/closed Commerce order state and matching currency;
- adversarial RLS/relationship evidence and a two-tenant application lifecycle;
- protected responsive Sales board/detail UI, deterministic disposable/hosted preview fixtures and protected browser acceptance.

Sales remains **IN PROGRESS** until the final exact PR head passes all mandatory CI/security gates and final security/design review. No completion claim should be made from the current code alone.

## Strong foundations already on main

- PostgreSQL canonical tenant state, SQL-first migrations and two-tenant RLS patterns.
- Keycloak JWT/JWKS authentication substrate, membership/permission resolution and tenant MFA assurance policy.
- RBAC/OPA, digest-bound approvals, idempotency, immutable audit and transactional outbox.
- Connector/webhook/sync/provider-action ledgers, leases/retries/dead letters and deterministic development fixtures.
- CRM / Customer 360 foundation.
- Unified Messaging / Tickets / SLA foundation.
- Commerce / Orders repository gate.
- Shipping repository gate.
- Usage/metering, telemetry/error and shared direction-safe UI contracts.
- Dependency/image scanning and hosted preview provenance/health foundations.
- Early AI Gateway routing substrate only; not a production AI execution platform.

## Stabilization baseline

The isolated Railway preview has previously been repaired for listener/domain/health/provenance agreement, trusted public login redirects and patched runtime/tooling dependencies. Green hosted development preview evidence is a development checkpoint only; it does not count as production acceptance or production-provider proof.

No production data, production provider account, VPS or n8n state is used by repository/preview testing.

## Production boundaries still open

### Business domains

- Sales — CURRENT, implementation and exact-head verification in PR #18.
- Campaigns.
- Final CRM / Inbox / Tickets / SLA closure.
- Commerce/Shipping provider and complete operator gaps beyond existing repository gates.

### Durable processes

Temporal infrastructure, restart persistence and Recovery expiry orchestration are verified repository foundations. The remaining business workflow family and full retry/timeout/heartbeat/cancel/signal/update/replay/versioning closure remain open.

### Automation and configuration

Automation Studio, Configuration Compiler and side-effect-free Configuration Simulation remain open.

### Real providers and secrets

Development connectors do not count as production adapters. Production secret resolution, OAuth/token lifecycle, signed webhook/account verification, transport rate limits/reconciliation and real launch-provider staging proof remain mandatory.

### AI and knowledge

Typed tool registry, production model/provider routing, RAG/knowledge ingestion/retrieval/citations, repeatable bilingual safety/quality evaluation and controlled AI Operators remain open.

### Commercial/data platform

Custom Data, Analytics/ROI products, commercial Billing/Entitlements, Developer Platform, operational Admin and formal Governance remain open.

### Product and operations

Complete EN/AR UX, production authentication/session journeys, adversarial security, observability/alerts, capacity/SLOs, durable media/secrets, immutable service topology, backup/restore/PITR, previous-release upgrade and rollback drills, UAT and final launch verification remain open.

## Next promotion rule

`Sales` remains CURRENT until its schema/domain/service/API/UI responsibilities, tenant/authorization/idempotency/audit/outbox evidence and applicable browser/security gates pass on the exact revision being merged. Only then may Campaigns become CURRENT.

The platform must not be called production-ready until one immutable release candidate satisfies the complete acceptance specification.
