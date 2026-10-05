# Testing and Release Acceptance

This file defines the objective finish line. A workstream is not complete because
its schema/API/UI exists; it is complete only when its applicable gate is green.
The full platform is not complete until the final release-candidate gate passes.

## Test levels

### Unit

Domain logic, parsers, normalization, policy input building, usage calculations,
configuration compilation/validation, deterministic workflow logic, attribution,
and pure automation/AI planning logic.

### Integration

PostgreSQL/RLS, transaction-local tenant context, Keycloak/JWT, OPA, approvals,
outbox/NATS, Temporal, connector adapters/emulators, worker claims, usage records,
analytics projections and configuration publication.

### Contract

Provider payload verification/normalization, outbound request generation from
recorded/synthetic fixtures, typed domain/event/tool contracts and connector
capability/error semantics.

### E2E

Critical user journeys through web/API including onboarding, operational work,
approvals, async provider state, configuration simulation/publish and admin/developer
surfaces as they become release critical.

### Security

Tenant escape, BOLA/IDOR, role escalation, system-role mutation, approval bypass
or substitution, webhook replay/forgery, API-key misuse, SSRF, injection classes,
upload/media abuse, cross-tenant RAG, AI tool abuse and privileged admin misuse.

## Definition-of-Done gate for every module

Where applicable, a module/workstream must prove:

- append-only SQL migration and checksum discipline;
- tenant-qualified constraints/indexes/relationships;
- RLS and direct-ID/list/search/write/delete isolation;
- typed domain/repository/service/API contracts;
- runtime input/output validation;
- authentication, membership, RBAC and OPA;
- digest-bound approval for policy-defined HIGH/CRITICAL operations;
- idempotent commands and replay behavior;
- immutable bounded audit evidence;
- transactional outbox and versioned event contract;
- Temporal workflow/hooks when long-running;
- post-commit connector/provider hooks when external;
- bounded retry/dead-letter behavior;
- usage/cost records where metered;
- analytics/ROI instrumentation where meaningful;
- structured logs/correlation/trace hooks;
- protected operational UI;
- shared design-system usage;
- English LTR and Arabic RTL behavior;
- responsive and accessibility checks;
- loading/empty/forbidden/error/pending states;
- applicable unit/integration/RLS/authorization/contract/browser tests;
- documentation and implementation-status update;
- green relevant CI evidence.

A later release-wide gate may still own exhaustive cross-product visual,
performance, security and deployment verification.

## Mandatory two-tenant test

Every tenant-owned module must prove with Tenant A and Tenant B:

- read isolation;
- write/update/delete isolation;
- list/search isolation;
- direct-ID isolation;
- relationship isolation;
- export isolation;
- event tenant preservation;
- usage/metering tenant preservation;
- analytics projection tenant preservation;
- AI tool tenant/resource preservation;
- RAG retrieval isolation where applicable;
- background-job/worker tenant preservation;
- Temporal workflow/activity tenant preservation where applicable;
- custom-data row/field isolation where applicable;
- admin/support paths cannot silently bypass tenant scoping.

## Database gate

CI:

1. clean PostgreSQL 16 + pgvector;
2. apply `0001` -> latest;
3. validate migration checksums;
4. run schema tests;
5. run RLS tests;
6. run constraint/index/relationship tests;
7. test upgrade from previous-release fixture when available;
8. verify destructive evolution follows expand/migrate/contract where required;
9. verify runtime roles remain non-superuser and `NOBYPASSRLS`.

## Auth / Identity gate

- valid token accepted;
- wrong issuer/audience rejected;
- expired/not-before rejected;
- invalid algorithm/signature rejected;
- inactive/suspended membership rejected;
- wrong tenant rejected;
- missing permission rejected;
- system-role mutation blocked;
- invitation acceptance/revoke rules enforced;
- organization selection cannot select an unauthorized tenant;
- MFA integration behavior verified where configured.

## OPA / Approval gate

- default deny;
- low/medium policy behavior;
- high/critical approval behavior;
- cross-tenant deny;
- AI/service/automation actor constraints;
- OPA outage fails closed for protected writes;
- approval is bound to the exact immutable/deterministic action digest;
- changed payload invalidates prior approval;
- expired/rejected/cancelled/executed approval cannot be reused;
- concurrent/replayed execution cannot consume approval twice.

## Webhook gate

- valid signature accepted;
- invalid signature rejected;
- timestamp/replay checks where provider supports them;
- duplicate delivery idempotent;
- oversized payload rejected;
- tenant/account resolution correct;
- persisted before asynchronous processing;
- provider acknowledgement is prompt;
- normalization validated;
- poison/invalid payload does not cause unbounded retry;
- raw/sanitized storage does not leak secrets.

## Event / Outbox / NATS gate

