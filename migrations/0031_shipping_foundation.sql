-- Provider-neutral shipping domain. Canonical shipment, tracking, delivery-attempt,
-- and rescue state lives in PostgreSQL; carrier network side effects continue
-- through integrations.provider_actions only after the domain transaction commits.

BEGIN;

CREATE SCHEMA IF NOT EXISTS shipping;
GRANT USAGE ON SCHEMA shipping TO platform_app;

-- Relationship key used by Shipping to prove that a fulfillment belongs to the
-- same tenant/store/order as its shipment.
ALTER TABLE commerce.fulfillments
  ADD CONSTRAINT commerce_fulfillments_order_identity_unique
    UNIQUE (tenant_id, store_id, order_id, id);

CREATE TABLE shipping.carrier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  connection_id uuid,
  carrier_key text NOT NULL
    CHECK (carrier_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  account_label text NOT NULL
    CHECK (length(trim(account_label)) BETWEEN 1 AND 300),
  display_name text NOT NULL
    CHECK (length(trim(display_name)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id)
);
CREATE UNIQUE INDEX shipping_carrier_accounts_label_unique_ci
  ON shipping.carrier_accounts (tenant_id, lower(account_label))
  WHERE status <> 'ARCHIVED';
CREATE UNIQUE INDEX shipping_carrier_accounts_connection_unique
  ON shipping.carrier_accounts (tenant_id, connection_id)
  WHERE connection_id IS NOT NULL AND status <> 'ARCHIVED';
CREATE INDEX shipping_carrier_accounts_status_idx
  ON shipping.carrier_accounts (tenant_id, status, carrier_key, updated_at DESC);
CREATE TRIGGER shipping_carrier_accounts_touch_updated_at
  BEFORE UPDATE ON shipping.carrier_accounts
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.carrier_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  carrier_account_id uuid NOT NULL,
  service_code text NOT NULL
    CHECK (length(trim(service_code)) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
  domestic boolean NOT NULL DEFAULT true,
  international boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, carrier_account_id, id),
  UNIQUE (tenant_id, carrier_account_id, service_code),
  FOREIGN KEY (tenant_id, carrier_account_id)
    REFERENCES shipping.carrier_accounts(tenant_id, id)
);
CREATE INDEX shipping_carrier_services_status_idx
  ON shipping.carrier_services (tenant_id, carrier_account_id, status, name);
CREATE TRIGGER shipping_carrier_services_touch_updated_at
  BEFORE UPDATE ON shipping.carrier_services
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  fulfillment_id uuid NOT NULL,
  carrier_account_id uuid,
  carrier_service_id uuid,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT', 'READY', 'LABEL_PENDING', 'LABEL_CREATED', 'HANDED_OVER',
      'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION',
      'RETURN_TO_SENDER', 'RETURNED', 'CANCELLED'
    )),
  tracking_number text,
  tracking_url text,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(destination) = 'object'),
  declared_value_minor bigint CHECK (declared_value_minor IS NULL OR declared_value_minor >= 0),
  declared_value_currency text
    CHECK (declared_value_currency IS NULL OR declared_value_currency ~ '^[A-Z]{3}$'),
  estimated_delivery_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  last_tracking_at timestamptz,
  provider_sync_state text NOT NULL DEFAULT 'IN_SYNC'
    CHECK (provider_sync_state IN ('IN_SYNC', 'PENDING', 'OUT_OF_SYNC')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, store_id, fulfillment_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id, fulfillment_id)
    REFERENCES commerce.fulfillments(tenant_id, store_id, order_id, id),
  FOREIGN KEY (tenant_id, carrier_account_id)
    REFERENCES shipping.carrier_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, carrier_account_id, carrier_service_id)
    REFERENCES shipping.carrier_services(tenant_id, carrier_account_id, id),
  CHECK (
    (carrier_service_id IS NULL)
    OR (carrier_account_id IS NOT NULL)
  ),
  CHECK (
    (declared_value_minor IS NULL AND declared_value_currency IS NULL)
    OR (declared_value_minor IS NOT NULL AND declared_value_currency IS NOT NULL)
  ),
  CHECK (tracking_number IS NULL OR length(trim(tracking_number)) BETWEEN 1 AND 300),
  CHECK (tracking_url IS NULL OR length(tracking_url) <= 2000),
  CHECK ((status = 'DELIVERED' AND delivered_at IS NOT NULL) OR status <> 'DELIVERED')
);
CREATE INDEX shipping_shipments_order_idx
  ON shipping.shipments (tenant_id, order_id, created_at DESC, id DESC);
CREATE INDEX shipping_shipments_fulfillment_idx
  ON shipping.shipments (tenant_id, fulfillment_id, created_at DESC);
CREATE INDEX shipping_shipments_operations_idx
  ON shipping.shipments (
    tenant_id, status, provider_sync_state, estimated_delivery_at, updated_at DESC
  );
CREATE INDEX shipping_shipments_tracking_idx
  ON shipping.shipments (tenant_id, tracking_number)
  WHERE tracking_number IS NOT NULL;
