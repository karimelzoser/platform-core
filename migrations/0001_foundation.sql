BEGIN;


-- ============================================================
-- MIGRATION TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS platform.schema_migrations
(
    version         text PRIMARY KEY,
    checksum        text,
    applied_at      timestamptz NOT NULL DEFAULT now(),
    description     text NOT NULL
);


-- ============================================================
-- REQUEST / TENANT CONTEXT
--
-- Designed for transaction-scoped use:
--
-- BEGIN;
-- SELECT platform.set_request_context(...);
-- ...
-- COMMIT;
--
-- is_local=true is intentional so pooled connections cannot
-- accidentally leak one tenant's context into another request.
-- ============================================================

CREATE OR REPLACE FUNCTION platform.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        current_setting('app.tenant_id', true),
        ''
    )::uuid;
$$;


CREATE OR REPLACE FUNCTION platform.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        current_setting('app.actor_id', true),
        ''
    )::uuid;
$$;


CREATE OR REPLACE FUNCTION platform.current_subject()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        current_setting('app.subject', true),
        ''
    );
$$;


CREATE OR REPLACE FUNCTION platform.current_request_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        current_setting('app.request_id', true),
        ''
    );
$$;


CREATE OR REPLACE FUNCTION platform.set_request_context(
    p_tenant_id uuid,
    p_actor_id uuid,
    p_subject text,
    p_request_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN

    PERFORM set_config(
        'app.tenant_id',
        COALESCE(p_tenant_id::text, ''),
        true
    );

    PERFORM set_config(
        'app.actor_id',
        COALESCE(p_actor_id::text, ''),
        true
    );

    PERFORM set_config(
        'app.subject',
        COALESCE(p_subject, ''),
        true
    );

    PERFORM set_config(
        'app.request_id',
        COALESCE(p_request_id, ''),
        true
    );

END;
$$;


REVOKE ALL
ON FUNCTION platform.set_request_context(uuid,uuid,text,text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION platform.set_request_context(uuid,uuid,text,text)
TO platform_app;


-- ============================================================
-- UPDATED_AT HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION platform.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- ============================================================
-- USERS
--
-- Global identity projection of Keycloak users.
-- Tenant membership is kept separately.
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.users
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    keycloak_subject    text NOT NULL UNIQUE,

    email               text,
    first_name          text,
    last_name           text,

    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            status IN (
                                'ACTIVE',
                                'DISABLED'
                            )
                        ),

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);


CREATE UNIQUE INDEX IF NOT EXISTS
    users_email_unique_ci
ON identity.users (lower(email))
WHERE email IS NOT NULL;


DROP TRIGGER IF EXISTS
    users_touch_updated_at
ON identity.users;

CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON identity.users
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- ORGANIZATIONS / TENANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.organizations
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name                text NOT NULL,
    slug                text NOT NULL,

    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            status IN (
                                'ACTIVE',
                                'SUSPENDED',
                                'CLOSED'
                            )
                        ),

    timezone            text NOT NULL DEFAULT 'UTC',
    locale              text NOT NULL DEFAULT 'en',

    settings            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_by_user_id  uuid
                        REFERENCES identity.users(id)
                        ON DELETE SET NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT organizations_slug_format
        CHECK (
            slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'
        )
);


CREATE UNIQUE INDEX IF NOT EXISTS
    organizations_slug_unique_ci
ON identity.organizations (lower(slug));


DROP TRIGGER IF EXISTS
    organizations_touch_updated_at
ON identity.organizations;

CREATE TRIGGER organizations_touch_updated_at
BEFORE UPDATE ON identity.organizations
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- MEMBERSHIPS
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.memberships
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    user_id             uuid NOT NULL
                        REFERENCES identity.users(id),

    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            status IN (
                                'INVITED',
                                'ACTIVE',
                                'SUSPENDED',
                                'REMOVED'
                            )
                        ),

    title               text,

    invited_by_user_id  uuid
                        REFERENCES identity.users(id)
                        ON DELETE SET NULL,

    joined_at           timestamptz,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, user_id),
    UNIQUE (tenant_id, id)
);


CREATE INDEX IF NOT EXISTS
    memberships_user_id_idx
ON identity.memberships(user_id);


CREATE INDEX IF NOT EXISTS
    memberships_tenant_status_idx
ON identity.memberships(tenant_id, status);


DROP TRIGGER IF EXISTS
    memberships_touch_updated_at
ON identity.memberships;

CREATE TRIGGER memberships_touch_updated_at
BEFORE UPDATE ON identity.memberships
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- PERMISSION CATALOG
--
-- Global catalog.
-- Actual grants remain tenant-scoped through roles.
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.permissions
(
    code                text PRIMARY KEY,
    category            text NOT NULL,
    description         text NOT NULL,

    default_risk        text NOT NULL DEFAULT 'LOW'
                        CHECK (
                            default_risk IN (
                                'LOW',
                                'MEDIUM',
                                'HIGH',
                                'CRITICAL'
                            )
                        ),

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- TENANT ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.roles
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    code                text NOT NULL,
    name                text NOT NULL,
    description         text,

    is_system           boolean NOT NULL DEFAULT false,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
);


