# Security and Authorization

## Identity

Keycloak authenticates users.

Application PostgreSQL owns:

- organizations;
- memberships;
- roles;
- permissions;
- tenant selection;
- resource state/ownership;
- tenant business/configuration state.

Do not create a separate Keycloak realm for every customer organization.

## JWT validation

API validates:

- signature;
- issuer;
- audience/client;
- expiration;
- not-before;
- allowed algorithms.

Resolve `sub` to `identity.users.keycloak_subject`.

Never trust a tenant ID from client input without verifying membership/context.

## Actor types

Authorization applies consistently to human and non-human actors.

Relevant actor classes include:

- USER;
- AI;
- AUTOMATION;
- SYSTEM;
- SERVICE;
- INTEGRATION;
- privileged PLATFORM_ADMIN operations where explicitly modeled.

No actor class receives an implicit tenant/RLS/policy bypass merely because it is
internal.

## Authorization chain

```text
subject/service actor
 -> active tenant context / scoped platform-admin context
 -> effective permissions
 -> required permission
 -> resource/tenant ownership
 -> risk
 -> OPA
 -> optional/required approval
 -> idempotent domain operation
 -> PostgreSQL RLS
 -> audit/outbox
```

All business actors ultimately use canonical domain commands. Frontend hiding,
AI operator mode, automation publication or Temporal workflow state never replace
server-side authorization.

## OPA

OPA input includes at least:

- tenant ID;
- subject/service identity;
- effective permissions/scopes;
- action;
- required permission;
- risk;
- resource type/id/tenant;
- relevant bounded resource attributes;
- actor type/mode;
- approval context;
- configuration/automation/tool version where material.

OPA result is a typed contract.

Missing/invalid OPA response is not allow.

OPA unavailable => fail closed for protected writes.

## Approvals

Create first-class approval entities.

Lifecycle:

- REQUESTED;
- APPROVED;
- REJECTED;
- EXPIRED;
- CANCELED;
- EXECUTED;
- FAILED.

Store:

- tenant;
- requesting actor;
- requested canonical action/tool;
- resource;
- risk;
- sanitized request snapshot;
- policy reason;
- approver;
- decision time;
- expiry;
- resulting execution.

Bind approval to an immutable/deterministic action digest to prevent TOCTOU
substitution.

The reusable command authorizer enforces permission, tenant match, OPA, approval
status, expiry and action-digest equality before a protected command enters its
domain mutation transaction.

Approved actions are consumed atomically with the authorized canonical domain
mutation where the command model requires one-time execution. Idempotency key
reuse with a different request hash is rejected.

## Automation Studio security

Automation publication and automation execution are distinct security moments.

- publishing/editing an automation requires tenant permissions and audit;
- a published automation version is immutable/versioned;
- execution uses a bounded AUTOMATION actor context;
- each protected action reuses the canonical action permission/OPA/approval path;
- automation cannot call arbitrary SQL, shell, code or unrestricted HTTP;
- connector actions are typed/allowlisted and post-commit;
- automation cannot acquire permissions merely because the publisher once had
  broader rights unless the product explicitly defines and audits a safe service
  principal model;
- cancellation/retry must not duplicate side effects.

## Configuration compiler security

The compiler produces declarative tenant configuration, not executable source
code.

- input schemas are validated;
- blueprint/template IDs and versions are allowlisted/known;
- generated configuration is tenant scoped/versioned;
- material diff shown before publish;
- HIGH/CRITICAL generated changes follow policy/approval rules;
- publication is idempotent/audited and cannot bypass normal domain commands;
- rollback/forward correction is authorized and audited;
- compiler cannot embed secrets into ordinary configuration records.

### Simulation security

Simulation:

- never sends real provider actions/messages;
- never mutates canonical production business state;
- uses synthetic/snapshotted bounded test inputs;
- cannot access another tenant's records/knowledge;
- cannot turn arbitrary user text into code/SQL/network execution;
- clearly marks estimated/planned outcomes as non-production.

## AI security

AI model output is untrusted input to the tool layer.

Every tool invocation requires:

- schema validation;
- tenant/resource context;
- permission/RBAC;
- OPA;
- approval where required;
- idempotency;
- canonical domain command;
- audit/outbox;
- post-commit connector if external.

