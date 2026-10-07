# Production Readiness Matrix

This matrix is the release-control companion to `CODEX_EXECUTION_QUEUE.md` and
`IMPLEMENTATION_STATUS.md`. A row may be marked `COMPLETE` only when its objective evidence
is present on the exact code being evaluated. Repository completion is not equivalent to
public production readiness when a row still has provider, deployment, security, performance
or acceptance work outstanding.

**Overall release state:** IN PROGRESS  
**Current workstream:** Basic self-service onboarding  
**Current `main` baseline:** `63bdb1bf5127684f2d15fb2a4dc05157af724617` — Identity / Team / Organization closure

## Readiness levels

- `COMPLETE`: required repository/release evidence for this row exists.
- `FOUNDATION`: reusable substrate exists but release closure remains later.
- `IN PROGRESS`: the current workstream is actively closing the row.
- `NOT STARTED`: no release-acceptable implementation yet.
- `EXTERNAL`: depends on launch credentials/certification/account approval that must not be fabricated.

## Matrix

| Capability / gate | Schema / state | Tenant + auth security | Typed commands / async | UI / UX evidence | CI / test evidence | Production adapter / operations | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core migration / tenant foundation | COMPLETE | COMPLETE | COMPLETE | N/A | COMPLETE | Production upgrade/rollback later | FOUNDATION |
| RBAC / OPA / approvals | COMPLETE | COMPLETE | COMPLETE | Identity visibility complete | COMPLETE | Policy operations hardening later | FOUNDATION |
| Audit / idempotency / outbox | COMPLETE | COMPLETE | COMPLETE | N/A | COMPLETE | Alerting/operational tooling later | FOUNDATION |
| CRM / Customer 360 | COMPLETE foundation | COMPLETE foundation | COMPLETE foundation | Protected surface exists | Strong repository evidence | N/A | FOUNDATION |
| Messaging / Tickets / SLA | COMPLETE foundation | COMPLETE foundation | COMPLETE foundation | Protected surface exists | Strong repository evidence | Real Meta/email network adapters pending | FOUNDATION |
| Integration SDK / webhook / sync | COMPLETE foundation | COMPLETE foundation | COMPLETE foundation | Integration surfaces partial | COMPLETE foundation | Real launch adapters pending | FOUNDATION |
| Commerce / Orders | COMPLETE repository gate | COMPLETE | COMPLETE | LTR/RTL responsive acceptance | COMPLETE | Shopify/WooCommerce real adapters pending | COMPLETE repository scope |
| Shipping | COMPLETE repository gate | COMPLETE | COMPLETE | LTR/RTL responsive acceptance | COMPLETE | Real carrier adapters pending | COMPLETE repository scope |
| Usage / metering source ledger | COMPLETE shared foundation | COMPLETE | COMPLETE | N/A | COMPLETE | Commercial billing later | FOUNDATION |
| Observability contracts | COMPLETE shared foundation | COMPLETE | COMPLETE | N/A | COMPLETE | Production telemetry/alerts later | FOUNDATION |
| Design-system primitives | COMPLETE shared foundation | N/A | N/A | Shared direction-safe/a11y primitives | Contract/browser evidence | Full product conversion later | FOUNDATION |
| Identity / Team / Organization | COMPLETE | COMPLETE | COMPLETE | Protected Team/Settings/Onboarding/org selector | CI run #444 7/7 green | Keycloak remains auth/MFA credential source | COMPLETE repository scope |
| Self-service onboarding | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | IN PROGRESS | First-integration step references connector state | IN PROGRESS |
| Returns / Exchanges / Refunds | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Payment/carrier execution later | NOT STARTED |
| Recovery | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Messaging/Commerce adapters reused | NOT STARTED |
| Sales | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | N/A | NOT STARTED |
| Campaigns | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Real messaging adapters pending | NOT STARTED |
| Temporal platform closure | Foundation present | Tenant context foundation | Partial workflows | Operational visibility later | Restart durability proven | Replay/versioning/cancellation closure later | FOUNDATION |
| Automation Studio | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Typed canonical actions only | NOT STARTED |
| Configuration compiler | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Version/diff/approval/publish/rollback | NOT STARTED |
| Configuration simulation | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Must never mutate production/call providers | NOT STARTED |
| Production connectors | Contracts/fixtures exist | Foundation exists | Foundation exists | Partial | Fixture evidence only | Real Shopify/WooCommerce/Meta/email/shipping/payment/generic REST closure | NOT STARTED |
| AI typed tools | Minimal concepts | Canonical auth foundation | NOT STARTED full registry | NOT STARTED | NOT STARTED | Canonical commands only | NOT STARTED |
| AI Gateway | Early routing skeleton | Partial | Partial | Minimal | Minimal | Real model/provider routing/cost/fallback pending | FOUNDATION |
| AI evaluation / Knowledge / RAG | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Embedding/model adapter pending | NOT STARTED |
| AI Operators | NOT STARTED | NOT STARTED | NOT STARTED | Placeholder only | NOT STARTED | Typed tools + eval gates mandatory | NOT STARTED |
| Custom Data | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | No arbitrary SQL/schema execution | NOT STARTED |
| Analytics / ROI | Source contracts exist | Foundation | Event source foundation | NOT STARTED product dashboards | NOT STARTED | Materialized reporting/performance later | FOUNDATION |
| Billing / Metering commercial | Usage ledger exists | Foundation | NOT STARTED commercial layer | NOT STARTED | NOT STARTED | Payment/subscription/invoice operations later | FOUNDATION |
| Developer Platform | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | NOT STARTED | Scoped keys, signed outbound webhooks | NOT STARTED |
| Admin Control Center | Early skeleton | Foundation | Minimal | Skeleton | NOT STARTED | Safe audited remediation later | FOUNDATION |
| Data Governance | NOT STARTED formal closure | Foundation | NOT STARTED | Partial settings later | NOT STARTED | Retention/export/delete/anonymization/secret rotation | NOT STARTED |
| Full English/Arabic UX | N/A | N/A | N/A | PARTIAL | Partial browser evidence | All release-critical surfaces pending | FOUNDATION |
| Dependency / supply-chain security | Locking + secret scan present | N/A | N/A | N/A | Secret scan green | Dependency advisory closure/SBOM/image scan later | FOUNDATION |
| Adversarial application security | RLS/auth foundation | Strong foundation | Approval/idempotency foundation | N/A | Partial negative tests | Formal BOLA/IDOR/replay/SSRF/injection/AI tests later | FOUNDATION |
| Performance / SLO | N/A | N/A | N/A | N/A | NOT STARTED release benchmark | Capacity/alerts/load thresholds pending | NOT STARTED |
| Observability operations | N/A | N/A | Structured contracts | Admin visibility later | Partial | Metrics/traces/log backend + alerting pending | FOUNDATION |
| Backup / restore / rollback | Production DB baseline exists | N/A | N/A | N/A | NOT STARTED release drill | Mandatory release gate | NOT STARTED |
| Hosted preview | Preview-only state | Preview tenant/auth | Real app path intended | Public URL pending | Source CI green | Isolated Railway deployment being validated | IN PROGRESS |
| Immutable release engineering | Foundation images/Compose | N/A | N/A | N/A | Image builds exist | Previous-release upgrade, smoke, rollback, runbook pending | FOUNDATION |
| Complete release acceptance | N/A | N/A | N/A | N/A | `TESTING_AND_ACCEPTANCE.md` not fully executed | Exact immutable release candidate required | NOT STARTED |

## Non-negotiable release blockers

The platform is not production-ready while any of the following is true:

1. an execution-queue workstream remains open;
2. an advertised provider uses only a development fixture instead of a verified real adapter;
3. exact release SHA CI or mandatory adversarial/security tests are red;
4. release-critical Temporal workflows lack retry/replay/cancellation/restart evidence;
5. AI autonomy is enabled without typed-tool authorization and evaluation thresholds;
6. English LTR or Arabic RTL release-critical UX remains incomplete or inaccessible;
7. realistic load/SLO evidence and production telemetry/alerting are absent;
8. backup restore, migration upgrade and rollback drills have not passed;
9. critical/high security blockers remain unresolved;
10. deployment/runbook/release notes and complete acceptance evidence are missing.

## Evidence update rule

Every workstream PR must update this matrix only for gates it objectively changes. A status
must never be promoted merely because code exists. Record exact PR/head/run/release evidence
in `IMPLEMENTATION_STATUS.md`; keep this matrix concise enough to audit at a glance.
