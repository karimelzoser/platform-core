# Implementation Status

**Last updated:** 2026-09-29
**Branch/workstream:** `main` / Integration SDK completion
**Release status:** IN PROGRESS — this is not yet a release candidate.

## Baseline and controls

| Area                                | State       | Evidence / next action                                                                                                             |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Production migrations `0001`–`0003` | COMPLETE    | Root copies match the supplied `SHA256SUMS`; Git attributes prevent line-ending conversion and CI will byte-lock historical files. |
| Secret safety                       | IN PROGRESS | Local credential file is ignored and excluded from Git; CI secret scanning is being added.                                         |
| Architecture / ADRs                 | IN PROGRESS | Record foundation decisions before implementation changes.                                                                         |
| Local integration environment       | TESTING     | Isolated Compose stack and CI migration/RLS test path added; not executable on this Docker-less workstation.                       |

## Platform workstreams

| Module                            | Database                            | API / worker | UI          | Tests       | Documentation | State       |
| --------------------------------- | ----------------------------------- | ------------ | ----------- | ----------- | ------------- | ----------- |
| Repository tooling / CI           | N/A                                 | COMPLETE     | N/A         | TESTING     | IN PROGRESS   | TESTING     |
| Identity, auth, RBAC, approvals   | Existing `0001`–`0002`              | IN PROGRESS  | IN PROGRESS | TESTING     | IN PROGRESS   | IN PROGRESS |
| CRM / Customer 360                | Existing `0003`, permissions `0007` | IN PROGRESS  | IN PROGRESS | IN PROGRESS | IN PROGRESS   | IN PROGRESS |
| Integrations / connector SDK      | IN PROGRESS (`0004`–`0006`, `0024`) | IN PROGRESS  | IN PROGRESS | IN PROGRESS | IN PROGRESS   | IN PROGRESS |
| Messaging / tickets               | IN PROGRESS (`0011`–`0023`)         | IN PROGRESS  | IN PROGRESS | IN PROGRESS | IN PROGRESS   | IN PROGRESS |
| Commerce / order operations       | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| Shipping / returns / recovery     | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| Sales / campaigns                 | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| Temporal / automation             | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| AI gateway / operators / RAG      | NOT STARTED                         | IN PROGRESS  | IN PROGRESS | IN PROGRESS | NOT STARTED   | IN PROGRESS |
| Custom data / analytics / billing | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| Developer platform / admin center | NOT STARTED                         | NOT STARTED  | NOT STARTED | NOT STARTED | NOT STARTED   | NOT STARTED |
| Deployment / operations           | NOT STARTED                         | NOT STARTED  | N/A         | NOT STARTED | NOT STARTED   | NOT STARTED |

## Objective release gates

No overall completion percentage is recorded: the required release gate is a binary result, and most workstreams are not yet objectively complete. The authoritative acceptance criteria remain in [TESTING_AND_ACCEPTANCE.md](TESTING_AND_ACCEPTANCE.md).

## Current blockers

- Docker and Python 3.11+ are absent locally, so PostgreSQL/RLS, NATS, Temporal, and FastAPI integration checks require the disposable GitHub Actions workflow for objective verification.
- Production credentials, domains, and provider applications are intentionally unavailable and are not required for repository implementation.
- Integrations now have protected connection lifecycle, opaque reference
  rotation, health records, provider asset refresh, and durable sync requests.
  Migration `0024` adds worker leases, capped retries, and terminal sync
  dead-letter behavior. The development Web Chat emulator exercises the typed
  sync boundary without a provider network call. Real provider adapter
  lifecycle/webhook/backfill/reconciliation implementations and integration
  UI remain incomplete.
- CRM has tenant-scoped customer/tag/segment/import/export/merge foundations.
  Migration `0022` adds immutable verified provider-consent evidence. Its
  canonical webhook path verifies a bounded provider payload, writes evidence
  and a monotonic opt-in preference update in the worker transaction, and emits
  audit/outbox records only after commit. GitHub Actions run #115 passed the
  two-tenant consent lifecycle, migration/RLS suite, API image, quality, AI
  gateway, and secret scan. Direct staff-created opt-ins are deliberately not
  available. The protected dynamic-segment evaluation UI and quoted-field CSV
  parser tests are implemented. GitHub Actions run #119 verified the
  two-tenant CRM application lifecycle: create/import idempotency, dynamic
  segment evaluation, opt-out, approval-bound merge, export/audit/outbox, and
  direct-ID RLS isolation. Migration `0023` grants only the dependent-record
  reconciliation deletes needed by an approved merge; customer deletion remains
  unavailable to the runtime role. GitHub Actions run #137 for commit
  `4634601` passed the protected browser acceptance path: owner/approver
  Keycloak login, customer creation, quoted CSV import, dynamic segment
  evaluation, approval-bound merge execution, and responsive, RTL, and
  accessibility checks. CRM remains IN PROGRESS until its full Definition of
  Done is satisfied.
- Messaging has tenant-scoped conversations/messages, a read inbox, protected handover, assignment, and close/reopen controls; its canonical inbound worker persists normalized messages through the outbox. The outbound command persists a pending message and its worker has a leased, post-commit typed connector dispatch boundary with provider IDs, sent/dead-letter states, bounded exponential retries, and outbox events. Canonical provider receipts update status monotonically through the persisted webhook worker. The inbox has permission-aware compose, template selection, and template list/create UI backed by protected tenant APIs. Bounded attachment references have tenant RLS, size/count limits, API persistence, and typed post-commit connector dispatch. Development-only local-media upload registration and inbox compose controls are implemented, with a bounded 700 KB browser upload route. Migration `0019` registers tenant-owned uploads and the send transaction claims each uploaded reference once, rejecting expired, reused, mismatched, or cross-tenant references. GitHub Actions run #101 passed the two-tenant application messaging lifecycle suite, migrations/RLS, the API image build, quality, AI gateway, and secret scan. Production provider adapters remain incomplete. Tickets have tenant-scoped schema; protected list/detail/create/comment/update/assignment/resolve/reopen APIs; authorization tests; permission-aware create/detail UI; and GitHub Actions run #104 two-tenant application lifecycle evidence. Migration `0014_messaging_ticket_schema_usage.sql` is present, and migrations `0020`–`0021` add SLA policies with approval-bound create/archive, response/resolution clocks, pause/resume, idempotent worker breach/escalation events, a private worker health endpoint, and protected ticket/approval UI. GitHub Actions run #114 passed the full two-tenant SLA lifecycle, migrations/RLS, quality, API image, AI gateway, and secret scan. Messaging/ticket migrations now extend through `0023`. Temporal workflow coverage, browser E2E, Arabic RTL/LTR visual checks, accessibility, and the full acceptance suites remain incomplete.