AI never receives arbitrary SQL, shell, code execution, unrestricted provider
HTTP or provider credentials.

Operator mode (OFF/COPILOT/APPROVAL/AUTONOMOUS) never bypasses risk policy.

RAG retrieval enforces tenant/access scope before context reaches the model.
Prompt-injection content cannot grant tools, permissions or provider access.

## Platform Admin security

Admin Control Center is an operational control plane, not unrestricted database
access.

Preferred path:

```text
platform admin identity
 -> privileged internal endpoint/command
 -> explicit support permission/scope
 -> OPA/policy if applicable
 -> audited scoped read/action
 -> RLS-safe view/function or canonical domain command
```

Requirements:

- every privileged cross-tenant access/action attributable to an admin actor;
- least privilege/support purpose;
- sensitive values minimized;
- remediation commands idempotent/audited;
- no raw provider secrets exposed;
- no silent direct modification of customer business data;
- break-glass processes explicit and outside routine UI paths.

## Secrets

Never store raw provider secrets in ordinary domain tables.

Use a secret-reference abstraction and a production-capable secret backend behind
it.

Development may use env-backed disposable secrets.

Do not log/audit/emit secrets.

Secret rotation and access are least-privilege and observable without revealing
secret material.

## API keys

- hash plaintext one-way;
- display plaintext once;
- key prefix/id;
- tenant;
- scopes;
- expiration;
- last-used;
- revoke;
- rotate;
- rate limits;
- audit.

An API key cannot select an unauthorized tenant or exceed stored scopes.

## Webhook security

Each connector defines:

- signature verification;
- timestamp/replay checks where supported;
- tenant/account resolution;
- delivery-ID dedupe;
- body-size limit;
- sanitized raw storage;
- retry semantics.

A provider-native tenant/account identifier must resolve through trusted
connection mappings, not through untrusted body fields alone.

## SSRF and outbound network controls

Connector configuration must prevent arbitrary internal/private network requests
unless a tightly controlled capability explicitly requires and allowlists them.

Generic REST/webhook connectors require URL validation, scheme restrictions,
private/link-local/metadata endpoint protection, redirect policy and DNS/rebinding
consideration appropriate to implementation.

Automation and AI do not get unrestricted HTTP tools.

## Files/media

Validate:

- size;
- MIME/type consistency;
- tenant ownership;
- access permission;
- filename handling;
- opaque object IDs;
- one-time/lease semantics where applicable;
- cleanup/retention.

Do not trust browser MIME alone. Media download URLs must not become cross-tenant
access paths.

## Rate limiting and cost abuse

Protect:

- auth-sensitive endpoints;
- public/webhook endpoints;
- API-key endpoints;
- AI-costly endpoints;
- exports/imports;
- campaign sends;
- simulation abuse if computationally expensive;
- destructive/admin endpoints;
- provider action creation;
- password/invitation/auth flows where relevant.

Limits may incorporate tenant plan/entitlement later but security limits must not
disappear when commercial billing is unavailable.

## Data governance security

Implement explicit policies/workflows for:

- retention;
- raw webhook cleanup;
- AI trace/prompt data handling;
- media cleanup;
- tenant/customer export;
- deletion/anonymization;
- tenant suspension/deletion;
- consent/evidence retention;
- backup/restore implications.

Deletion/anonymization must not silently destroy required security/audit evidence;
retention exceptions must be documented and minimize sensitive content.

## Security testing

Mandatory suites include:

- tenant escape;
- BOLA/IDOR;
- relationship binding across tenants;
- role/system-role escalation;
- approval bypass/replay/substitution;
- automation actor privilege escalation;
- configuration publish/simulation boundary escape;
- webhook forgery/replay;
- SSRF;
- injection;
- upload/media abuse;
- API-key misuse;
- privileged admin misuse;
- cross-tenant RAG;
- prompt injection / AI tool privilege escalation;
- usage/billing record cross-tenant tampering.

## Threat model

Maintain `/docs/THREAT_MODEL.md` and refresh it before the release candidate when
new high-impact surfaces (Automation, Configuration Compiler, AI tools/RAG,
Developer Platform, Admin Control Center, Custom Data) are implemented.
