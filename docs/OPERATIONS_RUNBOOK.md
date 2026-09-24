# Operations Runbook

## Release procedure

1. Confirm n8n health, disk, memory/swap/load, and private infrastructure health.
2. Back up database/configuration using approved production procedures.
3. Verify immutable migration checksums and pull images by digest.
4. Validate `docker/compose.production.yml`; run migrations as `platform_migrator` only.
5. Recreate application services only. Do not modify n8n or infrastructure containers.
6. Wait for health, run `scripts/smoke.sh`, then recheck n8n and public ports.
7. Record image digests, migration state, health result, and rollback decision.

## Rollback

Roll back application images by immutable digest when migrations are backward compatible. Do not reverse a production migration without an approved, tested rollback plan; use a forward fix when data has been transformed.
