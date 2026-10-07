-- Close the asymmetric privileged-role mutation boundary left by migration 0038.
-- Ordinary member managers may manage membership lifecycle, but assigning, replacing,
-- or removing Owner/Admin system roles requires organization.roles.manage.

BEGIN;

CREATE OR REPLACE FUNCTION identity.guard_privileged_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_new_role_code text;
  v_old_role_code text;
  v_can_manage_roles boolean;
BEGIN
  -- Trusted SECURITY DEFINER identity bootstrap/acceptance functions execute as
  -- their owner. Runtime application mutations execute as platform_app and must
  -- prove the dedicated role-management permission.
  IF current_user <> 'platform_app' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_can_manage_roles := identity.current_actor_has_permission('organization.roles.manage');

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT role.code
    INTO v_old_role_code
    FROM identity.roles role
    WHERE role.tenant_id = OLD.tenant_id
      AND role.id = OLD.role_id
      AND role.is_system = true;

    IF v_old_role_code IN ('owner', 'admin')
       AND NOT v_can_manage_roles THEN
      RAISE EXCEPTION 'removing privileged system roles requires organization.roles.manage'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT role.code
    INTO v_new_role_code
    FROM identity.roles role
    WHERE role.tenant_id = NEW.tenant_id
      AND role.id = NEW.role_id
      AND role.is_system = true;

    IF v_new_role_code IN ('owner', 'admin')
       AND NOT v_can_manage_roles THEN
      RAISE EXCEPTION 'assigning privileged system roles requires organization.roles.manage'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION identity.guard_privileged_role_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.guard_privileged_role_assignment() TO platform_app;

DROP TRIGGER IF EXISTS guard_privileged_membership_role_assignment
ON identity.membership_roles;
CREATE TRIGGER guard_privileged_membership_role_assignment
BEFORE INSERT OR UPDATE OR DELETE ON identity.membership_roles
FOR EACH ROW EXECUTE FUNCTION identity.guard_privileged_role_assignment();

-- Invitation-role deletion is intentionally left to invitation lifecycle semantics.
-- Assignment/replacement remains guarded by the existing INSERT/UPDATE trigger.

COMMIT;
