# Security and Authorization

## Identity

Keycloak authenticates users.

Application PostgreSQL owns:

- organizations
- memberships
- roles
- permissions
- tenant selection
- resource state/ownership

Do not create a separate Keycloak realm for every customer organization.

## JWT validation

API validates:

- signature
- issuer
- audience/client
- expiration
- not-before
- allowed algorithms

Resolve `sub` to `identity.users.keycloak_subject`.

Never trust a tenant ID from client input without verifying membership.

## Authorization chain

```text
subject
 -> active membership
 -> effective permissions
 -> required permission
 -> risk
 -> OPA
 -> optional approval
 -> domain operation
 -> RLS
```

## OPA

OPA input includes at least:

- tenant ID
- subject
- effective permissions
- action
- required permission
- risk
- resource type/id/tenant
- relevant resource attributes
- actor type/mode
- approval context

OPA result is a typed contract.

Missing/invalid OPA response is not allow.

OPA unavailable => fail closed for protected writes.

## Approvals

Create first-class approval entities.

Lifecycle:

- REQUESTED
- APPROVED
- REJECTED
- EXPIRED
- CANCELED
- EXECUTED
- FAILED

Store:

- tenant
- requesting actor
- requested action/tool
- resource
- risk
- sanitized request snapshot
- policy reason
- approver
- decision time
- expiry
- resulting execution

Bind approval to an immutable/deterministic action digest to prevent TOCTOU substitution.

The reusable `CommandAuthorizer` enforces permission, tenant match, OPA, approval status, expiry, and action-digest equality before a protected command can enter its domain mutation transaction.

The shared command executor retrieves approvals under tenant RLS and consumes an
approved action only in the same transaction as its domain mutation. It also
requires an idempotency key, rejects key reuse with a different request hash,
stores successful responses for replay, writes sanitized append-only audit data,
and records the canonical outbox event before commit.

## Secrets

Never store raw provider secrets in ordinary domain tables.

Use a secret-reference abstraction.

Development may use env-backed secrets.

Do not log secrets.

## API keys

- hash plaintext one-way
- display plaintext once
- key prefix/id
- tenant
- scopes
- expiration
- last-used
- revoke
- rate limits
- audit

## Webhook security

Each connector defines:

- signature verification
- timestamp/replay checks where supported
- tenant/account resolution
- delivery-ID dedupe
- body-size limit
- sanitized raw storage
- retry semantics

## SSRF

Connector configuration must prevent arbitrary internal/private network requests unless explicitly allowlisted.

## Files/media

Validate size, MIME, ownership, tenant access, and filenames. Use opaque object IDs.

## Rate limiting

Protect auth-sensitive, public/webhook, API-key, AI-costly, export, campaign, and destructive-admin endpoints.

## Threat model

Maintain `/docs/THREAT_MODEL.md`.
