# Self-Service Onboarding Contract

This document defines the repository contract for PRENEURA self-service onboarding. Onboarding is
a guided setup layer over canonical Organization, Team, and Integration state. It must never
become a second identity, member, connector, credential, workflow, or provider-state database.

## Goals

Onboarding must let an authorized organization user:

1. create or select an organization;
2. capture reusable business context;
3. establish or defer the initial Team step;
4. establish or defer the first Integration step;
5. resume setup safely after interruption;
6. see whether the workspace is ready for normal product navigation.

Onboarding does not generate arbitrary automation graphs, invoke providers directly, create AI
autonomy, or compile final tenant configuration. Those capabilities belong to their dedicated
later workstreams.

## Canonical data ownership

### Identity / Organization owns

- organization ID, name, and slug;
- locale and timezone;
- users, memberships, invitations, roles, and membership lifecycle;
- tenant MFA policy and authentication-assurance evidence.

### Integrations owns

- connection records;
- secret references;
- provider asset/sync/webhook state;
- connection status and health;
- provider credentials and lifecycle.

### Onboarding owns

`identity.organization_business_profiles` stores reusable setup context:

- country code;
- currency code;
- industry code;
- customer model (`B2C`, `B2B`, `HYBRID`);
- commerce model;
- monthly order-volume band;
- monthly conversation-volume band;
- selected business goals.

`identity.organization_onboarding_progress` stores only explicit user disposition for optional
steps:

- Team: `PENDING` or `SKIPPED`;
- Integration: `PENDING` or `SKIPPED`.

Canonical member/invitation/connection state is always derived at read time and has precedence
over the stored disposition.

## State model

### Business profile

- `PENDING`: no canonical business profile exists.
- `COMPLETE`: a canonical business profile exists.

### Team

- `COMPLETE`: more than one active organization membership exists.
- `INVITED`: no second active member exists, but at least one non-expired pending invitation
  exists.
- `SKIPPED`: the user explicitly deferred Team setup and no stronger canonical Team evidence
  exists.
- `PENDING`: no second active member, valid pending invitation, or explicit defer disposition
  exists.

A pending invitation is not Team completion.

### First Integration

Canonical `integrations.connections.status` is interpreted as:

- `CONNECTED` -> onboarding `CONNECTED`;
- `DEGRADED` -> onboarding `DEGRADED` when no connected connection exists;
- `PENDING`, `DISCONNECTED`, or `FAILED` -> onboarding `ACTION_REQUIRED` when no connected or
  degraded connection exists;
- `REVOKED` -> ignored for onboarding readiness.

When no stronger canonical connection evidence exists:

- explicit defer -> `SKIPPED`;
- otherwise -> `PENDING`.

### Workspace readiness

The workspace is `READY` when:

- Business Profile = `COMPLETE`;
- Team = `COMPLETE` or `SKIPPED`;
- Integration = `CONNECTED`, `DEGRADED`, or `SKIPPED`.

`DEGRADED` is readiness-sufficient because it represents an established connection with current
operational health degradation. The degradation must remain visible; later Admin/Observability
work must make it actionable.

Current setup step resolution:

1. incomplete Business Profile -> `BUSINESS_PROFILE`;
2. Team not ready -> `TEAM`;
3. Integration not ready -> `INTEGRATION`;
4. otherwise -> `READY`.

## HTTP API

All tenant-scoped routes require valid authentication and `X-Tenant-Id`. Tenant membership and
MFA policy are resolved through `AuthenticatedContextService`.

### `GET /v1/onboarding`

Permission: `organization.read`

Returns canonical organization identity plus business profile and derived setup progress.

Representative response shape:

```json
{
  "organization": {
    "id": "uuid",
    "name": "Acme",
    "slug": "acme",
    "timezone": "Africa/Cairo",
    "locale": "en"
  },
  "profile": {
    "countryCode": "EG",
    "currencyCode": "EGP",
    "timezone": "Africa/Cairo",
    "locale": "en",
    "industryCode": "ECOMMERCE",
    "customerModel": "B2C",
    "commerceModel": "ECOMMERCE",
    "monthlyOrderVolumeBand": "1001_5000",
    "monthlyConversationVolumeBand": "5001_20000",
    "goals": ["SUPPORT_AUTOMATION", "ANALYTICS"],
    "completedAt": "ISO-8601",
    "updatedAt": "ISO-8601"
  },
  "progress": {
    "currentStep": "READY",
    "ready": true,
    "businessProfile": "COMPLETE",
    "team": "COMPLETE",
    "integration": "CONNECTED",
    "activeMemberCount": 2,
    "pendingInvitationCount": 0,
    "connectionCount": 1,
    "connectedConnectionCount": 1,
    "degradedConnectionCount": 0,
    "actionRequiredConnectionCount": 0
  }
}
```

