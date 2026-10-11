# Capability / Implementation / Test / Evidence Matrix

This matrix is the auditable bridge from advertised capability to implementation, test and deployment evidence. Status is intentionally conservative.

| Capability | Owner / dependency | DB / service / API / worker / UI state | Fixture vs real provider | Test/evidence | Remaining gate |
| --- | --- | --- | --- | --- | --- |
| Tenant isolation / RLS | Platform foundation | Canonical tenant context, tenant-qualified relationships, RLS patterns | N/A | integration SQL negatives across domains | Final adversarial tenant-escape/BOLA/IDOR campaign |
| Authorization / approvals | Platform foundation | RBAC + OPA + digest-bound approvals in shared command path | N/A | command/domain integration tests | Product-wide concurrency/replay/admin misuse closure |
| Idempotency / audit / outbox | Platform foundation | Shared command executor and canonical ledgers | N/A | domain lifecycle replay/audit/outbox checks | Operational stuck/DLQ remediation and failure injection |
| Identity / organization / team | Identity | Organization create/select, membership/invite/roles/profile/MFA policy | Keycloak integration is real substrate; preview login is development-only | merged Identity exact-head CI | Production PKCE/session/MFA/invitation delivery |
| Self-service onboarding | Identity + Integration state | Business profile + derived team/integration readiness + UI | Integration readiness may observe development fixtures in preview | merged main CI #505 + protected browser journey | Config compiler/simulation + production activation journey + final AR copy |
| CRM / Customer 360 | CRM | Customer/contact identity, tags, segments, timeline, consent/suppression, merge, CSV | N/A | integration + protected browser CRM journey | Rich maintenance/identity-resolution/search/bulk/governance closure |
| Unified Inbox / Messaging | Messaging + connectors | Conversations/messages/media/assignment/handover/templates/outbound ledger | Current external channels are development fixtures | integration tests + repository UI | Real channel transports/account binding/read/media/provider-policy closure |
| Tickets / SLA | Tickets + Messaging | ticket lifecycle/comments/assignment/SLA clocks/policies/escalation foundation | N/A | lifecycle/RLS tests | business calendars/categories/tasks/notifications/durable orchestration/E2E |
| Commerce / Orders | Commerce | stores/catalog/inventory/order/payment/fulfillment mappings + order workflow commands/UI | Store/provider transports are fixtures/not launch-certified | repository gate + protected Orders browser journey | Real Shopify/WooCommerce/payment sync/reconciliation + edge cases |
| Shipping | Shipping | carriers/services/locations/zones/routing/shipments/packages/labels/tracking/rescue/UI | Carrier transports not production | RLS/lifecycle + rescue/routing browser journeys | Real carriers/address data/label/tracking + durable workflows |
| Returns / Exchanges / Refunds | Commerce + Returns | policies/requests/lines/inspection/disposition/refunds/exchanges/timeline/API/UI | Refund provider action boundary exists; real payment transport not production | PR #12 CI #527; main #528 | Real payment execution/ambiguity reconciliation + actual Temporal workflow |
| Recovery | Commerce + CRM + Messaging | NOT STARTED as complete domain | N/A | none yet | Implement next with eligibility/suppression/sends/expiry/attribution/Temporal/UI |
| Sales | CRM | NOT STARTED as complete domain | N/A | none yet | Implement leads/pipelines/opportunities/activities/tasks/linkage |
| Campaigns | CRM + Messaging | NOT STARTED as complete domain | N/A | none yet | Immutable audiences, scheduling, sends, receipts, budgets, attribution, Temporal |
| Temporal business orchestration | Platform worker | Temporal server/restart probe exists; no complete business workflow worker family | N/A | restart durability probe | Register real workflows/activities and prove execution/retry/cancel/replay/evolution |
| Automation Studio | Temporal + canonical commands | NOT STARTED | N/A | none | Safe declarative versions/builder/runs; no arbitrary code/network/SQL |
| Configuration compiler | Onboarding + Automation | NOT STARTED | N/A | none | Blueprint/bundle compile/validate/diff/approve/apply/publish/history/rollback |
| Configuration simulation | Config + command policy | NOT STARTED | N/A | none | Side-effect-free synthetic traces sharing runtime policy semantics |
| Connector infrastructure | Integrations | Connections/secrets refs/assets/health/sync/webhook/provider-action ledgers | Development fixture registry available | integration/RLS/worker tests | Protected real secret resolver + real provider network adapters |
| WhatsApp / Instagram / Messenger | Integrations + Messaging | development connector definitions/adapters only | DEVELOPMENT FIXTURE | deterministic CI | Real Meta auth/assets/webhooks/send/media/receipts/token/policy staging evidence |
| Email | Integrations + Messaging | development fixture | DEVELOPMENT FIXTURE | deterministic CI | Real inbound/outbound/thread/bounce/complaint/auth provider |
| Web Chat | Integrations + Messaging | development fixture | DEVELOPMENT FIXTURE | deterministic CI | First-party authorized widget/session/origin/abuse controls |
| API channel | Integrations + Developer Platform | development fixture | DEVELOPMENT FIXTURE | deterministic CI | Scoped API-key canonical ingress |
| Shopify | Integrations + Commerce | development fixture + canonical commerce state | DEVELOPMENT FIXTURE | deterministic CI | Public-app OAuth/scopes/webhooks/privacy/backfill/reconcile/typed actions |
| WooCommerce | Integrations + Commerce | development fixture + canonical commerce state | DEVELOPMENT FIXTURE | deterministic CI | Real auth/version/webhook/sync/reconcile/actions |
| Shipping/payment providers | Integration + domain | provider-action boundaries exist | NOT SELECTED / NOT VERIFIED | repository contracts only | Commercial launch provider selection + implementation + authorized staging proof |
| AI typed tools | AI + command registry | NOT STARTED production registry | N/A | none | Versioned schemas/permission/risk/approval/idempotency/audit/usage |
| AI Gateway | AI | health + basic routing substrate | No production model inference/provider stack | Python tests | Authenticated routing/providers/models/budgets/fallback/cost telemetry |
| Knowledge / RAG | AI + pgvector | NOT STARTED complete platform | N/A | none | Access-scoped ingestion/retrieval/citations/freshness/deletion/evals |
| AI Operators | AI + typed tools | NOT STARTED production operators | N/A | none | Versioned instructions/knowledge/tools/budgets/evals/escalation/modes |
| Custom Data | Platform data | NOT STARTED | N/A | none | Typed tenant tables/fields/records/permissions/import/export/UI/events/tools |
| Analytics / ROI | Events + usage | source event/meter contracts exist | N/A | source-ledger tests | projections/rebuilds/attribution/confidence/cost dashboards/performance |
| Billing / entitlements | Usage ledger | source metering foundation only | N/A | source-ledger tests | Plans/subscriptions/quotas/trials/overages/invoices/suspension/enforcement |
| Developer Platform | API + webhooks | NOT STARTED complete platform | N/A | none | hashed scoped keys + signed outbound webhooks + rate limits/logs/docs/UI |
| Admin Control Center | Operations | static/limited skeleton | N/A | none complete | privileged APIs/authorization/telemetry/remediation/audit/UI/E2E |
| Data Governance | Cross-domain | NOT STARTED complete gate | N/A | none complete | retention/export/deletion/anonymization/cleanup/consent/secret lifecycle tests |
| EN/AR production UX | Web/Admin | partial direction-safe/shared primitives | N/A | five protected journeys currently cover only limited surfaces | Full translation/localization/bidi/responsive/a11y and complete states |
| Development preview | Railway dev-preview project | Combined Web/API/Worker/OPA with separate Postgres/Keycloak/NATS/Temporal | preview fixtures only | Railway runtime + external health workflow | Deploy patched exact SHA; verify /health/login/protected reads; no production claim |
| Production topology / DR | Release engineering | Docker/Compose/reference scaffolding | N/A | build gates only | Separate immutable images/topology, migration job, media/secrets, backup/restore/PITR/rollback |
| Final release acceptance | Entire program | NOT READY | Real advertised providers required | not yet run | One immutable RC passes all mandatory functional/security/provider/UX/load/DR/UAT gates |

## Evidence convention

For each row moving toward completion, record: branch/PR, exact SHA, CI/run ID, migration/test locations, browser evidence where applicable, deployed SHA/deployment ID if deployed, and any external staging-provider evidence. Never upgrade a fixture or static demo into a production-evidence claim.
