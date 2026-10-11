-- Canonical abandoned-order recovery domain.
-- Recovery reuses canonical Commerce orders/customers, CRM suppression state, and Messaging dispatch.
-- It never calls a provider inline. Long-running execution is represented by deterministic
-- Temporal workflow IDs and domain events; Temporal platform closure wires the durable workers.

BEGIN;

CREATE SCHEMA IF NOT EXISTS recovery;
GRANT USAGE ON SCHEMA recovery TO platform_app;

-- Recovery attempts reuse the tenant-qualified message key introduced by 0018.
-- Do not recreate that historical constraint or its backing index here.

CREATE TABLE recovery.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  store_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  abandonment_delay_minutes integer NOT NULL DEFAULT 60
    CHECK (abandonment_delay_minutes BETWEEN 1 AND 43200),
  opportunity_ttl_hours integer NOT NULL DEFAULT 72 CHECK (opportunity_ttl_hours BETWEEN 1 AND 2160),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  cooldown_minutes integer NOT NULL DEFAULT 240 CHECK (cooldown_minutes BETWEEN 1 AND 43200),
  attribution_window_hours integer NOT NULL DEFAULT 168
    CHECK (attribution_window_hours BETWEEN 1 AND 2160),
  channels text[] NOT NULL DEFAULT ARRAY['WHATSAPP','EMAIL']::text[]
    CHECK (cardinality(channels) BETWEEN 1 AND 4)
    CHECK (channels <@ ARRAY['EMAIL','WHATSAPP','MESSENGER','INSTAGRAM']::text[]),
  max_offer_percent_basis_points integer NOT NULL DEFAULT 0
    CHECK (max_offer_percent_basis_points BETWEEN 0 AND 10000),
  max_offer_amount_minor bigint NOT NULL DEFAULT 0 CHECK (max_offer_amount_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES commerce.stores(tenant_id, id)
);
CREATE UNIQUE INDEX recovery_active_policy_per_store_idx
  ON recovery.policies (tenant_id, store_id) WHERE status = 'ACTIVE';
CREATE TRIGGER recovery_policies_touch_updated_at
  BEFORE UPDATE ON recovery.policies FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE recovery.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  source_order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN (
    'ELIGIBLE', 'ACTIVE', 'SUPPRESSED', 'EXPIRED', 'RECOVERED', 'CANCELLED'
  )),
  potential_value_minor bigint NOT NULL CHECK (potential_value_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  detected_at timestamptz NOT NULL DEFAULT now(),
  eligible_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  suppression_code text CHECK (
    suppression_code IS NULL OR suppression_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
  ),
  suppression_reason text CHECK (suppression_reason IS NULL OR length(suppression_reason) <= 2000),
  temporal_workflow_id text NOT NULL CHECK (length(temporal_workflow_id) BETWEEN 1 AND 500),
  recovered_order_id uuid,
  attributed_attempt_id uuid,
  recovered_at timestamptz,
  recovered_value_minor bigint CHECK (recovered_value_minor IS NULL OR recovered_value_minor >= 0),
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, source_order_id),
  UNIQUE (tenant_id, temporal_workflow_id),
  FOREIGN KEY (tenant_id, store_id, source_order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, policy_id) REFERENCES recovery.policies(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, recovered_order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK (expires_at > eligible_at),
  CHECK (status <> 'SUPPRESSED' OR suppression_code IS NOT NULL),
  CHECK (status <> 'EXPIRED' OR expires_at <= updated_at),
  CHECK (status <> 'RECOVERED' OR (
    recovered_order_id IS NOT NULL AND recovered_at IS NOT NULL AND recovered_value_minor IS NOT NULL
  )),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);
CREATE INDEX recovery_opportunities_state_idx
  ON recovery.opportunities (tenant_id, store_id, status, eligible_at, expires_at);
CREATE INDEX recovery_opportunities_customer_idx
  ON recovery.opportunities (tenant_id, customer_id, detected_at DESC, id DESC);
