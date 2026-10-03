-- Canonical provider-independent commerce model. Provider adapters map external
-- resources into these tenant-owned records instead of creating parallel
-- Shopify/WooCommerce sources of truth.

BEGIN;

CREATE SCHEMA IF NOT EXISTS commerce;
GRANT USAGE ON SCHEMA commerce TO platform_app;

CREATE TABLE commerce.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
  default_currency text NOT NULL
    CHECK (default_currency ~ '^[A-Z]{3}$'),
  timezone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX commerce_stores_name_unique_ci
  ON commerce.stores (tenant_id, lower(name))
  WHERE status <> 'ARCHIVED';
CREATE INDEX commerce_stores_status_idx
  ON commerce.stores (tenant_id, status, updated_at DESC);
CREATE TRIGGER commerce_stores_touch_updated_at
  BEFORE UPDATE ON commerce.stores
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  description text,
  vendor text,
  product_type text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id)
    REFERENCES commerce.stores(tenant_id, id)
);
CREATE INDEX commerce_products_catalog_idx
  ON commerce.products (tenant_id, store_id, status, updated_at DESC);
CREATE INDEX commerce_products_title_idx
  ON commerce.products (tenant_id, store_id, lower(title));
CREATE TRIGGER commerce_products_touch_updated_at
  BEFORE UPDATE ON commerce.products
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  sku text,
  barcode text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  track_inventory boolean NOT NULL DEFAULT true,
  price_minor bigint NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  compare_at_price_minor bigint CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, product_id)
    REFERENCES commerce.products(tenant_id, store_id, id)
);
CREATE UNIQUE INDEX commerce_variants_sku_unique
  ON commerce.variants (tenant_id, store_id, sku)
  WHERE sku IS NOT NULL AND status <> 'ARCHIVED';
CREATE INDEX commerce_variants_product_idx
  ON commerce.variants (tenant_id, store_id, product_id, status);
CREATE INDEX commerce_variants_barcode_idx
  ON commerce.variants (tenant_id, store_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE TRIGGER commerce_variants_touch_updated_at
  BEFORE UPDATE ON commerce.variants
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id)
    REFERENCES commerce.stores(tenant_id, id)
);
CREATE INDEX commerce_inventory_locations_idx
  ON commerce.inventory_locations (tenant_id, store_id, status, name);
CREATE TRIGGER commerce_inventory_locations_touch_updated_at
  BEFORE UPDATE ON commerce.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.inventory_levels (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  location_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  on_hand integer NOT NULL DEFAULT 0,
  committed integer NOT NULL DEFAULT 0 CHECK (committed >= 0),
  incoming integer NOT NULL DEFAULT 0 CHECK (incoming >= 0),
  available integer GENERATED ALWAYS AS (on_hand - committed) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, location_id, variant_id),
  FOREIGN KEY (tenant_id, store_id, location_id)
    REFERENCES commerce.inventory_locations(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, variant_id)
    REFERENCES commerce.variants(tenant_id, store_id, id)
);
CREATE INDEX commerce_inventory_variant_idx
  ON commerce.inventory_levels (tenant_id, store_id, variant_id, location_id);
CREATE TRIGGER commerce_inventory_levels_touch_updated_at
  BEFORE UPDATE ON commerce.inventory_levels
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  customer_id uuid,
  order_number text NOT NULL CHECK (length(trim(order_number)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('DRAFT', 'PENDING', 'CONFIRMED', 'CANCELLED', 'CLOSED')),
  financial_status text NOT NULL DEFAULT 'PENDING'
    CHECK (financial_status IN (
      'PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID',
      'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'
    )),
  fulfillment_status text NOT NULL DEFAULT 'UNFULFILLED'
    CHECK (fulfillment_status IN ('UNFULFILLED', 'PARTIAL', 'FULFILLED', 'CANCELLED')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  shipping_minor bigint NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  total_minor bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  source text NOT NULL DEFAULT 'platform' CHECK (length(trim(source)) BETWEEN 1 AND 100),
  placed_at timestamptz,
  cancelled_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  UNIQUE (tenant_id, store_id, order_number),
  FOREIGN KEY (tenant_id, store_id)
    REFERENCES commerce.stores(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES crm.customers(tenant_id, id),
  CONSTRAINT commerce_orders_cancelled_timestamp CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    OR (status <> 'CANCELLED')
  ),
  CONSTRAINT commerce_orders_closed_timestamp CHECK (
    (status = 'CLOSED' AND closed_at IS NOT NULL)
    OR (status <> 'CLOSED')
  )
);
CREATE INDEX commerce_orders_list_idx
  ON commerce.orders (tenant_id, store_id, created_at DESC, id DESC);
CREATE INDEX commerce_orders_customer_idx
  ON commerce.orders (tenant_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX commerce_orders_state_idx
  ON commerce.orders (tenant_id, store_id, status, financial_status, fulfillment_status, updated_at DESC);
CREATE TRIGGER commerce_orders_touch_updated_at
  BEFORE UPDATE ON commerce.orders
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  sku text,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, product_id)
    REFERENCES commerce.products(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, variant_id)
    REFERENCES commerce.variants(tenant_id, store_id, id),
  CONSTRAINT commerce_order_line_catalog_pair CHECK (
    variant_id IS NULL OR product_id IS NOT NULL
  )
);
CREATE INDEX commerce_order_lines_order_idx
  ON commerce.order_lines (tenant_id, order_id, created_at, id);