CREATE TRIGGER shipping_shipments_touch_updated_at
  BEFORE UPDATE ON shipping.shipments
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.shipment_lines (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  fulfillment_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, shipment_id, order_line_id),
  FOREIGN KEY (tenant_id, store_id, fulfillment_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, fulfillment_id, id),
  FOREIGN KEY (tenant_id, fulfillment_id, order_line_id)
    REFERENCES commerce.fulfillment_lines(tenant_id, fulfillment_id, order_line_id)
);
CREATE INDEX shipping_shipment_lines_fulfillment_idx
  ON shipping.shipment_lines (tenant_id, fulfillment_id, order_line_id, shipment_id);

CREATE TABLE shipping.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'READY'
    CHECK (status IN (
      'READY', 'LABEL_CREATED', 'HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
      'DELIVERED', 'EXCEPTION', 'RETURN_TO_SENDER', 'RETURNED', 'CANCELLED'
    )),
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams BETWEEN 0 AND 100000000),
  length_mm integer CHECK (length_mm IS NULL OR length_mm BETWEEN 0 AND 100000),
  width_mm integer CHECK (width_mm IS NULL OR width_mm BETWEEN 0 AND 100000),
  height_mm integer CHECK (height_mm IS NULL OR height_mm BETWEEN 0 AND 100000),
  tracking_number text,
  tracking_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, shipment_id, id),
  UNIQUE (tenant_id, shipment_id, sequence),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  CHECK (tracking_number IS NULL OR length(trim(tracking_number)) BETWEEN 1 AND 300),
  CHECK (tracking_url IS NULL OR length(tracking_url) <= 2000)
);
CREATE INDEX shipping_packages_tracking_idx
  ON shipping.packages (tenant_id, tracking_number)
  WHERE tracking_number IS NOT NULL;
CREATE TRIGGER shipping_packages_touch_updated_at
  BEFORE UPDATE ON shipping.packages
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  package_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_FACILITY',
      'DEPARTED_FACILITY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED',
      'EXCEPTION', 'RETURN_TO_SENDER', 'RETURNED', 'CANCELLED'
    )),
  normalized_status text NOT NULL
    CHECK (normalized_status IN (
      'LABEL_CREATED', 'HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY',
      'DELIVERED', 'EXCEPTION', 'RETURN_TO_SENDER', 'RETURNED', 'CANCELLED'
    )),
  raw_code text,
  description text,
  location_name text,
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  occurred_at timestamptz NOT NULL,
  source_type text NOT NULL DEFAULT 'INTEGRATION'
    CHECK (source_type IN ('USER', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  external_event_id text,
  dedupe_key text NOT NULL CHECK (length(trim(dedupe_key)) BETWEEN 1 AND 300),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, shipment_id, dedupe_key),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, shipment_id, package_id)
    REFERENCES shipping.packages(tenant_id, store_id, shipment_id, id),
  CHECK (raw_code IS NULL OR length(raw_code) <= 300),
  CHECK (description IS NULL OR length(description) <= 4000),
  CHECK (location_name IS NULL OR length(location_name) <= 500),
  CHECK (external_event_id IS NULL OR length(external_event_id) <= 500)
);
CREATE INDEX shipping_tracking_events_timeline_idx
  ON shipping.tracking_events (tenant_id, shipment_id, occurred_at DESC, id DESC);
CREATE INDEX shipping_tracking_events_status_idx
  ON shipping.tracking_events (tenant_id, normalized_status, occurred_at DESC);

CREATE TABLE shipping.delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 1000),
  state text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (state IN ('SCHEDULED', 'OUT_FOR_DELIVERY', 'FAILED', 'DELIVERED', 'CANCELLED')),
  attempted_at timestamptz,
  next_attempt_at timestamptz,
  failure_code text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, shipment_id, attempt_number),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  CHECK (failure_code IS NULL OR length(failure_code) <= 200),
  CHECK (failure_reason IS NULL OR length(failure_reason) <= 4000)
);
CREATE INDEX shipping_delivery_attempts_due_idx
  ON shipping.delivery_attempts (tenant_id, state, next_attempt_at, updated_at DESC);
CREATE TRIGGER shipping_delivery_attempts_touch_updated_at
  BEFORE UPDATE ON shipping.delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.rescue_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'OPEN'
    CHECK (state IN (
      'OPEN', 'CONTACT_REQUIRED', 'CONTACTED', 'ADDRESS_UPDATE_REQUIRED',
      'RESCHEDULED', 'READY_TO_RETRY', 'RESOLVED', 'CANCELLED'
    )),
  trigger_reason text NOT NULL
    CHECK (trigger_reason IN (
      'DELIVERY_FAILED', 'ADDRESS_ISSUE', 'CUSTOMER_UNREACHABLE',
      'CARRIER_EXCEPTION', 'RETURN_RISK', 'OTHER'
    )),
  priority text NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  assigned_actor_id uuid,
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 1000),
  due_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK ((state = 'RESOLVED' AND resolved_at IS NOT NULL) OR state <> 'RESOLVED')
);
CREATE UNIQUE INDEX shipping_rescue_cases_one_active_idx
  ON shipping.rescue_cases (tenant_id, shipment_id)
  WHERE state NOT IN ('RESOLVED', 'CANCELLED');
