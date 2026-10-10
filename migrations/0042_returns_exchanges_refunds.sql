-- Canonical returns / exchanges / refunds domain.
-- Financial/provider side effects are never executed inline. Refund provider work is
-- represented by integrations.provider_actions after the canonical refund is approved.

BEGIN;

CREATE SCHEMA IF NOT EXISTS returns;
GRANT USAGE ON SCHEMA returns TO platform_app;

CREATE TABLE returns.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  store_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  return_window_days integer NOT NULL DEFAULT 14 CHECK (return_window_days BETWEEN 0 AND 365),
  require_inspection boolean NOT NULL DEFAULT true,
  allow_exchange boolean NOT NULL DEFAULT true,
  allow_store_credit boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES commerce.stores(tenant_id, id)
);
CREATE UNIQUE INDEX returns_active_policy_per_store_idx
  ON returns.policies (tenant_id, store_id) WHERE status = 'ACTIVE';
CREATE TRIGGER returns_policies_touch_updated_at
  BEFORE UPDATE ON returns.policies FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid,
  policy_id uuid,
  kind text NOT NULL CHECK (kind IN ('RETURN', 'EXCHANGE')),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED',
    'INSPECTING', 'RESOLVED', 'CANCELLED'
  )),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  customer_note text CHECK (customer_note IS NULL OR length(customer_note) <= 4000),
  internal_note text CHECK (internal_note IS NULL OR length(internal_note) <= 10000),
  requested_by_actor_type text NOT NULL DEFAULT 'USER'
    CHECK (requested_by_actor_type IN ('USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  requested_by_actor_id uuid,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  rejected_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  received_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  temporal_workflow_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, policy_id) REFERENCES returns.policies(tenant_id, store_id, id),
  CHECK ((status = 'APPROVED') = (approved_at IS NOT NULL) OR status NOT IN ('APPROVED')),
  CHECK ((status = 'REJECTED') = (rejected_at IS NOT NULL) OR status NOT IN ('REJECTED')),
  CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);
CREATE INDEX returns_requests_order_idx
  ON returns.requests (tenant_id, order_id, created_at DESC, id DESC);
CREATE INDEX returns_requests_state_idx
  ON returns.requests (tenant_id, store_id, status, updated_at DESC);
CREATE INDEX returns_requests_customer_idx
  ON returns.requests (tenant_id, customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE TRIGGER returns_requests_touch_updated_at
  BEFORE UPDATE ON returns.requests FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  request_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  accepted_quantity integer NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  inspection_status text NOT NULL DEFAULT 'PENDING'
    CHECK (inspection_status IN ('PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED')),
  condition_code text CHECK (condition_code IS NULL OR condition_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  restock_disposition text NOT NULL DEFAULT 'PENDING' CHECK (restock_disposition IN (
    'PENDING', 'RESTOCK', 'QUARANTINE', 'DISCARD', 'RETURN_TO_VENDOR'
  )),
  eligible_refund_minor bigint NOT NULL DEFAULT 0 CHECK (eligible_refund_minor >= 0),
  exchange_variant_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, request_id, order_line_id),
  FOREIGN KEY (tenant_id, store_id, request_id) REFERENCES returns.requests(tenant_id, store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, store_id, order_line_id) REFERENCES commerce.order_lines(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, exchange_variant_id) REFERENCES commerce.variants(tenant_id, store_id, id),
  CHECK (received_quantity <= requested_quantity),
  CHECK (accepted_quantity <= received_quantity),
  CHECK (exchange_variant_id IS NULL OR accepted_quantity > 0)
);
CREATE INDEX returns_request_lines_request_idx
  ON returns.request_lines (tenant_id, request_id, created_at, id);
CREATE TRIGGER returns_request_lines_touch_updated_at
  BEFORE UPDATE ON returns.request_lines FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  return_request_id uuid,
  source_payment_id uuid,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'APPROVED', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
  )),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 4000),
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  provider_action_id uuid,
  provider_reference text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  queued_at timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, provider_action_id),
  FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, return_request_id) REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, source_payment_id) REFERENCES commerce.payments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, provider_action_id) REFERENCES integrations.provider_actions(tenant_id, id),
  CHECK (status NOT IN ('APPROVED', 'QUEUED', 'PROCESSING', 'SUCCEEDED') OR approved_at IS NOT NULL),
  CHECK (status <> 'QUEUED' OR (provider_action_id IS NOT NULL AND queued_at IS NOT NULL)),
  CHECK (status <> 'SUCCEEDED' OR processed_at IS NOT NULL),
  CHECK (status <> 'FAILED' OR failed_at IS NOT NULL)
);
CREATE INDEX returns_refunds_order_idx
  ON returns.refunds (tenant_id, order_id, created_at DESC, id DESC);
CREATE INDEX returns_refunds_state_idx
  ON returns.refunds (tenant_id, status, updated_at DESC);
CREATE TRIGGER returns_refunds_touch_updated_at
  BEFORE UPDATE ON returns.refunds FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_request_id uuid NOT NULL,
  original_order_id uuid NOT NULL,
  replacement_order_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'APPROVED', 'QUEUED', 'FULFILLED', 'FAILED', 'CANCELLED'
  )),
  price_adjustment_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, return_request_id),
  FOREIGN KEY (tenant_id, store_id, return_request_id) REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, original_order_id) REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, replacement_order_id) REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK (status NOT IN ('APPROVED', 'QUEUED', 'FULFILLED') OR approved_at IS NOT NULL),
  CHECK (status <> 'FULFILLED' OR (replacement_order_id IS NOT NULL AND fulfilled_at IS NOT NULL))
);
CREATE INDEX returns_exchanges_state_idx
  ON returns.exchanges (tenant_id, store_id, status, updated_at DESC);
CREATE TRIGGER returns_exchanges_touch_updated_at
  BEFORE UPDATE ON returns.exchanges FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  request_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM'
    CHECK (actor_type IN ('USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, request_id) REFERENCES returns.requests(tenant_id, store_id, id)
);
CREATE INDEX returns_timeline_request_idx
  ON returns.timeline (tenant_id, request_id, occurred_at, id);

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'returns.policies', 'returns.requests', 'returns.request_lines',
    'returns.refunds', 'returns.exchanges', 'returns.timeline'
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
  returns.policies,
  returns.requests,
  returns.request_lines,
  returns.refunds,
  returns.exchanges
TO platform_app;
GRANT SELECT, INSERT ON returns.timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA returns FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON returns.timeline FROM platform_app;

-- Existing authorization catalog already defines returns.* and commerce.refunds.issue.
-- Backfill those template permissions into system roles already instantiated before
-- this domain existed, while preserving custom-role immutability.
INSERT INTO identity.role_permissions (tenant_id, role_id, permission_code)
SELECT role.tenant_id, role.id, template_permission.permission_code
FROM identity.roles role
JOIN identity.role_template_permissions template_permission
  ON template_permission.template_code = role.code
WHERE role.is_system = true
  AND template_permission.permission_code IN (
    'returns.read', 'returns.create', 'returns.approve', 'returns.manage', 'commerce.refunds.issue'
  )
ON CONFLICT DO NOTHING;

COMMIT;
