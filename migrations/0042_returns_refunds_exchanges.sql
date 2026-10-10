-- Canonical returns, exchanges, inspections, refunds and restock state.
-- Financial/provider side effects remain post-commit through integrations.provider_actions.

BEGIN;

CREATE SCHEMA IF NOT EXISTS returns;
GRANT USAGE ON SCHEMA returns TO platform_app;

CREATE TABLE returns.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  store_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  return_window_days integer NOT NULL DEFAULT 14 CHECK (return_window_days BETWEEN 0 AND 365),
  require_fulfilled boolean NOT NULL DEFAULT true,
  allow_exchanges boolean NOT NULL DEFAULT true,
  require_inspection boolean NOT NULL DEFAULT true,
  allow_restock boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id) REFERENCES commerce.stores(tenant_id, id)
);
CREATE UNIQUE INDEX returns_policies_active_name_ci
  ON returns.policies (tenant_id, store_id, lower(name)) WHERE status <> 'ARCHIVED';
CREATE INDEX returns_policies_store_idx ON returns.policies (tenant_id, store_id, status, updated_at DESC);
CREATE TRIGGER returns_policies_touch_updated_at
  BEFORE UPDATE ON returns.policies FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid,
  policy_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED',
    'INSPECTED', 'RESOLVED', 'CANCELLED'
  )),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  customer_note text CHECK (customer_note IS NULL OR length(customer_note) <= 4000),
  eligibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(eligibility_snapshot) = 'object'),
  requested_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  return_shipment_id uuid,
  temporal_workflow_id text CHECK (temporal_workflow_id IS NULL OR length(temporal_workflow_id) <= 300),
  approved_at timestamptz,
  rejected_at timestamptz,
  received_at timestamptz,
  resolved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES crm.customers(tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, policy_id) REFERENCES returns.policies(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, return_shipment_id) REFERENCES shipping.shipments(tenant_id, id),
  CHECK ((status = 'APPROVED') = (approved_at IS NOT NULL) OR status IN ('IN_TRANSIT','RECEIVED','INSPECTED','RESOLVED')),
  CHECK ((status = 'REJECTED') = (rejected_at IS NOT NULL)),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
);
CREATE INDEX returns_requests_order_idx ON returns.return_requests (tenant_id, order_id, created_at DESC, id DESC);
CREATE INDEX returns_requests_state_idx ON returns.return_requests (tenant_id, status, updated_at DESC, id DESC);
CREATE TRIGGER returns_requests_touch_updated_at
  BEFORE UPDATE ON returns.return_requests FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  return_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  requested_resolution text NOT NULL DEFAULT 'REFUND' CHECK (requested_resolution IN ('REFUND','EXCHANGE','STORE_CREDIT','NO_REFUND')),
  proposed_refund_minor bigint NOT NULL DEFAULT 0 CHECK (proposed_refund_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  note text CHECK (note IS NULL OR length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, id),
  FOREIGN KEY (tenant_id, store_id, return_id) REFERENCES returns.return_requests(tenant_id, store_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, store_id, order_line_id) REFERENCES commerce.order_lines(tenant_id, store_id, id)
);
CREATE INDEX returns_lines_order_line_idx ON returns.return_lines (tenant_id, order_line_id, created_at DESC);
CREATE TRIGGER returns_lines_touch_updated_at
  BEFORE UPDATE ON returns.return_lines FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','VOIDED')),
  inspected_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  inspected_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, id),
  UNIQUE (tenant_id, return_id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES returns.return_requests(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status = 'COMPLETED' AND inspected_at IS NOT NULL) OR status <> 'COMPLETED')
);
CREATE TRIGGER returns_inspections_touch_updated_at
  BEFORE UPDATE ON returns.inspections FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.inspection_lines (
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  inspection_id uuid NOT NULL,
  return_line_id uuid NOT NULL,
  accepted_quantity integer NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  rejected_quantity integer NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  condition text NOT NULL CHECK (condition IN ('NEW','OPENED','USED','DAMAGED','DEFECTIVE','MISSING_PARTS','OTHER')),
  note text CHECK (note IS NULL OR length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, inspection_id, return_line_id),
  FOREIGN KEY (tenant_id, return_id, inspection_id) REFERENCES returns.inspections(tenant_id, return_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, return_id, return_line_id) REFERENCES returns.return_lines(tenant_id, return_id, id) ON DELETE CASCADE,
  CHECK (accepted_quantity + rejected_quantity > 0)
);