CREATE INDEX shipping_rescue_cases_operations_idx
  ON shipping.rescue_cases (tenant_id, state, priority, due_at, updated_at DESC);
CREATE TRIGGER shipping_rescue_cases_touch_updated_at
  BEFORE UPDATE ON shipping.rescue_cases
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.provider_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  carrier_account_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('SHIPMENT', 'PACKAGE')),
  canonical_id uuid NOT NULL,
  external_id text NOT NULL CHECK (length(trim(external_id)) BETWEEN 1 AND 500),
  state text NOT NULL DEFAULT 'ACTIVE'
    CHECK (state IN ('ACTIVE', 'STALE', 'REMOVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, carrier_account_id, entity_type, external_id),
  UNIQUE (tenant_id, carrier_account_id, entity_type, canonical_id),
  FOREIGN KEY (tenant_id, carrier_account_id)
    REFERENCES shipping.carrier_accounts(tenant_id, id)
);
CREATE INDEX shipping_provider_references_canonical_idx
  ON shipping.provider_references (tenant_id, entity_type, canonical_id, state);
CREATE TRIGGER shipping_provider_references_touch_updated_at
  BEFORE UPDATE ON shipping.provider_references
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.shipment_provider_actions (
  provider_action_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  operation text NOT NULL
    CHECK (operation IN (
      'CREATE_LABEL', 'REQUEST_PICKUP', 'CANCEL_SHIPMENT',
      'RESCHEDULE_DELIVERY', 'UPDATE_DELIVERY_ADDRESS'
    )),
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED', 'SUCCEEDED', 'DEAD_LETTER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_action_id),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, provider_action_id)
    REFERENCES integrations.provider_actions(tenant_id, id)
);
CREATE INDEX shipping_shipment_provider_actions_idx
  ON shipping.shipment_provider_actions (tenant_id, shipment_id, state, created_at DESC);
CREATE TRIGGER shipping_shipment_provider_actions_touch_updated_at
  BEFORE UPDATE ON shipping.shipment_provider_actions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.shipment_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM'
    CHECK (actor_type IN ('USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id)
);
CREATE INDEX shipping_shipment_timeline_idx
  ON shipping.shipment_timeline (tenant_id, shipment_id, occurred_at DESC, id DESC);

ALTER TABLE shipping.carrier_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.carrier_accounts
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.carrier_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.carrier_services
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.shipments
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.shipment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.shipment_lines
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.packages
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.tracking_events
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.delivery_attempts
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.rescue_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.rescue_cases
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.provider_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.provider_references
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.shipment_provider_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.shipment_provider_actions
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.shipment_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.shipment_timeline
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  shipping.carrier_accounts,
  shipping.carrier_services,
  shipping.shipments,
  shipping.shipment_lines,
  shipping.packages,
  shipping.delivery_attempts,
  shipping.rescue_cases,
  shipping.provider_references,
  shipping.shipment_provider_actions
TO platform_app;
GRANT SELECT, INSERT ON
  shipping.tracking_events,
  shipping.shipment_timeline
TO platform_app;

REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA shipping FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON
  shipping.tracking_events,
  shipping.shipment_timeline
FROM platform_app;

INSERT INTO identity.permissions (code, category, description, default_risk)
VALUES
  ('shipping.shipments.read', 'shipping', 'Read canonical shipments, packages, tracking, and rescue state', 'LOW'),
  ('shipping.shipments.manage', 'shipping', 'Create and update canonical shipments and packages', 'MEDIUM'),
  ('shipping.tracking.record', 'shipping', 'Record normalized carrier tracking and delivery attempts', 'MEDIUM'),
  ('shipping.rescue.manage', 'shipping', 'Operate delivery rescue cases and retry preparation', 'MEDIUM'),
  ('shipping.provider.execute', 'shipping', 'Request carrier network actions through the post-commit provider boundary', 'HIGH')
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  default_risk = EXCLUDED.default_risk;

INSERT INTO identity.role_template_permissions (template_code, permission_code)
VALUES
  ('owner', 'shipping.shipments.read'),
  ('owner', 'shipping.shipments.manage'),
  ('owner', 'shipping.tracking.record'),
  ('owner', 'shipping.rescue.manage'),
  ('owner', 'shipping.provider.execute'),
  ('admin', 'shipping.shipments.read'),
  ('admin', 'shipping.shipments.manage'),
  ('admin', 'shipping.tracking.record'),
  ('admin', 'shipping.rescue.manage'),
  ('admin', 'shipping.provider.execute'),
  ('manager', 'shipping.shipments.read'),
  ('manager', 'shipping.shipments.manage'),
  ('manager', 'shipping.tracking.record'),
  ('manager', 'shipping.rescue.manage'),
  ('manager', 'shipping.provider.execute'),
  ('agent', 'shipping.shipments.read'),
  ('agent', 'shipping.rescue.manage')
ON CONFLICT (template_code, permission_code) DO NOTHING;

SELECT identity.bootstrap_default_roles(id)
FROM identity.organizations;

COMMIT;
