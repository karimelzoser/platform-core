# Disposable Integration Environment

`docker/integration/compose.yml` is an isolated, throwaway test stack. It has no published host ports, uses only test credentials, and must never be pointed at the production VPS.

It provides PostgreSQL 16 with pgvector/pgcrypto, Valkey, NATS JetStream, Temporal 1.32.0, Keycloak 26.7.4, and OPA 1.20.2. PostgreSQL initializes restricted `platform_app` and `platform_migrator` roles plus the schemas required before immutable migration `0001`.

```sh
scripts/integration/up.sh
scripts/integration/migrate.sh
scripts/integration/down.sh
```

CI runs this stack from a clean runner. The local machine currently lacks Docker, so local execution has not been claimed.
