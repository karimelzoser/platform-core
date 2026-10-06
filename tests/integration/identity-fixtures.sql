-- Applied as platform_migrator after the common fixture organizations/users exist.
-- Runtime RLS/security behavior is verified separately as platform_app.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'identity-fixture-a'
);
SELECT identity.bootstrap_default_roles('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

INSERT INTO identity.memberships (tenant_id, user_id, status, joined_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'ACTIVE',
  now()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = 'ACTIVE', updated_at = now();

INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
SELECT membership.tenant_id, membership.id, role.id
FROM identity.memberships membership
JOIN identity.roles role
  ON role.tenant_id = membership.tenant_id
 AND role.code = 'owner'
WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND membership.user_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'identity-fixture-b'
);
SELECT identity.bootstrap_default_roles('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO identity.memberships (tenant_id, user_id, status, joined_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'ACTIVE',
  now()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = 'ACTIVE', updated_at = now();

INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
SELECT membership.tenant_id, membership.id, role.id
FROM identity.memberships membership
JOIN identity.roles role
  ON role.tenant_id = membership.tenant_id
 AND role.code = 'owner'
WHERE membership.tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND membership.user_id = '22222222-2222-2222-2222-222222222222'
ON CONFLICT DO NOTHING;
COMMIT;

INSERT INTO identity.users (
  id, keycloak_subject, email, first_name, last_name, locale, timezone
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  'test-subject-manager-a',
  'manager-a@example.test',
  'Manager',
  'A',
  'en',
  'UTC'
)
ON CONFLICT (id) DO NOTHING;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'identity-fixture-manager'
);
INSERT INTO identity.memberships (
  tenant_id, user_id, status, invited_by_user_id, joined_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  'ACTIVE',
  '11111111-1111-1111-1111-111111111111',
  now()
)
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET status = 'ACTIVE', updated_at = now();

INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
SELECT membership.tenant_id, membership.id, role.id
FROM identity.memberships membership
JOIN identity.roles role
  ON role.tenant_id = membership.tenant_id
 AND role.code = 'manager'
WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND membership.user_id = '55555555-5555-5555-5555-555555555555'
ON CONFLICT DO NOTHING;

INSERT INTO identity.organization_invitations (
  id, tenant_id, email, invited_by_user_id, expires_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'invitee-a@example.test',
  '11111111-1111-1111-1111-111111111111',
  now() + interval '7 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.organization_invitation_roles (
  tenant_id, invitation_id, role_id
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  role.id
FROM identity.roles role
WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND role.code = 'agent'
ON CONFLICT DO NOTHING;
COMMIT;
