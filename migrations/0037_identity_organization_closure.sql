-- Identity / Team / Organization closure.
-- Keycloak remains the authentication and MFA credential source. This migration
-- owns only application profile, tenant membership, invitation and policy state.

BEGIN;

ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE identity.users
  DROP CONSTRAINT IF EXISTS users_locale_format,
  ADD CONSTRAINT users_locale_format
    CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$');

ALTER TABLE identity.organizations
  ADD COLUMN IF NOT EXISTS mfa_policy text NOT NULL DEFAULT 'OPTIONAL',
  ADD COLUMN IF NOT EXISTS profile_owner_membership_id uuid;

ALTER TABLE identity.organizations
  DROP CONSTRAINT IF EXISTS organizations_mfa_policy_check,
  ADD CONSTRAINT organizations_mfa_policy_check
    CHECK (mfa_policy IN ('OPTIONAL', 'REQUIRED_FOR_PRIVILEGED', 'REQUIRED_FOR_ALL'));

ALTER TABLE identity.memberships
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_reason text;

ALTER TABLE identity.organizations
  DROP CONSTRAINT IF EXISTS organizations_profile_owner_membership_fk,
  ADD CONSTRAINT organizations_profile_owner_membership_fk
    FOREIGN KEY (id, profile_owner_membership_id)
    REFERENCES identity.memberships(tenant_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE identity.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  accepted_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
    CHECK (octet_length(metadata::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL)),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX organization_invitations_pending_email_idx
  ON identity.organization_invitations (tenant_id, lower(email))
  WHERE status = 'PENDING';
CREATE INDEX organization_invitations_tenant_status_idx
  ON identity.organization_invitations (tenant_id, status, created_at DESC);
CREATE INDEX organization_invitations_expiry_idx
  ON identity.organization_invitations (expires_at)
  WHERE status = 'PENDING';

CREATE TRIGGER organization_invitations_touch_updated_at
BEFORE UPDATE ON identity.organization_invitations
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE identity.organization_invitation_roles (
  tenant_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invitation_id, role_id),
  FOREIGN KEY (tenant_id, invitation_id)
    REFERENCES identity.organization_invitations(tenant_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, role_id)
    REFERENCES identity.roles(tenant_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE identity.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.organization_invitations
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE identity.organization_invitation_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.organization_invitation_roles
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

-- Global users are readable only by the authenticated subject or by members of
-- the active tenant. Updates are self-service only; member lifecycle changes are
-- stored on identity.memberships instead of mutating another user's profile.
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read_self_or_tenant_member ON identity.users;
CREATE POLICY users_read_self_or_tenant_member
ON identity.users FOR SELECT
USING (
  keycloak_subject = platform.current_subject()
  OR EXISTS (
    SELECT 1
    FROM identity.memberships membership
    WHERE membership.user_id = identity.users.id
      AND membership.tenant_id = platform.current_tenant_id()
      AND membership.status IN ('INVITED', 'ACTIVE', 'SUSPENDED')
  )
);

DROP POLICY IF EXISTS users_update_self ON identity.users;
CREATE POLICY users_update_self
ON identity.users FOR UPDATE
USING (keycloak_subject = platform.current_subject())
WITH CHECK (keycloak_subject = platform.current_subject());

DROP POLICY IF EXISTS users_insert_self ON identity.users;
CREATE POLICY users_insert_self
ON identity.users FOR INSERT
WITH CHECK (keycloak_subject = platform.current_subject());

GRANT SELECT, INSERT, UPDATE, DELETE
ON identity.organization_invitations,
   identity.organization_invitation_roles
TO platform_app;

-- New authorization contracts. Profile updates are self-scoped by RLS. Security
-- policy changes are CRITICAL and require both permission/approval and MFA in the
-- application layer.
INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('identity.profile.update', 'identity', 'Update the authenticated user profile and preferences', 'LOW'),
  ('organization.security.manage', 'identity', 'Modify tenant authentication and MFA policy', 'CRITICAL')
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_risk = EXCLUDED.default_risk;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
SELECT template.code, permission.code
FROM identity.role_templates template
CROSS JOIN identity.permissions permission
WHERE permission.code = 'identity.profile.update'
ON CONFLICT DO NOTHING;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'organization.security.manage'),
  ('admin', 'organization.security.manage')
ON CONFLICT DO NOTHING;

-- Backfill already-instantiated system roles from the updated templates without
-- touching tenant custom roles.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code IN (
    'identity.profile.update',
    'organization.security.manage'
  )
ON CONFLICT DO NOTHING;

-- Prevent an administrative operation from removing the final active owner.
CREATE OR REPLACE FUNCTION identity.assert_other_active_owner(
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, identity
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM identity.memberships membership
    JOIN identity.membership_roles membership_role
      ON membership_role.tenant_id = membership.tenant_id
     AND membership_role.membership_id = membership.id
    JOIN identity.roles role
      ON role.tenant_id = membership_role.tenant_id
     AND role.id = membership_role.role_id
    WHERE membership.tenant_id = p_tenant_id
      AND membership.status = 'ACTIVE'
      AND membership.id <> p_membership_id
      AND role.code = 'owner'
      AND role.is_system = true
  ) THEN
    RAISE EXCEPTION 'organization must retain at least one active owner'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION identity.protect_last_active_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'ACTIVE'
     AND NEW.status <> 'ACTIVE'
     AND EXISTS (
       SELECT 1
       FROM identity.membership_roles membership_role
       JOIN identity.roles role
         ON role.tenant_id = membership_role.tenant_id
        AND role.id = membership_role.role_id
       WHERE membership_role.tenant_id = OLD.tenant_id
         AND membership_role.membership_id = OLD.id
         AND role.code = 'owner'
         AND role.is_system = true
     ) THEN
    PERFORM identity.assert_other_active_owner(OLD.tenant_id, OLD.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_active_owner_membership ON identity.memberships;
CREATE TRIGGER protect_last_active_owner_membership
BEFORE UPDATE OF status ON identity.memberships
FOR EACH ROW EXECUTE FUNCTION identity.protect_last_active_owner_membership();

CREATE OR REPLACE FUNCTION identity.protect_last_active_owner_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_role boolean;
  member_active boolean;
BEGIN
  SELECT role.code = 'owner' AND role.is_system
  INTO owner_role
  FROM identity.roles role
  WHERE role.tenant_id = OLD.tenant_id
    AND role.id = OLD.role_id;

  IF coalesce(owner_role, false) THEN
    SELECT membership.status = 'ACTIVE'
    INTO member_active
    FROM identity.memberships membership
    WHERE membership.tenant_id = OLD.tenant_id
      AND membership.id = OLD.membership_id;

    IF coalesce(member_active, false) THEN
      PERFORM identity.assert_other_active_owner(OLD.tenant_id, OLD.membership_id);
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_last_active_owner_role ON identity.membership_roles;
CREATE TRIGGER protect_last_active_owner_role
BEFORE DELETE ON identity.membership_roles
FOR EACH ROW EXECUTE FUNCTION identity.protect_last_active_owner_role();

-- Organization bootstrap for an authenticated Keycloak subject that does not yet
-- have a tenant. No tenant id is accepted from the caller; ownership is always
-- bound to platform.current_subject().
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
  v_subject text;
  v_user_id uuid;
  v_organization_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
BEGIN
  v_subject := platform.current_subject();
  IF v_subject IS NULL OR length(trim(v_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated subject is required' USING ERRCODE = '28000';
  END IF;
  IF length(trim(p_name)) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'invalid organization name' USING ERRCODE = '22023';
  END IF;
  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN
    RAISE EXCEPTION 'invalid organization slug' USING ERRCODE = '22023';
  END IF;
  IF p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN
    RAISE EXCEPTION 'invalid locale' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'invalid timezone' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_user_id
  FROM identity.users
  WHERE keycloak_subject = v_subject
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    INSERT INTO identity.users (
      keycloak_subject, email, first_name, last_name, locale, timezone
    ) VALUES (
      v_subject, lower(trim(p_email)), nullif(trim(p_first_name), ''),
      nullif(trim(p_last_name), ''), p_locale, p_timezone
    ) RETURNING id INTO v_user_id;
  ELSE
    UPDATE identity.users
    SET email = CASE
          WHEN email IS NULL THEN lower(trim(p_email))
          WHEN lower(email) = lower(trim(p_email)) THEN email
          ELSE email
        END,
        first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
        locale = p_locale,
        timezone = p_timezone,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM identity.users
    WHERE lower(email) = lower(trim(p_email))
      AND id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'email belongs to another identity' USING ERRCODE = '23505';
  END IF;

  INSERT INTO identity.organizations (
    name, slug, timezone, locale, created_by_user_id
  ) VALUES (
    trim(p_name), p_slug, p_timezone, p_locale, v_user_id
  ) RETURNING id INTO v_organization_id;

  PERFORM set_config('app.tenant_id', v_organization_id::text, true);
  PERFORM identity.bootstrap_default_roles(v_organization_id);

  INSERT INTO identity.memberships (
    tenant_id, user_id, status, joined_at
  ) VALUES (
    v_organization_id, v_user_id, 'ACTIVE', now()
  ) RETURNING id INTO v_membership_id;

  SELECT id INTO v_owner_role_id
  FROM identity.roles
  WHERE tenant_id = v_organization_id
    AND code = 'owner'
    AND is_system = true;

  INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
  VALUES (v_organization_id, v_membership_id, v_owner_role_id);

  UPDATE identity.organizations
  SET profile_owner_membership_id = v_membership_id
  WHERE id = v_organization_id;

  RETURN QUERY SELECT v_organization_id, v_membership_id, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION identity.create_organization_for_current_subject(
  text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.create_organization_for_current_subject(
  text, text, text, text, text, text, text
) TO platform_app;

-- Invitation acceptance is authenticated by Keycloak subject + verified email.
-- The invitation UUID is only a locator and cannot be accepted by a different
-- verified email identity.
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
  v_subject text;
  v_invitation identity.organization_invitations%ROWTYPE;
  v_user_id uuid;
  v_membership_id uuid;
BEGIN
  v_subject := platform.current_subject();
  IF v_subject IS NULL OR length(trim(v_subject)) = 0 THEN
    RAISE EXCEPTION 'authenticated subject is required' USING ERRCODE = '28000';
  END IF;
  IF p_verified_email IS NULL OR length(trim(p_verified_email)) < 3 THEN
    RAISE EXCEPTION 'verified email is required' USING ERRCODE = '28000';
  END IF;
  IF p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN
    RAISE EXCEPTION 'invalid locale' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'invalid timezone' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invitation
  FROM identity.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.status <> 'PENDING' THEN
    RAISE EXCEPTION 'invitation is not pending' USING ERRCODE = '23514';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE identity.organization_invitations
    SET status = 'EXPIRED', updated_at = now()
    WHERE id = p_invitation_id;
    RAISE EXCEPTION 'invitation has expired' USING ERRCODE = '23514';
  END IF;
  IF lower(trim(v_invitation.email)) <> lower(trim(p_verified_email)) THEN
    RAISE EXCEPTION 'verified email does not match invitation' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_user_id
  FROM identity.users
  WHERE keycloak_subject = v_subject
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM identity.users
      WHERE lower(email) = lower(trim(p_verified_email))
    ) THEN
      RAISE EXCEPTION 'email belongs to another identity' USING ERRCODE = '23505';
    END IF;

    INSERT INTO identity.users (
      keycloak_subject, email, first_name, last_name, locale, timezone
    ) VALUES (
      v_subject, lower(trim(p_verified_email)), nullif(trim(p_first_name), ''),
      nullif(trim(p_last_name), ''), p_locale, p_timezone
    ) RETURNING id INTO v_user_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM identity.users
      WHERE id = v_user_id
        AND email IS NOT NULL
        AND lower(email) <> lower(trim(p_verified_email))
    ) THEN
      RAISE EXCEPTION 'verified email does not match existing identity' USING ERRCODE = '28000';
    END IF;

    UPDATE identity.users
    SET email = coalesce(email, lower(trim(p_verified_email))),
        first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
        locale = p_locale,
        timezone = p_timezone,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  PERFORM set_config('app.tenant_id', v_invitation.tenant_id::text, true);

  SELECT id INTO v_membership_id
  FROM identity.memberships
  WHERE tenant_id = v_invitation.tenant_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_membership_id IS NULL THEN
    INSERT INTO identity.memberships (
      tenant_id, user_id, status, invited_by_user_id, joined_at
    ) VALUES (
      v_invitation.tenant_id, v_user_id, 'ACTIVE', v_invitation.invited_by_user_id, now()
    ) RETURNING id INTO v_membership_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM identity.memberships
      WHERE id = v_membership_id
        AND status = 'SUSPENDED'
    ) THEN
      RAISE EXCEPTION 'suspended membership requires administrator reactivation'
        USING ERRCODE = '23514';
    END IF;

    UPDATE identity.memberships
    SET status = 'ACTIVE',
        joined_at = coalesce(joined_at, now()),
        removed_at = NULL,
        removed_by_user_id = NULL,
        status_reason = NULL,
        updated_at = now()
    WHERE id = v_membership_id;
  END IF;

  INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
  SELECT invitation_role.tenant_id, v_membership_id, invitation_role.role_id
  FROM identity.organization_invitation_roles invitation_role
  WHERE invitation_role.tenant_id = v_invitation.tenant_id
    AND invitation_role.invitation_id = v_invitation.id
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM identity.membership_roles
    WHERE tenant_id = v_invitation.tenant_id
      AND membership_id = v_membership_id
  ) THEN
    RAISE EXCEPTION 'invitation has no assignable roles' USING ERRCODE = '23514';
  END IF;

  UPDATE identity.organization_invitations
  SET status = 'ACCEPTED',
      accepted_by_user_id = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_invitation.tenant_id, v_membership_id, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION identity.accept_organization_invitation(
  uuid, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.accept_organization_invitation(
  uuid, text, text, text, text, text
) TO platform_app;

COMMIT;
