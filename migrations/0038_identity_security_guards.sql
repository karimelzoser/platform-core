-- Security closure for identity bootstrap and privileged role assignment.
-- Trusted SECURITY DEFINER bootstrap/acceptance functions may materialize roles,
-- while ordinary platform_app mutations must pass role-management authorization.

BEGIN;

CREATE OR REPLACE FUNCTION identity.current_actor_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM identity.current_effective_permissions() permission
    WHERE permission.permission_code = p_permission
  );
$$;

REVOKE ALL ON FUNCTION identity.current_actor_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_actor_has_permission(text) TO platform_app;

CREATE OR REPLACE FUNCTION identity.guard_privileged_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_role_code text;
BEGIN
  -- SECURITY DEFINER identity functions execute as their owner and are the only
  -- trusted path for bootstrap/invitation materialization. Runtime application
  -- writes execute as platform_app and must prove role-management permission.
  IF current_user <> 'platform_app' THEN
    RETURN NEW;
  END IF;

  SELECT role.code
  INTO v_role_code
  FROM identity.roles role
  WHERE role.tenant_id = NEW.tenant_id
    AND role.id = NEW.role_id
    AND role.is_system = true;

  IF v_role_code IN ('owner', 'admin')
     AND NOT identity.current_actor_has_permission('organization.roles.manage') THEN
    RAISE EXCEPTION 'assigning privileged system roles requires organization.roles.manage'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_privileged_membership_role_assignment
ON identity.membership_roles;
CREATE TRIGGER guard_privileged_membership_role_assignment
BEFORE INSERT OR UPDATE ON identity.membership_roles
FOR EACH ROW EXECUTE FUNCTION identity.guard_privileged_role_assignment();

DROP TRIGGER IF EXISTS guard_privileged_invitation_role_assignment
ON identity.organization_invitation_roles;
CREATE TRIGGER guard_privileged_invitation_role_assignment
BEFORE INSERT OR UPDATE ON identity.organization_invitation_roles
FOR EACH ROW EXECUTE FUNCTION identity.guard_privileged_role_assignment();

-- Wrap the tenantless organization bootstrap function so it produces immutable
-- audit and outbox evidence after its internal implementation establishes tenant
-- context. The internal implementation is intentionally not executable by the
-- runtime role.
ALTER FUNCTION identity.create_organization_for_current_subject(
  text, text, text, text, text, text, text
) RENAME TO create_organization_for_current_subject_internal;

REVOKE ALL ON FUNCTION identity.create_organization_for_current_subject_internal(
  text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.create_organization_for_current_subject_internal(
  text, text, text, text, text, text, text
) FROM platform_app;

CREATE OR REPLACE FUNCTION identity.create_organization_for_current_subject(
  p_name text,
  p_slug text,
  p_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_locale text DEFAULT 'en',
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  organization_id uuid,
  membership_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, identity, platform
AS $$
DECLARE
  v_existing_email text;
  v_result record;
BEGIN
  SELECT user_record.email
  INTO v_existing_email
  FROM identity.users user_record
  WHERE user_record.keycloak_subject = platform.current_subject();

  IF v_existing_email IS NOT NULL
     AND lower(v_existing_email) <> lower(trim(p_email)) THEN
    RAISE EXCEPTION 'verified email does not match existing identity'
      USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_result
  FROM identity.create_organization_for_current_subject_internal(
    p_name,
    p_slug,
    p_email,
    p_first_name,
    p_last_name,
    p_locale,
    p_timezone
  );

  INSERT INTO platform.audit_log (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id,
    request_id, correlation_id, metadata
  ) VALUES (
    v_result.organization_id,
    'USER',
    v_result.user_id,
    'identity.organization.create',
    'identity.organization',
    v_result.organization_id::text,
    platform.current_request_id(),
    platform.current_request_id(),
    jsonb_build_object('bootstrap', true)
  );

  INSERT INTO platform.outbox_events (
    tenant_id, event_type, source, correlation_id, causation_id,
    actor_type, actor_id, resource_type, resource_id, data, dedupe_key
  ) VALUES (
    v_result.organization_id,
    'identity.organization.created',
    'identity',
    platform.current_request_id(),
    platform.current_request_id(),
    'USER',
    v_result.user_id,
    'identity.organization',
    v_result.organization_id::text,
    jsonb_build_object(
      'organizationId', v_result.organization_id,
      'membershipId', v_result.membership_id
    ),
    'identity:organization:created:' || v_result.organization_id::text
  );

  RETURN QUERY SELECT
    v_result.organization_id,
    v_result.membership_id,
    v_result.user_id;
END;
$$;

REVOKE ALL ON FUNCTION identity.create_organization_for_current_subject(
  text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.create_organization_for_current_subject(
  text, text, text, text, text, text, text
) TO platform_app;

-- Apply the same wrapper pattern to tenantless invitation acceptance. The invite
-- UUID is only a locator; verified Keycloak email remains the acceptance proof.
ALTER FUNCTION identity.accept_organization_invitation(
  uuid, text, text, text, text, text
) RENAME TO accept_organization_invitation_internal;

REVOKE ALL ON FUNCTION identity.accept_organization_invitation_internal(
  uuid, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.accept_organization_invitation_internal(
  uuid, text, text, text, text, text
) FROM platform_app;

CREATE OR REPLACE FUNCTION identity.accept_organization_invitation(
  p_invitation_id uuid,
  p_verified_email text,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_locale text DEFAULT 'en',
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE (
  organization_id uuid,
  membership_id uuid,
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, identity, platform
AS $$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO v_result
  FROM identity.accept_organization_invitation_internal(
    p_invitation_id,
    p_verified_email,
    p_first_name,
    p_last_name,
    p_locale,
    p_timezone
  );

  INSERT INTO platform.audit_log (
    tenant_id, actor_type, actor_id, action, resource_type, resource_id,
    request_id, correlation_id, metadata
  ) VALUES (
    v_result.organization_id,
    'USER',
    v_result.user_id,
    'identity.organization.invitation.accept',
    'identity.organization_invitation',
    p_invitation_id::text,
    platform.current_request_id(),
    platform.current_request_id(),
    jsonb_build_object('membershipId', v_result.membership_id)
  );

  INSERT INTO platform.outbox_events (
    tenant_id, event_type, source, correlation_id, causation_id,
    actor_type, actor_id, resource_type, resource_id, data, dedupe_key
  ) VALUES (
    v_result.organization_id,
    'identity.organization.invitation_accepted',
    'identity',
    platform.current_request_id(),
    platform.current_request_id(),
    'USER',
    v_result.user_id,
    'identity.organization_invitation',
    p_invitation_id::text,
    jsonb_build_object(
      'invitationId', p_invitation_id,
      'membershipId', v_result.membership_id
    ),
    'identity:invitation:accepted:' || p_invitation_id::text
  );

  RETURN QUERY SELECT
    v_result.organization_id,
    v_result.membership_id,
    v_result.user_id;
END;
$$;

REVOKE ALL ON FUNCTION identity.accept_organization_invitation(
  uuid, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.accept_organization_invitation(
  uuid, text, text, text, text, text
) TO platform_app;

COMMIT;