- rolled-back transaction emits no event;
- committed outbox eventually publishes;
- publisher claiming/lease behavior safe;
- duplicate publish/consume idempotent;
- event schema/version validated;
- tenant preserved;
- actor/resource/correlation/causation retained;
- bounded retry and dead-letter path works;
- event consumer failure does not corrupt canonical domain state;
- operational lag metric/visibility exists.

## Usage / Metering gate

For every metered action:

- deterministic/idempotent usage identity;
- tenant/source/resource/correlation attribution;
- correct unit/quantity;
- retry does not double count unless a genuinely new provider/billable unit was
  consumed;
- provider cost currency/estimate recorded only when known/meaningful;
- replay/reconciliation cannot inflate commercial usage;
- usage cannot cross tenant boundaries;
- plan/billing aggregation reproduces source usage totals.

## Analytics / ROI gate

- projections consume canonical events/usage idempotently;
- tenant/correlation references retained;
- projection replay/rebuild produces stable results where supported;
- recovered revenue/conversion attribution has a documented method/confidence;
- dashboards do not count the same conversion twice across campaign/recovery
  dimensions;
- query latency measured with realistic data;
- aggregate lag/failure is observable.

## Connector SDK / Production Adapter gate

For each connector capability claimed:

- configuration validation;
- auth/OAuth and token lifecycle where applicable;
- opaque secret references only in ordinary domain records;
- asset discovery;
- webhook register/unregister/verify/normalize;
- initial/incremental sync;
- reconciliation;
- typed provider actions/results;
- provider error classification;
- rate-limit/retry-after semantics;
- health/disconnect/uninstall behavior;
- no provider call inside a DB transaction;
- no provider-specific JSON escapes into canonical domain contracts;
- logs/audit/dead letters contain bounded sanitized provider data.

For every provider claimed for production release:

- a real network adapter exists;
- production registration cannot select a development fixture;
- recorded/synthetic provider contract tests pass;
- credential/certification requirements are documented;
- no launch-critical route depends on fake success or an emulator.

## Temporal gate

For every release-critical workflow:

- deterministic workflow ID semantics;
- happy path;
- activity retry;
- provider/infrastructure failure classification;
- business-terminal failure classification;
- timeout/heartbeat;
- cancellation;
- duplicate start;
- human approval;
- signal/update;
- external state update;
- worker restart;
- deterministic replay after code evolution;
- server restart where practical;
- canonical domain state remains in PostgreSQL;
- workflow metadata contains no secrets/unnecessary PII.

Required workflows include OrganizationOnboarding, IntegrationBackfill,
IntegrationReconciliation, OrderConfirmation, Shipping, DeliveryRescue, Return,
Refund, Recovery, Campaign, ConversationOperator and Automation.

## Automation Studio gate

- trigger contract validation;
- condition/branch determinism;
- waits/timers durable;
- published version immutable or versioned safely;
- draft cannot execute as published;
- canonical typed actions only;
- authorization/OPA/approval rechecked at execution time where required;
- retries do not duplicate side effects;
- cancellation behavior defined;
- run/node visibility and audit correct;
- no arbitrary SQL/HTTP/source-code execution;
- automation actor cannot exceed tenant/user/policy permissions;
- metering/analytics records correct.

## Configuration compiler gate

- same business input + blueprint/version produces deterministic equivalent output
  where contract requires;
- schema validation catches invalid/missing policy/config values;
- configuration bundle is tenant-scoped/versioned;
- diff shows material changes before publish;
- publish is idempotent;
- partial apply cannot silently leave a falsely complete version;
- approval required for high-risk generated changes where policy requires;
- version history/audit/outbox correct;
- rollback/forward-correction semantics verified;
- compiler cannot generate arbitrary executable code;
- compiler cannot bypass domain/security/connector boundaries.

## Configuration simulation gate

- synthetic scenarios do not mutate canonical production state;
- simulation never invokes real provider network side effects;
- policy/condition decisions match published runtime logic for covered cases;
- proposed domain/tool/provider actions are visible;
- approval requirements visible;
- expected state transitions/warnings visible;
- estimated cost marked estimated and bounded to available inputs;
- simulation trace is tenant isolated;
- malicious/invalid synthetic input cannot escape the simulation sandbox/boundary.

## AI tool / Gateway gate

- unauthorized tool cannot run;
- cross-tenant/resource tool request denied;
- critical/high-risk tool follows approval policy;
- changed action payload invalidates prior approval;
- malformed tool args rejected before domain execution;
- tool execution uses canonical domain command, not a parallel mutation path;
- no unrestricted HTTP/SQL/shell/code tool;
- model/provider outage never fabricates successful business state;
- fallback/escalation behavior verified;
- model/routing decision usage/cost telemetry recorded;
- sensitive tool result is sanitized/minimized.

## Knowledge / RAG gate

- ingestion is tenant/access scoped;
- document version/source metadata retained;
- chunk retrieval cannot cross tenant/access boundary;
- stale/deleted/inaccessible sources handled according to policy;
- citations map to accessible source/version evidence;
- malformed documents and prompt-injection content cannot grant tools/permissions;
- retrieval quality/eval fixtures meet threshold;
- no raw secret/provider credential is indexed.

