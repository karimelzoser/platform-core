# Implementation Status

**Last reconciled:** 2026-10-11

**Overall release state:** IN PROGRESS — engineering alpha, not a production release candidate.

**Reviewed `main`:** `a99053e9cc207546b23fd887e6f4e8eb60530f76` — security/preview stabilization merged.

**Main CI evidence:** Continuous integration run #536 (`38102502376`) passed
all seven required jobs on that exact SHA, including dependency and image scans.

**Current product workstream:** Recovery.

**Bounded follow-up:** supported build-tool version and OPA build-policy checks;
exact branch-head verification remains pending.

## Evidence hierarchy

Repository state, exact-SHA CI and deployed runtime evidence override stale prose. A merged repository gate does not imply production acceptance. Development fixtures, the static Pages demo and the Railway development preview are not production provider or launch evidence.

## Verified repository gates

### Identity / Team / Organization — COMPLETE repository gate

Merged as `63bdb1bf5127684f2d15fb2a4dc05157af724617` after exact-head tenant/RLS, authorization, privileged-role, last-owner, browser and seven-job CI evidence.

### Self-service onboarding — COMPLETE repository gate

Merged as `9728098275ff42cf7397ea153a6b5a5026bf1a66`. Main CI #505 passed all seven mandatory jobs. The repository includes the reusable business profile, country/currency/timezone/locale/industry/customer/commerce/volume/goals setup, derived Team/Integration status, defer/reopen behavior, tenant/RLS lifecycle evidence and protected browser acceptance.

Configuration compilation/simulation, final Arabic translation and acquisition-to-activation production journeys remain later gates.

### Returns / Exchanges / Refunds — COMPLETE repository gate

PR #12 exact head `17a05bf3fc9ceba8b8b6304202bfd922459d897b` passed CI #527. It merged as current main `01b48010b749bc780bfbd21afb464e91553b26d5`, followed by green main CI #528.

Repository scope includes tenant-scoped policies/requests/lines/refunds/exchanges/timeline, eligibility and cumulative guards, inspection/restock disposition, approval-sensitive review/exchange/refund commands, post-commit provider intents and reconciliation, replacement-order linkage, API/UI, tenant/RLS lifecycle evidence and protected browser acceptance. Real payment/provider transports and durable Temporal business workflows remain production-program gates.

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
- Early AI Gateway routing substrate only; not a production AI execution platform.

## Bounded stabilization — verified repository and preview baseline

The Railway project `preneura-platform-preview` is confirmed as the isolated development preview. It is not the production VPS and does not represent customer/provider production state.

Fresh inspection on 2026-10-11 reconfirmed:

- service `platform-preview` was deployed from stale onboarding-derived SHA `56a5c5210be56c4d1ad72115d10dbc65fbeb1d79`;
- the public Railway domain targeted container port 3000 while runtime Next.js logged listening on 8080;
- public HTTP proxy logs recorded 502 connection-refused responses;
- the live service healthcheck path is `/health`;
- Postgres/pgvector, Keycloak, Temporal and NATS dependencies are isolated Railway services in this preview project.

The domain target has been repaired in place from 3000 to 8080. The next preview deployment must use a tested patched repository SHA; deployment-success alone is insufficient.

That deployment is now verified: Railway deployment
`166cb1d9-c864-4371-8a95-1f11b5601827` runs main SHA `a99053e`. The public
`/health` returned HTTP 200 and the same full SHA, with environment
`development`. CI #536 passed all required repository/image/browser gates.
This closes the bounded stabilization checkpoint, not production acceptance.

A fresh hosted browser check additionally found that the development login
redirect used the container listener URL (`0.0.0.0:8080`) behind Railway's proxy.
The follow-up branch resolves redirects from trusted deployment configuration,
rejects off-origin browser credential posts, and sets HTTPS cookies from that
public origin. Proxy/Codespaces/loopback regressions pass locally; deployed
protected login verification is pending that branch's promotion.

A dedicated security stabilization branch is upgrading Web/Admin from vulnerable Next.js 15.1.0 / React 19.0.0 to the previously regression-tested patched 15.x/19.0.x baseline, carrying forward corresponding Nest/Fastify/Kysely/transitive fixes, adding dependency and image vulnerability gates, pruning development dependencies from the hosted image, exposing safe build provenance from `/health`, keeping the hosted Keycloak application-readiness probe, and adding hourly external `/health` monitoring.

No production data, production provider account, VPS or n8n state is used for this repair.

### Stabilization repair batch — local evidence, remote verification pending

The repair batch removes development build tools and bundled unused package
managers from runtime images, updates Debian runtime packages, preserves typed
Returns redirects, and tests keyboard focus on actual application controls.
Tooling updates close the available ESLint/esbuild/YAML advisories.

Braces has no upstream patched release for CVE-2026-93687 at this review date.
A checked-in pnpm source patch bounds parsing and every recursive AST entry
point; the mandatory security command tests deep strings, caller-supplied ASTs
and cycles before auditing. The narrowly scoped metadata exception is explained
in `DEPENDENCY_SECURITY.md`; it is not a waiver for unpatched source.

Local production Web/Admin/API/worker builds, workspace typechecks, unit tests,
immutable migration checks and the installed-patch regressions have passed.
Runtime container scanning, PostgreSQL/RLS and protected browser evidence still
require the published repair head's CI result.

## Production boundaries still open

### Business domains

- Recovery — next.
- Sales.
- Campaigns.
- Final CRM / Inbox / Tickets / SLA closure.
- Commerce/Shipping provider and complete operator gaps beyond existing repository gates.

### Durable processes

Temporal infrastructure and restart persistence exist, but actual business workflow/activity workers and complete retry/timeout/heartbeat/cancel/signal/update/replay/versioning evidence remain open.

### Automation and configuration

Automation Studio, Configuration Compiler and side-effect-free Configuration Simulation remain open.

### Real providers and secrets

Development connectors do not count as production adapters. Production secret resolution, OAuth/token lifecycle, signed webhook/account verification, transport rate limits/reconciliation and real launch provider staging proof remain mandatory.

### AI and knowledge

Typed tool registry, production model/provider routing, RAG/knowledge ingestion/retrieval/citations, repeatable bilingual safety/quality evaluation and controlled AI Operators remain open.

### Commercial/data platform

Custom Data, Analytics/ROI products, commercial Billing/Entitlements, Developer Platform, operational Admin and formal Governance remain open.

### Product and operations

Complete EN/AR UX, production authentication/session journeys, adversarial security, observability/alerts, capacity/SLOs, durable media/secrets, immutable service topology, backup/restore/PITR, previous-release upgrade and rollback drills, UAT and final launch verification remain open.

## Next promotion rule

After the security/preview repair is validated and merged, `Recovery` becomes CURRENT. A workstream is promoted only when its schema/domain/service/API/worker/UI responsibilities, tenant/authorization/approval/idempotency/audit/outbox evidence, required durable orchestration and applicable browser/security gates pass on the exact revision being merged.

The platform must not be called production-ready until one immutable release candidate satisfies the complete acceptance specification.
