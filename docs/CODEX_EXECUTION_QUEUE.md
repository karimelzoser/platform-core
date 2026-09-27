# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a
release-gate result, not a feature-level result.

Invariant: unless BLOCKED contains the only remaining mandatory work, CURRENT
must always contain exactly one executable item. Completing CURRENT is not a
reason to stop; it triggers immediate promotion and execution of the next
dependency-ready item.

## CURRENT

- **Messaging lifecycle acceptance:** execute two-tenant outbound media and
  delivery lifecycle integration tests, including RLS, idempotency, post-commit
  connector dispatch, and failure behavior. Do not add provider adapters.

## VERIFICATION PENDING

- **Messaging worker paths:** Docker-backed application integration evidence is
  pending for outbound dispatch, receipts, templates, and tenant behavior.

## NEXT

1. Ticket service/API/UI: update/assign/resolve/reopen tickets, comments UI,
   customer/conversation links, audit/outbox/idempotency, and tenant tests.
2. SLA worker/workflow: response/resolution clocks, pause/resume, breach events,
   escalation, deterministic Temporal coverage, and admin visibility.
3. CRM completion: verified opt-in evidence flow; tag-rule segment UI evaluation
   action; CSV import quoted-field integration tests; full two-tenant CRM/RLS,
   approval, merge, import/export, and accessibility/E2E suites.
4. Integration SDK completion: connection lifecycle, encrypted secret-reference
   boundary, provider assets, sync cursor/reconciliation commands, health, and
   connector contract fixtures.
5. Commerce schema and service: catalog, inventory, orders, payments,
   fulfillment, canonical provider mapping, commands, audit/outbox, RLS tests.
6. Order workflows: confirmation, duplicate detection, modification,
   cancellation, payment/fulfillment guards, provider activity boundaries, UI,
   Temporal tests.
7. Shipping: carrier abstraction, shipment normalization, tracking updates,
   delivery rescue, tenant tests, operational UI.
8. Returns/recovery: returns, exchanges, refunds, recovery attribution and
   commands/workflows, UI, provider contracts, tenant tests.
9. Sales: lead/pipeline/opportunity schema, services, UI, permissions,
   audit/outbox, tests.
10. Campaigns: audience/suppression, batching, provider cost/conversion,
    approval controls, worker/workflow and UI tests.
11. Temporal baseline: all release-critical workflow/activity contracts,
    retries, timeouts, signals, deterministic replay, restart tests.
12. Automation Studio: typed triggers/actions, version/publish, durable runs,
    approval-aware actions, UI and Temporal verification.
13. AI Gateway: provider abstraction, safe routing, typed tool registry,
    approval-bound actions, cost records, fallback/escalation, API/UI tests.
14. Knowledge/RAG and AI evaluation: ingestion, tenant retrieval boundaries,
    citations, prompt-injection/sensitive-data fixtures, evaluation thresholds.
15. Custom Data: tables/fields/records, import/export, permissions, APIs/UI,
    RLS and contract tests.
16. Analytics/Billing: aggregates, dashboards, usage/metering, provider cost,
    subscription state, tenant/UI/performance tests.
17. Developer Platform: tenant API keys, scoped outbound webhooks, signing,
    retries/dead letters, developer UI/docs/tests.
18. Admin Control Center: tenant/integration/workflow health, failed webhooks,
    stuck outbox, usage/spend, audited remediation commands, UI.
19. Identity/RBAC/approval closure: onboarding, invitations, organization
    selection, role editor/lifecycle, approval observability, auth/security E2E.
20. Full UX closure: every surface English LTR and Arabic RTL, responsive,
    accessible, loading/error/empty/forbidden states, visual/E2E scans.
21. Observability/performance/security hardening: structured logs/traces/metrics,
    threat-model refresh, dependency/security scan, benchmarks and thresholds.
22. Release engineering: immutable images, production Compose overlays, migration
    upgrade fixture, backup/restore/rollback validation, smoke tooling, runbook,
    release notes and release checklist.
23. Complete release acceptance: execute every mandatory gate in
    `TESTING_AND_ACCEPTANCE.md`, inspect green CI, and record evidence.

## BLOCKED

- None. Production provider credentials and deployment access are deliberately
  out of scope until a separate explicit deployment instruction; repository
  implementations use emulators, fixtures, and development-only configuration.

## DONE

- Immutable baseline migration checksum verifier and disposable CI stack.
- Keycloak/JWT tenant context, RLS transaction helper, OPA command authorization,
  idempotency, audit, transactional outbox, and approvals foundation.
- Connector/webhook ingress foundation with persisted/deduplicated deliveries.
- CRM customer profiles, merge approval flow, tags, static/tag-rule segments,
  timeline, bounded CSV import/export, bulk tags, and opt-out foundation.
- Codespaces development preview with isolated services and real Keycloak login.
- Messaging/ticket schemas through migration `0019`, schema/RLS integration
  harness, conversation/message read API, inbound worker, protected handover,
  assignment, close/reopen API/UI controls, durable outbound command/claim and
  post-commit dispatch/retry/dead-letter, receipts, protected compose/template
  selection/management foundations, and initial protected ticket
  list/create/comment API/UI foundations.
- Bounded tenant-owned media uploads, one-time message attachment claims,
  post-commit typed connector references, inbox compose and history metadata,
  private local storage, and two-tenant migration/RLS verification in green
  GitHub Actions run #100 for commit `273aebf` (quality, integration, API image,
  AI gateway, and secret scan all passed).

## Release evidence

- No workstream above is marked complete until its Definition of Done and the
  relevant acceptance tests are objectively verified. The overall release
  remains **IN PROGRESS** until every NEXT item drains and the final acceptance
  gate passes.
