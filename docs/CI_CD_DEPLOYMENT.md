# CI/CD and Production Deployment

## GitHub-first

GitHub is source of truth for application code and release specifications.

Target state: protect `main`, prohibit force pushes, and require the release-critical
checks appropriate to the current development stage. Until branch protection is
configured, implementation discipline must still preserve reviewable history and
green validation.

During pre-release implementation, Codex may make small reviewable local commits
in an implementation branch/worktree and batch them before pushing. A local
commit is not a reason to push or stop. Push a substantial coherent workstream
batch, inspect the resulting CI run, and repair a red run before promoting the
workstream.

Do not defer remote Docker/PostgreSQL/RLS/Temporal/browser evidence until the
entire product is complete.

## Pull request / workstream CI

Run the applicable subset of:

- frozen lockfile install;
- formatting check;
- lint;
- typecheck;
- unit tests;
- application builds;
- migration checksum/blank-DB test;
- integration environment;
- PostgreSQL RLS/relationship tests;
- auth/RBAC/OPA/approval tests;
- outbox/NATS tests;
- connector fixtures/contract tests;
- production-adapter unit/contract tests without live secrets;
- Temporal workflow/replay/restart tests;
- usage/metering/analytics projection tests;
- configuration compiler/simulation tests once present;
- Automation Studio execution tests once present;
- AI Gateway/tool/RAG/evaluation tests once present;
- API tests;
- protected frontend browser tests including LTR/RTL/responsive/accessibility as
  applicable;
- API/worker/web/admin/AI image builds at major checkpoints;
- dependency/vulnerability scan;
- secret scan.

Tests must never use the production VPS or production customer/provider data.

## Production provider verification

Ordinary CI uses recorded/synthetic provider fixtures and local deterministic
emulators where live credentials are unavailable.

This does not waive the requirement to implement real production adapters.

Before a provider is claimed for launch, verify its real adapter according to
`CONNECTORS.md` and `TESTING_AND_ACCEPTANCE.md`. Live credential/certification
checks, if required, use an explicitly authorized secure pre-production/release
process and never place secrets in Git or general CI logs.

## Release CI

At release-candidate time:

- execute all mandatory gates in `TESTING_AND_ACCEPTANCE.md`;
- verify required AI eval thresholds for enabled modes;
- verify no launch-critical development fixture/fake-success path;
- verify configuration compiler/simulation safety gates;
- verify usage/billing reconciliation;
- verify production provider adapter readiness/certification status;
- build immutable images;
- tag by commit SHA;
- optionally attach semantic version;
- generate SBOM;
- publish image digests;
- create release manifest;
- capture test/security/performance evidence and release notes.

## Images

At minimum:

- `platform-web`;
- `platform-admin`;
- `platform-api`;
- `platform-worker`;
- `platform-ai-gateway`.

Do not deploy only a mutable `latest` tag.

Images must be reproducible enough that the release manifest can identify the
exact commit/image digests deployed.

## Production build constraint

Do not compile/build the monorepo on the production VPS. The current production
host is constrained and shares responsibility with critical existing n8n.

Build images in CI/dev/release infrastructure, then pull immutable release images
on the VPS.

## Production deployment

Normal application deployment must not recreate production PostgreSQL, Valkey,
NATS, Temporal, Keycloak or OPA.

Application services consume the existing external Docker network
`platform_internal`.

Deployment sequence:

1. validate release manifest/digests and deployment authorization;
2. validate disk, memory and backup capacity;
3. back up DB/config required for recovery;
4. validate restore prerequisites;
5. pull exact release images;
6. validate production Compose overlay/environment contract;
7. verify historical migration checksums;
8. run migration job as `platform_migrator`;
9. verify migration result before app promotion;
10. recreate application services only;
11. wait for health/readiness;
12. verify worker/Temporal/NATS/outbox readiness;
13. run non-destructive post-deploy smoke;
14. verify public/internal port boundaries;
15. verify existing n8n health and no route conflict;
16. verify memory/swap/load/retry guardrails;
17. verify logs/metrics/critical alerts;
18. record release manifest and outcome.

Rollback/stop immediately when a release-critical gate fails.

## Production services and networks

Do not expose PostgreSQL, Valkey, NATS, Temporal, OPA or internal Keycloak
management endpoints publicly.

Public platform services join the existing Traefik network only when final
hostnames/routes are selected and explicitly configured.

The existing n8n deployment, database, Redis/Valkey dependencies, volumes and
Traefik routes are not modified by normal platform deployment unless a separate
explicit change is authorized.

## Secrets

Production secrets remain outside Git.

`.env.example` contains names/descriptions only.

Provider secrets are resolved through the production secret-reference backend;
ordinary domain/configuration records contain opaque references only.

CI logs, release manifests, SBOMs and deployment output must not expose secrets.

## Database upgrade and rollback

Distinguish:

- image rollback;
- reversible database migration where truly safe;
- forward-fix database migration;
- application/configuration rollback;
- provider-side operations that cannot be undone automatically.

Prefer backward-compatible expand/migrate/contract patterns.

Release acceptance includes:

- blank DB -> latest;
- previous-release fixture -> latest;
- backup -> restore validation;
- image rollback compatibility where applicable;
- documented forward-fix path for irreversible migrations/provider actions.

Do not rewrite already-applied SQL history.

## Configuration release state

Tenant Configuration Compiler versions are application data, not deployment
artifacts. Application rollback must not silently roll tenant configuration to an
older version.

Configuration publish/rollback uses its own versioned/audited domain semantics.
Application releases must preserve compatibility with supported published
configuration versions or include an explicit migration strategy.

## Domain / Traefik / Keycloak

Do not finalize Keycloak OIDC production redirects/hostname until final product
domain(s) exist.

When configured:

- HTTPS only;
- explicit hostnames;
- specific redirect URIs;
- trusted proxy headers;
- secure cookies;
- no broad production wildcards.

## Post-deploy smoke

Follow `TESTING_AND_ACCEPTANCE.md` and verify, without modifying customer business
data:

- web/admin/API/AI Gateway health;
- Keycloak discovery;
- OPA;
- DB;
- NATS;
- Temporal;
- worker pollers;
- outbox publisher;
- connector worker readiness;
- expected public ports only;
- n8n health;
- host resource guardrails;
- no migration/worker retry storm;
- critical observability available.
