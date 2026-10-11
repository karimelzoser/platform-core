# Implementation Status

**Last reconciled:** 2026-10-11

**Overall release state:** IN PROGRESS — engineering alpha, not a production release candidate.

**Reviewed `main`:** `86facdbfe89b69d6859cabed9c670f9471bdf62a` — preview/tooling and approval-expiry security fixes merged.

**Main CI evidence:** Continuous integration run #546 (`38105976105`) passed
all seven required jobs on that exact SHA, including dependency and image scans.

**Current product workstream:** Recovery.

**Verified preview:** Railway deployment `451a935c-7ee7-4519-83ed-0907917801f2`
reports this SHA and development environment. Real Keycloak login now redirects
to the public `/customers` page; protected customer/order reads and the order
page's LTR/RTL direction were inspected. Full Arabic translation remains open.

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

The domain target was repaired in place from 3000 to 8080. Subsequent preview
promotion used exact-SHA CI and public runtime provenance, not deployment-success alone.

The latest verified deployment is `451a935c-7ee7-4519-83ed-0907917801f2`,
running main SHA `86facdb`. Public `/health` returned HTTP 200 with matching
full SHA and `development`. Main CI #546 passed all seven required gates.
This closes the bounded stabilization checkpoint, not production acceptance.

A fresh hosted browser check additionally found that the development login
redirect used the container listener URL (`0.0.0.0:8080`) behind Railway's proxy.
The merged follow-up resolves redirects from trusted deployment configuration,
rejects off-origin browser credential posts, and sets HTTPS cookies from that
public origin. Proxy/Codespaces/loopback and request-level regressions pass;
PR #16 exact-head CI #545 and main #546 are green. Deployed protected login
and real tenant API reads now pass without manual redirect correction.

Merged stabilization upgrades Web/Admin to patched Next.js/React and carries
Nest/Fastify/Kysely/transitive fixes, dependency/image vulnerability gates,
pruned runtime images, `/health` provenance, application-readiness probes and
external health monitoring. pnpm is pinned to 10.34.6 with explicit build-script
allowlisting. OPA build-time policy/default-deny checks are mandatory.

No production data, production provider account, VPS or n8n state is used for this repair.

### Stabilization repair batch — exact-head remote evidence verified

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
Runtime container scans, PostgreSQL/RLS and protected browser evidence passed
on the published repair head and merged main. PR #17 CI #543 additionally
verified Date/ISO expiry binding in approvals and idempotency before merging;
historically ambiguous Date-object approvals intentionally fail closed.

## Recovery — IN PROGRESS, not a completed repository gate

The Recovery branch contains migrations `0043`/`0044`, policies/opportunities/
offers/attempts/timeline, consent guards, API/UI and tenant lifecycle/browser
tests. Local continuation adds safe ambiguous-message retries, monotonic attempt
sequences, canonical repeated-detection status/event dedupe, and expiry-substitution
negative evidence.

`@platform/recovery` shares protected per-opportunity expiry between API and
Temporal. A registered worker and durable NATS consumer verify committed event
origins, schedule expiry, refresh on conversion and reuse canonical commands.
Workflow history contains IDs only, not contact bodies/credentials. Runtime
retry/duplicate-start/signal/cancel/replay/restart tests and new DB negatives are
added to CI; their exact-head result remains pending until this batch is pushed.
The locally available suite passed: production workspace builds, all workspace
typechecks, 61 unit/contract tests, lint (27 warnings, zero errors), formatting,
immutable migration checks, dependency/installed-patch security checks and
Temporal workflow bundle compilation. Local Docker/PostgreSQL runtime evidence
is unavailable; the CI runtime tests must not be reported as passed yet.
Batch CI #547 on `90b0408` passed quality, hosted image/security, AI and secret
checks but failed the API image's missing Recovery manifest and duplicate
unreleased migration DDL, also preventing preview startup. The local repair
adds the manifest and static dependency-graph regression, reuses the existing
`0018` constraint without touching released history, and replaces direct preview
opt-in with signed development webhook bootstrap. New repair CI remains pending.
Repair CI #548 (`2c288d8`) now passes quality, both image/security jobs, AI and
secret scan. The real Recovery Temporal test passed retry, duplicate-start,
signal, cancellation, replay and worker restart. Canonical lifecycles revealed
a PL/pgSQL variable collision in the applied `0044` consent trigger; the forward
correction is `0045`, with null-safe proof and active signed-delivery checks.
Preview bootstrap also needs the same Keycloak issuer hostname as the API;
`127.0.0.1` and `localhost` are not interchangeable JWT issuers. Full integration
and protected browser gates remain pending the combined repair.

Remaining closure includes dispatch-time consent/suppression rechecks and atomic
message linkage, delivery reconciliation, bounded incentives with full approval
UX, deterministic conversion attribution/deduplication/cost semantics, durable
failure/DLQ operations, complete EN/AR UI and protected browser acceptance.

## Production boundaries still open

### Business domains

- Recovery — CURRENT, partially implemented on its continuation branch.
- Sales.
- Campaigns.
- Final CRM / Inbox / Tickets / SLA closure.
- Commerce/Shipping provider and complete operator gaps beyond existing repository gates.

### Durable processes

Temporal infrastructure and restart persistence are verified. Recovery expiry
workflow/activities are now implemented on the continuation branch; exact-head
runtime evidence is pending. The remaining business workflow family and full
retry/timeout/heartbeat/cancel/signal/update/replay/versioning closure remain open.

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

`Recovery` remains CURRENT after verified security/preview stabilization. A
workstream is promoted only when its schema/domain/service/API/worker/UI
responsibilities, tenant/authorization/approval/idempotency/audit/outbox evidence,
required durable orchestration and applicable browser/security gates pass on the
exact revision being merged.

The platform must not be called production-ready until one immutable release candidate satisfies the complete acceptance specification.
