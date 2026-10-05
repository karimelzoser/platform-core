#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'
if [ ! -x node_modules/.bin/tsc ]; then
  corepack pnpm install --frozen-lockfile
fi
corepack pnpm --filter @platform/api... --filter @platform/worker... build
$compose up --detach --wait
scripts/integration/migrate.sh
scripts/preview/seed.sh
sh scripts/preview/seed-integration-fixtures.sh
sh scripts/preview/seed-shipping-fixtures.sh
mkdir -p .preview
mkdir -p .preview/media
API_PORT=4000 ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true MEDIA_LOCAL_ROOT="$(pwd)/.preview/media" DATABASE_URL=postgres://platform_app:platform-test-app-password@localhost:5432/platform OPA_URL=http://localhost:8181 KEYCLOAK_ISSUER=http://localhost:8080/realms/platform KEYCLOAK_JWKS_URL=http://localhost:8080/realms/platform/protocol/openid-connect/certs KEYCLOAK_CLIENT_ID=platform-web nohup corepack pnpm --filter @platform/api start > .preview/api.log 2>&1 &
ENABLE_DEVELOPMENT_CONNECTOR_FIXTURES=true DATABASE_URL=postgres://platform_app:platform-test-app-password@localhost:5432/platform NATS_URL=nats://localhost:4222 nohup corepack pnpm --filter @platform/worker start > .preview/worker.log 2>&1 &
nohup python -m uvicorn apps.ai-gateway.app.main:app --host 0.0.0.0 --port 8000 > .preview/ai-gateway.log 2>&1 &
APP_ENV=development API_INTERNAL_URL=http://localhost:4000 KEYCLOAK_ISSUER=http://localhost:8080/realms/platform KEYCLOAK_CLIENT_ID=platform-web PREVIEW_TENANT_ID=cccccccc-cccc-cccc-cccc-cccccccccccc nohup corepack pnpm --filter @platform/web exec next dev --port 3000 > .preview/web.log 2>&1 &
nohup corepack pnpm --filter @platform/admin exec next dev --port 3001 > .preview/admin.log 2>&1 &
echo 'Preview started. Run corepack pnpm preview:health.'
