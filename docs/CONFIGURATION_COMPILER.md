# Self-Service Configuration Compiler and Simulation

## Purpose

The platform must let a business configure itself without engineering assistance
while preserving the same safety, versioning, audit and canonical domain rules as
manual configuration.

The setup experience is intentionally split into two layers:

1. **Basic onboarding** captures durable business profile and gets the tenant into
   the product.
2. **Configuration Compiler + Simulation** converts approved business answers,
   policies and blueprints into a versioned declarative tenant configuration that
   can be reviewed, simulated, published and changed safely.

The compiler is not an AI code generator and does not emit arbitrary executable
source code.

## Basic business profile

A canonical profile may include:

- legal/display business name;
- country/operating regions;
- base currency;
- timezone;
- supported languages;
- industry/vertical;
- B2B/B2C/mixed;
- commerce model;
- COD/prepaid/payment characteristics;
- order volume band;
- support/conversation volume band;
- team size/roles;
- primary operational objectives;
- initial connected systems.

Profile fields are tenant-owned, typed, version-aware where necessary and usable
by policy/default selection without copying them into every generated resource.

## Policy questionnaire

Questions should be domain-oriented and explain consequences.

Examples:

### Commerce

- Does this order type require confirmation?
- What duplicate window applies?
- Which order modifications are allowed after payment/fulfillment state X?
- When may a user/AI/automation cancel an order?

### Shipping

- Which carriers/services are eligible by zone?
- Is shipment creation automatic after readiness?
- What failures open Delivery Rescue?
- Which address changes require approval?

### Support

- Working hours/timezone?
- SLA targets?
- AI/human handover defaults?
- Which issue classes must become tickets?

### Recovery

- Which loss states create recovery opportunities?
- Attempt window/frequency?
- Maximum allowed incentive/discount?
- When is human approval required?

### Sales

- Pipeline/stages?
- Qualification criteria?
- Assignment rules?
- Follow-up expectations?

### Campaigns

- Consent/suppression rules?
- Allowed channels/time windows?
- Cost/budget guardrails?
- Approval thresholds?

### AI

- Enabled operators?
- Default modes?
- Tool/risk limits?
- Knowledge sources?
- Escalation rules?
- Cost limits where applicable?

## Blueprint registry

A blueprint is an approved versioned declarative template, not arbitrary source
code. It may describe:

- required prerequisites/capabilities;
- policy defaults;
- automation graph templates;
- operator profile templates;
- dashboard presets;
- notification rules;
- integration capability expectations;
- validation rules;
- simulation scenarios.

Blueprints should have stable IDs/versions and lifecycle state such as draft,
approved/deprecated.

Changing a blueprint does not silently mutate tenants already published from an
older version. Tenants upgrade through a visible configuration diff/publish flow.

## Tenant configuration bundle

Use a versioned aggregate or equivalent model such as:

```text
TenantConfigurationBundle
- id
- tenant_id
- version
- status: DRAFT | VALIDATED | APPROVAL_PENDING | PUBLISHED | SUPERSEDED | FAILED
- source_profile_version
- blueprint_refs[]
- policy_set
- integration_configuration
- automation_blueprint_refs/configuration
- operator_profiles
- notification_configuration
- dashboard_preset
- limit/plan references where applicable
- compile metadata
- validation summary
- parent_version_id
- created_by
- created_at
- published_at
```

Large subdocuments may be normalized into versioned relational records rather
than one JSON blob. The important property is an immutable/reproducible version
boundary and deterministic references.

Do not put provider secrets into the configuration bundle. Store only secret
references/connection IDs.

## Compiler pipeline

```text
Business Profile
      +
Policy Answers
      +
Connected Capability Discovery
      +
Approved Blueprint Versions
      |
      v
Normalize Inputs
      |
      v
Policy Resolution
      |
      v
Blueprint Selection / Parameterization
      |
      v
Compile Candidate Bundle
      |
      v
Schema + Dependency Validation
      |
      v
Impact / Diff
      |
      v
Simulation
      |
      v
Approval when required
      |
      v
Idempotent Publish / Apply
      |
      v
Published Version + Audit + Events
```

## Compiler requirements

### Determinism

For the same normalized input and exact blueprint/compiler versions, output should
be equivalent where business rules require reproducibility. Non-deterministic AI
suggestions must not silently become the only source of a published configuration.

AI may assist by explaining choices or proposing bounded structured answers, but
published configuration must pass deterministic schema/policy validation.

### Validation

Validate at least:

- schema/types;
- required integrations/capabilities;
- referenced domain resources;
- automation trigger/action compatibility;
- permission/risk/approval policy;
- unsupported provider capability;
- contradictory policies;
- invalid timezones/currencies/locales;
- invalid shipping/payment dependencies;
- operator tool/knowledge compatibility;
- plan/entitlement constraints when billing exists.

Validation errors block publish. Warnings require explicit presentation and may
require acknowledgment/approval depending on impact.

### Diff and impact analysis

Before publish, show material changes relative to current published version:

- policies added/changed/removed;
- automations added/changed/disabled;
- operator modes/tool sets changed;
- integration settings changed;
- notification behavior changed;
- expected operational/provider consequences;
- estimated cost impact where known;
- resources that require migration/reconciliation.

