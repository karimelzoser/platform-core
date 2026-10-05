-- This file runs after shipping-rls.sql and extends those tenant fixtures with
-- canonical routing, zone eligibility, derived label state, and delivery-attempt
-- evidence.

BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'shipping-routing-rls-a',
  'shipping-routing-rls-a'
);

DO $$
BEGIN
  IF has_table_privilege(current_user, 'shipping.labels', 'INSERT')
     OR has_table_privilege(current_user, 'shipping.labels', 'UPDATE')
     OR has_table_privilege(current_user, 'shipping.labels', 'DELETE') THEN
    RAISE EXCEPTION 'Runtime role can directly mutate derived shipping label state';
  END IF;
END;
$$;

INSERT INTO shipping.locations (
  id, tenant_id, parent_id, level, country_code, code, name, aliases
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000610',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL,
    'COUNTRY',
    'EG',
    'EG',
    'Egypt',
    '["مصر"]'::jsonb
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000611',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000610',
    'REGION',
    'EG',
    'CAIRO-GOV',
    'Cairo Governorate',
    '["Cairo","القاهرة"]'::jsonb
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000612',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000611',
    'CITY',
    'EG',
    'CAIRO',
    'Cairo',
    '["القاهرة"]'::jsonb
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000613',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000612',
    'DISTRICT',
    'EG',
    'NASR-CITY',
    'Nasr City',
    '["مدينة نصر"]'::jsonb
  );

INSERT INTO shipping.zones (
  id, tenant_id, code, name, priority
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000614',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'CAIRO-METRO',
  'Cairo Metro',
  500
);

INSERT INTO shipping.zone_locations (
  tenant_id, zone_id, location_id, include_descendants
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000614',
  'aaaaaaaa-0000-0000-0000-000000000612',
  true
);

INSERT INTO shipping.carrier_location_mappings (
  id, tenant_id, carrier_account_id, location_id,
  external_code, external_name
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000615',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'aaaaaaaa-0000-0000-0000-000000000612',
  'provider-cairo-001',
  'Cairo'
);

INSERT INTO shipping.carrier_service_zone_rules (
  tenant_id, carrier_account_id, carrier_service_id, zone_id, eligibility
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000601',
  'aaaaaaaa-0000-0000-0000-000000000602',
  'aaaaaaaa-0000-0000-0000-000000000614',
  'ALLOWED'
);

SELECT shipping.refresh_shipment_routing(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000603'
);

DO $$
DECLARE
  validation_state text;
  confidence numeric;
  raw_city text;
  normalized_city text;
  resolved_city uuid;
  resolved_zone uuid;
  eligibility record;
BEGIN
  SELECT address_validation_state,
         address_validation_confidence,
         destination->>'city',
         normalized_destination->>'city',
         city_location_id,
         zone_id
  INTO validation_state, confidence, raw_city, normalized_city,
       resolved_city, resolved_zone
  FROM shipping.shipments
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000603';

  IF validation_state <> 'MATCHED' THEN
    RAISE EXCEPTION 'Expected MATCHED address, got %', validation_state;
  END IF;
  IF confidence < 0.80 THEN
    RAISE EXCEPTION 'Expected useful canonical match confidence, got %', confidence;
  END IF;
  IF raw_city <> 'Cairo' OR normalized_city <> 'Cairo' THEN
    RAISE EXCEPTION 'Raw/normalized address separation was not preserved';
  END IF;
  IF resolved_city <> 'aaaaaaaa-0000-0000-0000-000000000612'::uuid
     OR resolved_zone <> 'aaaaaaaa-0000-0000-0000-000000000614'::uuid THEN
    RAISE EXCEPTION 'Canonical city/zone routing did not resolve';
  END IF;

  SELECT * INTO eligibility
  FROM shipping.shipment_service_eligibility(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000603'
  );
  IF eligibility IS NULL OR NOT eligibility.eligible OR eligibility.reason <> 'ZONE_ALLOWED' THEN
    RAISE EXCEPTION 'Expected carrier service to be eligible for Cairo zone';
  END IF;
END;
$$;

INSERT INTO integrations.provider_actions (
  id, tenant_id, connection_id, action_type, input, idempotency_key
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000616',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'shipping.shipment.create_label',
  '{"canonicalShipmentId":"aaaaaaaa-0000-0000-0000-000000000603"}'::jsonb,
  'shipping-routing-label-a'
);

