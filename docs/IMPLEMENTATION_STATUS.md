# Implementation Status

**Last updated:** 2026-10-05  
**Main baseline:** `dc41d3b84bc931e6ff42c17abce68430226e30d2` (`Architecture: align full platform execution plan (#4)`)  
**Functional code baseline before active Shipping PR:** `f4758ddcebec6e531596a7f70040c83f0b06b29a` (`Order workflows and hosted preview (#2)`)  
**Active functional workstream:** PR #3 `codex/shipping-foundation-20261005`  
**Active Shipping head:** `aeeb313829ff33a58955d70c18383b40b7567f0b`  
**Shipping CI:** GitHub Actions run #337 — `success`  
**Full execution architecture:** merged to `main` via PR #4  
**Release status:** IN PROGRESS — not a release candidate.

`CODEX_EXECUTION_QUEUE.md` is the authoritative execution ledger.
`PLATFORM_EXECUTION_BLUEPRINT.md` and ADR 0004 define dependency and domain
ownership rules. A repository-scope `COMPLETE` does not waive later product-wide
UX, provider, security, performance, deployment or complete-release acceptance.

## Current assessment

The repository has a strong production foundation and real implemented core
operations, but it is not close enough to the complete commercial product to
justify a release-candidate claim. The current architecture is retained; the
execution plan has been corrected so the remaining work does not create late
retrofits or parallel backends.

Key corrections now reflected in the authoritative plan:

- cross-cutting observability, event/analytics instrumentation, usage/cost
  metering and shared UI contracts start early and continue with every module;
- Identity/Team/Organization lifecycle and basic self-service onboarding move
  earlier because ownership, approvals, configuration publishing and billing
  depend on them;
- Temporal workflows are added with their domains and later standardized/proven
  centrally rather than bolted on at the end;
- self-service setup is separated into durable business-profile onboarding and a
  later versioned Configuration Compiler + Simulation layer;
- development connector fixtures are explicitly separated from real production
  adapters, with a formal Production Connector Closure gate;
- AI typed tools and evaluation/RAG foundations precede autonomous operators;
- analytics dashboards/billing remain later, but events and usage records are
  produced from the beginning;
- humans, API, automation, Temporal, configuration and AI all use the same
  canonical domain-command/security path.

## Baseline and controls

| Area                                | State                                 | Evidence / next action                                                                                                                                                       |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production migrations `0001`–`0003` | COMPLETE                              | Root copies remain checksum-locked; new changes are append-only SQL migrations.                                                                                              |
| Tenant/RLS foundation               | COMPLETE                              | Runtime tenant context and two-tenant test patterns exist; each new module must extend them.                                                                                 |
| Auth/RBAC/OPA/approvals foundation  | COMPLETE foundation / closure pending | Shared command authorization, approval digest binding and tenant checks exist; full team/onboarding/role UX and auth E2E remain.                                             |
| Idempotency/audit/outbox            | COMPLETE foundation                   | Shared command execution and post-commit async intent pattern exist; every new domain must use them.                                                                         |
| Connector SDK                       | COMPLETE repository foundation        | Typed boundaries, webhook/sync/reconcile/provider-action infrastructure and deterministic fixtures exist. Real production network adapters remain a separate mandatory gate. |
| Disposable integration/CI           | COMPLETE foundation                   | CI boots platform dependencies and validates migrations/RLS/application/browser/image gates.                                                                                 |
| Temporal infrastructure             | COMPLETE foundation / TESTING         | Server restart durability exists. Full workflow/activity/replay/retry/timeout/signal coverage remains a later central closure gate while workflows are added incrementally.  |
| Observability                       | FOUNDATION PRESENT / IN PROGRESS      | JSON logging/correlation conventions exist; shared trace/metric/operational contracts and full production metrics/alerts remain.                                             |
| Usage/metering                      | NOT STARTED                           | Must be introduced as a shared append-only/idempotent ledger before campaign/AI/billing expansion.                                                                           |
| Shared design system                | PARTIAL                               | Existing protected surfaces exist; a consistent direction-aware product system must be reinforced before many new surfaces are added.                                        |

## Platform workstreams

