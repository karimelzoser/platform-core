-- Identity / Team / Organization two-tenant and security-boundary acceptance.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'identity-owner-a'
);

DO $$
DECLARE permission_count integer;
BEGIN
  SELECT count(*) INTO permission_count
  FROM identity.current_effective_permissions()
  WHERE permission_code IN (
    'organization.members.manage',
    'organization.roles.manage',
    'organization.security.manage',
    'identity.profile.update'
  );
  IF permission_count <> 4 THEN
    RAISE EXCEPTION 'Owner A is missing identity closure permissions';
  END IF;
END;
$$;

DO $$
DECLARE owner_membership uuid;
BEGIN
  SELECT membership.id INTO owner_membership
  FROM identity.memberships membership
  WHERE membership.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND membership.user_id = '11111111-1111-1111-1111-111111111111';

  BEGIN
    UPDATE identity.memberships
    SET status = 'SUSPENDED', suspended_at = now()
    WHERE id = owner_membership;
    RAISE EXCEPTION 'Final active owner was suspended';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    DELETE FROM identity.membership_roles membership_role
    USING identity.roles role
    WHERE membership_role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND membership_role.membership_id = owner_membership
      AND role.tenant_id = membership_role.tenant_id
      AND role.id = membership_role.role_id
      AND role.code = 'owner';
    RAISE EXCEPTION 'Final active owner role was removed';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;

-- A manager can manage ordinary members but cannot use that permission to assign
-- Owner/Admin system roles; privileged role assignment requires roles.manage.
BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '55555555-5555-5555-5555-555555555555',
  'test-subject-manager-a',
  'identity-manager-a'
);

DO $$
DECLARE can_manage_members boolean;
DECLARE can_manage_roles boolean;
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
END;
$$;

INSERT INTO identity.organization_invitations (
  id, tenant_id, email, invited_by_user_id, expires_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000502',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'manager-created@example.test',
  '55555555-5555-5555-5555-555555555555',
  now() + interval '1 day'
);

DO $$
DECLARE owner_role uuid;
BEGIN
  SELECT id INTO owner_role
  FROM identity.roles
  WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND code = 'owner';

  BEGIN
    INSERT INTO identity.organization_invitation_roles (
      tenant_id, invitation_id, role_id
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000502',
      owner_role
    );
    RAISE EXCEPTION 'Manager assigned privileged Owner role through invitation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

INSERT INTO identity.organization_invitation_roles (
  tenant_id, invitation_id, role_id
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000502',
  role.id
FROM identity.roles role
WHERE role.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND role.code = 'agent';
COMMIT;

-- Tenant B cannot observe or mutate Tenant A team/invitation/profile state.
BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'identity-tenant-b-isolation'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM identity.organization_invitations
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A invitations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM identity.users
    WHERE id = '55555555-5555-5555-5555-555555555555'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A manager profile';
  END IF;

  UPDATE identity.users
  SET first_name = 'Cross tenant'
  WHERE id = '55555555-5555-5555-5555-555555555555';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A user profile';
  END IF;

  BEGIN
    INSERT INTO identity.organization_invitations (
      tenant_id, email, expires_at
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cross-tenant@example.test',
      now() + interval '1 day'
    );
    RAISE EXCEPTION 'Tenant B inserted a Tenant A invitation';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
COMMIT;

-- Organization discovery works before tenant selection but is constrained to the
-- authenticated Keycloak subject.
BEGIN;
SELECT platform.set_request_context(
  NULL,
  NULL,
  'test-subject-a',
  'identity-org-discovery'
);
DO $$
DECLARE organization_count integer;
BEGIN
  SELECT count(*) INTO organization_count
  FROM identity.current_user_organizations()
  WHERE organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF organization_count <> 1 THEN
    RAISE EXCEPTION 'Tenantless organization discovery did not return Tenant A';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.current_user_organizations()
    WHERE organization_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'Tenantless organization discovery leaked Tenant B';
  END IF;
END;
$$;
COMMIT;

-- Tenantless organization bootstrap must establish owner membership and immutable
-- audit/outbox evidence in the newly-created tenant.
BEGIN;
SELECT platform.set_request_context(
  NULL,
  NULL,
  'identity-bootstrap-subject',
  'identity-bootstrap-request'
);
DO $$
DECLARE created record;
BEGIN
  SELECT * INTO created
  FROM identity.create_organization_for_current_subject(
    'Identity Bootstrap Org',
    'identity-bootstrap-org',
    'identity-bootstrap@example.test',
    'Identity',
    'Owner',
    'en',
    'UTC'
  );

  IF created.organization_id IS NULL OR created.membership_id IS NULL OR created.user_id IS NULL THEN
    RAISE EXCEPTION 'Tenantless organization bootstrap returned incomplete identity';
  END IF;
  IF platform.current_tenant_id() <> created.organization_id THEN
    RAISE EXCEPTION 'Organization bootstrap did not establish new tenant context';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.membership_roles membership_role
    JOIN identity.roles role
      ON role.tenant_id = membership_role.tenant_id
     AND role.id = membership_role.role_id
    WHERE membership_role.tenant_id = created.organization_id
      AND membership_role.membership_id = created.membership_id
      AND role.code = 'owner'
  ) THEN
    RAISE EXCEPTION 'Organization bootstrap did not assign Owner role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.audit_log
    WHERE tenant_id = created.organization_id
      AND action = 'identity.organization.create'
      AND request_id = 'identity-bootstrap-request'
  ) THEN
    RAISE EXCEPTION 'Organization bootstrap audit evidence is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.outbox_events
    WHERE tenant_id = created.organization_id
      AND event_type = 'identity.organization.created'
      AND correlation_id = 'identity-bootstrap-request'
  ) THEN
    RAISE EXCEPTION 'Organization bootstrap outbox evidence is missing';
  END IF;