CREATE INDEX IF NOT EXISTS
    roles_tenant_idx
ON identity.roles(tenant_id);


DROP TRIGGER IF EXISTS
    roles_touch_updated_at
ON identity.roles;

CREATE TRIGGER roles_touch_updated_at
BEFORE UPDATE ON identity.roles
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- ROLE -> PERMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.role_permissions
(
    tenant_id           uuid NOT NULL,

    role_id             uuid NOT NULL,

    permission_code     text NOT NULL
                        REFERENCES identity.permissions(code),

    created_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (
        tenant_id,
        role_id,
        permission_code
    ),

    FOREIGN KEY (tenant_id, role_id)
        REFERENCES identity.roles(tenant_id, id)
        ON DELETE CASCADE
);


-- ============================================================
-- MEMBERSHIP -> ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.membership_roles
(
    tenant_id           uuid NOT NULL,

    membership_id       uuid NOT NULL,
    role_id             uuid NOT NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (
        tenant_id,
        membership_id,
        role_id
    ),

    FOREIGN KEY (tenant_id, membership_id)
        REFERENCES identity.memberships(tenant_id, id)
        ON DELETE CASCADE,

    FOREIGN KEY (tenant_id, role_id)
        REFERENCES identity.roles(tenant_id, id)
        ON DELETE CASCADE
);


-- ============================================================
-- IDEMPOTENCY
-- ============================================================

CREATE TABLE IF NOT EXISTS platform.idempotency_keys
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    scope               text NOT NULL,
    idempotency_key     text NOT NULL,

    request_hash        text,

    state               text NOT NULL DEFAULT 'IN_PROGRESS'
                        CHECK (
                            state IN (
                                'IN_PROGRESS',
                                'COMPLETED',
                                'FAILED'
                            )
                        ),

    response_status     integer,
    response_body       jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,

    UNIQUE (
        tenant_id,
        scope,
        idempotency_key
    )
);


CREATE INDEX IF NOT EXISTS
    idempotency_expires_idx
ON platform.idempotency_keys(expires_at);


DROP TRIGGER IF EXISTS
    idempotency_touch_updated_at
ON platform.idempotency_keys;

CREATE TRIGGER idempotency_touch_updated_at
BEFORE UPDATE ON platform.idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- TRANSACTIONAL OUTBOX
-- ============================================================

CREATE TABLE IF NOT EXISTS platform.outbox_events
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    event_type          text NOT NULL,
    event_version       integer NOT NULL DEFAULT 1,

    source              text NOT NULL DEFAULT 'platform',

    correlation_id      text,
    causation_id        text,

    actor_type          text NOT NULL DEFAULT 'SYSTEM'
                        CHECK (
                            actor_type IN (
                                'USER',
                                'AI',
                                'SYSTEM',
                                'SERVICE',
                                'INTEGRATION'
                            )
                        ),

    actor_id            uuid,

    resource_type       text NOT NULL,
    resource_id         text NOT NULL,

    data                jsonb NOT NULL DEFAULT '{}'::jsonb,

    dedupe_key          text,

    status              text NOT NULL DEFAULT 'PENDING'
                        CHECK (
                            status IN (
                                'PENDING',
                                'PUBLISHED',
                                'FAILED'
                            )
                        ),

    attempts            integer NOT NULL DEFAULT 0,

    available_at        timestamptz NOT NULL DEFAULT now(),
    claimed_at          timestamptz,
    claimed_by          text,

    occurred_at         timestamptz NOT NULL DEFAULT now(),
    published_at        timestamptz,

    last_error          text
);


CREATE INDEX IF NOT EXISTS
    outbox_pending_idx
ON platform.outbox_events(status, available_at)
WHERE status = 'PENDING';


CREATE INDEX IF NOT EXISTS
    outbox_tenant_occurred_idx
ON platform.outbox_events(tenant_id, occurred_at DESC);


CREATE UNIQUE INDEX IF NOT EXISTS
    outbox_dedupe_unique
ON platform.outbox_events(tenant_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;


-- ============================================================
-- DEAD LETTERS
-- ============================================================

CREATE TABLE IF NOT EXISTS platform.dead_letters
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    source              text NOT NULL,
    event_type          text,

    source_event_id     text,

    payload             jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_code          text,
    error_message       text NOT NULL,

    attempts            integer NOT NULL DEFAULT 1,

    status              text NOT NULL DEFAULT 'OPEN'
                        CHECK (
                            status IN (
                                'OPEN',
                                'RETRYING',
                                'RESOLVED',
                                'IGNORED'
                            )
                        ),

    first_failed_at     timestamptz NOT NULL DEFAULT now(),
    last_failed_at      timestamptz NOT NULL DEFAULT now(),

    resolved_at         timestamptz,
    resolution          jsonb
);


CREATE INDEX IF NOT EXISTS
    dead_letters_open_idx
