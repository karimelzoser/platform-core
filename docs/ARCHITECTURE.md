# System Architecture

## Style

Use a modular monolith for the business API, a separate worker process, and a separate AI Gateway.

Do not create one microservice per domain.

## Deployables

### web

Customer-facing platform UI.

### admin

Internal/super-admin operational UI.

### api

NestJS modular monolith for synchronous domain APIs and commands.

### worker

Runs:

- transactional outbox publisher
- NATS consumers
- Temporal workers
- webhook processors
- provider sync/backfill/reconciliation
- scheduled maintenance
- analytics aggregation

### ai-gateway

FastAPI service for:

- provider/model routing
- tool-call protocol
- RAG orchestration
- AI telemetry
- eval hooks
- local/external model adapters

## Infrastructure

```text
Browser
  |
Traefik / HTTPS
  |
  +------------------+
  |                  |
Web/Admin            API
                       |
       +---------------+---------------+
       |               |               |
   PostgreSQL        Keycloak          OPA
       |
 transactional
   outbox
       |
     Worker
       |
      NATS <----> Temporal
       |
 connectors / providers

API/Worker <----> AI Gateway
```

## Authorization path

```text
JWT
 -> Keycloak signature/issuer/audience validation
 -> identity.users projection
 -> tenant membership
 -> transaction-local request context
 -> RBAC effective permissions
 -> OPA decision
 -> domain command
 -> PostgreSQL RLS
 -> audit
 -> outbox
 -> commit
```

RLS remains mandatory even after API authorization succeeds.

## External action path

```text
Domain command
 -> authorization
 -> OPA
 -> approval if required
 -> idempotent command
 -> connector
 -> provider API
 -> normalized response
 -> domain update
 -> audit/outbox
```

AI cannot skip this path.

## Webhook path

```text
Provider
 -> webhook endpoint
 -> signature verification
 -> account/tenant resolution
 -> raw delivery persistence
 -> dedupe/replay check
 -> immediate provider response
 -> async processing
 -> normalization
 -> domain command/event
```

No large sync operation belongs inside the webhook request.

## Data ownership

- PostgreSQL: source of truth
- Valkey: ephemeral
- NATS: event delivery
- Temporal: durable workflows
- Keycloak: authentication
- application DB: tenant/RBAC/resource state
- OPA: policy decision
- media abstraction: binary objects