| Module                              | Database                           | API / worker                  | UI                           | Tests                    | Production provider                         | State                     |
| ----------------------------------- | ---------------------------------- | ----------------------------- | ---------------------------- | ------------------------ | ------------------------------------------- | ------------------------- |
| Repository tooling / CI             | N/A                                | COMPLETE                      | N/A                          | COMPLETE foundation      | N/A                                         | COMPLETE foundation       |
| Identity / Organization / approvals | Existing `0001`–`0002`             | IN PROGRESS                   | IN PROGRESS                  | IN PROGRESS              | N/A                                         | IN PROGRESS               |
| Basic self-service onboarding       | Partial org foundation             | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Integration discovery depends on connectors | NOT STARTED               |
| CRM / Customer 360                  | Existing `0003`, later permissions | IN PROGRESS                   | IN PROGRESS                  | Strong partial evidence  | N/A                                         | IN PROGRESS               |
| Integrations / connector SDK        | `0004`–`0006`, `0024`–`0026`       | COMPLETE foundation           | COMPLETE foundation          | COMPLETE foundation      | Development fixtures only                   | FOUNDATION COMPLETE       |
| Messaging / Tickets / SLA           | `0011`–`0023`                      | IN PROGRESS                   | IN PROGRESS                  | Strong partial evidence  | Real Meta/email adapters pending            | IN PROGRESS               |
| Commerce / Order operations         | `0027`–`0030`                      | COMPLETE repository gate      | COMPLETE repository gate     | COMPLETE repository gate | Real Shopify/WooCommerce adapters pending   | COMPLETE repository scope |
| Shipping                            | PR #3 migrations `0031`–`0033`     | Strong partial implementation | Operational UI present in PR | CI run #337 green        | Real carrier adapters pending               | IN PROGRESS               |
| Returns / Exchanges / Refunds       | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Payment/carrier hooks pending               | NOT STARTED               |
| Recovery                            | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Uses Messaging/Commerce adapters            | NOT STARTED               |
| Sales                               | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | N/A                                         | NOT STARTED               |
| Campaigns                           | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Real messaging adapters pending             | NOT STARTED               |
| Temporal workflow suite             | Foundation present                 | Partial workflows/evidence    | Operational visibility later | TESTING                  | Provider activities depend on real adapters | IN PROGRESS foundation    |
| Automation Studio                   | NOT STARTED                        | NOT STARTED                   | Placeholder/surface only     | NOT STARTED              | Via canonical actions/connectors            | NOT STARTED               |
| Configuration Compiler / Simulation | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Must never call providers in simulation     | NOT STARTED               |
| AI typed tool platform              | Minimal concepts only              | NOT STARTED as full registry  | NOT STARTED                  | NOT STARTED              | Via canonical commands only                 | NOT STARTED               |
| AI Gateway                          | No full persistence yet            | Routing skeleton only         | Minimal/placeholder          | Minimal                  | External model adapters incomplete          | EARLY FOUNDATION          |
| Knowledge / RAG / AI eval           | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Model/embedding adapter pending             | NOT STARTED               |
| AI Operators                        | NOT STARTED                        | NOT STARTED                   | Placeholder/surface only     | NOT STARTED              | Via tools only                              | NOT STARTED               |
| Custom Data                         | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | N/A                                         | NOT STARTED               |
| Analytics / ROI                     | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Uses usage/provider cost                    | NOT STARTED               |
| Billing / Metering product          | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Payment provider abstract                   | NOT STARTED               |
| Developer Platform                  | NOT STARTED                        | NOT STARTED                   | NOT STARTED                  | NOT STARTED              | Outbound webhook delivery                   | NOT STARTED               |
| Admin Control Center                | Existing skeleton only             | Minimal                       | Skeleton                     | NOT STARTED              | N/A                                         | EARLY FOUNDATION          |
| Data Governance                     | NOT STARTED formal workstream      | NOT STARTED                   | N/A/partial settings later   | NOT STARTED              | N/A                                         | NOT STARTED               |
| Full product UX                     | Partial surfaces                   | N/A                           | PARTIAL                      | Partial browser evidence | N/A                                         | IN PROGRESS foundation    |
| Release engineering / operations    | Foundation present                 | Foundation present            | N/A                          | TESTING foundation       | N/A                                         | IN PROGRESS foundation    |

