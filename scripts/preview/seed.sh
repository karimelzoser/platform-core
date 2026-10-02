#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'
$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO identity.users (id, keycloak_subject, email)
SELECT '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'preview-owner@example.test'
WHERE NOT EXISTS (
  SELECT 1 FROM identity.users WHERE keycloak_subject = '33333333-3333-3333-3333-333333333333'
);
INSERT INTO identity.users (id, keycloak_subject, email)
SELECT '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'preview-approver@example.test'
WHERE NOT EXISTS (
  SELECT 1 FROM identity.users WHERE keycloak_subject = '44444444-4444-4444-4444-444444444444'
);
INSERT INTO identity.organizations (id, name, slug, created_by_user_id)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Preview Tenant', 'preview-tenant', '33333333-3333-3333-3333-333333333333'
WHERE NOT EXISTS (
  SELECT 1 FROM identity.organizations WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
BEGIN;
SELECT platform.set_request_context(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'preview-bootstrap'
);
SELECT identity.bootstrap_default_roles('cccccccc-cccc-cccc-cccc-cccccccccccc');
INSERT INTO identity.memberships (tenant_id, user_id, status)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM identity.memberships
  WHERE tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    AND user_id = '33333333-3333-3333-3333-333333333333'
);
INSERT INTO identity.memberships (tenant_id, user_id, status)
SELECT 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM identity.memberships
  WHERE tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    AND user_id = '44444444-4444-4444-4444-444444444444'
);
INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
SELECT m.tenant_id, m.id, r.id FROM identity.memberships m JOIN identity.roles r ON r.tenant_id=m.tenant_id AND r.code='owner'
WHERE m.tenant_id='cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND m.user_id IN ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')
  AND NOT EXISTS (
    SELECT 1 FROM identity.membership_roles existing
    WHERE existing.tenant_id = m.tenant_id AND existing.membership_id = m.id AND existing.role_id = r.id
  );
INSERT INTO integrations.connector_definitions (key, version, category, display_name, manifest)
VALUES (
  'development-web-chat',
  '1.0.0',
  'MESSAGING',
  'Development Web Chat',
  '{"key":"development-web-chat","version":"1.0.0","category":"MESSAGING","capabilities":["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture"]}}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET version = EXCLUDED.version,
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    manifest = EXCLUDED.manifest,
    enabled = true,
    updated_at = now();
INSERT INTO integrations.secret_references (id, tenant_id, provider, reference, key_version, metadata)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-web-chat',
  'development://web-chat/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
)
ON CONFLICT (tenant_id, provider, reference) DO NOTHING;
INSERT INTO integrations.connections (
  id, tenant_id, connector_key, secret_reference_id, display_name, status, settings, capabilities, last_validated_at
)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-web-chat',
  '66666666-6666-6666-6666-666666666666',
  'Development Web Chat',
  'CONNECTED',
  '{"allowDevelopmentFixture":true}'::jsonb,
  '["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"]'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
SET connector_key = EXCLUDED.connector_key,
    secret_reference_id = EXCLUDED.secret_reference_id,
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    settings = EXCLUDED.settings,
    capabilities = EXCLUDED.capabilities,
    last_validated_at = EXCLUDED.last_validated_at,
    updated_at = now();
INSERT INTO integrations.connector_definitions (key, version, category, display_name, manifest)
VALUES (
  'development-api',
  '1.0.0',
  'GENERIC',
  'Development API Channel',
  '{"key":"development-api","version":"1.0.0","category":"GENERIC","capabilities":["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture"]}}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET version = EXCLUDED.version,
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    manifest = EXCLUDED.manifest,
    enabled = true,
    updated_at = now();
INSERT INTO integrations.secret_references (id, tenant_id, provider, reference, key_version, metadata)
VALUES (
  '88888888-8888-8888-8888-888888888888',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-api',
  'development://api/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
)
ON CONFLICT (tenant_id, provider, reference) DO NOTHING;
INSERT INTO integrations.connections (
  id, tenant_id, connector_key, secret_reference_id, display_name, status, settings, capabilities, last_validated_at
)
VALUES (
  '99999999-9999-9999-9999-999999999999',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-api',
  '88888888-8888-8888-8888-888888888888',
  'Development API Channel',
  'CONNECTED',
  '{"allowDevelopmentFixture":true}'::jsonb,
  '["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"]'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
SET connector_key = EXCLUDED.connector_key,
    secret_reference_id = EXCLUDED.secret_reference_id,
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    settings = EXCLUDED.settings,
    capabilities = EXCLUDED.capabilities,
    last_validated_at = EXCLUDED.last_validated_at,
    updated_at = now();
INSERT INTO integrations.connector_definitions (key, version, category, display_name, manifest)
VALUES (
  'development-whatsapp-cloud-api',
  '1.0.0',
  'MESSAGING',
  'Development WhatsApp Cloud API',
  '{"key":"development-whatsapp-cloud-api","version":"1.0.0","category":"MESSAGING","capabilities":["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"],"credentialSchema":{"type":"development-fixture"},"settingsSchema":{"type":"object","required":["allowDevelopmentFixture"]}}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET version = EXCLUDED.version,
    category = EXCLUDED.category,
    display_name = EXCLUDED.display_name,
    manifest = EXCLUDED.manifest,
    enabled = true,
    updated_at = now();
INSERT INTO integrations.secret_references (id, tenant_id, provider, reference, key_version, metadata)
VALUES (
  'aaaaaaaa-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-whatsapp-cloud-api',
  'development://whatsapp-cloud-api/preview',
  'development-only',
  '{"developmentOnly":true}'::jsonb
)
ON CONFLICT (tenant_id, provider, reference) DO NOTHING;
INSERT INTO integrations.connections (
  id, tenant_id, connector_key, secret_reference_id, display_name, status, settings, capabilities, last_validated_at
)
VALUES (
  'aaaaaaaa-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'development-whatsapp-cloud-api',
  'aaaaaaaa-1111-1111-1111-111111111111',
  'Development WhatsApp Cloud API',
  'CONNECTED',
  '{"allowDevelopmentFixture":true}'::jsonb,
  '["messaging.inbound","messaging.outbound","webhooks","sync","provider.actions"]'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE
SET connector_key = EXCLUDED.connector_key,
    secret_reference_id = EXCLUDED.secret_reference_id,
    display_name = EXCLUDED.display_name,
    status = EXCLUDED.status,
    settings = EXCLUDED.settings,
    capabilities = EXCLUDED.capabilities,
    last_validated_at = EXCLUDED.last_validated_at,
    updated_at = now();
INSERT INTO crm.tags (id, tenant_id, name, description)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Preview E2E tag',
  'Development-only fixture for disposable browser acceptance tests.'
)
ON CONFLICT (id) DO NOTHING;
COMMIT;
SQL
