-- Verify that membership managers cannot assign, replace, or remove privileged
-- Owner/Admin roles or privileged custom roles without organization.roles.manage,
-- while authorized Owners can mutate a non-final privileged role.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  'test-subject-manager-a',
  'identity-privileged-role-manager-denial'
);

DO $$
DECLARE
  manager_membership uuid;
  secondary_owner_membership uuid;
  owner_role uuid;
  agent_role uuid;
  delegated_role_admin uuid;
  can_manage_members boolean;
  can_manage_roles boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM identity.current_effective_permissions()
    WHERE permission_code = 'organization.members.manage'
  ) INTO can_manage_members;
  SELECT EXISTS(
    SELECT 1 FROM identity.current_effective_permissions()
    WHERE permission_code = 'organization.roles.manage'
  ) INTO can_manage_roles;

  IF NOT can_manage_members OR can_manage_roles THEN
    RAISE EXCEPTION 'Manager fixture does not represent the intended privilege boundary';
  END IF;

  SELECT membership.id INTO manager_membership
  FROM identity.memberships membership
  WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND membership.user_id = '55555555-5555-5555-5555-555555555555'
    AND membership.status = 'ACTIVE';

  SELECT membership.id INTO secondary_owner_membership
  FROM identity.memberships membership
  WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND membership.user_id = '99999999-9999-9999-9999-999999999999'
    AND membership.status = 'ACTIVE';

  SELECT role.id INTO owner_role
  FROM identity.roles role
  WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND role.code = 'owner'
    AND role.is_system = true;

  SELECT role.id INTO agent_role
  FROM identity.roles role
  WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND role.code = 'agent'
    AND role.is_system = true;

  SELECT role.id INTO delegated_role_admin
  FROM identity.roles role
  WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND role.code = 'delegated_role_admin'
    AND role.is_system = false;

  IF manager_membership IS NULL
     OR secondary_owner_membership IS NULL
     OR owner_role IS NULL
     OR agent_role IS NULL
     OR delegated_role_admin IS NULL THEN
    RAISE EXCEPTION 'Privileged-role guard fixture is incomplete';
  END IF;

  BEGIN
    DELETE FROM identity.membership_roles
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND membership_id = secondary_owner_membership
      AND role_id = owner_role;
    RAISE EXCEPTION 'Member manager removed privileged Owner role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE identity.membership_roles
    SET role_id = agent_role
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND membership_id = secondary_owner_membership
      AND role_id = owner_role;
    RAISE EXCEPTION 'Member manager replaced privileged Owner role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      manager_membership,
      delegated_role_admin
    );
    RAISE EXCEPTION 'Member manager escalated through privileged custom role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  INSERT INTO identity.organization_invitations (
    id, tenant_id, email, invited_by_user_id, expires_at
  ) VALUES (
    'aaaaaaaa-0000-0000-0000-000000000591',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'privileged-custom-role-invite@example.test',
    '55555555-5555-5555-5555-555555555555',
    now() + interval '1 day'
  );

  BEGIN
    INSERT INTO identity.organization_invitation_roles (
      tenant_id, invitation_id, role_id
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000591',
      delegated_role_admin
    );
    RAISE EXCEPTION 'Member manager invited a privileged custom role';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM identity.membership_roles
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND membership_id = secondary_owner_membership
      AND role_id = owner_role
  ) THEN
    RAISE EXCEPTION 'Denied privileged-role mutation changed persisted Owner state';
  END IF;

  IF EXISTS (
    SELECT 1 FROM identity.membership_roles
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND membership_id = manager_membership
      AND role_id = delegated_role_admin
  ) THEN
    RAISE EXCEPTION 'Denied custom-role escalation changed persisted membership state';
  END IF;
END;
$$;
ROLLBACK;

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'identity-privileged-role-owner-allowed'
);

DO $$
DECLARE
  secondary_owner_membership uuid;
  owner_role uuid;
  affected integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM identity.current_effective_permissions()
    WHERE permission_code = 'organization.roles.manage'
  ) THEN
    RAISE EXCEPTION 'Owner fixture is missing organization.roles.manage';
  END IF;

  SELECT membership.id INTO secondary_owner_membership
  FROM identity.memberships membership
  WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND membership.user_id = '99999999-9999-9999-9999-999999999999'
    AND membership.status = 'ACTIVE';

  SELECT role.id INTO owner_role
  FROM identity.roles role
  WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND role.code = 'owner'
    AND role.is_system = true;

  DELETE FROM identity.membership_roles
  WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND membership_id = secondary_owner_membership
    AND role_id = owner_role;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected <> 1 THEN
    RAISE EXCEPTION 'Authorized Owner could not remove secondary privileged role';
  END IF;
END;
$$;
ROLLBACK;
