#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml'
$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO identity.users (id, keycloak_subject, email)
VALUES ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'preview-owner@example.test')
ON CONFLICT (keycloak_subject) DO NOTHING;
INSERT INTO identity.organizations (id, name, slug, created_by_user_id)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Preview Tenant', 'preview-tenant', '33333333-3333-3333-3333-333333333333')
ON CONFLICT (slug) DO NOTHING;
SELECT identity.bootstrap_default_roles('cccccccc-cccc-cccc-cccc-cccccccccccc');
INSERT INTO identity.memberships (tenant_id, user_id, status)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'ACTIVE')
ON CONFLICT DO NOTHING;
INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
SELECT m.tenant_id, m.id, r.id FROM identity.memberships m JOIN identity.roles r ON r.tenant_id=m.tenant_id AND r.code='owner'
WHERE m.tenant_id='cccccccc-cccc-cccc-cccc-cccccccccccc' AND m.user_id='33333333-3333-3333-3333-333333333333'
ON CONFLICT DO NOTHING;
SQL
