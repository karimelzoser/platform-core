BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'shipping-rls-a',
  'shipping-rls-a'
);

DO $$
BEGIN
  IF NOT has_schema_privilege(current_user, 'shipping', 'USAGE') THEN
    RAISE EXCEPTION 'Runtime role cannot use shipping schema';
  END IF;
  IF has_table_privilege(current_user, 'shipping.shipments', 'DELETE')
     OR has_table_privilege(current_user, 'shipping.tracking_events', 'UPDATE')
     OR has_table_privilege(current_user, 'shipping.tracking_events', 'DELETE')
     OR has_table_privilege(current_user, 'shipping.shipment_timeline', 'UPDATE')
     OR has_table_privilege(current_user, 'shipping.shipment_timeline', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can destructively mutate shipping history';
  END IF;
END;
$$;

INSERT INTO shipping.carrier_accounts (
  id, tenant_id, connection_id, carrier_key, account_label, display_name
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000601',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'test-carrier',
  'Shipping RLS Account A',
  'Test Carrier'
);

INSERT INTO shipping.carrier_services (
  id, tenant_id, carrier_account_id, service_code, name
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000602',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'standard',
  'Standard Delivery'
);

INSERT INTO shipping.shipments (
  id, tenant_id, store_id, order_id, fulfillment_id,
  carrier_account_id, carrier_service_id, status, destination
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000603',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000505',
  'aaaaaaaa-0000-0000-0000-000000000508',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'READY',
  '{"name":"RLS Customer A","line1":"1 Test Street","city":"Cairo","countryCode":"EG"}'::jsonb
);

INSERT INTO shipping.shipment_lines (
  tenant_id, store_id, shipment_id, fulfillment_id, order_line_id, quantity
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'aaaaaaaa-0000-0000-0000-000000000508',
  'aaaaaaaa-0000-0000-0000-000000000506',
  1
);

INSERT INTO shipping.packages (
  id, tenant_id, store_id, shipment_id, sequence, status, weight_grams
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000604',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  1,
  'IN_TRANSIT',
  750
);

INSERT INTO shipping.tracking_events (
  id, tenant_id, store_id, shipment_id, package_id,
  event_type, normalized_status, occurred_at, dedupe_key, data
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000605',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'aaaaaaaa-0000-0000-0000-000000000604',
  'IN_TRANSIT',
  'IN_TRANSIT',
  now(),
  'rls-a-in-transit-1',
  '{"fixture":true}'::jsonb
);

INSERT INTO shipping.delivery_attempts (
  id, tenant_id, store_id, shipment_id, attempt_number,
  state, attempted_at, next_attempt_at, failure_code, failure_reason
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000606',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  1,
  'FAILED',
  now(),
  now() + interval '1 day',
  'CUSTOMER_UNAVAILABLE',
  'Customer was unavailable at delivery address'
);

INSERT INTO shipping.rescue_cases (
  id, tenant_id, store_id, shipment_id,
  state, trigger_reason, priority, summary, due_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000607',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'CONTACT_REQUIRED',
  'CUSTOMER_UNREACHABLE',
  'HIGH',
  'Contact customer before the next delivery attempt',
  now() + interval '4 hours'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM shipping.rescue_cases AS rescue
    JOIN shipping.shipments AS shipment
      ON shipment.tenant_id = rescue.tenant_id
     AND shipment.store_id = rescue.store_id
     AND shipment.id = rescue.shipment_id
    WHERE rescue.id = 'aaaaaaaa-0000-0000-0000-000000000607'
      AND shipment.order_id = 'aaaaaaaa-0000-0000-0000-000000000505'
  ) THEN
    RAISE EXCEPTION 'Rescue case does not derive the canonical shipment order identity';
  END IF;
END;
$$;

INSERT INTO shipping.provider_references (
  id, tenant_id, carrier_account_id, entity_type, canonical_id, external_id
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000608',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'SHIPMENT',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'carrier-shipment-a'
);

INSERT INTO shipping.shipment_timeline (
  id, tenant_id, store_id, shipment_id, event_type, actor_type, actor_id, data
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000609',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'shipping.shipment.created',
  'USER',
  '11111111-1111-1111-1111-111111111111',
  '{"fixture":true}'::jsonb
);
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'shipping-rls-b',
  'shipping-rls-b'
);

INSERT INTO shipping.carrier_accounts (
  id, tenant_id, connection_id, carrier_key, account_label, display_name
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000601',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bbbbbbbb-0000-0000-0000-000000000202',
  'test-carrier',
  'Shipping RLS Account B',
  'Test Carrier'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM shipping.carrier_accounts
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000601'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A carrier account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.shipments
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000603'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A shipment';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.packages
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000604'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A package';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.tracking_events
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000605'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A tracking event';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.rescue_cases
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000607'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A rescue case';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM shipping.carrier_accounts
    WHERE id = 'bbbbbbbb-0000-0000-0000-000000000601'
  ) THEN
    RAISE EXCEPTION 'Tenant B cannot read own carrier account';
  END IF;

  UPDATE shipping.shipments
  SET status = 'CANCELLED'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000603';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A shipment';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO shipping.carrier_services (
      tenant_id, carrier_account_id, service_code, name
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-0000-0000-000000000601',
      'cross-tenant-write',
      'Cross Tenant Write'
    );
    RAISE EXCEPTION 'Tenant B inserted Tenant A shipping data';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO shipping.carrier_services (
      tenant_id, carrier_account_id, service_code, name
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000601',
      'cross-tenant-relationship',
      'Cross Tenant Relationship'
    );
    RAISE EXCEPTION 'Tenant B linked a service to Tenant A carrier account';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO shipping.rescue_cases (
      tenant_id, store_id, shipment_id, state, trigger_reason, priority, summary
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'bbbbbbbb-0000-0000-0000-000000000501',
      'aaaaaaaa-0000-0000-0000-000000000603',
      'OPEN',
      'OTHER',
      'LOW',
      'Cross-tenant rescue relation must fail'
    );
    RAISE EXCEPTION 'Tenant B linked rescue state to Tenant A shipment';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;
