# Threat Model

This threat model covers the current foundation and the planned release-critical
surfaces in `PLATFORM_EXECUTION_BLUEPRINT.md`. Controls must be implemented with
each feature and revalidated in the final security gate.

## Protected assets

- tenant-owned PostgreSQL business data;
- organization memberships, roles, permissions and approval state;
- provider credentials/secret references and access tokens;
- API keys and webhook signing secrets;
- incoming/outgoing webhook payloads;
- commerce/payment/refund state;
- shipping addresses and provider mappings;
- customer identity/contact/consent data;
- campaign recipient/audience data;
- custom-data records;
- knowledge/RAG documents/embeddings;
- AI prompts/tool arguments/results where retained;
- configuration/compiler versions and blueprints;
- usage/cost/billing records;
- operational audit logs and dead letters;
- backup/restore artifacts.

## Trust boundaries

Separate trust boundaries include:

- browser/mobile clients;
- public API/webhook ingress;
- Keycloak;
- application API;
- OPA;
- PostgreSQL/RLS;
- worker processes;
- NATS;
- Temporal;
- connector/secret-resolution boundary;
- external providers;
- AI Gateway/model providers;
- knowledge ingestion/retrieval;
- Automation Studio execution;
- Configuration Compiler/Simulation;
- Developer API/outbound webhooks;
- Admin Control Center/support operations;
- backup/restore environment.

## Primary threats and controls

| Threat                                    | Control                                                                                                  | Required verification                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cross-tenant BOLA/IDOR                    | Membership authorization, tenant-qualified relationships, transaction-local PostgreSQL RLS               | Two-tenant read/write/list/search/direct-ID/relationship/export/event/worker/Temporal/AI/RAG tests |
| Privilege escalation                      | DB-owned permissions, protected system roles, OPA, scoped actor types                                    | Role mutation, inactive/suspended membership, service/automation/admin actor tests                 |
| Approval substitution/replay              | Digest-bound immutable action/resource/input, expiry and one-time execution                              | Changed-payload, expired/reused/concurrent approval rejection                                      |
| OPA outage bypass                         | Typed OPA client fails closed for protected writes                                                       | Outage contract and recovery tests                                                                 |
| Unsafe customer reconciliation            | HIGH-risk approval, stable locking/RLS/history                                                           | Cross-tenant, conflict, rollback and concurrent merge tests                                        |
| Forged/replayed webhook                   | Provider signature/timestamp verification, account mapping, persisted dedupe                             | Signature/replay/duplicate/oversize tests                                                          |
| Credential disclosure                     | Opaque secret refs, narrow resolution boundary, sanitized logs/audit                                     | Secret scan, log/dead-letter review, rotation tests                                                |
| Provider call inside DB transaction       | Desired intent committed first, worker/Temporal connector execution after commit                         | Contract/integration test proving network adapter is not invoked before commit                     |
| SSRF / arbitrary provider calls           | Typed connectors, URL validation, private/metadata network restrictions, no arbitrary AI/automation HTTP | URL/redirect/DNS/private-range tests                                                               |
| Automation privilege abuse                | Canonical typed actions, execution-time RBAC/OPA/approval, immutable published versions                  | Publisher/executor scope, retry/idempotency, forbidden action tests                                |
| Untrusted code execution                  | No arbitrary SQL/shell/JavaScript/Python; typed action graph only                                        | Schema/action allowlist tests and malicious graph fixtures                                         |
| Configuration compiler privilege abuse    | Declarative allowlisted blueprints, schema/dependency validation, diff, approval, canonical apply        | Malicious input, changed candidate/approval invalidation, tenant isolation                         |
| Simulation causes real side effects       | Separate non-mutating evaluator/planner; no provider network/canonical outbox/business mutation          | Network/provider call denial and DB mutation/outbox absence tests                                  |
| Malicious blueprint/template supply chain | Versioned approved registry, integrity/review, no arbitrary executable content                           | Unknown/deprecated/tampered version rejection                                                      |
| AI prompt injection/action abuse          | Typed tool schemas, tenant/resource context, RBAC, OPA, approvals, audit                                 | Prompt injection, unauthorized tool, changed payload, cross-tenant tests                           |
| Cross-tenant RAG/data exfiltration        | Tenant/access filtering before retrieval context reaches model                                           | Retrieval isolation, inaccessible-source/citation tests                                            |
| Model/provider data leakage               | Minimum necessary context, provider policy/configuration, bounded telemetry                              | Sensitive-data eval fixtures and telemetry review                                                  |
| Campaign duplicate/consent violation      | Frozen audience/recipient IDs, consent/suppression snapshot, idempotent send                             | Retry duplicate prevention and suppression/opt-out tests                                           |
| Billing/usage tampering or double count   | Append-only/idempotent usage identity, tenant scope, source correlation                                  | Retry/replay/tenant isolation and billing reconciliation tests                                     |
| API-key misuse                            | One-way hash, scopes, expiry/revoke/rotate, rate limits                                                  | Scope/tenant/revoke/expiry tests                                                                   |
| Outbound webhook leakage                  | Tenant-scoped subscription, signing, canonical event filtering, bounded payload                          | Cross-tenant destination/subscription/signature tests                                              |
| Admin support abuse                       | Explicit platform-admin identity, scoped privileged commands/views, immutable audit                      | Unauthorized admin, cross-tenant support action and audit completeness tests                       |
| Custom Data permission bypass             | RLS + table/field/row/operation permission checks                                                        | Direct ID, relationship, export, AI/automation bypass tests                                        |
| Upload/media abuse                        | Size/MIME/ownership checks, opaque IDs, safe filenames/storage                                           | Polyglot/spoofed MIME, cross-tenant download, oversized file tests                                 |
| Data-retention/deletion corruption        | Versioned governance workflow, legal/audit retention exceptions, scoped cleanup                          | Deletion/anonymization/export/retention lifecycle tests                                            |
| Backup data exposure                      | Access-controlled encrypted operational process, no production dump in repo/tests                        | Restore procedure review, artifact handling and secret scan                                        |

