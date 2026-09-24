BEGIN;


-- ============================================================
-- GLOBAL ROLE TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS identity.role_templates
(
    code            text PRIMARY KEY,

    name            text NOT NULL,
    description     text NOT NULL,

    sort_order      integer NOT NULL DEFAULT 100,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS identity.role_template_permissions
(
    template_code       text NOT NULL
                        REFERENCES identity.role_templates(code)
                        ON DELETE CASCADE,

    permission_code     text NOT NULL
                        REFERENCES identity.permissions(code)
                        ON DELETE CASCADE,

    created_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (
        template_code,
        permission_code
    )
);


DROP TRIGGER IF EXISTS
    role_templates_touch_updated_at
ON identity.role_templates;

CREATE TRIGGER role_templates_touch_updated_at
BEFORE UPDATE ON identity.role_templates
FOR EACH ROW
EXECUTE FUNCTION platform.touch_updated_at();


-- ============================================================
-- PERMISSION CATALOG
-- ============================================================

INSERT INTO identity.permissions
(
    code,
    category,
    description,
    default_risk
)
VALUES

-- Organization / Identity
('organization.read',               'identity',      'View organization configuration',                         'LOW'),
('organization.update',             'identity',      'Update organization configuration',                       'MEDIUM'),
('organization.members.read',       'identity',      'View organization members',                               'LOW'),
('organization.members.invite',     'identity',      'Invite organization members',                             'MEDIUM'),
('organization.members.manage',     'identity',      'Suspend, remove, or modify members',                       'HIGH'),
('organization.roles.read',         'identity',      'View roles and permission assignments',                   'LOW'),
('organization.roles.manage',       'identity',      'Create and modify tenant roles',                           'HIGH'),

-- CRM
('crm.customers.read',              'crm',           'View customer records',                                   'LOW'),
('crm.customers.write',             'crm',           'Create and update customer records',                       'MEDIUM'),
('crm.customers.delete',            'crm',           'Delete customer records',                                  'HIGH'),
('crm.customers.export',            'crm',           'Export customer data',                                     'HIGH'),
('crm.tags.manage',                 'crm',           'Manage CRM tags',                                          'MEDIUM'),
('crm.segments.read',               'crm',           'View customer segments',                                   'LOW'),
('crm.segments.manage',             'crm',           'Create and modify customer segments',                      'MEDIUM'),

-- Messaging
('messaging.conversations.read',    'messaging',     'View conversations',                                       'LOW'),
('messaging.conversations.reply',   'messaging',     'Send conversation replies',                               'MEDIUM'),
('messaging.conversations.assign',  'messaging',     'Assign conversations',                                     'LOW'),
('messaging.conversations.handover','messaging',     'Change AI/human conversation ownership',                   'MEDIUM'),
('messaging.conversations.close',   'messaging',     'Close conversations',                                      'MEDIUM'),
('messaging.templates.read',        'messaging',     'View message templates',                                   'LOW'),
('messaging.templates.manage',      'messaging',     'Create or modify message templates',                       'MEDIUM'),

-- Tickets
('tickets.read',                    'tickets',       'View tickets',                                             'LOW'),
('tickets.create',                  'tickets',       'Create tickets',                                           'LOW'),
('tickets.update',                  'tickets',       'Update ticket content or status',                           'MEDIUM'),
('tickets.assign',                  'tickets',       'Assign tickets',                                           'LOW'),
('tickets.close',                   'tickets',       'Close tickets',                                            'MEDIUM'),
('tickets.sla.manage',              'tickets',       'Configure SLA policies',                                   'HIGH'),

-- Commerce
('commerce.orders.read',            'commerce',      'View orders',                                              'LOW'),
('commerce.orders.create',          'commerce',      'Create orders',                                            'MEDIUM'),
('commerce.orders.update',          'commerce',      'Modify order information',                                 'MEDIUM'),
('commerce.orders.confirm',         'commerce',      'Confirm customer orders',                                  'MEDIUM'),
('commerce.orders.cancel',          'commerce',      'Cancel orders',                                            'HIGH'),

('commerce.products.read',          'commerce',      'View products',                                            'LOW'),
('commerce.products.manage',        'commerce',      'Create or modify products',                                'MEDIUM'),

('commerce.inventory.read',         'commerce',      'View inventory',                                           'LOW'),
('commerce.inventory.manage',       'commerce',      'Modify inventory quantities or configuration',             'HIGH'),

('commerce.payments.read',          'commerce',      'View payment information',                                 'LOW'),
('commerce.refunds.issue',          'commerce',      'Issue customer refunds',                                   'CRITICAL'),

('commerce.fulfillments.read',      'commerce',      'View fulfillment information',                             'LOW'),
('commerce.fulfillments.manage',    'commerce',      'Create or modify fulfillments',                            'HIGH'),

-- Shipping
('shipping.shipments.read',         'shipping',      'View shipments',                                           'LOW'),
('shipping.shipments.create',       'shipping',      'Create shipments',                                         'MEDIUM'),
('shipping.shipments.update',       'shipping',      'Update shipment information',                              'MEDIUM'),
('shipping.shipments.cancel',       'shipping',      'Cancel shipments',                                         'HIGH'),
('shipping.zones.manage',           'shipping',      'Configure shipping zones and mappings',                    'HIGH'),
('shipping.delivery_rescue.execute','shipping',      'Execute delivery rescue operations',                       'HIGH'),

-- Returns
('returns.read',                    'returns',       'View returns and exchanges',                               'LOW'),
('returns.create',                  'returns',       'Create return or exchange requests',                        'MEDIUM'),
('returns.approve',                 'returns',       'Approve returns or exchanges',                              'HIGH'),
('returns.manage',                  'returns',       'Modify return workflow configuration',                      'HIGH'),

-- Recovery
('recovery.read',                   'recovery',      'View recovery opportunities and results',                  'LOW'),
('recovery.execute',                'recovery',      'Execute customer recovery actions',                         'MEDIUM'),
('recovery.manage',                 'recovery',      'Configure recovery policies',                              'HIGH'),

-- Sales
('sales.leads.read',                'sales',         'View leads',                                                'LOW'),
('sales.leads.create',              'sales',         'Create leads',                                              'LOW'),
('sales.leads.update',              'sales',         'Update leads',                                              'MEDIUM'),
('sales.leads.assign',              'sales',         'Assign leads',                                              'LOW'),
('sales.pipelines.read',            'sales',         'View sales pipelines',                                     'LOW'),
('sales.pipelines.manage',          'sales',         'Configure sales pipelines',                                'MEDIUM'),
('sales.opportunities.read',        'sales',         'View opportunities',                                       'LOW'),
('sales.opportunities.manage',      'sales',         'Create or modify opportunities',                           'MEDIUM'),

-- Campaigns
('campaigns.read',                  'campaigns',     'View campaigns',                                            'LOW'),
('campaigns.create',                'campaigns',     'Create campaigns',                                          'MEDIUM'),
('campaigns.update',                'campaigns',     'Modify campaign configuration',                             'MEDIUM'),
('campaigns.send',                  'campaigns',     'Launch customer-facing campaigns',                         'HIGH'),
('campaigns.stop',                  'campaigns',     'Stop running campaigns',                                    'HIGH'),
('campaigns.audiences.manage',      'campaigns',     'Create and modify campaign audiences',                     'MEDIUM'),

-- Integrations
('integrations.read',               'integrations',  'View integrations and connection health',                  'LOW'),
('integrations.manage',             'integrations',  'Connect, disconnect, or configure integrations',           'HIGH'),
('integrations.webhooks.manage',    'integrations',  'Manage webhook registrations',                             'HIGH'),
('integrations.sync.execute',       'integrations',  'Run integration synchronization',                          'MEDIUM'),
('integrations.secrets.rotate',     'integrations',  'Rotate provider credentials and secrets',                  'CRITICAL'),

-- Automation
('automation.workflows.read',       'automation',    'View automation definitions',                              'LOW'),
('automation.workflows.create',     'automation',    'Create automation definitions',                            'MEDIUM'),
('automation.workflows.update',     'automation',    'Modify automation definitions',                            'MEDIUM'),
('automation.workflows.publish',    'automation',    'Publish automation definitions to production',             'HIGH'),
('automation.workflows.execute',    'automation',    'Execute automation workflows',                             'MEDIUM'),
('automation.runs.read',            'automation',    'View automation runs',                                     'LOW'),
('automation.runs.cancel',          'automation',    'Cancel automation runs',                                   'HIGH'),

-- AI
('ai.operators.read',               'ai',            'View AI operator configuration and activity',              'LOW'),
('ai.operators.run',                'ai',            'Invoke AI operators',                                       'MEDIUM'),
('ai.operators.manage',             'ai',            'Configure AI operators',                                    'HIGH'),
('ai.tools.read',                   'ai',            'View AI tool definitions',                                  'LOW'),
('ai.tools.manage',                 'ai',            'Configure AI tool access',                                  'HIGH'),

-- Policy / Approval
('policy.approvals.read',           'policy',        'View approval requests',                                    'LOW'),
('policy.approvals.decide',         'policy',        'Approve or reject protected operations',                    'HIGH'),
('policy.rules.read',               'policy',        'View authorization and business policies',                  'LOW'),
('policy.rules.manage',             'policy',        'Modify authorization and business policies',                'CRITICAL'),

-- Knowledge
('knowledge.read',                  'knowledge',     'Read knowledge-base content',                               'LOW'),
('knowledge.write',                 'knowledge',     'Create and update knowledge-base content',                  'MEDIUM'),
('knowledge.manage',                'knowledge',     'Configure knowledge sources and indexing',                  'HIGH'),

-- Custom Data
('custom_data.tables.read',         'custom_data',   'View custom tables',                                        'LOW'),
('custom_data.tables.write',        'custom_data',   'Create and update custom table records',                    'MEDIUM'),
('custom_data.schema.manage',       'custom_data',   'Create or modify custom table schemas',                     'HIGH'),

-- Billing
('billing.read',                    'billing',       'View subscription, usage, and billing information',         'LOW'),
('billing.manage',                  'billing',       'Change plans and billing configuration',                    'CRITICAL'),

-- Audit
('audit.read',                      'audit',         'View audit history',                                        'LOW'),
('audit.export',                    'audit',         'Export audit history',                                      'HIGH'),

-- Analytics
('analytics.read',                  'analytics',     'View business and operational analytics',                   'LOW'),
('analytics.export',                'analytics',     'Export analytics data',                                     'MEDIUM'),

-- Developer
('developer.api_keys.read',         'developer',     'View API key metadata',                                     'LOW'),
('developer.api_keys.manage',       'developer',     'Create, rotate, or revoke API keys',                        'CRITICAL'),
('developer.webhooks.read',         'developer',     'View outbound webhook configuration',                       'LOW'),
('developer.webhooks.manage',       'developer',     'Create or modify outbound webhooks',                        'HIGH'),

-- Administration
('admin.settings.read',             'admin',         'View tenant-level platform settings',                       'LOW'),
('admin.settings.manage',           'admin',         'Modify tenant-level platform settings',                     'HIGH')

ON CONFLICT (code)
DO UPDATE SET
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    default_risk = EXCLUDED.default_risk;


-- ============================================================
-- DEFAULT ROLE TEMPLATES
-- ============================================================

INSERT INTO identity.role_templates
(
    code,
    name,
    description,
    sort_order
)
VALUES
(
    'owner',
    'Owner',
    'Full tenant control including billing and critical administrative operations.',
    10
),
(
    'admin',
    'Administrator',
    'Broad tenant administration excluding ownership-only billing control.',
    20
),
(
    'manager',
    'Manager',
    'Operational management with approval authority but restricted infrastructure administration.',
    30
),
(
    'agent',
    'Agent',
    'Customer support, sales, order, recovery, and daily operational work.',
    40
),
(
    'viewer',
    'Viewer',
    'Read-only operational and analytics access.',
    50
)

ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;


-- Rebuild mappings deterministically.
DELETE FROM identity.role_template_permissions;


-- OWNER: every permission.
INSERT INTO identity.role_template_permissions
(
    template_code,
    permission_code
)
SELECT
    'owner',
    code
FROM identity.permissions;


-- ADMIN: everything except ownership-only billing changes.
INSERT INTO identity.role_template_permissions
(
    template_code,
    permission_code
)
SELECT
    'admin',
    code
FROM identity.permissions
WHERE code <> 'billing.manage';


-- MANAGER:
-- broad business operations but not tenant-security,
-- provider-secret, billing, developer-key or policy-rule administration.
INSERT INTO identity.role_template_permissions
(
    template_code,
    permission_code
)
SELECT
    'manager',
    code
FROM identity.permissions
WHERE code NOT IN
(
    'organization.members.manage',
    'organization.roles.manage',

    'integrations.manage',
    'integrations.webhooks.manage',
    'integrations.secrets.rotate',

    'automation.workflows.publish',

    'ai.operators.manage',
    'ai.tools.manage',

    'policy.rules.manage',

    'knowledge.manage',
    'custom_data.schema.manage',

    'billing.manage',

    'audit.export',

    'developer.api_keys.manage',
    'developer.webhooks.manage',

    'admin.settings.manage'
);


-- AGENT:
-- day-to-day support / commerce / sales execution.
INSERT INTO identity.role_template_permissions
(
    template_code,
    permission_code
)
SELECT
    'agent',
    code
FROM identity.permissions
WHERE code IN
(
    'organization.read',
    'organization.members.read',

    'crm.customers.read',
    'crm.customers.write',
    'crm.tags.manage',
    'crm.segments.read',

    'messaging.conversations.read',
    'messaging.conversations.reply',
    'messaging.conversations.assign',
    'messaging.conversations.handover',
    'messaging.conversations.close',
    'messaging.templates.read',

    'tickets.read',
    'tickets.create',
    'tickets.update',
    'tickets.assign',
    'tickets.close',

    'commerce.orders.read',
    'commerce.orders.update',
    'commerce.orders.confirm',
    'commerce.products.read',
    'commerce.inventory.read',
    'commerce.payments.read',
    'commerce.fulfillments.read',

    'shipping.shipments.read',
    'shipping.shipments.create',
    'shipping.shipments.update',

    'returns.read',
    'returns.create',

    'recovery.read',
    'recovery.execute',

    'sales.leads.read',
    'sales.leads.create',
    'sales.leads.update',
    'sales.leads.assign',
    'sales.pipelines.read',
    'sales.opportunities.read',
    'sales.opportunities.manage',

    'campaigns.read',

    'automation.workflows.read',
    'automation.workflows.execute',
    'automation.runs.read',

    'ai.operators.read',
    'ai.operators.run',
    'ai.tools.read',

    'knowledge.read',

    'custom_data.tables.read',
    'custom_data.tables.write',

    'analytics.read'
);


-- VIEWER:
-- read-only permissions only.
INSERT INTO identity.role_template_permissions
(
    template_code,
    permission_code
)
SELECT
    'viewer',
    code
FROM identity.permissions
WHERE
       code LIKE '%.read'
    OR code = 'organization.read'
    OR code = 'organization.members.read'
    OR code = 'organization.roles.read';


-- ============================================================
-- PROTECT BUILT-IN SYSTEM ROLES
--
-- Runtime may assign these roles but may not mutate their
-- definition or permission set.
-- ============================================================

CREATE OR REPLACE FUNCTION identity.protect_system_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    IF current_user <> 'platform_app' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;


    IF TG_OP = 'INSERT' THEN

        IF NEW.is_system THEN
            RAISE EXCEPTION
                'platform_app cannot create system roles';
        END IF;

        RETURN NEW;

    END IF;


    IF TG_OP = 'UPDATE' THEN

        IF OLD.is_system OR NEW.is_system THEN
            RAISE EXCEPTION
                'system roles cannot be modified by platform_app';
        END IF;

        RETURN NEW;

    END IF;


    IF TG_OP = 'DELETE' THEN

        IF OLD.is_system THEN
            RAISE EXCEPTION
                'system roles cannot be deleted by platform_app';
        END IF;

        RETURN OLD;

    END IF;


    RETURN COALESCE(NEW, OLD);

END;
$$;


DROP TRIGGER IF EXISTS
    protect_system_role
ON identity.roles;

CREATE TRIGGER protect_system_role
BEFORE INSERT OR UPDATE OR DELETE
ON identity.roles
FOR EACH ROW
EXECUTE FUNCTION identity.protect_system_role();


CREATE OR REPLACE FUNCTION identity.protect_system_role_permission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_id uuid;
    v_tenant_id uuid;
    v_is_system boolean;
BEGIN

    IF current_user <> 'platform_app' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;


    IF TG_OP = 'DELETE' THEN
        v_role_id := OLD.role_id;
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_role_id := NEW.role_id;
        v_tenant_id := NEW.tenant_id;
    END IF;


    SELECT is_system
    INTO v_is_system
    FROM identity.roles
    WHERE tenant_id = v_tenant_id
      AND id = v_role_id;


    IF COALESCE(v_is_system, false) THEN
        RAISE EXCEPTION
            'permissions of system roles cannot be modified by platform_app';
    END IF;


    RETURN COALESCE(NEW, OLD);

END;
$$;


DROP TRIGGER IF EXISTS
    protect_system_role_permission
ON identity.role_permissions;

CREATE TRIGGER protect_system_role_permission
BEFORE INSERT OR UPDATE OR DELETE
ON identity.role_permissions
FOR EACH ROW
EXECUTE FUNCTION identity.protect_system_role_permission();


-- ============================================================
-- BOOTSTRAP BUILT-IN TENANT ROLES
--
-- SECURITY DEFINER is intentional:
-- role creation needs to cross RLS during organization setup.
--
-- The function still requires the caller's active tenant
-- context to match p_tenant_id.
-- ============================================================

CREATE OR REPLACE FUNCTION identity.bootstrap_default_roles(
    p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, identity, platform
AS $$
DECLARE

    v_template record;
    v_role_id uuid;

BEGIN

    IF platform.current_tenant_id() IS NULL THEN
        RAISE EXCEPTION
            'tenant context is required';
    END IF;


    IF platform.current_tenant_id() <> p_tenant_id THEN
        RAISE EXCEPTION
            'cannot bootstrap roles for another tenant';
    END IF;


    IF NOT EXISTS
    (
        SELECT 1
        FROM identity.organizations
        WHERE id = p_tenant_id
    ) THEN

        RAISE EXCEPTION
            'organization does not exist';

    END IF;


    FOR v_template IN

        SELECT
            code,
            name,
            description

        FROM identity.role_templates

        ORDER BY sort_order, code

    LOOP

        INSERT INTO identity.roles
        (
            tenant_id,
            code,
            name,
            description,
            is_system
        )
        VALUES
        (
            p_tenant_id,
            v_template.code,
            v_template.name,
            v_template.description,
            true
        )

        ON CONFLICT (tenant_id, code)

        DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_system = true

        RETURNING id
        INTO v_role_id;


        DELETE FROM identity.role_permissions
        WHERE tenant_id = p_tenant_id
          AND role_id = v_role_id;


        INSERT INTO identity.role_permissions
        (
            tenant_id,
            role_id,
            permission_code
        )

        SELECT
            p_tenant_id,
            v_role_id,
            rtp.permission_code

        FROM identity.role_template_permissions rtp

        WHERE rtp.template_code = v_template.code;

    END LOOP;

END;
$$;


REVOKE ALL
ON FUNCTION identity.bootstrap_default_roles(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION identity.bootstrap_default_roles(uuid)
TO platform_app;


-- ============================================================
-- EFFECTIVE PERMISSIONS
--
-- This is the normal authorization projection for the API.
--
-- Keycloak identifies the subject.
-- PostgreSQL resolves tenant membership + roles.
-- OPA receives these permissions + risk classification.
-- ============================================================

CREATE OR REPLACE FUNCTION identity.current_effective_permissions()
RETURNS TABLE
(
    permission_code text,
    default_risk text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$

    SELECT DISTINCT
        p.code,
        p.default_risk

    FROM identity.users u

    JOIN identity.memberships m
      ON m.user_id = u.id
     AND m.tenant_id = platform.current_tenant_id()
     AND m.status = 'ACTIVE'

    JOIN identity.membership_roles mr
      ON mr.tenant_id = m.tenant_id
     AND mr.membership_id = m.id

    JOIN identity.roles r
      ON r.tenant_id = mr.tenant_id
     AND r.id = mr.role_id

    JOIN identity.role_permissions rp
      ON rp.tenant_id = r.tenant_id
     AND rp.role_id = r.id

    JOIN identity.permissions p
      ON p.code = rp.permission_code

    WHERE u.keycloak_subject =
          platform.current_subject()

    ORDER BY p.code;

$$;


REVOKE ALL
ON FUNCTION identity.current_effective_permissions()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION identity.current_effective_permissions()
TO platform_app;


CREATE OR REPLACE FUNCTION identity.current_effective_permission_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$

    SELECT COALESCE(
        array_agg(
            permission_code
            ORDER BY permission_code
        ),
        ARRAY[]::text[]
    )

    FROM identity.current_effective_permissions();

$$;


REVOKE ALL
ON FUNCTION identity.current_effective_permission_codes()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION identity.current_effective_permission_codes()
TO platform_app;


-- ============================================================
-- RUNTIME GRANTS
-- ============================================================

GRANT SELECT
ON identity.role_templates,
   identity.role_template_permissions
TO platform_app;


COMMIT;