CREATE TABLE returns.exchange_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','ALLOCATED','FULFILLED','CANCELLED','FAILED')),
  replacement_order_id uuid,
  price_delta_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  approved_at timestamptz,
  fulfilled_at timestamptz,
  failure_reason text CHECK (failure_reason IS NULL OR length(failure_reason) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES returns.return_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, replacement_order_id) REFERENCES commerce.orders(tenant_id, id)
);
CREATE INDEX returns_exchanges_state_idx ON returns.exchange_requests (tenant_id, status, updated_at DESC);
CREATE TRIGGER returns_exchanges_touch_updated_at
  BEFORE UPDATE ON returns.exchange_requests FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.exchange_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  exchange_id uuid NOT NULL,
  return_line_id uuid NOT NULL,
  replacement_variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_delta_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, return_id, exchange_id) REFERENCES returns.exchange_requests(tenant_id, return_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, return_id, return_line_id) REFERENCES returns.return_lines(tenant_id, return_id, id),
  FOREIGN KEY (tenant_id, replacement_variant_id) REFERENCES commerce.variants(tenant_id, id)
);

CREATE TABLE returns.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  order_id uuid NOT NULL,
  payment_id uuid,
  connection_id uuid,
  provider_action_id uuid,
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','QUEUED','PROCESSING','SUCCEEDED','FAILED','CANCELLED')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 4000),
  approved_at timestamptz,
  completed_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES returns.return_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES commerce.payments(tenant_id, id),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES integrations.connections(tenant_id, id),
  FOREIGN KEY (tenant_id, provider_action_id) REFERENCES integrations.provider_actions(tenant_id, id)
);
CREATE INDEX returns_refunds_state_idx ON returns.refunds (tenant_id, status, updated_at DESC);
CREATE INDEX returns_refunds_order_idx ON returns.refunds (tenant_id, order_id, created_at DESC);
CREATE TRIGGER returns_refunds_touch_updated_at
  BEFORE UPDATE ON returns.refunds FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE returns.restock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  return_line_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, return_id, return_line_id) REFERENCES returns.return_lines(tenant_id, return_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES commerce.variants(tenant_id, id),
  FOREIGN KEY (tenant_id, location_id, variant_id) REFERENCES commerce.inventory_levels(tenant_id, location_id, variant_id)
);
CREATE INDEX returns_restock_return_idx ON returns.restock_movements (tenant_id, return_id, created_at DESC);

