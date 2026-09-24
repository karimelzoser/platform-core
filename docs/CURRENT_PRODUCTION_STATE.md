# Current Production State

The repository must remain compatible with this already-deployed baseline.

## VPS

- Ubuntu 24.04 LTS
- 2 vCPU
- ~8 GiB RAM
- 4 GiB swap
- Docker
- existing critical n8n stack on the same host

Do not make CPU-heavy production build steps part of routine deployment.

## Existing n8n

Existing n8n is production-critical and out of scope for modification.

- public 80/443 via existing Traefik
- n8n app bound to `127.0.0.1:5678`
- do not modify its compose project, DB, Redis, volumes, or Traefik unless explicitly approved

## Platform Docker network

`platform_internal`

Infrastructure services have no host-published ports.

## PostgreSQL

Container: `platform-postgres`

- PostgreSQL 16
- pgvector 0.8.6
- pgcrypto installed
- application DB `platform`
- DB/bootstrap admin `platform_admin`
- runtime role `platform_app`
- migrator role `platform_migrator`

`platform_app`:

- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOBYPASSRLS
- connection limit 10

`platform_migrator`:

- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOBYPASSRLS
- connection limit 2

## Valkey

Container: `platform-valkey`

Use only for cache, ephemeral locks, and short-lived coordination.

No persistence; `noeviction`.

Never use as source of truth.

## NATS

Container: `platform-nats`

- JetStream enabled
- private only

## Temporal

Container: `platform-temporal`

- version 1.32.0
- PostgreSQL persistence + visibility
- 128 history shards
- namespace `platform`
- private endpoint `platform-temporal:7233`

Durability was tested across a real server restart.

## Keycloak

Container: `platform-keycloak`

- version 26.7.4
- PostgreSQL persistence
- application realm `platform`
- `master` realm for administration only
- permanent break-glass admin outside Git
- bootstrap admin removed
- private application endpoint `http://platform-keycloak:8080`
- management health on private port 9000
- final HTTPS hostname intentionally not selected yet

## OPA

Container: `platform-opa`

- version 1.20.2
- private endpoint `http://platform-opa:8181`
- default deny
- tenant check
- permission check
- LOW/MEDIUM may allow
- HIGH/CRITICAL require approval

## Applied migrations

### 0001

Foundation:

- domain schemas
- migration tracking
- transaction-local tenant/request context
- users/orgs/memberships
- permissions/roles
- RLS
- idempotency
- transactional outbox
- dead letters
- immutable runtime audit
- org chooser helper

Recorded checksum on production:
`55fb7d13ca07bf7e6bbe6e8b6012dbd7748adf24720367eaac785cb9438ebed0`

### 0002

Authorization:

- 106 permissions
- risk classes
- owner/admin/manager/agent/viewer templates
- system-role protection
- default-role bootstrap
- effective permission projection
- DB -> OPA contract tested

### 0003

CRM / Customer 360:

- customers
- contact points
- canonical identity keys
- external identities
- addresses
- communication preferences
- tags
- segments
- merge history
- identity resolution
- tenant RLS

## Immutable migration rule

Copy these exact files from production:

- `/opt/platform/migrations/0001_foundation.sql`
- `/opt/platform/migrations/0002_authorization.sql`
- `/opt/platform/migrations/0003_crm_customer360.sql`

Never recreate them from documentation.

## Resource posture

After the foundation, the host retained roughly 5.5+ GiB available memory and no swap usage.

CPU is expected to become the first constraint.

Build release images in CI or a development environment, not on production.
