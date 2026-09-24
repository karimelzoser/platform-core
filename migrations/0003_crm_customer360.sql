
-- ============================================================
-- CRM / CUSTOMER 360
--
-- Canonical customer identity lives here.
--
-- Provider-specific IDs must reference this model rather than
-- becoming separate Shopify / WhatsApp / Instagram customers.
-- ============================================================


-- ============================================================
-- CUSTOMERS
-- ============================================================

CREATE TABLE crm.customers
(
    id                      uuid PRIMARY KEY
                            DEFAULT gen_random_uuid(),

    tenant_id               uuid NOT NULL
                            REFERENCES identity.organizations(id),

    display_name            text,

    first_name              text,
    last_name               text,

    company_name            text,

    status                  text NOT NULL DEFAULT 'ACTIVE'
                            CHECK (
                                status IN (
                                    'ACTIVE',
                                    'BLOCKED',
                                    'ARCHIVED',
                                    'MERGED'
                                )
                            ),

    preferred_language      text,

    timezone                text,

    source                  text NOT NULL DEFAULT 'platform',

    merged_into_customer_id uuid,

    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    UNIQUE (tenant_id, id),

    FOREIGN KEY (
        tenant_id,
        merged_into_customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    ),

    CONSTRAINT customer_merge_state_valid
    CHECK (
        (
            status = 'MERGED'
            AND merged_into_customer_id IS NOT NULL
            AND merged_into_customer_id <> id
        )
        OR
        (
            status <> 'MERGED'
            AND merged_into_customer_id IS NULL
        )
    )
);


CREATE INDEX customers_tenant_status_idx
ON crm.customers(
    tenant_id,
    status,
    updated_at DESC
);


CREATE INDEX customers_tenant_name_idx
ON crm.customers(
    tenant_id,
    lower(display_name)
)
WHERE display_name IS NOT NULL;


CREATE TRIGGER customers_touch_updated_at
BEFORE UPDATE
ON crm.customers
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- CONTACT POINTS
--
-- Communication destinations belonging to customers.
--
-- A shared phone/email can exist on two customer records during
-- ambiguous identity resolution. Canonical ownership is handled
-- separately by identity_keys.
-- ============================================================

CREATE TABLE crm.contact_points
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL,

    customer_id         uuid NOT NULL,

    channel             text NOT NULL
                        CHECK (
                            channel IN (
                                'EMAIL',
                                'PHONE',
                                'WHATSAPP',
                                'INSTAGRAM',
                                'MESSENGER',
                                'TELEGRAM',
                                'OTHER'
                            )
                        ),

    value_original      text NOT NULL,

    normalized_value    text NOT NULL,

    label               text,

    is_primary          boolean NOT NULL DEFAULT false,
    is_verified         boolean NOT NULL DEFAULT false,

    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            status IN (
                                'ACTIVE',
                                'INVALID',
                                'UNSUBSCRIBED',
                                'REMOVED'
                            )
                        ),

    source              text NOT NULL DEFAULT 'platform',

    verified_at         timestamptz,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (
        tenant_id,
        customer_id,
        channel,
        normalized_value
    ),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE,

    CONSTRAINT contact_normalized_nonempty
    CHECK (
        length(trim(normalized_value)) > 0
    ),

    CONSTRAINT email_normalized_lowercase
    CHECK (
        channel <> 'EMAIL'
        OR normalized_value = lower(normalized_value)
    ),

    CONSTRAINT phone_normalized_e164
    CHECK (
        channel NOT IN ('PHONE', 'WHATSAPP')
        OR normalized_value ~ '^\+[1-9][0-9]{6,14}$'
    )
);


CREATE INDEX contact_points_customer_idx
ON crm.contact_points(
    tenant_id,
    customer_id,
    status
);


CREATE INDEX contact_points_lookup_idx
ON crm.contact_points(
    tenant_id,
    channel,
    normalized_value
)
WHERE status = 'ACTIVE';


CREATE UNIQUE INDEX contact_points_primary_channel_unique
ON crm.contact_points(
    tenant_id,
    customer_id,
    channel
)
WHERE
    is_primary = true
    AND status = 'ACTIVE';


CREATE TRIGGER contact_points_touch_updated_at
BEFORE UPDATE
ON crm.contact_points
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- CANONICAL IDENTITY KEYS
--
-- An ACTIVE key is the canonical identity-resolution claim.
--
-- Examples:
--   EMAIL     somebody@example.com
--   PHONE     +201xxxxxxxxx
--   WHATSAPP  +966xxxxxxxxx
--
-- If identity resolution becomes ambiguous, competing claims
-- can be stored as CONFLICT instead of ACTIVE.
-- ============================================================