CREATE TABLE returns.timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM' CHECK (actor_type IN ('USER','AI','SYSTEM','SERVICE','INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, return_id) REFERENCES returns.return_requests(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX returns_timeline_idx ON returns.timeline (tenant_id, return_id, occurred_at, id);

CREATE OR REPLACE FUNCTION returns.validate_return_line_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, returns, commerce AS $$
DECLARE
  purchased integer;
  related_order uuid;
  already_returning integer;
BEGIN
  SELECT line.quantity, line.order_id INTO purchased, related_order
  FROM commerce.order_lines line
  WHERE line.tenant_id = NEW.tenant_id AND line.store_id = NEW.store_id AND line.id = NEW.order_line_id;
  IF purchased IS NULL OR related_order <> NEW.order_id THEN
    RAISE EXCEPTION 'Return line must reference an order line from the same canonical order' USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(sum(line.quantity), 0)::integer INTO already_returning
  FROM returns.return_lines line
  JOIN returns.return_requests request ON request.tenant_id = line.tenant_id AND request.id = line.return_id
  WHERE line.tenant_id = NEW.tenant_id
    AND line.order_line_id = NEW.order_line_id
    AND request.status NOT IN ('REJECTED','CANCELLED')
    AND (TG_OP <> 'UPDATE' OR line.id <> NEW.id);
  IF already_returning + NEW.quantity > purchased THEN
    RAISE EXCEPTION 'Cumulative active return quantity exceeds purchased quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_return_lines_validate
  BEFORE INSERT OR UPDATE OF quantity, order_id, order_line_id ON returns.return_lines
  FOR EACH ROW EXECUTE FUNCTION returns.validate_return_line_quantity();

CREATE OR REPLACE FUNCTION returns.validate_inspection_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, returns AS $$
DECLARE requested integer;
BEGIN
  SELECT quantity INTO requested FROM returns.return_lines
  WHERE tenant_id = NEW.tenant_id AND return_id = NEW.return_id AND id = NEW.return_line_id;
  IF requested IS NULL OR NEW.accepted_quantity + NEW.rejected_quantity > requested THEN
    RAISE EXCEPTION 'Inspection quantity exceeds requested return quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_inspection_lines_validate
  BEFORE INSERT OR UPDATE ON returns.inspection_lines
  FOR EACH ROW EXECUTE FUNCTION returns.validate_inspection_line();

CREATE OR REPLACE FUNCTION returns.validate_refund_amount()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, returns, commerce AS $$
DECLARE
  order_total bigint;
  order_currency text;
  refunded bigint;
  related_order uuid;
BEGIN
  SELECT request.order_id INTO related_order FROM returns.return_requests request
  WHERE request.tenant_id = NEW.tenant_id AND request.id = NEW.return_id;
  IF related_order IS NULL OR related_order <> NEW.order_id THEN
    RAISE EXCEPTION 'Refund must reference the return canonical order' USING ERRCODE = '23503';
  END IF;
  SELECT total_minor, currency INTO order_total, order_currency FROM commerce.orders
  WHERE tenant_id = NEW.tenant_id AND id = NEW.order_id;
  IF order_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Refund currency must match canonical order currency' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum(amount_minor),0)::bigint INTO refunded FROM returns.refunds
  WHERE tenant_id = NEW.tenant_id AND order_id = NEW.order_id
    AND status NOT IN ('FAILED','CANCELLED')
    AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
  IF refunded + NEW.amount_minor > order_total THEN
    RAISE EXCEPTION 'Cumulative refund exceeds canonical order total' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_refunds_validate
  BEFORE INSERT OR UPDATE OF amount_minor, currency, status ON returns.refunds
  FOR EACH ROW EXECUTE FUNCTION returns.validate_refund_amount();

CREATE OR REPLACE FUNCTION returns.validate_restock_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, returns AS $$
DECLARE accepted integer; restored integer;
BEGIN
  SELECT coalesce(sum(line.accepted_quantity),0)::integer INTO accepted
  FROM returns.inspection_lines line
  WHERE line.tenant_id = NEW.tenant_id AND line.return_id = NEW.return_id AND line.return_line_id = NEW.return_line_id;
  SELECT coalesce(sum(movement.quantity),0)::integer INTO restored
  FROM returns.restock_movements movement
  WHERE movement.tenant_id = NEW.tenant_id AND movement.return_line_id = NEW.return_line_id;
  IF restored + NEW.quantity > accepted THEN
    RAISE EXCEPTION 'Restock quantity exceeds accepted inspected quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER returns_restock_validate
  BEFORE INSERT ON returns.restock_movements FOR EACH ROW EXECUTE FUNCTION returns.validate_restock_quantity();

ALTER TABLE returns.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.inspection_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.exchange_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.exchange_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.restock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns.policies FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.return_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.return_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.inspection_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.exchange_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.exchange_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.restock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE returns.timeline FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON returns.policies USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.return_requests USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.return_lines USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.inspections USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.inspection_lines USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.exchange_requests USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.exchange_lines USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.refunds USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.restock_movements USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());
CREATE POLICY tenant_isolation ON returns.timeline USING (tenant_id = platform.current_tenant_id()) WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON returns.policies, returns.return_requests, returns.return_lines,
  returns.inspections, returns.inspection_lines, returns.exchange_requests, returns.exchange_lines,
  returns.refunds TO platform_app;
GRANT SELECT, INSERT ON returns.restock_movements, returns.timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA returns FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON returns.restock_movements, returns.timeline FROM platform_app;

ALTER TABLE commerce.provider_mappings DROP CONSTRAINT IF EXISTS commerce_provider_mappings_entity_type_check;
ALTER TABLE commerce.provider_mappings ADD CONSTRAINT commerce_provider_mappings_entity_type_check
  CHECK (entity_type IN ('STORE','PRODUCT','VARIANT','INVENTORY_LOCATION','ORDER','PAYMENT','FULFILLMENT','RETURN','EXCHANGE','REFUND'));

INSERT INTO platform.meter_definitions (
  meter_key, version, description, unit, aggregation_behavior, source_of_truth,
  retry_creates_unit, may_be_billable, provider_cost_applies, allowed_dimensions
) VALUES
('returns.request.created', 1, 'A canonical return request created by a tenant actor.', 'case', 'COUNT', 'returns.return_requests', false, false, false, ARRAY['resolution']),
('returns.refund.queued', 1, 'A canonical refund provider action queued after approval.', 'refund', 'COUNT', 'returns.refunds', false, false, true, ARRAY['currency'])
ON CONFLICT (meter_key, version) DO NOTHING;

COMMIT;