CREATE TRIGGER commerce_order_lines_touch_updated_at
  BEFORE UPDATE ON commerce.order_lines
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  code text,
  title text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX commerce_order_discounts_order_idx
  ON commerce.order_discounts (tenant_id, order_id, created_at, id);

CREATE TABLE commerce.order_tax_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  rate_basis_points integer CHECK (rate_basis_points IS NULL OR rate_basis_points BETWEEN 0 AND 100000),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX commerce_order_tax_lines_order_idx
  ON commerce.order_tax_lines (tenant_id, order_id, created_at, id);

CREATE TABLE commerce.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('AUTHORIZATION', 'CAPTURE', 'SALE', 'REFUND', 'VOID')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'VOIDED',
      'PARTIALLY_REFUNDED', 'REFUNDED'
    )),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method_type text,
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX commerce_payments_order_idx
  ON commerce.payments (tenant_id, order_id, created_at DESC);
CREATE INDEX commerce_payments_state_idx
  ON commerce.payments (tenant_id, store_id, status, updated_at DESC);
CREATE TRIGGER commerce_payments_touch_updated_at
  BEFORE UPDATE ON commerce.payments
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'FAILED')),
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id),
  CONSTRAINT commerce_fulfillment_timestamp CHECK (
    (status = 'FULFILLED' AND fulfilled_at IS NOT NULL)
    OR status <> 'FULFILLED'
  )
);
CREATE INDEX commerce_fulfillments_order_idx
  ON commerce.fulfillments (tenant_id, order_id, created_at DESC);
CREATE INDEX commerce_fulfillments_state_idx
  ON commerce.fulfillments (tenant_id, store_id, status, updated_at DESC);
CREATE TRIGGER commerce_fulfillments_touch_updated_at
  BEFORE UPDATE ON commerce.fulfillments
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.fulfillment_lines (
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  fulfillment_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fulfillment_id, order_line_id),
  FOREIGN KEY (tenant_id, store_id, fulfillment_id)
    REFERENCES commerce.fulfillments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, order_line_id)
    REFERENCES commerce.order_lines(tenant_id, store_id, id)
);
CREATE INDEX commerce_fulfillment_lines_order_line_idx
  ON commerce.fulfillment_lines (tenant_id, order_line_id, fulfillment_id);

CREATE TABLE commerce.provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'STORE', 'PRODUCT', 'VARIANT', 'INVENTORY_LOCATION',
      'ORDER', 'PAYMENT', 'FULFILLMENT'
    )),
  canonical_id uuid NOT NULL,
  external_id text NOT NULL CHECK (length(trim(external_id)) BETWEEN 1 AND 500),
  external_parent_id text,
  state text NOT NULL DEFAULT 'ACTIVE'
    CHECK (state IN ('ACTIVE', 'STALE', 'REMOVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, entity_type, external_id),
  UNIQUE (tenant_id, connection_id, entity_type, canonical_id),
  FOREIGN KEY (tenant_id, store_id)
    REFERENCES commerce.stores(tenant_id, id),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES integrations.connections(tenant_id, id)
);
CREATE INDEX commerce_provider_mapping_canonical_idx
  ON commerce.provider_mappings (tenant_id, store_id, entity_type, canonical_id);
CREATE INDEX commerce_provider_mapping_state_idx
  ON commerce.provider_mappings (tenant_id, connection_id, state, updated_at DESC);
CREATE TRIGGER commerce_provider_mappings_touch_updated_at
  BEFORE UPDATE ON commerce.provider_mappings
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE commerce.order_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  actor_type text NOT NULL DEFAULT 'SYSTEM'
    CHECK (actor_type IN ('USER', 'AI', 'SYSTEM', 'SERVICE', 'INTEGRATION')),
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, store_id, order_id)
    REFERENCES commerce.orders(tenant_id, store_id, id)
);
CREATE INDEX commerce_order_timeline_idx
  ON commerce.order_timeline (tenant_id, order_id, occurred_at, id);

ALTER TABLE commerce.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.stores
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.products
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.variants
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.inventory_locations
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.inventory_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.inventory_levels
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.orders
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_lines
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.order_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_discounts
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.order_tax_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_tax_lines
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.payments
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.fulfillments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.fulfillments
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.fulfillment_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.fulfillment_lines
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.provider_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.provider_mappings
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE commerce.order_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON commerce.order_timeline
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  commerce.stores,
  commerce.products,
  commerce.variants,
  commerce.inventory_locations,
  commerce.inventory_levels,
  commerce.orders,
  commerce.order_lines,
  commerce.order_discounts,
  commerce.order_tax_lines,
  commerce.payments,
  commerce.fulfillments,
  commerce.fulfillment_lines,
  commerce.provider_mappings
TO platform_app;

GRANT SELECT, INSERT ON commerce.order_timeline TO platform_app;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA commerce FROM platform_app;
REVOKE UPDATE, DELETE, TRUNCATE ON commerce.order_timeline FROM platform_app;

COMMIT;