CREATE TABLE crm.identity_keys
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL,

    customer_id         uuid NOT NULL,

    key_type            text NOT NULL
                        CHECK (
                            key_type IN (
                                'EMAIL',
                                'PHONE',
                                'WHATSAPP'
                            )
                        ),

    key_value           text NOT NULL,

    state               text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            state IN (
                                'ACTIVE',
                                'CONFLICT',
                                'REVOKED'
                            )
                        ),

    confidence          smallint NOT NULL DEFAULT 100
                        CHECK (
                            confidence BETWEEN 0 AND 100
                        ),

    verified            boolean NOT NULL DEFAULT false,

    source              text NOT NULL,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE,

    CONSTRAINT identity_key_nonempty
    CHECK (
        length(trim(key_value)) > 0
    ),

    CONSTRAINT identity_email_lowercase
    CHECK (
        key_type <> 'EMAIL'
        OR key_value = lower(key_value)
    ),

    CONSTRAINT identity_phone_e164
    CHECK (
        key_type NOT IN ('PHONE', 'WHATSAPP')
        OR key_value ~ '^\+[1-9][0-9]{6,14}$'
    )
);


CREATE UNIQUE INDEX identity_keys_active_unique
ON crm.identity_keys(
    tenant_id,
    key_type,
    key_value
)
WHERE state = 'ACTIVE';


CREATE INDEX identity_keys_customer_idx
ON crm.identity_keys(
    tenant_id,
    customer_id,
    state
);


CREATE TRIGGER identity_keys_touch_updated_at
BEFORE UPDATE
ON crm.identity_keys
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- EXTERNAL PROVIDER IDENTITIES
--
-- Maps canonical customers to Shopify, WooCommerce, Meta,
-- WhatsApp provider IDs, imported systems, etc.
--
-- account_ref distinguishes multiple stores/accounts connected
-- to one tenant.
-- ============================================================

CREATE TABLE crm.external_identities
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL,

    customer_id         uuid NOT NULL,

    provider            text NOT NULL,

    account_ref         text NOT NULL DEFAULT 'default',

    external_id         text NOT NULL,

    state               text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            state IN (
                                'ACTIVE',
                                'DISCONNECTED',
                                'REPLACED'
                            )
                        ),

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    first_seen_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE,

    CONSTRAINT provider_name_format
    CHECK (
        provider ~ '^[a-z0-9][a-z0-9_.-]{0,62}$'
    ),

    CONSTRAINT external_id_nonempty
    CHECK (
        length(trim(external_id)) > 0
    )
);


CREATE UNIQUE INDEX external_identities_active_unique
ON crm.external_identities(
    tenant_id,
    provider,
    account_ref,
    external_id
)
WHERE state = 'ACTIVE';


CREATE INDEX external_identities_customer_idx
ON crm.external_identities(
    tenant_id,
    customer_id,
    provider
);


CREATE TRIGGER external_identities_touch_updated_at
BEFORE UPDATE
ON crm.external_identities
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- CUSTOMER ADDRESSES
-- ============================================================

CREATE TABLE crm.addresses
(
    id                      uuid PRIMARY KEY
                            DEFAULT gen_random_uuid(),

    tenant_id               uuid NOT NULL,

    customer_id             uuid NOT NULL,

    label                   text,

    recipient_name          text,

    phone                   text,

    line1                   text NOT NULL,
    line2                   text,

    city                    text,
    district                text,
    state_region            text,
    postal_code             text,

    country_code            text
                            CHECK (
                                country_code IS NULL
                                OR country_code ~ '^[A-Z]{2}$'
                            ),

    latitude                numeric(9,6)
                            CHECK (
                                latitude IS NULL
                                OR latitude BETWEEN -90 AND 90
                            ),

    longitude               numeric(9,6)
                            CHECK (
                                longitude IS NULL
                                OR longitude BETWEEN -180 AND 180
                            ),

    is_default_shipping     boolean NOT NULL DEFAULT false,
    is_default_billing      boolean NOT NULL DEFAULT false,

    status                  text NOT NULL DEFAULT 'ACTIVE'
                            CHECK (
                                status IN (
                                    'ACTIVE',
                                    'INVALID',
                                    'ARCHIVED'
                                )
                            ),

    source                  text NOT NULL DEFAULT 'platform',

    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE
);


