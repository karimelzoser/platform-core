-- Correct PL/pgSQL output-column ambiguity in tenantless invitation acceptance.
-- Migration 0038 renamed the implementation function to *_internal and wrapped it
-- with immutable audit/outbox evidence. Keep that public wrapper unchanged while
-- replacing the internal implementation with fully-qualified column references.

BEGIN;

CREATE OR REPLACE FUNCTION identity.accept_organization_invitation_internal(
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

  SELECT invitation.* INTO v_invitation
  FROM identity.organization_invitations invitation
  WHERE invitation.id = p_invitation_id
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation was not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.status <> 'PENDING' THEN
    RAISE EXCEPTION 'invitation is not pending' USING ERRCODE = '23514';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE identity.organization_invitations invitation
    SET status = 'EXPIRED', updated_at = now()
    WHERE invitation.id = p_invitation_id;
    RAISE EXCEPTION 'invitation has expired' USING ERRCODE = '23514';
  END IF;
  IF lower(trim(v_invitation.email)) <> lower(trim(p_verified_email)) THEN
    RAISE EXCEPTION 'verified email does not match invitation' USING ERRCODE = '28000';
  END IF;

  SELECT user_record.id INTO v_user_id
  FROM identity.users user_record
  WHERE user_record.keycloak_subject = v_subject
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM identity.users user_record
      WHERE lower(user_record.email) = lower(trim(p_verified_email))
    ) THEN
      RAISE EXCEPTION 'email belongs to another identity' USING ERRCODE = '23505';
    END IF;

    INSERT INTO identity.users (
      keycloak_subject, email, first_name, last_name, locale, timezone
    ) VALUES (
      v_subject, lower(trim(p_verified_email)), nullif(trim(p_first_name), ''),
      nullif(trim(p_last_name), ''), p_locale, p_timezone
    ) RETURNING identity.users.id INTO v_user_id;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM identity.users user_record
      WHERE user_record.id = v_user_id
        AND user_record.email IS NOT NULL
        AND lower(user_record.email) <> lower(trim(p_verified_email))
    ) THEN
      RAISE EXCEPTION 'verified email does not match existing identity' USING ERRCODE = '28000';
    END IF;

    UPDATE identity.users user_record
    SET email = coalesce(user_record.email, lower(trim(p_verified_email))),
        first_name = coalesce(nullif(trim(p_first_name), ''), user_record.first_name),
        last_name = coalesce(nullif(trim(p_last_name), ''), user_record.last_name),
        locale = p_locale,
        timezone = p_timezone,
        updated_at = now()
    WHERE user_record.id = v_user_id;
  END IF;

  PERFORM set_config('app.tenant_id', v_invitation.tenant_id::text, true);

  SELECT membership.id INTO v_membership_id
  FROM identity.memberships membership
  WHERE membership.tenant_id = v_invitation.tenant_id
    AND membership.user_id = v_user_id
  FOR UPDATE;

  IF v_membership_id IS NULL THEN
    INSERT INTO identity.memberships (
      tenant_id, user_id, status, invited_by_user_id, joined_at
    ) VALUES (
      v_invitation.tenant_id, v_user_id, 'ACTIVE', v_invitation.invited_by_user_id, now()
    ) RETURNING identity.memberships.id INTO v_membership_id;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM identity.memberships membership
      WHERE membership.id = v_membership_id
        AND membership.status = 'SUSPENDED'
    ) THEN
      RAISE EXCEPTION 'suspended membership requires administrator reactivation'
        USING ERRCODE = '23514';
    END IF;

    UPDATE identity.memberships membership
    SET status = 'ACTIVE',
        joined_at = coalesce(membership.joined_at, now()),
        removed_at = NULL,
        removed_by_user_id = NULL,
        status_reason = NULL,
        updated_at = now()
    WHERE membership.id = v_membership_id;
  END IF;

  INSERT INTO identity.membership_roles (tenant_id, membership_id, role_id)
  SELECT invitation_role.tenant_id, v_membership_id, invitation_role.role_id
  FROM identity.organization_invitation_roles invitation_role
  WHERE invitation_role.tenant_id = v_invitation.tenant_id
    AND invitation_role.invitation_id = v_invitation.id
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM identity.membership_roles membership_role
    WHERE membership_role.tenant_id = v_invitation.tenant_id
      AND membership_role.membership_id = v_membership_id
  ) THEN
    RAISE EXCEPTION 'invitation has no assignable roles' USING ERRCODE = '23514';
  END IF;

  UPDATE identity.organization_invitations invitation
  SET status = 'ACCEPTED',
      accepted_by_user_id = v_user_id,
      accepted_at = now(),
      updated_at = now()
  WHERE invitation.id = v_invitation.id;

  RETURN QUERY SELECT v_invitation.tenant_id, v_membership_id, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION identity.accept_organization_invitation_internal(
  uuid, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.accept_organization_invitation_internal(
  uuid, text, text, text, text, text
) FROM platform_app;

COMMIT;
