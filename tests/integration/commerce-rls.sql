BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'commerce-rls-a',
  'commerce-rls-a'
);

DO $$
BEGIN
  IF NOT has_schema_privilege(current_user, 'commerce', 'USAGE') THEN
    RAISE EXCEPTION 'Runtime role cannot use commerce schema';
  END IF;
  IF has_table_privilege(current_user, 'commerce.orders', 'DELETE')
     OR has_table_privilege(current_user, 'commerce.order_timeline', 'UPDATE')
     OR has_table_privilege(current_user, 'commerce.order_timeline', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can destructively mutate commerce history';
  END IF;
END;
$$;

INSERT INTO commerce.stores (id, tenant_id, name, default_currency)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Commerce RLS Store A',
  'EGP'
);

INSERT INTO commerce.products (id, tenant_id, store_id, title)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000502',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'Commerce RLS Product A'
);

INSERT INTO commerce.variants (
  id, tenant_id, store_id, product_id, title, sku, price_minor, currency
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000503',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000502',
  'Default',
  'RLS-A-SKU',
  1000,
  'EGP'
);

INSERT INTO commerce.inventory_locations (id, tenant_id, store_id, name)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000504',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'RLS A Warehouse'
);

INSERT INTO commerce.inventory_levels (
  tenant_id, store_id, location_id, variant_id, on_hand, committed, incoming
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000504',
  'aaaaaaaa-0000-0000-0000-000000000503',
  10, 2, 3
);

INSERT INTO commerce.orders (
  id, tenant_id, store_id, order_number, currency, subtotal_minor, total_minor
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'RLS-A-ORDER',
  'EGP',
  1000,
  1000
);

INSERT INTO commerce.order_lines (
  id, tenant_id, store_id, order_id, product_id, variant_id, sku,
  title, quantity, unit_price_minor, total_minor
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000506',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000502',
  'aaaaaaaa-0000-0000-0000-000000000503',
  'RLS-A-SKU',
  'Commerce RLS Product A',
  1,
  1000,
  1000
);

INSERT INTO commerce.payments (
  id, tenant_id, store_id, order_id, kind, status, amount_minor, currency
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000507',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'SALE',
  'CAPTURED',
  1000,
  'EGP'
);

INSERT INTO commerce.fulfillments (
  id, tenant_id, store_id, order_id, status, fulfilled_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000508',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'FULFILLED',
  now()
);

INSERT INTO commerce.fulfillment_lines (
  tenant_id, store_id, fulfillment_id, order_id, order_line_id, quantity
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000508',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000506',
  1
);

INSERT INTO commerce.provider_mappings (
  id, tenant_id, store_id, connection_id, entity_type, canonical_id, external_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000509',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'ORDER',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'external-order-a'
);

INSERT INTO commerce.order_timeline (
  tenant_id, store_id, order_id, event_type, actor_type, actor_id, data
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'commerce.order.created',
  'USER',
  '11111111-1111-1111-1111-111111111111',
  '{"fixture":true}'::jsonb
);
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'commerce-rls-b',
  'commerce-rls-b'
);

INSERT INTO integrations.connections (
  id, tenant_id, connector_key, display_name, status
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000202',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'test-connector',
  'Commerce RLS Connection B',
  'CONNECTED'
);

INSERT INTO commerce.stores (id, tenant_id, name, default_currency)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000501',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Commerce RLS Store B',
  'EGP'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (SELECT 1 FROM commerce.stores WHERE id = 'aaaaaaaa-0000-0000-0000-000000000501') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A commerce store';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.products WHERE id = 'aaaaaaaa-0000-0000-0000-000000000502') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A product';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.variants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000503') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A variant';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.inventory_levels WHERE variant_id = 'aaaaaaaa-0000-0000-0000-000000000503') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A inventory';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.orders WHERE id = 'aaaaaaaa-0000-0000-0000-000000000505') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A order';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.payments WHERE id = 'aaaaaaaa-0000-0000-0000-000000000507') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A payment';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.fulfillments WHERE id = 'aaaaaaaa-0000-0000-0000-000000000508') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A fulfillment';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.provider_mappings WHERE id = 'aaaaaaaa-0000-0000-0000-000000000509') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A provider mapping';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce.order_timeline WHERE order_id = 'aaaaaaaa-0000-0000-0000-000000000505') THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A order timeline';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM commerce.stores WHERE id = 'bbbbbbbb-0000-0000-0000-000000000501') THEN
    RAISE EXCEPTION 'Tenant B cannot read own commerce store';
  END IF;

  UPDATE commerce.orders
  SET status = 'CONFIRMED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000505';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A order';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO commerce.products (tenant_id, store_id, title)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'Cross-tenant product'
    );
    RAISE EXCEPTION 'Tenant B inserted a Tenant A product';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO commerce.products (tenant_id, store_id, title)
    VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000501',
      'Cross-tenant relationship'
    );
    RAISE EXCEPTION 'Tenant B linked a product to Tenant A store';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;
