# Implementation Status

**Last updated:** 2026-09-26
**Branch/workstream:** `main` / Messaging outbound delivery pipeline
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
| Integrations / connector SDK      | IN PROGRESS (`0004`–`0006`)         | IN PROGRESS  | IN PROGRESS | IN PROGRESS | IN PROGRESS   | IN PROGRESS |
| Messaging / tickets               | IN PROGRESS (`0011`–`0018`)         | IN PROGRESS  | IN PROGRESS | IN PROGRESS | IN PROGRESS   | IN PROGRESS |
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
- Messaging has tenant-scoped conversations/messages, a read inbox, protected handover, assignment, and close/reopen controls; its canonical inbound worker persists normalized messages through the outbox. The outbound command persists a pending message and its worker has a leased, post-commit typed connector dispatch boundary with provider IDs, sent/dead-letter states, bounded exponential retries, and outbox events. Canonical provider receipts update status monotonically through the persisted webhook worker. The inbox has permission-aware compose, template selection, and template list/create UI backed by protected tenant APIs. Bounded attachment references have tenant RLS, size/count limits, API persistence, and typed post-commit connector dispatch; local-media byte storage and compose controls remain incomplete. Production connector adapters and Docker-backed proof for migrations `0015`–`0018` remain incomplete. Tickets have tenant-scoped schema, list/create/comment APIs, authorization tests, and an initial list UI. Ticket assignment/resolve/reopen and comment UI, SLA workflows, RTL/visual/E2E coverage, and full acceptance suites remain incomplete.