CREATE INDEX addresses_customer_idx
ON crm.addresses(
    tenant_id,
    customer_id,
    status
);


CREATE UNIQUE INDEX addresses_default_shipping_unique
ON crm.addresses(
    tenant_id,
    customer_id
)
WHERE
    is_default_shipping = true
    AND status = 'ACTIVE';


CREATE UNIQUE INDEX addresses_default_billing_unique
ON crm.addresses(
    tenant_id,
    customer_id
)
WHERE
    is_default_billing = true
    AND status = 'ACTIVE';


CREATE TRIGGER addresses_touch_updated_at
BEFORE UPDATE
ON crm.addresses
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- COMMUNICATION PREFERENCES
--
-- This does NOT replace provider consent records.
-- It is the normalized application-level decision state used
-- by campaigns, support and outbound automation.
-- ============================================================

CREATE TABLE crm.communication_preferences
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL,

    customer_id         uuid NOT NULL,

    channel             text NOT NULL
                        CHECK (
                            channel IN (
                                'EMAIL',
                                'SMS',
                                'WHATSAPP',
                                'MESSENGER',
                                'INSTAGRAM',
                                'PUSH'
                            )
                        ),

    status              text NOT NULL DEFAULT 'UNKNOWN'
                        CHECK (
                            status IN (
                                'UNKNOWN',
                                'OPTED_IN',
                                'OPTED_OUT'
                            )
                        ),

    source              text NOT NULL,

    captured_at         timestamptz,

    suppressed_until    timestamptz,

    reason              text,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (
        tenant_id,
        customer_id,
        channel
    ),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE
);


CREATE INDEX communication_preferences_status_idx
ON crm.communication_preferences(
    tenant_id,
    channel,
    status
);


CREATE TRIGGER communication_preferences_touch_updated_at
BEFORE UPDATE
ON crm.communication_preferences
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();



-- ============================================================
-- TAGS
-- ============================================================

CREATE TABLE crm.tags
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    name                text NOT NULL,

    description         text,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (
        tenant_id,
        id
    )
);


CREATE UNIQUE INDEX tags_name_unique_ci
ON crm.tags(
    tenant_id,
    lower(name)
);


CREATE TRIGGER tags_touch_updated_at
BEFORE UPDATE
ON crm.tags
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


CREATE TABLE crm.customer_tags
(
    tenant_id           uuid NOT NULL,

    customer_id         uuid NOT NULL,
    tag_id              uuid NOT NULL,

    assigned_by         uuid,

    source              text NOT NULL DEFAULT 'platform',

    created_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (
        tenant_id,
        customer_id,
        tag_id
    ),

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE,

    FOREIGN KEY (
        tenant_id,
        tag_id
    )
    REFERENCES crm.tags(
        tenant_id,
        id
    )
    ON DELETE CASCADE
);



-- ============================================================
-- SEGMENTS
-- ============================================================

CREATE TABLE crm.segments
(
    id                  uuid PRIMARY KEY
                        DEFAULT gen_random_uuid(),

    tenant_id           uuid NOT NULL
                        REFERENCES identity.organizations(id),

    name                text NOT NULL,

    description         text,

    mode                text NOT NULL DEFAULT 'DYNAMIC'
                        CHECK (
                            mode IN (
                                'STATIC',
                                'DYNAMIC'
                            )
                        ),

    status              text NOT NULL DEFAULT 'ACTIVE'
                        CHECK (
                            status IN (
                                'ACTIVE',
                                'PAUSED',
                                'ARCHIVED'
                            )
                        ),

    definition          jsonb NOT NULL DEFAULT '{}'::jsonb,

    last_evaluated_at   timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (
        tenant_id,
        id
    )
);


CREATE INDEX segments_tenant_status_idx
ON crm.segments(
    tenant_id,
    status
);


CREATE UNIQUE INDEX segments_name_unique_ci
ON crm.segments(
    tenant_id,
    lower(name)
);


CREATE TRIGGER segments_touch_updated_at
BEFORE UPDATE
ON crm.segments
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


CREATE TABLE crm.segment_memberships
(
    tenant_id           uuid NOT NULL,

    segment_id          uuid NOT NULL,
    customer_id         uuid NOT NULL,

    source              text NOT NULL
                        CHECK (
                            source IN (
                                'MANUAL',
                                'RULE',
                                'SYSTEM'
                            )
                        ),

    matched_at          timestamptz NOT NULL DEFAULT now(),

    expires_at          timestamptz,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    PRIMARY KEY (
        tenant_id,
        segment_id,
        customer_id
    ),

    FOREIGN KEY (
        tenant_id,
        segment_id
    )
    REFERENCES crm.segments(
        tenant_id,
        id
    )
    ON DELETE CASCADE,

    FOREIGN KEY (
        tenant_id,
        customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    )
    ON DELETE CASCADE
);