## High-risk business operations

Treat at least the following as policy-sensitive and approval-capable:

- provider connection/disconnection and secret rotation;
- destructive customer merge/reconciliation;
- order cancellation/modification after sensitive state;
- shipment cancellation/address change/reschedule where consequential;
- refunds/payment actions;
- high-value recovery/campaign incentives;
- configuration publication with high-risk policy changes;
- AI/automation actions classified HIGH/CRITICAL;
- API-key creation/rotation where tenant policy requires;
- privileged admin remediation and tenant lifecycle operations.

Risk class does not by itself mean every tenant must require a human every time;
OPA/tenant policy determines the allowed/approval behavior. Autonomous mode never
bypasses that decision.

## AI and RAG specific threats

### Prompt injection

Knowledge, customer messages and uploaded documents are untrusted content. They
cannot grant permissions, alter system policy, expand the tool allowlist or expose
secrets.

### Tool-output injection

Tool/provider results returned to a model are also untrusted data. Sanitize and
structure them; do not allow provider text to redefine agent instructions.

### Excessive data context

Only send the minimum tenant-authorized context required for the task. Avoid
putting whole customer databases or unnecessary sensitive fields into model
context.

### Hallucinated success

The model cannot mark business/provider actions successful. Success is derived
from canonical committed state/provider evidence.

## Configuration / automation threats

Questionnaire text, imported templates and blueprint parameters are data, not
source code.

Compiler and Automation Studio must resist:

- expression/code injection;
- arbitrary network target injection;
- arbitrary SQL/table access;
- hidden privilege escalation through generated actions;
- stale approval reused after candidate change;
- retry causing duplicate side effects;
- simulation accidentally executing production actions.

## Admin / break-glass

Routine Admin Control Center operations use scoped APIs/commands and are audited.

Permanent break-glass credentials/processes remain outside routine product flows,
use least privilege, and require documented operational handling.

Do not expose raw database consoles/provider secrets through the admin UI.

## Residual risks

Residual risk remains from external provider compromise, tenant-admin misuse,
model/provider outages, external identity infrastructure failure, misconfigured
business policies, and provider policy changes.

Mitigations include least-privilege credentials/scopes, deterministic validation,
monitoring, explicit degraded states, audit, safe defaults, simulations,
provider-contract maintenance, incident/runbook procedures and break-glass
controls.

## Release requirement

Refresh this threat model before release candidate acceptance after Automation,
Configuration Compiler, AI tools/RAG, Developer Platform, Custom Data, Billing and
Admin Control Center are implemented. Security testing in
`TESTING_AND_ACCEPTANCE.md` is release blocking.