ON platform.dead_letters(tenant_id, last_failed_at DESC)
WHERE status IN ('OPEN', 'RETRYING');


-- ============================================================
-- IMMUTABLE AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS platform.audit_log
(
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    sequence_no         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    actor_type          text NOT NULL
                        CHECK (
                            actor_type IN (
                                'USER',
                                'AI',
                                'SYSTEM',
                                'SERVICE',
                                'INTEGRATION'
                            )
                        ),

    actor_id            uuid,

    action              text NOT NULL,

    resource_type       text NOT NULL,
    resource_id         text,

    request_id          text,
    correlation_id      text,

    ip_address          inet,
    user_agent          text,

    before_state        jsonb,
    after_state         jsonb,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now()
);


CREATE INDEX IF NOT EXISTS
    audit_tenant_sequence_idx
ON platform.audit_log(tenant_id, sequence_no DESC);


CREATE INDEX IF NOT EXISTS
    audit_resource_idx
ON platform.audit_log(
    tenant_id,
    resource_type,
    resource_id
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE identity.organizations
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON identity.organizations;

CREATE POLICY tenant_isolation
ON identity.organizations
USING (
    id = platform.current_tenant_id()
)
WITH CHECK (
    id = platform.current_tenant_id()
);


ALTER TABLE identity.memberships
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON identity.memberships;

CREATE POLICY tenant_isolation
ON identity.memberships
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE identity.roles
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON identity.roles;

CREATE POLICY tenant_isolation
ON identity.roles
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE identity.role_permissions
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON identity.role_permissions;

CREATE POLICY tenant_isolation
ON identity.role_permissions
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE identity.membership_roles
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON identity.membership_roles;

CREATE POLICY tenant_isolation
ON identity.membership_roles
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE platform.idempotency_keys
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON platform.idempotency_keys;

CREATE POLICY tenant_isolation
ON platform.idempotency_keys
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE platform.outbox_events
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON platform.outbox_events;

CREATE POLICY tenant_isolation
ON platform.outbox_events
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE platform.dead_letters
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON platform.dead_letters;

CREATE POLICY tenant_isolation
ON platform.dead_letters
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE platform.audit_log
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation
ON platform.audit_log;

CREATE POLICY tenant_isolation
ON platform.audit_log
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


-- ============================================================
-- SAFE CROSS-TENANT LOGIN HELPER
--
-- This is intentionally SECURITY DEFINER.
--
-- It only returns organizations belonging to the authenticated
-- Keycloak subject stored in transaction request context.
-- ============================================================

CREATE OR REPLACE FUNCTION identity.current_user_organizations()
RETURNS TABLE
(
    organization_id uuid,
    organization_name text,
    organization_slug text,
    membership_id uuid,
    role_codes text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, identity, platform
AS $$

    SELECT
        o.id,
        o.name,
        o.slug,
        m.id,

        COALESCE(
            array_agg(
                DISTINCT r.code
            ) FILTER (
                WHERE r.code IS NOT NULL
            ),
            ARRAY[]::text[]
        )

    FROM identity.users u

    JOIN identity.memberships m
      ON m.user_id = u.id
     AND m.status = 'ACTIVE'

    JOIN identity.organizations o
      ON o.id = m.tenant_id
     AND o.status = 'ACTIVE'

    LEFT JOIN identity.membership_roles mr
      ON mr.tenant_id = m.tenant_id
     AND mr.membership_id = m.id

    LEFT JOIN identity.roles r
      ON r.tenant_id = mr.tenant_id
     AND r.id = mr.role_id

    WHERE u.keycloak_subject =
          platform.current_subject()

    GROUP BY
        o.id,
        o.name,
        o.slug,
        m.id

    ORDER BY
        o.name;

$$;


REVOKE ALL
ON FUNCTION identity.current_user_organizations()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION identity.current_user_organizations()
TO platform_app;


-- ============================================================
-- RUNTIME PRIVILEGES
-- ============================================================

GRANT SELECT, INSERT, UPDATE
ON identity.users
TO platform_app;


GRANT SELECT, INSERT, UPDATE
ON identity.organizations,
   identity.memberships
TO platform_app;


GRANT SELECT, INSERT, UPDATE, DELETE
ON identity.roles,
   identity.role_permissions,
   identity.membership_roles
TO platform_app;


GRANT SELECT
ON identity.permissions
TO platform_app;


GRANT SELECT, INSERT, UPDATE, DELETE
ON platform.idempotency_keys
TO platform_app;


GRANT SELECT, INSERT, UPDATE
ON platform.outbox_events,
   platform.dead_letters
TO platform_app;


GRANT SELECT, INSERT
ON platform.audit_log
TO platform_app;


GRANT USAGE, SELECT
ON ALL SEQUENCES
IN SCHEMA platform
TO platform_app;


-- Explicitly make audit immutable to runtime.
REVOKE UPDATE, DELETE, TRUNCATE
ON platform.audit_log
FROM platform_app;


-- Runtime must not manage migration history.
REVOKE ALL
ON platform.schema_migrations
FROM platform_app;


COMMIT;