Do not show only raw JSON diffs to normal users. Provide semantic summaries plus
technical details where appropriate.

## Publication model

Publishing configuration is itself a protected, idempotent command.

It must:

- verify tenant/actor permission;
- run OPA;
- require approval if material high-risk changes demand it;
- verify candidate version has not changed since approval/diff;
- apply changes through canonical domain configuration commands/services;
- never call provider networks inside a DB transaction;
- record audit and outbox events;
- expose async provider/sync progress where needed;
- set PUBLISHED only when canonical apply semantics are satisfied;
- surface partial/failed application truthfully.

If external provider setup is required, publication may commit desired state and
start durable post-commit workflows rather than pretending everything is
synchronous.

## Rollback and forward correction

A prior configuration version is immutable evidence, not a mutable backup blob.

Rollback means creating/applying a new version derived from a previous approved
state, subject to current schema/security/provider constraints. Some provider or
data migrations may not be reversibly undone; these cases require an explicit
forward-correction plan and UI warning.

Never delete history merely to simulate rollback.

## Simulation

Simulation evaluates candidate behavior without real production side effects.

### Inputs

- synthetic domain events;
- explicitly selected/snapshotted tenant example data with permission checks;
- blueprint-provided scenarios;
- manually entered test records.

Prefer synthetic data by default. Real tenant data used in a simulation must stay
inside tenant/access boundaries and must not be copied into unbounded logs.

### Simulation pipeline

```text
Scenario Input
 -> normalization
 -> candidate policy evaluation
 -> candidate automation traversal
 -> candidate AI/tool planning boundary where relevant
 -> proposed canonical domain actions
 -> proposed provider intents
 -> expected state transitions
 -> warnings / approvals / estimated cost
 -> trace result
```

### Hard prohibitions

Simulation must not:

- send WhatsApp/Instagram/Messenger/email messages;
- create/cancel/update real provider orders/shipments/refunds;
- invoke real payment transactions;
- mutate canonical production domain state;
- publish canonical production outbox events;
- start a production campaign;
- use unrestricted HTTP/SQL/code execution;
- access another tenant's data/knowledge.

### Simulation trace

A trace should show, in business-readable form:

- trigger/input;
- matched conditions;
- policies and decisions;
- selected automation branches;
- proposed tool/domain actions;
- approval stops;
- provider actions that would be queued;
- waits/timeouts;
- expected resulting states;
- warnings/errors;
- estimated AI/provider cost where available;
- configuration/blueprint/compiler versions.

A developer/advanced view may additionally expose stable IDs, schemas and
correlation references.

## Example

Business profile/policy:

```text
Store: Shopify
Country: Egypt
Order type: COD
Confirmation: required
Duplicate window: 5 days
Confirmation attempts: initial + one retry
Shipment creation: after confirmed/ready
Carrier: configured launch carrier
Recovery incentive max: 10%
Human approval required above 5%
```

Compiled configuration could reference:

```text
PolicySet v4
OrderConfirmationAutomation v7
ShippingPolicy v2
RecoveryPolicy v3
SupportOperatorProfile v5
RecoveryOperatorProfile v2
DashboardPreset ecommerce-egypt-v3
```

Simulation scenario:

```text
new COD order
 -> duplicate evaluation
 -> confirmation message intent
 -> durable wait
 -> retry according to policy
 -> confirmed => shipping readiness
 -> shipping eligibility/provider intent
 -> rejection/timeout => configured cancellation/recovery behavior
```

The UI shows this before publish without contacting Shopify/Meta/carrier.

## Events

Expected semantic events include:

- business profile changed;
- configuration compiled;
- validation completed/failed;
- simulation completed;
- approval requested/decided through the existing approval domain;
- configuration published/applied/failed;
- configuration superseded/rollback version published.

Use exact versioned names in `EVENT_CATALOG.md` when implemented.

## Security

- tenant/RLS on all tenant configuration state;
- permission/OPA/approval for compile/publish/rollback operations as applicable;
- no secrets in configuration payloads;
- immutable version identity/digest used for approval where high risk;
- simulation side-effect prohibition enforced server side;
- blueprint registry integrity/version checks;
- bounded/sanitized compiler/simulation logs;
- malicious questionnaire/text input is data, not executable code;
- AI suggestions cannot grant tools/permissions or bypass validation.

## Testing

Required suites include:

- deterministic/equivalent compile for fixed versions/input;
- invalid/contradictory config rejection;
- missing integration/capability rejection;
- two-tenant config isolation;
- approval digest invalidation on candidate change;
- idempotent publish;
- partial apply/error truthfulness;
- rollback/forward-correction semantics;
- simulation produces no canonical mutation/outbox/provider network call;
- simulated policy/automation decisions match runtime logic for covered fixtures;
- malicious input cannot trigger SQL/HTTP/code/provider side effects;
- LTR/RTL/responsive/accessibility browser flows for setup/diff/simulation/publish.

## Observability and metering

Track bounded metrics such as:

- compile/validation/simulation duration;
- validation failure categories;
- publish/apply duration/state;
- async provider/config reconciliation status;
- compiler/blueprint/config version references;
- estimated simulation provider/AI cost only when reliable.

Simulation itself may be metered later if commercially relevant, but cost records
must never imply a real provider side effect occurred when it did not.