### `POST /v1/onboarding/profile`

Permission: `organization.update`

Required header: `Idempotency-Key`

Risk: `MEDIUM`

Input:

```json
{
  "countryCode": "EG",
  "currencyCode": "EGP",
  "timezone": "Africa/Cairo",
  "locale": "en",
  "industryCode": "ECOMMERCE",
  "customerModel": "B2C",
  "commerceModel": "ECOMMERCE",
  "monthlyOrderVolumeBand": "1001_5000",
  "monthlyConversationVolumeBand": "5001_20000",
  "goals": ["SUPPORT_AUTOMATION", "ORDER_OPERATIONS", "ANALYTICS"]
}
```

The command atomically validates the timezone, updates canonical organization locale/timezone,
and upserts the business profile. Invalid timezone/input must not leave partial organization or
profile state.

Idempotency behavior:

- same key + same canonical input -> replay prior result;
- same key + changed canonical input -> idempotency conflict;
- a new key may intentionally revise the profile.

### `POST /v1/onboarding/steps/:step`

Permission: `organization.update`

Required header: `Idempotency-Key`

Risk: `LOW`

`:step` must be `team` or `integration`.

Input:

```json
{
  "status": "SKIPPED"
}
```

Allowed stored dispositions are `PENDING` and `SKIPPED`. `PENDING` reopens a previously deferred
step. Derived `INVITED`, `COMPLETE`, `CONNECTED`, `DEGRADED`, and `ACTION_REQUIRED` statuses are
never written into onboarding progress because they belong to canonical Team/Integration state.

## Canonical commands and events

### Business profile update

Action: `onboarding.business_profile.update`

Permission: `organization.update`

Event: `onboarding.business_profile.updated`

Audit evidence includes the resulting business profile fields. The outbox event includes bounded
profile metadata such as country/currency/industry/model and goal count; it must not contain
provider credentials or authentication secrets.

### Step disposition update

Action: `onboarding.step.disposition.update`

Permission: `organization.update`

Event: `onboarding.step.disposition.updated`

The event records only tenant, step, and disposition.

## Security requirements

- Never accept a tenant ID inside the mutation body as authority.
- Tenant authority comes from authenticated context and `X-Tenant-Id` membership resolution.
- Both onboarding tables use PostgreSQL RLS with `platform.current_tenant_id()`.
- Tenant B must not read, update, insert, infer, or reference Tenant A onboarding rows.
- Onboarding must not expose integration secrets, provider tokens, passwords, MFA credentials,
  recovery credentials, or unrestricted configuration internals.
- Existing tenant MFA requirements remain enforced by authenticated context.
- Mutation commands require idempotency and participate in canonical audit/outbox semantics.

## Failure semantics

- malformed/non-object JSON -> `400`;
- invalid profile enum/format -> `400`;
- unknown timezone -> `400` with no partial mutation;
- invalid/missing authentication or tenant membership -> `401`;
- tenant MFA requirement not satisfied -> `403`;
- missing required permission -> `403`;
- missing `Idempotency-Key` -> `400`;
- changed payload under an existing idempotency key -> conflict;
- approval/command-state conflicts -> bounded conflict response;
- unexpected infrastructure faults remain server errors and must be traceable by correlation
  context without leaking secrets.

## Browser acceptance

The protected disposable preview must prove:

- onboarding loads only for an authenticated tenant member;
- business profile can be saved and remains visible after navigation;
- progress reflects canonical Team/Integration evidence;
- workspace readiness is visible;
- keyboard focus is usable;
- desktop, tablet, and mobile layouts remain usable;
- global LTR/RTL direction switching does not break the onboarding surface;
- browser console/page errors remain empty during the protected flow.

Full product Arabic translation is deliberately not claimed by this workstream. Complete Arabic
copy, locale-specific content, comprehensive accessibility, and all product surfaces close in the
later full-product UX gate.

## What onboarding deliberately does not do

- create arbitrary workflows;
- execute provider API calls;
- store provider secrets;
- duplicate memberships or invitations;
- duplicate integration connection state;
- auto-enable AI autonomy;
- compile/publish final tenant configuration;
- bypass approvals or authorization;
- mark future Returns, Recovery, Sales, or Campaigns modules complete.

The later Configuration Compiler consumes this reusable business profile as one input to a
versioned, reviewable tenant configuration bundle.
