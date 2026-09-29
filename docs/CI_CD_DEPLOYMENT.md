# CI/CD and Production Deployment

## GitHub-first

GitHub is source of truth for application code.

Protect `main`; do not allow force pushes.

During pre-release implementation, Codex may make small reviewable **local**
commits directly on `main` when repository permissions allow it, but must batch
them before pushing. A local commit is not a reason to push or stop. Push one
substantial coherent workstream batch, inspect its single CI run, and repair a
red run in a local repair batch before continuing. Push early only when remote
Docker/PostgreSQL/RLS/Temporal/browser evidence is needed to safely continue or
the accumulated local batch creates material integration risk. PR review may be
introduced before production release without changing this autonomous
implementation flow.

## PR CI

Run:

- lockfile install
- formatting check
- lint
- typecheck
- unit tests
- build
- migration test
- integration environment
- RLS/security tests
- connector contracts
- Temporal tests
- API tests
- frontend tests
- AI gateway tests
- dependency/vulnerability scan
- secret scan

## Release CI

- repeat required gates
- build immutable images
- tag by commit SHA
- optional semantic version
- generate SBOM
- publish image digests
- create release manifest

## Images

At minimum:

- platform-web
- platform-admin
- platform-api
- platform-worker
- platform-ai-gateway

Do not deploy only a mutable `latest` tag.

## Production

Do not compile monorepo on VPS.

Deployment:

1. validate disk/backup capacity
2. back up DB/config required for recovery
3. pull release images
4. validate compose
5. verify historical migration checksums
6. run migration job as `platform_migrator`
7. recreate application services only
8. wait for health
9. run smoke
10. verify n8n
11. verify public ports
12. record release manifest

## Existing infrastructure

Do not recreate production PostgreSQL, Valkey, NATS, Temporal, Keycloak, or OPA as part of a normal application release.

Application services consume external network `platform_internal`.

Public services later join the existing Traefik network only after final hostnames are selected.

## Secrets

Production secrets remain outside Git.

`.env.example` contains names/descriptions only.

## DB rollback

Distinguish:

- image rollback
- reversible DB migration
- forward-fix DB migration

Prefer backward-compatible expand/contract migration patterns.

## Domain/Traefik

Do not finalize Keycloak OIDC redirects/hostname until final product domain exists.

When configured:

- HTTPS only
- explicit hostnames
- specific redirect URIs
- trusted proxy headers
- secure cookies
- no broad production wildcards