## Objective evidence through Order workflows

- Commerce repository-scope evidence is green for canonical stores,
  products/variants, inventory locations/levels, orders/lines/discounts/taxes,
  payments, fulfillments, provider mappings, order timeline,
  authorization/idempotency/audit/outbox execution, two-tenant RLS, relationship
  isolation and application lifecycle behavior.
- Order workflow repository-scope evidence is green for tenant-scoped
  confirmation, duplicate evaluation/review, guarded modification/cancellation,
  payment/fulfillment safety guards, typed post-commit provider actions,
  provider sync/timeline evidence, Temporal server restart durability and
  protected responsive LTR/RTL Order browser acceptance.
- Provider execution is post-commit and a provider result is recorded in a new
  transaction with canonical workflow/timeline/audit/outbox evidence.
- CI source verification is not allowed to rewrite/push implementation code as a
  formatter side effect.

## Active Shipping workstream

PR #3 is open, draft and mergeable at head
`aeeb313829ff33a58955d70c18383b40b7567f0b`. GitHub Actions run #337 completed
successfully. Its PR description has been synchronized with the full execution
architecture merged by PR #4.

The PR already contains substantial provider-neutral Shipping scope including
carrier accounts/services, shipments/line allocation, packages, normalized
tracking events, delivery attempts, rescue cases, provider references/actions,
append-only timeline, API/service, provider result handling, operational UI,
worker integration, RLS/relationship migrations, lifecycle tests and browser
acceptance.

Before Shipping is declared complete, the workstream must reconcile the full
module catalog and close or explicitly justify the remaining canonical
location/address/zone/carrier-mapping requirements:

- country/region/city/district or equivalent canonical location hierarchy;
- raw + normalized address representation;
- validation state/confidence;
- shipping zones;
- carrier location mappings;
- carrier/service eligibility;
- complete label/provider-reference lifecycle semantics;
- final accessibility/security/Definition-of-Done evidence.

Real production carrier adapters are not required to be embedded in the Shipping
domain itself; they are implemented behind the Connector SDK and verified under
the Production Connector Closure gate.

## Corrected next dependency order

After Shipping closure:

1. cross-cutting contracts (observability, usage/cost ledger, analytics dimensions,
   design-system primitives);
2. Identity / Team / Organization closure;
3. basic self-service onboarding/business profile;
4. Returns / Exchanges / Refunds;
5. Recovery;
6. Sales;
7. Campaigns;
8. Temporal platform closure;
9. Automation Studio;
10. Configuration Compiler;
11. Configuration Simulation;
12. Production Connector Closure;
13. AI typed tool platform;
14. AI Gateway production foundation;
15. AI evaluation + Knowledge/RAG;
16. AI Operators;
17. Custom Data;
18. Analytics / ROI;
19. Billing / Metering commercial closure;
20. Developer Platform;
21. Admin Control Center + Data Governance;
22. Full product UX closure;
23. Observability/performance/security hardening;
24. Release engineering + complete release acceptance.

See `WORK_PLAN.md` and `PLATFORM_EXECUTION_BLUEPRINT.md` for detailed dependencies.

## Release-wide gates still mandatory

Even a green repository-scope module does not waive:

- full English LTR and Arabic RTL visual/accessibility closure across every
  release-critical surface;
- complete Temporal retry/timeout/cancellation/signal/update/replay evidence;
- real production adapters for every provider claimed for launch;
- configuration compiler/simulation safety and versioning;
- AI tool authorization and required eval thresholds for enabled autonomy;
- logs/traces/metrics/alerts, realistic performance thresholds and security
  refresh;
- immutable production images/Compose overlay, previous-release upgrade,
  backup/restore/rollback, smoke/deployment verification and runbook;
- all mandatory checks in `TESTING_AND_ACCEPTANCE.md`.

## External boundaries

Production provider credentials/accounts/certifications and production deployment
access remain intentionally unavailable to repository tests unless separately
provided. Deterministic fixtures/emulators are allowed in CI but cannot be
presented as production adapters.

Automated tests must never use the production VPS or disturb the existing n8n
installation.
