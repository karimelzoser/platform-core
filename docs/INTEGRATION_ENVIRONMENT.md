# Disposable Integration Environment

`docker/integration/compose.yml` is an isolated, throwaway test stack. It has no published host ports, uses only test credentials, and must never be pointed at the production VPS.

It provides PostgreSQL 16 with pgvector/pgcrypto, Valkey, NATS JetStream, Temporal 1.29.7, Keycloak 26.8.0, and OPA 1.20.2. PostgreSQL initializes restricted `platform_app` and `platform_migrator` roles plus the schemas required before immutable migration `0001`.

Temporal persistence schema initialization is isolated in the one-shot `temporal-schema` service. The long-running Temporal server starts with `SKIP_SCHEMA_SETUP=true`, so a server restart exercises persisted workflow history without rerunning destructive/bootstrap schema setup. Custom search-attribute bootstrap is disabled in this disposable stack because the integration contracts do not depend on those development defaults.

```sh
scripts/integration/up.sh
scripts/integration/migrate.sh
scripts/integration/down.sh
```

CI runs this stack from a clean runner. The local machine currently lacks Docker, so local execution has not been claimed.