CREATE INDEX segment_memberships_customer_idx
ON crm.segment_memberships(
    tenant_id,
    customer_id
);



-- ============================================================
-- CUSTOMER MERGE HISTORY
--
-- Append-only evidence of identity reconciliation.
-- ============================================================

CREATE TABLE crm.customer_merge_history
(
    id                      uuid PRIMARY KEY
                            DEFAULT gen_random_uuid(),

    tenant_id               uuid NOT NULL,

    source_customer_id      uuid NOT NULL,
    target_customer_id      uuid NOT NULL,

    reason                  text NOT NULL,

    actor_id                uuid,

    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,

    merged_at               timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (
        tenant_id,
        source_customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    ),

    FOREIGN KEY (
        tenant_id,
        target_customer_id
    )
    REFERENCES crm.customers(
        tenant_id,
        id
    ),

    CONSTRAINT merge_customers_different
    CHECK (
        source_customer_id <> target_customer_id
    )
);


CREATE INDEX customer_merge_history_source_idx
ON crm.customer_merge_history(
    tenant_id,
    source_customer_id,
    merged_at DESC
);


CREATE INDEX customer_merge_history_target_idx
ON crm.customer_merge_history(
    tenant_id,
    target_customer_id,
    merged_at DESC
);



-- ============================================================
-- IDENTITY RESOLUTION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION crm.resolve_customer_by_identity(
    p_key_type text,
    p_key_value text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$

    SELECT ik.customer_id

    FROM crm.identity_keys ik

    JOIN crm.customers c
      ON c.tenant_id = ik.tenant_id
     AND c.id = ik.customer_id

    WHERE ik.tenant_id =
          platform.current_tenant_id()

      AND ik.key_type = upper(p_key_type)

      AND ik.key_value = p_key_value

      AND ik.state = 'ACTIVE'

      AND c.status = 'ACTIVE'

    LIMIT 1;

$$;


REVOKE ALL
ON FUNCTION crm.resolve_customer_by_identity(text,text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION crm.resolve_customer_by_identity(text,text)
TO platform_app;



CREATE OR REPLACE FUNCTION crm.resolve_customer_by_external_identity(
    p_provider text,
    p_account_ref text,
    p_external_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$

    SELECT ei.customer_id

    FROM crm.external_identities ei

    JOIN crm.customers c
      ON c.tenant_id = ei.tenant_id
     AND c.id = ei.customer_id

    WHERE ei.tenant_id =
          platform.current_tenant_id()

      AND ei.provider = lower(p_provider)

      AND ei.account_ref = p_account_ref

      AND ei.external_id = p_external_id

      AND ei.state = 'ACTIVE'

      AND c.status = 'ACTIVE'

    LIMIT 1;

$$;


REVOKE ALL
ON FUNCTION crm.resolve_customer_by_external_identity(text,text,text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION crm.resolve_customer_by_external_identity(text,text,text)
TO platform_app;



-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE crm.customers
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.customers
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.contact_points
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.contact_points
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.identity_keys
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.identity_keys
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.external_identities
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.external_identities
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.addresses
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.addresses
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.communication_preferences
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.communication_preferences
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.tags
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.tags
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.customer_tags
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.customer_tags
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.segments
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.segments
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.segment_memberships
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.segment_memberships
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);


ALTER TABLE crm.customer_merge_history
    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
ON crm.customer_merge_history
USING (
    tenant_id = platform.current_tenant_id()
)
WITH CHECK (
    tenant_id = platform.current_tenant_id()
);



-- ============================================================
-- RUNTIME PRIVILEGES
-- ============================================================

GRANT SELECT, INSERT, UPDATE
ON crm.customers,
   crm.contact_points,
   crm.identity_keys,
   crm.external_identities,
   crm.addresses,
   crm.communication_preferences
TO platform_app;


GRANT SELECT, INSERT, UPDATE, DELETE
ON crm.tags,
   crm.customer_tags,
   crm.segments,
   crm.segment_memberships
TO platform_app;


GRANT SELECT, INSERT
ON crm.customer_merge_history
TO platform_app;


-- Merge history must remain append-only.
REVOKE UPDATE, DELETE, TRUNCATE
ON crm.customer_merge_history
FROM platform_app;