INSERT INTO shipping.shipment_provider_actions (
  provider_action_id, tenant_id, store_id, shipment_id, operation
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000616',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'CREATE_LABEL'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shipping.labels
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND provider_action_id = 'aaaaaaaa-0000-0000-0000-000000000616'
      AND state = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'CREATE_LABEL did not derive a PENDING label lifecycle record';
  END IF;
END;
$$;

UPDATE integrations.provider_actions
SET state = 'SUCCEEDED',
    result = '{"trackingNumber":"TRACK-A-001","trackingUrl":"https://tracking.example/a","externalShipmentId":"carrier-a-001","labelReference":"label-a-001","labelFormat":"PDF"}'::jsonb,
    finished_at = now(),
    updated_at = now()
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000616';

UPDATE shipping.shipment_provider_actions
SET state = 'SUCCEEDED',
    completed_at = now()
WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND provider_action_id = 'aaaaaaaa-0000-0000-0000-000000000616';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shipping.labels
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND provider_action_id = 'aaaaaaaa-0000-0000-0000-000000000616'
      AND state = 'CREATED'
      AND tracking_number = 'TRACK-A-001'
      AND provider_label_reference = 'label-a-001'
      AND label_format = 'PDF'
  ) THEN
    RAISE EXCEPTION 'Successful provider action did not complete the label lifecycle';
  END IF;
END;
$$;

INSERT INTO shipping.tracking_events (
  tenant_id, store_id, shipment_id, package_id,
  event_type, normalized_status, occurred_at, dedupe_key, data
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000501',
    'aaaaaaaa-0000-0000-0000-000000000603',
    'aaaaaaaa-0000-0000-0000-000000000604',
    'OUT_FOR_DELIVERY',
    'OUT_FOR_DELIVERY',
    now(),
    'routing-out-for-delivery-1',
    '{"fixture":"routing"}'::jsonb
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-0000-0000-000000000501',
    'aaaaaaaa-0000-0000-0000-000000000603',
    'aaaaaaaa-0000-0000-0000-000000000604',
    'DELIVERY_FAILED',
    'EXCEPTION',
    now() + interval '1 minute',
    'routing-delivery-failed-1',
    '{"fixture":"routing"}'::jsonb
  );

UPDATE shipping.tracking_events
SET raw_code = 'CUSTOMER_UNAVAILABLE',
    description = 'Customer unavailable during delivery'
WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND shipment_id = 'aaaaaaaa-0000-0000-0000-000000000603'
  AND dedupe_key = 'routing-delivery-failed-1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shipping.delivery_attempts
    WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND shipment_id = 'aaaaaaaa-0000-0000-0000-000000000603'
      AND attempt_number = 2
      AND state = 'FAILED'
  ) THEN
    RAISE EXCEPTION 'Tracking events did not derive a failed delivery attempt';
  END IF;
END;
$$;

INSERT INTO shipping.tracking_events (
  tenant_id, store_id, shipment_id, package_id,
  event_type, normalized_status, raw_code, description,
  occurred_at, dedupe_key, data
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-0000-0000-000000000501',
  'aaaaaaaa-0000-0000-0000-000000000603',
  'aaaaaaaa-0000-0000-0000-000000000604',
  'RETURN_TO_SENDER',
  'RETURN_TO_SENDER',
  'RTS_CUSTOMER_UNREACHABLE',
  'Return to sender after failed delivery',
  now() + interval '2 minutes',
  'routing-rts-1',
  '{"fixture":"routing"}'::jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shipping.shipments
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000603'
      AND terminal_reason_code = 'RTS_CUSTOMER_UNREACHABLE'
      AND terminal_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'RTS tracking state did not persist terminal shipment semantics';
  END IF;
END;
$$;
COMMIT;

BEGIN;
SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'shipping-routing-rls-b',
  'shipping-routing-rls-b'
);

DO $$
DECLARE affected integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM shipping.locations
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000612'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A canonical location';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.zones
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000614'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A shipping zone';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.carrier_location_mappings
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000615'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A carrier location mapping';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shipping.labels
    WHERE provider_action_id = 'aaaaaaaa-0000-0000-0000-000000000616'
  ) THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A derived label';
  END IF;

  UPDATE shipping.zones
  SET name = 'Cross Tenant Update'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000614';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A shipping zone';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO shipping.zone_locations (
      tenant_id, zone_id, location_id, include_descendants
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-0000-0000-0000-000000000614',
      'aaaaaaaa-0000-0000-0000-000000000612',
      true
    );
    RAISE EXCEPTION 'Tenant B linked Tenant A zone/location';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO shipping.carrier_location_mappings (
      tenant_id, carrier_account_id, location_id, external_code
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'bbbbbbbb-0000-0000-0000-000000000601',
      'aaaaaaaa-0000-0000-0000-000000000612',
      'cross-tenant-location'
    );
    RAISE EXCEPTION 'Tenant B linked own carrier to Tenant A location';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;
COMMIT;