END;
$$;
COMMIT;

-- Invitation UUID is not sufficient proof. Wrong verified email must fail, while
-- the matching authenticated subject may accept and receives exactly the frozen
-- invited role set plus audit/outbox evidence.
BEGIN;
SELECT platform.set_request_context(
  NULL,
  NULL,
  'identity-wrong-invitee',
  'identity-invite-wrong-email'
);
DO $$
BEGIN
  BEGIN
    PERFORM identity.accept_organization_invitation(
      'aaaaaaaa-0000-0000-0000-000000000501',
      'wrong@example.test',
      'Wrong',
      'Invitee',
      'en',
      'UTC'
    );
    RAISE EXCEPTION 'Invitation accepted with a mismatched verified email';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '28000' THEN
      RAISE;
    END IF;
  END;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  NULL,
  NULL,
  'identity-invitee-a',
  'identity-invite-accept'
);
DO $$
DECLARE accepted record;
BEGIN
  SELECT * INTO accepted
  FROM identity.accept_organization_invitation(
    'aaaaaaaa-0000-0000-0000-000000000501',
    'invitee-a@example.test',
    'Invited',
    'Agent',
    'en',
    'UTC'
  );

  IF accepted.organization_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid THEN
    RAISE EXCEPTION 'Invitation was accepted into the wrong tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.membership_roles membership_role
    JOIN identity.roles role
      ON role.tenant_id = membership_role.tenant_id
     AND role.id = membership_role.role_id
    WHERE membership_role.tenant_id = accepted.organization_id
      AND membership_role.membership_id = accepted.membership_id
      AND role.code = 'agent'
  ) THEN
    RAISE EXCEPTION 'Accepted invitation did not materialize Agent role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.membership_roles membership_role
    JOIN identity.roles role
      ON role.tenant_id = membership_role.tenant_id
     AND role.id = membership_role.role_id
    WHERE membership_role.tenant_id = accepted.organization_id
      AND membership_role.membership_id = accepted.membership_id
      AND role.code IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accepted invitation gained an uninvited privileged role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.audit_log
    WHERE tenant_id = accepted.organization_id
      AND action = 'identity.organization.invitation.accept'
      AND request_id = 'identity-invite-accept'
  ) THEN
    RAISE EXCEPTION 'Invitation acceptance audit evidence is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.outbox_events
    WHERE tenant_id = accepted.organization_id
      AND event_type = 'identity.organization.invitation_accepted'
      AND correlation_id = 'identity-invite-accept'
  ) THEN
    RAISE EXCEPTION 'Invitation acceptance outbox evidence is missing';
  END IF;
END;
$$;
COMMIT;
