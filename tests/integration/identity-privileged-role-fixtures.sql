-- Privileged-role mutation fixture applied as platform_migrator.
-- A second active Owner is required so removal authorization can be tested
-- independently from the separate final-active-owner invariant.

INSERT INTO identity.users (
  id, keycloak_subject, email, first_name, last_name, locale, timezone
) VALUES (
  '99999999-9999-9999-9999-999999999999',
  'test-subject-secondary-owner-a',
  'secondary-owner-a@example.test',
  'Secondary',
  'Owner',
  'en',
  'UTC'
)
ON CONFLICT (id) DO NOTHING;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'identity-secondary-owner-fixture'
);

INSERT INTO identity.memberships (
  tenant_id, user_id, status, invited_by_user_id, joined_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '99999999-9999-9999-9999-999999999999',
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
 AND role.code = 'owner'
 AND role.is_system = true
WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND membership.user_id = '99999999-9999-9999-9999-999999999999'
ON CONFLICT DO NOTHING;
COMMIT;
