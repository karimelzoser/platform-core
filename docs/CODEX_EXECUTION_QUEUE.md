# Platform Core Execution Queue

This is the authoritative execution ledger. `COMPLETE` is reserved for a
release-gate result, not a feature-level result.

## CURRENT

- **Messaging inbound worker:** normalize persisted webhook deliveries into
  tenant-bound conversations/messages, dedupe provider messages, and publish
  post-commit inbox events. Finish reusable connector registration, disposable
  stack tests, retry/dead-letter assertions, and worker observability.

## VERIFICATION PENDING

- **Messaging and ticket integration acceptance harness:** two-tenant RLS read
  and cross-tenant write assertions, protected-handover authorization/idempotency
  command-contract tests, audit/outbox coverage, and schema probes were pushed
  in `af31eab`. Local migration/API/type/format checks pass. Its Docker-backed
  disposable-stack CI result is still required before it can move to `DONE`.

## NEXT

1. Messaging outbound command: typed connector dispatch after commit, delivery
   status persistence, retry/dead-letter behavior, templates, media bounds, and
   a real compose/UI flow.
2. Messaging operations: conversation assignment UI, close/reopen, customer
   linkage, permission states, Arabic RTL/LTR visual checks, and inbox E2E.
3. Ticket service/API/UI: create/update/assign/resolve tickets, comments,
   customer/conversation links, audit/outbox/idempotency, and tenant tests.
4. SLA worker/workflow: response/resolution clocks, pause/resume, breach events,
   escalation, deterministic Temporal coverage, and admin visibility.
5. CRM completion: verified opt-in evidence flow; tag-rule segment UI evaluation
   action; CSV import quoted-field integration tests; full two-tenant CRM/RLS,
   approval, merge, import/export, and accessibility/E2E suites.
6. Integration SDK completion: connection lifecycle, encrypted secret-reference
   boundary, provider assets, sync cursor/reconciliation commands, health, and
   connector contract fixtures.
7. Commerce schema and service: catalog, inventory, orders, payments,
   fulfillment, canonical provider mapping, commands, audit/outbox, RLS tests.
8. Order workflows: confirmation, duplicate detection, modification,
   cancellation, payment/fulfillment guards, provider activity boundaries, UI,
   Temporal tests.
9. Shipping: carrier abstraction, shipment normalization, tracking updates,
   delivery rescue, tenant tests, operational UI.
10. Returns/recovery: returns, exchanges, refunds, recovery attribution and
    commands/workflows, UI, provider contracts, tenant tests.
11. Sales: lead/pipeline/opportunity schema, services, UI, permissions,
    audit/outbox, tests.
12. Campaigns: audience/suppression, batching, provider cost/conversion,
    approval controls, worker/workflow and UI tests.
13. Temporal baseline: all release-critical workflow/activity contracts,
    retries, timeouts, signals, deterministic replay, restart tests.
14. Automation Studio: typed triggers/actions, version/publish, durable runs,
    approval-aware actions, UI and Temporal verification.
15. AI Gateway: provider abstraction, safe routing, typed tool registry,
    approval-bound actions, cost records, fallback/escalation, API/UI tests.
16. Knowledge/RAG and AI evaluation: ingestion, tenant retrieval boundaries,
    citations, prompt-injection/sensitive-data fixtures, evaluation thresholds.
17. Custom Data: tables/fields/records, import/export, permissions, APIs/UI,
    RLS and contract tests.
18. Analytics/Billing: aggregates, dashboards, usage/metering, provider cost,
    subscription state, tenant/UI/performance tests.
19. Developer Platform: tenant API keys, scoped outbound webhooks, signing,
    retries/dead letters, developer UI/docs/tests.
20. Admin Control Center: tenant/integration/workflow health, failed webhooks,
    stuck outbox, usage/spend, audited remediation commands, UI.
21. Identity/RBAC/approval closure: onboarding, invitations, organization
    selection, role editor/lifecycle, approval observability, auth/security E2E.
22. Full UX closure: every surface English LTR and Arabic RTL, responsive,
    accessible, loading/error/empty/forbidden states, visual/E2E scans.
23. Observability/performance/security hardening: structured logs/traces/metrics,
    threat-model refresh, dependency/security scan, benchmarks and thresholds.
24. Release engineering: immutable images, production Compose overlays, migration
    upgrade fixture, backup/restore/rollback validation, smoke tooling, runbook,
    release notes and release checklist.
25. Complete release acceptance: execute every mandatory gate in
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
- Messaging/ticket schemas; conversation/message read API and initial inbox UI;
  protected conversation handover API/UI.

## Release evidence

- No workstream above is marked complete until its Definition of Done and the
  relevant acceptance tests are objectively verified. The overall release
  remains **IN PROGRESS** until every NEXT item drains and the final acceptance
  gate passes.
