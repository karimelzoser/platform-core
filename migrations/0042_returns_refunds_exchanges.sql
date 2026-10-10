-- Canonical returns, exchanges, refunds, inspection and restock lifecycle.
-- Provider execution remains post-commit through integrations.provider_actions.

BEGIN;

CREATE SCHEMA IF NOT EXISTS returns;
GRANT USAGE ON SCHEMA returns TO platform_app;

CREATE TABLE returns.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  return_number text NOT NULL CHECK (length(trim(return_number)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','AUTHORIZED','REJECTED','IN_TRANSIT','RECEIVED','INSPECTING','RESOLVED','CANCELLED')),
  requested_resolution text NOT NULL CHECK (requested_resolution IN ('REFUND','EXCHANGE')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 4000),
  eligible boolean NOT NULL,
  eligibility_reason text,
  policy_version text NOT NULL CHECK (length(trim(policy_version)) BETWEEN 1 AND 100),
  return_window_days integer NOT NULL CHECK (return_window_days BETWEEN 0 AND 3650),
  eligible_until timestamptz,
  reverse_logistics_state text NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (reverse_logistics_state IN ('NOT_REQUIRED','PENDING','LABEL_CREATED','IN_TRANSIT','RECEIVED')),
  carrier_name text,
  tracking_number text,
  label_url text,
  provider_sync_state text NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (provider_sync_state IN ('NOT_REQUIRED','PENDING','IN_SYNC','OUT_OF_SYNC')),
  requested_by uuid,
  authorized_by uuid,
  rejected_by uuid,
  received_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  authorized_at timestamptz,
  rejected_at timestamptz,
  received_at timestamptz,
  inspected_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, store_id, return_number),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX returns_requests_queue_idx
  ON returns.requests (tenant_id, store_id, status, updated_at DESC, id DESC);
CREATE INDEX returns_requests_order_idx
  ON returns.requests (tenant_id, order_id, created_at DESC, id DESC);
CREATE TRIGGER returns_requests_touch_updated_at
  BEFORE UPDATE ON returns.requests
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
  authorized_quantity integer NOT NULL DEFAULT 0 CHECK (authorized_quantity >= 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  inspected_quantity integer NOT NULL DEFAULT 0 CHECK (inspected_quantity >= 0),
  condition text NOT NULL DEFAULT 'UNINSPECTED'
    CHECK (condition IN ('UNINSPECTED','NEW','OPEN_BOX','USED','DAMAGED','DEFECTIVE','MISSING')),
  disposition text NOT NULL DEFAULT 'PENDING'
    CHECK (disposition IN ('PENDING','RESTOCK','QUARANTINE','SCRAP','RETURN_TO_VENDOR')),
  restock_location_id uuid,
  refundable_minor bigint NOT NULL DEFAULT 0 CHECK (refundable_minor >= 0),
  restocked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, order_line_id),
  FOREIGN KEY (tenant_id, store_id, return_id)
    REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_line_id)
    REFERENCES commerce.order_lines(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, restock_location_id)
    REFERENCES commerce.inventory_locations(tenant_id, store_id, id),
  CHECK (authorized_quantity <= requested_quantity),
  CHECK (received_quantity <= authorized_quantity),
  CHECK (inspected_quantity <= received_quantity)
);
CREATE INDEX returns_request_lines_return_idx
  ON returns.request_lines (tenant_id, return_id, created_at, id);
CREATE INDEX returns_request_lines_order_line_idx
  ON returns.request_lines (tenant_id, order_line_id, return_id);
CREATE TRIGGER returns_request_lines_touch_updated_at
  BEFORE UPDATE ON returns.request_lines
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_id uuid NOT NULL,
  order_id uuid NOT NULL,
  source_payment_id uuid,
  refund_payment_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','QUEUED','SUCCEEDED','FAILED','CANCELLED')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 4000),
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, return_id)
    REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, source_payment_id)
    REFERENCES commerce.payments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, refund_payment_id)
    REFERENCES commerce.payments(tenant_id, store_id, id)
);
CREATE INDEX returns_refunds_return_idx
  ON returns.refunds (tenant_id, return_id, created_at DESC);
CREATE INDEX returns_refunds_status_idx
  ON returns.refunds (tenant_id, store_id, status, updated_at DESC);
