# Implementation Status

**Last updated:** 2026-10-04
**Branch/workstream:** `codex/order-workflows-hosted-preview-20261003` / Order gate transition to Shipping
**Release status:** IN PROGRESS — this is not yet a release candidate.

`docs/CODEX_EXECUTION_QUEUE.md` is the authoritative workstream ledger. A
repository-scope `COMPLETE` below does not waive the later cross-platform UX,
security, performance, release-engineering, or complete-release acceptance
requirements in `TESTING_AND_ACCEPTANCE.md`.

## Baseline and controls

| Area | State | Evidence / next action |
| --- | --- | --- |
| Production migrations `0001`–`0003` | COMPLETE | Root copies remain checksum-locked; new changes use later SQL-first migrations. |
| Secret safety | TESTING | CI verified-secret scan is active; opaque provider secret references are used by runtime integrations. |
| Architecture / ADRs | IN PROGRESS | Foundational architecture is enforced by `AGENTS.md`; consequential new decisions still require ADRs. |
| Local/disposable integration environment | COMPLETE | GitHub Actions boots PostgreSQL/pgvector, Keycloak, OPA, NATS/Valkey/Temporal dependencies, applies migrations, runs RLS/application gates, and tears the stack down. |
| Temporal integration foundation | TESTING | One-time schema bootstrap plus durable server restart verification is green; the later Temporal-baseline workstream still owns full workflow replay/retry/timeout/signal coverage. |

## Platform workstreams

| Module | Database | API / worker | UI | Tests | Documentation | State |
| --- | --- | --- | --- | --- | --- | --- |
| Repository tooling / CI | N/A | COMPLETE | N/A | COMPLETE | IN PROGRESS | COMPLETE |
| Identity, auth, RBAC, approvals | Existing `0001`–`0002` | IN PROGRESS | IN PROGRESS | TESTING | IN PROGRESS | IN PROGRESS |
| CRM / Customer 360 | Existing `0003`, permissions `0007` | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS |
| Integrations / connector SDK | `0004`–`0006`, `0024`–`0026` | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Messaging / tickets | `0011`–`0023` | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS |
| Commerce / order operations | `0027`–`0030` | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE |
| Shipping | STARTING | STARTING | NOT STARTED | NOT STARTED | STARTING | IN PROGRESS |
| Returns / recovery | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Sales | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Campaigns | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Temporal / automation | Foundation present | Foundation present | NOT STARTED | TESTING | IN PROGRESS | IN PROGRESS |
| AI gateway / operators / RAG | NOT STARTED | IN PROGRESS | IN PROGRESS | IN PROGRESS | NOT STARTED | IN PROGRESS |
| Custom data / analytics / billing | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Developer platform / admin center | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED |
| Deployment / operations | Foundation present | Foundation present | N/A | TESTING | IN PROGRESS | IN PROGRESS |

## Objective evidence through Order workflows

- Commerce foundation was verified in GitHub Actions run #205 for commit
  `e01810c`: canonical stores, products/variants, inventory locations/levels,
  orders/lines/discounts/taxes, payments, fulfillments, provider mappings, order
  timeline, authorization/idempotency/audit/outbox execution, two-tenant RLS,
  relationship isolation, and application lifecycle behavior.
- Order workflows were verified in GitHub Actions run #288 for commit `8cdad1c`.
  The integration gate passed clean migrations/RLS, Temporal server restart
  durability, API/worker/commerce builds, and the two-tenant application
  lifecycle. The disposable preview/browser gate also passed the Order browser
  journey, which covers duplicate evaluation, confirmation, guarded
  modification, responsive layouts, LTR/RTL switching, and no unexpected
  browser console errors.
- The provider-action failure that previously left Order workflow sync state at
  `PENDING` was traced to an invalid PostgreSQL lock shape: route resolution
  used an outer secret join under `FOR SHARE`. It now uses a required active or
  rotating secret row and explicit row-lock targets. Provider execution remains
  post-commit and its result is recorded transactionally with workflow sync,
  timeline, audit, and outbox evidence.
- Integration RLS verification no longer leaves its provider-action lease
  fixture eligible to re-enter the global worker queue after lease expiry.
- The branch-local self-modifying formatter workflow was removed. CI is
  verification-only for source code; it does not rewrite and push the PR branch.
- Provider-action processing failures retain operational visibility through a
  bounded structured JSON error event containing only action identifiers/type,
  normalized error code, and retryability rather than raw exception text.

## Current execution

Shipping is the promoted current workstream. Its repository scope is carrier
abstraction, canonical shipment normalization, tracking updates, delivery rescue,
tenant/RLS tests, connector boundaries, protected API and operational UI. It
must link to canonical Commerce orders/fulfillments, keep provider credentials
opaque, execute provider calls only after commit, and preserve audit/outbox and
approval guarantees.

## Deferred release-wide gates

These are mandatory before the product can be called complete even when an
individual module has a green repository-scope gate:

- full English LTR and Arabic RTL visual/accessibility closure across every UI
- complete Temporal retry/timeout/signal/deterministic-replay coverage
- structured logs, traces, metrics, performance thresholds and security refresh
- immutable production images/Compose overlays, upgrade fixture, backup/restore
  and rollback evidence, smoke tooling and runbook
- all mandatory checks in `TESTING_AND_ACCEPTANCE.md`, followed by inspection of
  green release-candidate CI

## External boundaries

Production provider credentials/accounts and deployment access remain
intentionally unavailable to repository tests. Development fixtures/emulators
are used for deterministic connector verification. Automated tests must never
use the production VPS or disturb the existing n8n installation.
