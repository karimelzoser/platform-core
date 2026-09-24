# Testing and Release Acceptance

## Test levels

### Unit

Domain logic, parsers, normalization, policy input building, deterministic workflow logic.

### Integration

PostgreSQL/RLS, Keycloak/JWT, OPA, NATS, Temporal, connector adapters/emulators.

### Contract

Provider payload normalization and outbound request generation from recorded/synthetic fixtures.

### E2E

Critical user journeys through web/API.

### Security

Tenant escape, role escalation, approval bypass, webhook replay/forgery, API-key misuse, SSRF guardrails, injection classes.

## Mandatory two-tenant test

Every tenant-owned module must prove with Tenant A and Tenant B:

- read isolation
- write isolation
- list/search isolation
- direct-ID isolation
- relationship isolation
- export isolation
- event tenant preservation
- AI tool tenant preservation
- background-job tenant preservation

## Database gate

CI:

1. clean PostgreSQL 16 + pgvector
2. apply `0001` -> latest
3. validate migration checksums
4. run schema tests
5. run RLS tests
6. run constraint/index tests
7. test upgrade from previous-release fixture when available

## Auth gate

- valid token accepted
- wrong issuer/audience rejected
- expired/not-before rejected
- inactive membership rejected
- wrong tenant rejected
- missing permission rejected
- system-role mutation blocked

## OPA gate

- default deny
- low/medium policy behavior
- high/critical approval behavior
- cross-tenant deny
- AI/service actor constraints
- OPA outage fails closed for protected writes

## Webhook gate

- valid signature accepted
- invalid rejected
- duplicate idempotent
- replay rejected where possible
- oversized payload rejected
- normalization validated
- handler acknowledges promptly

## Event gate

- rolled-back transaction emits no event
- committed outbox emits
- duplicate publish/consume idempotent
- correlation/causation retained
- dead-letter path works

## Temporal gate

For release-critical workflows:

- happy path
- activity retry
- timeout
- provider failure
- duplicate start
- human approval
- signal/update
- worker restart
- deterministic replay
- server restart where practical

## AI gate

- unauthorized tool cannot run
- critical tool requires approval
- changed action payload invalidates prior approval
- malformed tool args rejected
- prompt-injection fixtures
- sensitive-data fixtures
- eval thresholds
- fallback/human escalation

## Frontend gate

- typecheck
- lint
- component tests
- critical E2E
- RTL
- LTR
- responsive
- accessibility scan
- no console errors in critical flows

## Performance gate

Measure at least:

- inbox list
- customer 360
- order list/detail
- webhook ingestion
- outbox publisher
- event consumer
- permission resolution
- AI orchestration overhead

Record hardware/environment and realistic thresholds.

## Release candidate eligibility

All of these are mandatory:

- migrations pass
- all tests pass
- no disabled release-critical tests
- no release-critical TODO/mock/fake-success path
- no unresolved critical dependency/security finding
- reproducible images
- health endpoints work
- production compose validates
- backup validated
- rollback validated
- production smoke script exists
- runbook exists
- release notes exist
- threat model current
- docs current

## Post-deploy smoke

Verify without modifying customer data:

- web health
- API health
- Keycloak discovery
- OPA health
- DB
- NATS
- Temporal
- worker pollers
- outbox publisher
- expected public ports only
- n8n still healthy
- memory/swap/load within guardrail

Rollback/stop if a critical gate fails.
