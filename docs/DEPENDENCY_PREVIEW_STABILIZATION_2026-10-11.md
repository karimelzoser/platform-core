# Dependency and Development Preview Stabilization — 2026-10-11

## Scope

This is a bounded engineering stabilization for the isolated `preneura-platform-preview` Railway project and the repository dependency baseline. It is not production deployment authority and it does not make PRENEURA production-ready.

## Starting evidence

Repository at start:

- `main`: `01b48010b749bc780bfbd21afb464e91553b26d5` (merged Returns / Exchanges / Refunds).
- Main CI #528 (`38096257407`): green.
- Web/Admin: Next.js `15.1.0`, React/React DOM `19.0.0`.

Railway development preview at start:

- project: `preneura-platform-preview` (`74b36e83-a1d7-488c-b694-42eb73526088`);
- environment: `production` (`785e039d-9dc6-4ae7-8858-9e456a95b45a`) — this name belongs to the development-preview project and is not the production VPS;
- service: `platform-preview` (`62f64ff0-1e0e-4578-be6c-8e8ea146407f`);
- deployed source SHA: `56a5c5210be56c4d1ad72115d10dbc65fbeb1d79`;
- deployment: `6dd234a2-4502-48c2-9fad-985175f6fd7c`;
- Railway service status: SUCCESS/online;
- runtime Next listener: `0.0.0.0:8080`;
- public domain target: port `3000`;
- HTTP proxy logs: repeated 502 `connection refused`;
- healthcheck path: `/health`;
- no application persistent volume; default media path is temporary and remains a preview limitation.

The public-domain target was repaired in place from port 3000 to 8080. This change touched only the existing development-preview service routing.

## Repository remediation

The stabilization branch carries forward the dependency set that had already passed quality, integration, API image, hosted-preview image, AI Gateway and secret-scan gates on the earlier preview repair tree, rebased onto current Returns-complete main:

- Next.js `15.5.27`;
- React / React DOM `19.0.6`;
- NestJS `11.2.7`;
- Fastify `5.12.5` plus workspace override;
- Kysely `0.28.17` across canonical database consumers;
- PostCSS `8.5.29` override;
- regenerated matching pnpm lockfile.

The branch also:

- moves Next `typedRoutes` to the supported top-level config;
- ignores generated `next-env.d.ts` in ESLint while preserving the static-preview exclusion;
- keeps the hosted Keycloak readiness probe on the application endpoint `/realms/master` rather than assuming the management health endpoint is exposed on port 8080;
- prunes development dependencies from the hosted runtime image and documents container port 8080;
- adds `pnpm audit --audit-level high` to quality CI;
- scans API and hosted-preview container images with Trivy for known fixed HIGH/CRITICAL vulnerabilities;
- exposes non-secret build provenance through Web `/health`;
- adds an hourly external GitHub Actions `/health` monitor for the development preview.

## Required validation before preview deployment

The dependency/security branch must pass the complete repository CI gate on its exact head, including the new audit/image-scan steps. Any HIGH/CRITICAL fixed vulnerability reported by the new gates is a blocker, not a waiver candidate.

Only after that branch is merged and the resulting main revision remains green may the Railway preview be repointed to the tested revision.

## Required runtime validation after deployment

Record:

1. deployed repository SHA and Railway deployment ID;
2. Railway service/domain target still routes to port 8080;
3. `/health` returns `status=ok`, `service=web` and the deployed build SHA;
4. runtime logs show Web/API/Worker/OPA and dependency bootstrap ready;
5. development preview login succeeds;
6. at least one authenticated tenant-scoped read succeeds without weakening real Keycloak/RLS behavior;
7. hourly availability monitor succeeds;
8. preview remains development-only and no real provider/production/customer system is touched.

A Railway `SUCCESS` deployment status alone is not runtime acceptance.

## Remaining limitations after this stabilization

This preview is a combined convenience image, not the final production topology. Preview media remains ephemeral. Development provider fixtures remain fixtures. Production PKCE/session flows, real provider adapters, real Temporal business orchestration, full observability/DR and complete release acceptance remain separate workstreams.