CREATE TRIGGER returns_refunds_touch_updated_at
  BEFORE UPDATE ON returns.refunds
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_id uuid NOT NULL,
  order_id uuid NOT NULL,
  replacement_order_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','FULFILLMENT_PENDING','COMPLETED','CANCELLED')),
  price_difference_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  approved_by uuid,
  approved_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, return_id)
    REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, replacement_order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX returns_exchanges_return_idx
  ON returns.exchanges (tenant_id, return_id, created_at DESC);
CREATE TRIGGER returns_exchanges_touch_updated_at
  BEFORE UPDATE ON returns.exchanges
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.exchange_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  exchange_id uuid NOT NULL,
  return_line_id uuid NOT NULL,
  replacement_variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_difference_minor bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, exchange_id, return_line_id),
  FOREIGN KEY (tenant_id, store_id, exchange_id)
    REFERENCES returns.exchanges(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, return_line_id)
    REFERENCES returns.request_lines(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, replacement_variant_id)
    REFERENCES commerce.variants(tenant_id, store_id, id)
);
CREATE INDEX returns_exchange_lines_exchange_idx
  ON returns.exchange_lines (tenant_id, exchange_id, id);

CREATE TABLE returns.provider_actions (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  provider_action_id uuid NOT NULL,
  return_id uuid NOT NULL,
  refund_id uuid,
  operation text NOT NULL CHECK (operation IN ('CREATE_RETURN_LABEL','REFUND_PAYMENT')),
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD_LETTER','CANCELED')),
  failure_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider_action_id),
  FOREIGN KEY (tenant_id, provider_action_id)
    REFERENCES integrations.provider_actions(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, return_id)
    REFERENCES returns.requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, refund_id)
    REFERENCES returns.refunds(tenant_id, store_id, id)
);
CREATE INDEX returns_provider_actions_return_idx
  ON returns.provider_actions (tenant_id, return_id, state, created_at DESC);
CREATE TRIGGER returns_provider_actions_touch_updated_at
  BEFORE UPDATE ON returns.provider_actions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.timeline (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL CHECK (actor_type IN ('USER','SYSTEM','AUTOMATION','AI','INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, store_id, return_id)
    REFERENCES returns.requests(tenant_id, store_id, id)
);
CREATE INDEX returns_timeline_idx
  ON returns.timeline (tenant_id, return_id, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION returns.enforce_request_line_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, returns, commerce
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM returns.requests request
    WHERE request.tenant_id = NEW.tenant_id
      AND request.store_id = NEW.store_id
      AND request.id = NEW.return_id
      AND request.order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'return request and line order relationship mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM commerce.order_lines line
    WHERE line.tenant_id = NEW.tenant_id
      AND line.store_id = NEW.store_id
      AND line.id = NEW.order_line_id
      AND line.order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'return line does not belong to return order';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_request_lines_relationship_guard
  BEFORE INSERT OR UPDATE ON returns.request_lines
  FOR EACH ROW EXECUTE FUNCTION returns.enforce_request_line_relationships();

CREATE OR REPLACE FUNCTION returns.enforce_resolution_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, returns
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM returns.requests request
    WHERE request.tenant_id = NEW.tenant_id
      AND request.store_id = NEW.store_id
      AND request.id = NEW.return_id
      AND request.order_id = NEW.order_id
  ) THEN
    RAISE EXCEPTION 'return resolution and order relationship mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_refunds_relationship_guard
  BEFORE INSERT OR UPDATE ON returns.refunds
  FOR EACH ROW EXECUTE FUNCTION returns.enforce_resolution_relationships();
CREATE TRIGGER returns_exchanges_relationship_guard
  BEFORE INSERT OR UPDATE ON returns.exchanges
  FOR EACH ROW EXECUTE FUNCTION returns.enforce_resolution_relationships();

ALTER TABLE returns.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.exchange_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.provider_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON returns.requests
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.request_lines
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.refunds
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.exchanges
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.exchange_lines
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.provider_actions
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.timeline
  USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  returns.requests,
  returns.request_lines,
  returns.refunds,
  returns.exchanges,
  returns.exchange_lines,
  returns.provider_actions
TO platform_app;
GRANT SELECT, INSERT ON returns.timeline TO platform_app;
GRANT USAGE, SELECT ON SEQUENCE returns.timeline_id_seq TO platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON returns.timeline FROM platform_app;
REVOKE DELETE, TRUNCATE ON
  returns.requests,
  returns.request_lines,
  returns.refunds,
  returns.exchanges,
  returns.exchange_lines,
  returns.provider_actions
FROM platform_app;

COMMIT;
