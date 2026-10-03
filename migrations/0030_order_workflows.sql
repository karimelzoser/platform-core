-- Order workflow state, duplicate review, bounded modifications, and provider-sync links.
-- Canonical order data remains provider-independent; external side effects continue
-- through integrations.provider_actions after the domain transaction commits.

BEGIN;

ALTER TABLE commerce.orders
  ADD COLUMN customer_email text,
  ADD COLUMN customer_phone text,
  ADD COLUMN note text;

ALTER TABLE commerce.orders
  ADD CONSTRAINT commerce_orders_email_length
    CHECK (customer_email IS NULL OR length(customer_email) <= 320),
  ADD CONSTRAINT commerce_orders_phone_length
    CHECK (customer_phone IS NULL OR length(customer_phone) <= 64),
  ADD CONSTRAINT commerce_orders_note_length
    CHECK (note IS NULL OR length(note) <= 10000);

CREATE TABLE commerce.order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('SHIPPING', 'BILLING')),
  name text,
  company text,
  line1 text NOT NULL CHECK (length(trim(line1)) BETWEEN 1 AND 500),
  line2 text,
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 300),
  region text,
  postal_code text,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_id, kind),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK (name IS NULL OR length(name) <= 300),
  CHECK (company IS NULL OR length(company) <= 300),
  CHECK (line2 IS NULL OR length(line2) <= 500),
  CHECK (region IS NULL OR length(region) <= 300),
  CHECK (postal_code IS NULL OR length(postal_code) <= 100),
  CHECK (phone IS NULL OR length(phone) <= 64)
);
CREATE INDEX commerce_order_addresses_order_idx
  ON commerce.order_addresses (tenant_id, order_id, kind);
CREATE TRIGGER commerce_order_addresses_touch_updated_at
  BEFORE UPDATE ON commerce.order_addresses
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_workflows (
  order_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  confirmation_state text NOT NULL DEFAULT 'PENDING'
    CHECK (confirmation_state IN (
      'PENDING', 'REQUESTED', 'CONFIRMED', 'DECLINED', 'NOT_REQUIRED'
    )),
  duplicate_state text NOT NULL DEFAULT 'NOT_EVALUATED'
    CHECK (duplicate_state IN (
      'NOT_EVALUATED', 'UNIQUE', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE'
    )),
  modification_state text NOT NULL DEFAULT 'NONE'
    CHECK (modification_state IN ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED')),
  cancellation_state text NOT NULL DEFAULT 'NONE'
    CHECK (cancellation_state IN ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED')),
  provider_sync_state text NOT NULL DEFAULT 'IN_SYNC'
    CHECK (provider_sync_state IN ('IN_SYNC', 'PENDING', 'OUT_OF_SYNC')),
  confirmation_attempts integer NOT NULL DEFAULT 0 CHECK (confirmation_attempts >= 0),
  confirmation_requested_at timestamptz,
  confirmed_at timestamptz,
  declined_at timestamptz,
  duplicates_evaluated_at timestamptz,
  last_provider_sync_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, store_id, order_id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX commerce_order_workflows_attention_idx
  ON commerce.order_workflows (
    tenant_id, store_id, confirmation_state, duplicate_state,
    cancellation_state, provider_sync_state, updated_at DESC
  );
CREATE TRIGGER commerce_order_workflows_touch_updated_at
  BEFORE UPDATE ON commerce.order_workflows
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  candidate_order_id uuid NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL DEFAULT 'OPEN'
    CHECK (state IN ('OPEN', 'DISMISSED', 'CONFIRMED_DUPLICATE', 'CLEARED')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_id, candidate_order_id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, candidate_order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK (order_id <> candidate_order_id),
  CHECK (jsonb_typeof(reasons) = 'array')
);
CREATE INDEX commerce_order_duplicate_candidates_open_idx
  ON commerce.order_duplicate_candidates (tenant_id, order_id, state, score DESC, detected_at DESC);
CREATE TRIGGER commerce_order_duplicate_candidates_touch_updated_at
  BEFORE UPDATE ON commerce.order_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('MODIFICATION', 'CANCELLATION')),
  state text NOT NULL DEFAULT 'REQUESTED'
    CHECK (state IN ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED')),
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  requested_actor_type text NOT NULL
    CHECK (requested_actor_type IN ('USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  requested_actor_id uuid,
  decision_actor_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  applied_at timestamptz,
  last_error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CHECK (reason IS NULL OR length(reason) <= 4000),
  CHECK (last_error_code IS NULL OR length(last_error_code) <= 200)
);
CREATE INDEX commerce_order_change_requests_order_idx
  ON commerce.order_change_requests (tenant_id, order_id, state, created_at DESC);
CREATE TRIGGER commerce_order_change_requests_touch_updated_at
  BEFORE UPDATE ON commerce.order_change_requests
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_provider_actions (
  provider_action_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  change_request_id uuid,
  operation text NOT NULL CHECK (operation IN ('CONFIRM', 'MODIFY', 'CANCEL')),
  state text NOT NULL DEFAULT 'QUEUED'
    CHECK (state IN ('QUEUED', 'SUCCEEDED', 'DEAD_LETTER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_action_id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, change_request_id)
    REFERENCES commerce.order_change_requests(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, provider_action_id)
    REFERENCES integrations.provider_actions(tenant_id, id)
);
CREATE INDEX commerce_order_provider_actions_order_idx
  ON commerce.order_provider_actions (tenant_id, order_id, state, created_at DESC);
CREATE TRIGGER commerce_order_provider_actions_touch_updated_at
  BEFORE UPDATE ON commerce.order_provider_actions
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE OR REPLACE FUNCTION commerce.initialize_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, commerce
AS $$
BEGIN
  INSERT INTO commerce.order_workflows (
    order_id, tenant_id, store_id, confirmation_state, cancellation_state
  ) VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.store_id,
    CASE
      WHEN NEW.status = 'CONFIRMED' THEN 'CONFIRMED'
      WHEN NEW.status IN ('CANCELLED', 'CLOSED') THEN 'NOT_REQUIRED'
      ELSE 'PENDING'
    END,
    CASE WHEN NEW.status = 'CANCELLED' THEN 'APPLIED' ELSE 'NONE' END
  )
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commerce_orders_initialize_workflow
  AFTER INSERT ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION commerce.initialize_order_workflow();

INSERT INTO commerce.order_workflows (
  order_id, tenant_id, store_id, confirmation_state, cancellation_state
)
SELECT
  id,
  tenant_id,
  store_id,
  CASE
    WHEN status = 'CONFIRMED' THEN 'CONFIRMED'
    WHEN status IN ('CANCELLED', 'CLOSED') THEN 'NOT_REQUIRED'
    ELSE 'PENDING'
  END,
  CASE WHEN status = 'CANCELLED' THEN 'APPLIED' ELSE 'NONE' END
FROM commerce.orders
ON CONFLICT (order_id) DO NOTHING;

ALTER TABLE commerce.order_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_addresses
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE commerce.order_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_workflows
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE commerce.order_duplicate_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_duplicate_candidates
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE commerce.order_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_change_requests
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE commerce.order_provider_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_provider_actions
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  commerce.order_addresses,
  commerce.order_workflows,
  commerce.order_duplicate_candidates,
  commerce.order_change_requests,
  commerce.order_provider_actions
TO platform_app;

REVOKE DELETE, TRUNCATE ON
  commerce.order_addresses,
  commerce.order_workflows,
  commerce.order_duplicate_candidates,
  commerce.order_change_requests,
  commerce.order_provider_actions
FROM platform_app;

COMMIT;