## AI Evaluation / Operator gate

- eval cases bind prompt/model/tool/knowledge/operator versions;
- English/Arabic and required dialect suites;
- intent/classification accuracy;
- escalation/handover;
- tool selection;
- policy compliance;
- hallucination;
- order/refund safety;
- prompt injection;
- PII/sensitive-data handling;
- wrong tenant/resource attempts;
- campaign constraints;
- retrieval/citation quality;
- latency/cost regression;
- fallback/human escalation;
- required thresholds green before the affected autonomous rollout;
- AUTONOMOUS mode still respects permission/risk/approval.

## Custom Data gate

- typed field validation;
- row/field/operation permissions;
- relationship integrity;
- RLS/direct-ID/list/search/export isolation;
- imports/exports bounded and safe;
- automation/AI actions cannot bypass custom-data permissions;
- schema evolution/version handling defined;
- no arbitrary SQL or unmanaged per-tenant schema creation.

## Frontend gate

- typecheck;
- lint;
- component tests where appropriate;
- critical browser E2E;
- English LTR;
- Arabic RTL;
- desktop/laptop/tablet/mobile;
- keyboard operation;
- practical WCAG 2.2 AA scan/manual critical checks;
- shared design-system usage;
- loading/empty/forbidden/recoverable/fatal/pending states;
- no unexpected console errors in critical flows;
- high-risk/provider/approval/AI execution state not misrepresented;
- no release-critical generic placeholder page.

## Developer Platform gate

- API key plaintext shown once only;
- secure hash at rest;
- scope enforcement;
- expiry/revoke/rotate;
- rate limits;
- tenant isolation;
- outbound webhook signing;
- canonical event source/version;
- retries/dead letters;
- delivery logs/audit;
- replay/manual retry cannot bypass original tenant/subscription scope.

## Admin / Governance gate

- admin identity/permission explicit;
- no unrestricted silent cross-tenant DB mutation;
- privileged reads/actions scoped and audited;
- remediation uses typed commands where possible;
- dead-letter/retry actions idempotent/audited;
- retention policies tested;
- deletion/anonymization does not corrupt required legal/audit evidence;
- tenant export isolated;
- media/raw webhook/AI trace cleanup scoped;
- secret rotation does not expose secret material;
- tenant suspension/deletion lifecycle safe.

## Performance gate

Measure at least:

- inbox list/search;
- Customer 360;
- order list/detail;
- shipping list/detail;
- return/recovery operational lists;
- sales pipeline views;
- campaign recipient/batch execution;
- webhook ingestion;
- outbox publisher;
- event consumer/projection lag;
- permission/OPA resolution;
- Temporal workflow/activity throughput for representative workflows;
- automation execution overhead;
- AI orchestration overhead;
- RAG retrieval;
- analytics dashboards;
- usage/billing aggregation.

Record hardware/environment, data volume, concurrency assumptions and realistic
thresholds. Optimize based on measurements, not architectural guesswork.

## Observability gate

- JSON structured logs;
- correlation IDs across API/outbox/NATS/Temporal/provider/AI where possible;
- OpenTelemetry-compatible trace hooks;
- API/worker/provider/workflow latency/error metrics;
- webhook/outbox/queue/DLQ lag/health;
- connector health/sync status;
- Temporal workflow failure/retry visibility;
- AI latency/model/provider/usage/cost visibility;
- usage/analytics projection lag;
- alerts/operational thresholds documented for release-critical failures;
- no secrets/raw credentials in logs/traces/metrics.

## Release candidate eligibility

All of these are mandatory:

- every release-critical module workstream gate passes;
- migrations pass from blank DB and previous-release fixture where available;
- all release-critical tests pass;
- no disabled release-critical tests;
- no release-critical TODO/mock/fake-success/fixture-as-production path;
- no unresolved critical dependency/security finding;
- all launch provider adapters are real and appropriately documented;
- configuration compiler/simulation release paths are safe;
- required AI eval thresholds pass for enabled modes;
- reproducible immutable images;
- health/readiness endpoints work;
- production Compose validates;
- expected public/internal port boundaries validated;
- backup validated;
- restore validated;
- rollback validated;
- production smoke script exists;
- deployment verification script exists;
- operational runbook exists;
- release notes exist;
- threat model current;
- API/event/connector/workflow docs current;
- implementation status and execution queue current.

## Post-deploy smoke

Verify without modifying customer business data:

- web health;
- admin health;
- API health;
- AI Gateway health;
- Keycloak discovery;
- OPA health;
- PostgreSQL;
- NATS;
- Temporal;
- worker pollers;
- outbox publisher;
- connector worker readiness;
- expected public ports only;
- n8n still healthy;
- memory/swap/load within guardrail;
- no migration/worker storm or runaway retry;
- critical logs/metrics available.

Rollback/stop if a critical gate fails.
