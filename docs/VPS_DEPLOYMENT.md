# VPS deployment package

This directory is the self-contained, repository-owned PRENEURA deployment path for a Linux VPS. It is deliberately separate from the Railway development preview and from any pre-existing n8n installation.

## What it runs

The Compose topology builds application images directly from the checked-out Git revision and runs:

- Web (Next.js)
- API (NestJS)
- Worker / durable Recovery Temporal worker
- AI Gateway
- PostgreSQL 16 + pgvector
- Keycloak 26.8
- Temporal 1.29
- NATS JetStream
- Valkey
- OPA
- Caddy TLS edge
- one-shot platform migration service

Only Caddy publishes host ports (`80` and `443`). Database, NATS, Valkey, OPA, Temporal, API, worker and Keycloak containers remain on the private Compose network. API and Keycloak are exposed to users only through their dedicated TLS hostnames.

## DNS

Before installation, create public DNS records pointing to the VPS for three names, for example:

- `app.example.com` — Web
- `api.example.com` — API
- `auth.example.com` — Keycloak

Caddy obtains and renews certificates automatically. Ports 80/tcp, 443/tcp and 443/udp must reach the VPS.

## Host prerequisites

Use a supported Linux host with:

- Docker Engine
- Docker Compose v2 (`docker compose`)
- Git
- OpenSSL
- `envsubst` (usually package `gettext-base`)
- curl

Do not co-locate this Compose project's Postgres/NATS/Keycloak/Temporal ports with public listeners. If the VPS already has Traefik or another reverse proxy, either keep Caddy on separate ports during validation or adapt the edge only after the isolated stack passes smoke checks.

## First installation

```bash
git clone https://github.com/karimelzoser/platform-core.git
cd platform-core
cp docker/vps/.env.example docker/vps/.env
nano docker/vps/.env
# Set PLATFORM_DOMAIN, API_DOMAIN, AUTH_DOMAIN and ACME_EMAIL.
# Leave CHANGE_ME secrets in place; install.sh replaces them with 256-bit random hex values.
./scripts/vps/install.sh
```

`install.sh`:

1. generates missing secrets into `docker/vps/.env` with mode 0600;
2. renders the production Keycloak realm without preview users;
3. validates Compose;
4. builds repository-local app images;
5. starts private stateful infrastructure;
6. creates Temporal schemas;
7. imports the Keycloak realm;
8. applies SQL migrations under the dedicated `platform_migrator` role with a session advisory lock;
9. starts API/worker/AI/Web/Caddy;
10. runs public and private smoke checks.

The production realm uses Authorization Code + PKCE, disables direct password grants, maps the `platform-web` audience, and emits OIDC `amr` in access/ID tokens. No application user is committed to Git.

## Secrets

Never commit `docker/vps/.env` or `docker/vps/rendered/`. All generated passwords are local to the VPS. Rotate credentials through a controlled maintenance procedure; changing database passwords requires updating the database role and the local `.env` atomically.

For a mature production deployment, move secrets to the final approved secrets backend when the Production Connector / Admin / Governance workstreams close. This package intentionally does not pretend that provider credentials exist yet.

## Backup

```bash
./scripts/vps/backup.sh
```

A backup contains custom-format dumps of `platform`, `keycloak`, `temporal`, and `temporal_visibility`, PostgreSQL globals, the local media volume, a timestamp, and the Git SHA. Old backup directories are pruned using `BACKUP_RETENTION_DAYS`.

Copy backups off the VPS. A local disk copy is not disaster recovery.

## Restore

Restore is intentionally explicit and destructive:

```bash
./scripts/vps/restore.sh ./backups/20261013T010000Z --yes-i-understand-this-replaces-data
```

The script stops application/orchestration services, recreates databases, restores media, starts the stack, and runs smoke checks. Always rehearse restore on a separate VPS before treating it as release evidence.

## Upgrade

```bash
./scripts/vps/upgrade.sh origin/main
# Prefer an immutable release tag or SHA for production, e.g.
./scripts/vps/upgrade.sh v1.0.0
```

Upgrade creates a backup first, checks out the requested Git ref, builds new local images, applies migrations, starts services, and runs smoke checks. A failed post-migration smoke check is not automatically rolled back because schema rollback is migration-specific; use the captured backup and the documented release rollback procedure.

## Operations

```bash
# Status
docker compose --env-file docker/vps/.env -f docker/vps/compose.yml ps

# Follow application logs
docker compose --env-file docker/vps/.env -f docker/vps/compose.yml logs -f web api worker

# Re-run smoke checks
./scripts/vps/smoke.sh
```

## Important release boundary

This makes the backend/runtime **installable from GitHub on a clean VPS**. It does not by itself make the full platform production-ready. Real provider adapters, complete production authentication/session UX, all remaining business modules, full Temporal/Automation/Configuration/AI/commercial/governance closure, adversarial security, SLO/load evidence and final release acceptance remain governed by `docs/CODEX_EXECUTION_QUEUE.md`.