CREATE TRIGGER recovery_opportunities_touch_updated_at
  BEFORE UPDATE ON recovery.opportunities FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE recovery.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  offer_type text NOT NULL CHECK (offer_type IN ('PERCENT', 'FIXED', 'FREE_SHIPPING')),
  percent_basis_points integer CHECK (percent_basis_points IS NULL OR percent_basis_points BETWEEN 1 AND 10000),
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  code text CHECK (code IS NULL OR length(trim(code)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REDEEMED', 'CANCELLED')),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, opportunity_id)
    REFERENCES recovery.opportunities(tenant_id, store_id, id) ON DELETE CASCADE,
  CHECK (
    (offer_type = 'PERCENT' AND percent_basis_points IS NOT NULL AND amount_minor IS NULL AND currency IS NULL)
    OR (offer_type = 'FIXED' AND amount_minor IS NOT NULL AND currency IS NOT NULL AND percent_basis_points IS NULL)
    OR (offer_type = 'FREE_SHIPPING' AND percent_basis_points IS NULL AND amount_minor IS NULL AND currency IS NULL)
  ),
  CHECK (status <> 'REDEEMED' OR redeemed_at IS NOT NULL)
);
CREATE INDEX recovery_offers_opportunity_idx
  ON recovery.offers (tenant_id, opportunity_id, status, expires_at DESC);
CREATE TRIGGER recovery_offers_touch_updated_at
  BEFORE UPDATE ON recovery.offers FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE recovery.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','MESSENGER','INSTAGRAM')),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN (
    'RESERVED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED'
  )),
  conversation_id uuid NOT NULL,
  message_id uuid,
  offer_id uuid,
  body_snapshot text NOT NULL CHECK (length(body_snapshot) BETWEEN 1 AND 20000),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, opportunity_id, sequence),
  UNIQUE (tenant_id, message_id),
  FOREIGN KEY (tenant_id, store_id, opportunity_id)
    REFERENCES recovery.opportunities(tenant_id, store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES messaging.conversations(tenant_id, id),
  FOREIGN KEY (tenant_id, message_id)
    REFERENCES messaging.messages(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, offer_id)
    REFERENCES recovery.offers(tenant_id, store_id, id),
  CHECK (status NOT IN ('QUEUED','SENT','DELIVERED') OR message_id IS NOT NULL),
  CHECK (status <> 'QUEUED' OR queued_at IS NOT NULL),
  CHECK (status <> 'SENT' OR sent_at IS NOT NULL),
  CHECK (status <> 'DELIVERED' OR delivered_at IS NOT NULL),
  CHECK (status <> 'FAILED' OR failed_at IS NOT NULL)
);
ALTER TABLE recovery.opportunities
  ADD CONSTRAINT recovery_opportunities_attributed_attempt_fk
  FOREIGN KEY (tenant_id, attributed_attempt_id) REFERENCES recovery.attempts(tenant_id, id);
CREATE INDEX recovery_attempts_opportunity_idx
  ON recovery.attempts (tenant_id, opportunity_id, sequence DESC);
CREATE INDEX recovery_attempts_delivery_idx
  ON recovery.attempts (tenant_id, status, updated_at DESC);
CREATE TRIGGER recovery_attempts_touch_updated_at
  BEFORE UPDATE ON recovery.attempts FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE recovery.timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM'
    CHECK (actor_type IN ('USER','AI','SYSTEM','SERVICE','INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, opportunity_id)
    REFERENCES recovery.opportunities(tenant_id, store_id, id) ON DELETE CASCADE
);
CREATE INDEX recovery_timeline_opportunity_idx
  ON recovery.timeline (tenant_id, opportunity_id, occurred_at, id);

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'recovery.policies', 'recovery.opportunities', 'recovery.offers',
    'recovery.attempts', 'recovery.timeline'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id())',
      target
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON
  recovery.policies,
  recovery.opportunities,
  recovery.offers,
  recovery.attempts
TO platform_app;
GRANT SELECT, INSERT ON recovery.timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA recovery FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON recovery.timeline FROM platform_app;

-- The permission catalog predates this module. Backfill recovery permissions into
-- instantiated system roles without granting anything to custom roles.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code IN ('recovery.read','recovery.execute','recovery.manage')
ON CONFLICT DO NOTHING;

COMMIT;
