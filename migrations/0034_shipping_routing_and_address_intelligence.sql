-- Canonical Shipping routing, address normalization, service eligibility, label
-- lifecycle, and delivery-attempt derivation. Provider-native geography stays in
-- carrier mappings; canonical customer/order addresses remain provider-neutral.

BEGIN;

CREATE TABLE shipping.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  parent_id uuid,
  level text NOT NULL
    CHECK (level IN ('COUNTRY', 'REGION', 'CITY', 'DISTRICT')),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(aliases) = 'array'),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, level, country_code, code),
  FOREIGN KEY (tenant_id, parent_id)
    REFERENCES shipping.locations(tenant_id, id)
);
CREATE UNIQUE INDEX shipping_locations_name_unique_ci
  ON shipping.locations (
    tenant_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    level,
    country_code,
    lower(name)
  )
  WHERE status = 'ACTIVE';
CREATE INDEX shipping_locations_parent_idx
  ON shipping.locations (tenant_id, parent_id, level, status, name);
CREATE INDEX shipping_locations_country_idx
  ON shipping.locations (tenant_id, country_code, level, status, name);
CREATE TRIGGER shipping_locations_touch_updated_at
  BEFORE UPDATE ON shipping.locations
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE OR REPLACE FUNCTION shipping.validate_location_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_level text;
  parent_country text;
BEGIN
  IF NEW.level = 'COUNTRY' THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'COUNTRY locations cannot have a parent';
    END IF;
    IF NEW.code <> NEW.country_code THEN
      RAISE EXCEPTION 'COUNTRY location code must equal country_code';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RAISE EXCEPTION '% locations require a parent', NEW.level;
  END IF;

  SELECT level, country_code
  INTO parent_level, parent_country
  FROM shipping.locations
  WHERE tenant_id = NEW.tenant_id
    AND id = NEW.parent_id
    AND status = 'ACTIVE';

  IF parent_level IS NULL THEN
    RAISE EXCEPTION 'Active parent location was not found';
  END IF;
  IF parent_country <> NEW.country_code THEN
    RAISE EXCEPTION 'Location country_code must match its parent';
  END IF;
  IF (NEW.level = 'REGION' AND parent_level <> 'COUNTRY')
     OR (NEW.level = 'CITY' AND parent_level <> 'REGION')
     OR (NEW.level = 'DISTRICT' AND parent_level <> 'CITY') THEN
    RAISE EXCEPTION 'Invalid location hierarchy: % cannot be a child of %', NEW.level, parent_level;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER shipping_locations_validate_hierarchy
  BEFORE INSERT OR UPDATE OF tenant_id, parent_id, level, country_code, code
  ON shipping.locations
  FOR EACH ROW EXECUTE FUNCTION shipping.validate_location_hierarchy();

CREATE TABLE shipping.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES identity.organizations(id),
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 300),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000000),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX shipping_zones_name_unique_ci
  ON shipping.zones (tenant_id, lower(name))
  WHERE status <> 'ARCHIVED';
CREATE INDEX shipping_zones_status_idx
  ON shipping.zones (tenant_id, status, priority DESC, name);
CREATE TRIGGER shipping_zones_touch_updated_at
  BEFORE UPDATE ON shipping.zones
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.zone_locations (
  tenant_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  location_id uuid NOT NULL,
  include_descendants boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, zone_id, location_id),
  FOREIGN KEY (tenant_id, zone_id)
    REFERENCES shipping.zones(tenant_id, id),
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES shipping.locations(tenant_id, id)
);
CREATE INDEX shipping_zone_locations_location_idx
  ON shipping.zone_locations (tenant_id, location_id, zone_id);

CREATE TABLE shipping.carrier_location_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  carrier_account_id uuid NOT NULL,
  location_id uuid NOT NULL,
  external_code text NOT NULL CHECK (length(trim(external_code)) BETWEEN 1 AND 300),
  external_name text CHECK (external_name IS NULL OR length(trim(external_name)) BETWEEN 1 AND 500),
  state text NOT NULL DEFAULT 'ACTIVE'
    CHECK (state IN ('ACTIVE', 'STALE', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, carrier_account_id, location_id),
  UNIQUE (tenant_id, carrier_account_id, external_code),
  FOREIGN KEY (tenant_id, carrier_account_id)
    REFERENCES shipping.carrier_accounts(tenant_id, id),
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES shipping.locations(tenant_id, id)
);
CREATE INDEX shipping_carrier_location_mappings_state_idx
  ON shipping.carrier_location_mappings (
    tenant_id, carrier_account_id, state, location_id
  );
CREATE TRIGGER shipping_carrier_location_mappings_touch_updated_at
  BEFORE UPDATE ON shipping.carrier_location_mappings
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE shipping.carrier_service_zone_rules (
  tenant_id uuid NOT NULL,
  carrier_account_id uuid NOT NULL,
  carrier_service_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  eligibility text NOT NULL DEFAULT 'ALLOWED'
    CHECK (eligibility IN ('ALLOWED', 'BLOCKED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, carrier_service_id, zone_id),
  FOREIGN KEY (tenant_id, carrier_account_id, carrier_service_id)
    REFERENCES shipping.carrier_services(tenant_id, carrier_account_id, id),
  FOREIGN KEY (tenant_id, zone_id)
    REFERENCES shipping.zones(tenant_id, id)
);
CREATE INDEX shipping_carrier_service_zone_rules_lookup_idx
  ON shipping.carrier_service_zone_rules (
    tenant_id, carrier_account_id, carrier_service_id, eligibility, zone_id
  );
CREATE TRIGGER shipping_carrier_service_zone_rules_touch_updated_at
  BEFORE UPDATE ON shipping.carrier_service_zone_rules
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

ALTER TABLE shipping.shipments
  ADD COLUMN normalized_destination jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(normalized_destination) = 'object'),
  ADD COLUMN address_validation_state text NOT NULL DEFAULT 'UNVALIDATED'
    CHECK (address_validation_state IN (
      'UNVALIDATED', 'MATCHED', 'AMBIGUOUS', 'UNSUPPORTED', 'MANUAL_REVIEW'
    )),
  ADD COLUMN address_validation_confidence numeric(5,4)
    CHECK (
      address_validation_confidence IS NULL
      OR address_validation_confidence BETWEEN 0 AND 1
    ),
  ADD COLUMN address_validation_source text NOT NULL DEFAULT 'AUTO'
    CHECK (address_validation_source IN ('AUTO', 'MANUAL', 'PROVIDER')),
  ADD COLUMN country_location_id uuid,
  ADD COLUMN region_location_id uuid,
  ADD COLUMN city_location_id uuid,
  ADD COLUMN district_location_id uuid,
  ADD COLUMN zone_id uuid,
  ADD COLUMN terminal_reason_code text,
  ADD COLUMN terminal_reason_text text,
  ADD COLUMN terminal_at timestamptz,
  ADD CONSTRAINT shipping_shipments_country_location_fk
    FOREIGN KEY (tenant_id, country_location_id)
    REFERENCES shipping.locations(tenant_id, id),
  ADD CONSTRAINT shipping_shipments_region_location_fk
    FOREIGN KEY (tenant_id, region_location_id)
    REFERENCES shipping.locations(tenant_id, id),
  ADD CONSTRAINT shipping_shipments_city_location_fk
    FOREIGN KEY (tenant_id, city_location_id)
    REFERENCES shipping.locations(tenant_id, id),
  ADD CONSTRAINT shipping_shipments_district_location_fk
    FOREIGN KEY (tenant_id, district_location_id)
    REFERENCES shipping.locations(tenant_id, id),
  ADD CONSTRAINT shipping_shipments_zone_fk
    FOREIGN KEY (tenant_id, zone_id)
    REFERENCES shipping.zones(tenant_id, id),
  ADD CONSTRAINT shipping_shipments_terminal_reason_code_length
    CHECK (terminal_reason_code IS NULL OR length(terminal_reason_code) <= 200),
  ADD CONSTRAINT shipping_shipments_terminal_reason_text_length
    CHECK (terminal_reason_text IS NULL OR length(terminal_reason_text) <= 4000);
CREATE INDEX shipping_shipments_routing_idx
  ON shipping.shipments (
    tenant_id, address_validation_state, zone_id, carrier_service_id, updated_at DESC
  );

COMMENT ON COLUMN shipping.shipments.destination IS
  'Raw customer destination captured at shipment creation; never replace with carrier-native geography.';
COMMENT ON COLUMN shipping.shipments.normalized_destination IS
  'Canonical normalized destination derived from the tenant location catalog or an explicit reviewed override.';

CREATE TABLE shipping.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  store_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  provider_action_id uuid NOT NULL,
  package_id uuid,
  state text NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'CREATED', 'FAILED', 'VOIDED')),
  provider_label_reference text,
  label_format text,
  tracking_number text,
  tracking_url text,
  external_shipment_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider_action_id),
  FOREIGN KEY (tenant_id, store_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, id),
  FOREIGN KEY (tenant_id, store_id, shipment_id, package_id)
    REFERENCES shipping.packages(tenant_id, store_id, shipment_id, id),
  FOREIGN KEY (tenant_id, provider_action_id)
    REFERENCES shipping.shipment_provider_actions(tenant_id, provider_action_id),
  CHECK (
    provider_label_reference IS NULL
    OR length(provider_label_reference) <= 4000
  ),
  CHECK (label_format IS NULL OR length(label_format) <= 100),
  CHECK (tracking_number IS NULL OR length(tracking_number) <= 300),
  CHECK (tracking_url IS NULL OR length(tracking_url) <= 2000),
  CHECK (external_shipment_id IS NULL OR length(external_shipment_id) <= 500),
  CHECK (error_code IS NULL OR length(error_code) <= 300)
);
CREATE INDEX shipping_labels_shipment_idx
  ON shipping.labels (tenant_id, shipment_id, state, created_at DESC);
CREATE TRIGGER shipping_labels_touch_updated_at
  BEFORE UPDATE ON shipping.labels
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE OR REPLACE FUNCTION shipping.match_location_name(
  p_tenant_id uuid,
  p_level text,
  p_country_code text,
  p_parent_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  select location.id
  from shipping.locations as location
  where location.tenant_id = p_tenant_id
    and location.level = p_level
    and location.country_code = p_country_code
    and location.status = 'ACTIVE'
    and (p_parent_id is null or location.parent_id = p_parent_id)
    and (
      lower(location.name) = lower(trim(p_name))
      or exists (
        select 1
        from jsonb_array_elements_text(location.aliases) as alias(value)
        where lower(alias.value) = lower(trim(p_name))
      )
    )
  order by location.name, location.id
  limit 1;
$$;

CREATE OR REPLACE FUNCTION shipping.refresh_shipment_routing(
  p_tenant_id uuid,
  p_shipment_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  raw jsonb;
  country_code text;
  region_name text;
  city_name text;
  district_name text;
  country_id uuid;
  region_id uuid;
  city_id uuid;
  district_id uuid;
  resolved_zone_id uuid;
  validation_state text := 'UNVALIDATED';
  confidence numeric(5,4) := 0;
  country_label text;
  region_label text;
  city_label text;
  district_label text;
BEGIN
  SELECT destination
  INTO raw
  FROM shipping.shipments
  WHERE tenant_id = p_tenant_id
    AND id = p_shipment_id
  FOR UPDATE;

  IF raw IS NULL THEN
    RETURN;
  END IF;

  country_code := upper(trim(coalesce(raw->>'countryCode', '')));
  region_name := nullif(trim(coalesce(raw->>'region', '')), '');
  city_name := nullif(trim(coalesce(raw->>'city', '')), '');
  district_name := nullif(trim(coalesce(raw->>'district', '')), '');

  SELECT id, name
  INTO country_id, country_label
  FROM shipping.locations
  WHERE tenant_id = p_tenant_id
    AND level = 'COUNTRY'
    AND country_code = country_code
    AND code = country_code
    AND status = 'ACTIVE'
  LIMIT 1;

  -- Qualify PL/pgSQL variables explicitly after the country lookup to avoid
  -- accidental self-comparison if column names and variables evolve together.
  IF country_id IS NULL THEN
    validation_state := 'UNSUPPORTED';
    confidence := 0;
  ELSE
    IF region_name IS NOT NULL THEN
      region_id := shipping.match_location_name(
        p_tenant_id, 'REGION', country_code, country_id, region_name
      );
    END IF;
    IF city_name IS NOT NULL THEN
      IF region_id IS NOT NULL THEN
        city_id := shipping.match_location_name(
          p_tenant_id, 'CITY', country_code, region_id, city_name
        );
      ELSE
        SELECT location.id
        INTO city_id
        FROM shipping.locations AS location
        WHERE location.tenant_id = p_tenant_id
          AND location.level = 'CITY'
          AND location.country_code = country_code
          AND location.status = 'ACTIVE'
          AND (
            lower(location.name) = lower(city_name)
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(location.aliases) AS alias(value)
              WHERE lower(alias.value) = lower(city_name)
            )
          )
        ORDER BY location.id
        LIMIT 1;
      END IF;
    END IF;
    IF district_name IS NOT NULL AND city_id IS NOT NULL THEN
      district_id := shipping.match_location_name(
        p_tenant_id, 'DISTRICT', country_code, city_id, district_name
      );
    END IF;

    SELECT name INTO region_label
    FROM shipping.locations WHERE tenant_id = p_tenant_id AND id = region_id;
    SELECT name INTO city_label
    FROM shipping.locations WHERE tenant_id = p_tenant_id AND id = city_id;
    SELECT name INTO district_label
    FROM shipping.locations WHERE tenant_id = p_tenant_id AND id = district_id;

    IF district_name IS NOT NULL AND district_id IS NULL THEN
      validation_state := 'MANUAL_REVIEW';
      confidence := 0.5000;
    ELSIF city_name IS NOT NULL AND city_id IS NULL THEN
      validation_state := 'MANUAL_REVIEW';
      confidence := 0.4500;
    ELSIF region_name IS NOT NULL AND region_id IS NULL THEN
      validation_state := 'MANUAL_REVIEW';
      confidence := 0.4000;
    ELSIF district_id IS NOT NULL THEN
      validation_state := 'MATCHED';
      confidence := 1.0000;
    ELSIF city_id IS NOT NULL THEN
      validation_state := 'MATCHED';
      confidence := CASE WHEN region_id IS NOT NULL THEN 0.9500 ELSE 0.8000 END;
    ELSIF region_id IS NOT NULL THEN
      validation_state := 'MATCHED';
      confidence := 0.7000;
    ELSE
      validation_state := 'MATCHED';
      confidence := 0.4000;
    END IF;
  END IF;

  WITH RECURSIVE ancestry AS (
    SELECT location.id, location.parent_id, location.level,
           CASE location.level
             WHEN 'DISTRICT' THEN 4
             WHEN 'CITY' THEN 3
             WHEN 'REGION' THEN 2
             ELSE 1
           END AS specificity
    FROM shipping.locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.id = coalesce(district_id, city_id, region_id, country_id)
    UNION ALL
    SELECT parent.id, parent.parent_id, parent.level,
           CASE parent.level
             WHEN 'DISTRICT' THEN 4
             WHEN 'CITY' THEN 3
             WHEN 'REGION' THEN 2
             ELSE 1
           END
    FROM shipping.locations AS parent
    JOIN ancestry AS child ON child.parent_id = parent.id
    WHERE parent.tenant_id = p_tenant_id
  )
  SELECT zone.id
  INTO resolved_zone_id
  FROM ancestry
  JOIN shipping.zone_locations AS membership
    ON membership.tenant_id = p_tenant_id
   AND membership.location_id = ancestry.id
  JOIN shipping.zones AS zone
    ON zone.tenant_id = membership.tenant_id
   AND zone.id = membership.zone_id
   AND zone.status = 'ACTIVE'
  WHERE membership.include_descendants
     OR ancestry.id = coalesce(district_id, city_id, region_id, country_id)
  ORDER BY ancestry.specificity DESC, zone.priority DESC, zone.id
  LIMIT 1;

  UPDATE shipping.shipments
  SET normalized_destination = jsonb_strip_nulls(
        jsonb_build_object(
          'name', raw->>'name',
          'company', raw->>'company',
          'line1', raw->>'line1',
          'line2', raw->>'line2',
          'district', district_label,
          'city', coalesce(city_label, raw->>'city'),
          'region', coalesce(region_label, raw->>'region'),
          'postalCode', raw->>'postalCode',
          'countryCode', nullif(country_code, ''),
          'phone', raw->>'phone'
        )
      ),
      address_validation_state = validation_state,
      address_validation_confidence = confidence,
      address_validation_source = 'AUTO',
      country_location_id = country_id,
      region_location_id = region_id,
      city_location_id = city_id,
      district_location_id = district_id,
      zone_id = resolved_zone_id,
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND id = p_shipment_id;
END;
$$;

-- Replace the function body above with a variable-safe country lookup. PostgreSQL
-- resolves PL/pgSQL variables before unqualified column names in ambiguous cases,
-- so keep the lookup explicitly aliased.
CREATE OR REPLACE FUNCTION shipping.refresh_shipment_routing(
  p_tenant_id uuid,
  p_shipment_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  raw jsonb;
  v_country_code text;
  v_region_name text;
  v_city_name text;
  v_district_name text;
  v_country_id uuid;
  v_region_id uuid;
  v_city_id uuid;
  v_district_id uuid;
  v_zone_id uuid;
  v_validation_state text := 'UNVALIDATED';
  v_confidence numeric(5,4) := 0;
  v_country_label text;
  v_region_label text;
  v_city_label text;
  v_district_label text;
BEGIN
  SELECT shipment.destination
  INTO raw
  FROM shipping.shipments AS shipment
  WHERE shipment.tenant_id = p_tenant_id
    AND shipment.id = p_shipment_id
  FOR UPDATE;

  IF raw IS NULL THEN RETURN; END IF;

  v_country_code := upper(trim(coalesce(raw->>'countryCode', '')));
  v_region_name := nullif(trim(coalesce(raw->>'region', '')), '');
  v_city_name := nullif(trim(coalesce(raw->>'city', '')), '');
  v_district_name := nullif(trim(coalesce(raw->>'district', '')), '');

  SELECT location.id, location.name
  INTO v_country_id, v_country_label
  FROM shipping.locations AS location
  WHERE location.tenant_id = p_tenant_id
    AND location.level = 'COUNTRY'
    AND location.country_code = v_country_code
    AND location.code = v_country_code
    AND location.status = 'ACTIVE'
  LIMIT 1;

  IF v_country_id IS NULL THEN
    v_validation_state := 'UNSUPPORTED';
    v_confidence := 0;
  ELSE
    IF v_region_name IS NOT NULL THEN
      v_region_id := shipping.match_location_name(
        p_tenant_id, 'REGION', v_country_code, v_country_id, v_region_name
      );
    END IF;
    IF v_city_name IS NOT NULL THEN
      IF v_region_id IS NOT NULL THEN
        v_city_id := shipping.match_location_name(
          p_tenant_id, 'CITY', v_country_code, v_region_id, v_city_name
        );
      ELSE
        SELECT location.id
        INTO v_city_id
        FROM shipping.locations AS location
        WHERE location.tenant_id = p_tenant_id
          AND location.level = 'CITY'
          AND location.country_code = v_country_code
          AND location.status = 'ACTIVE'
          AND (
            lower(location.name) = lower(v_city_name)
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(location.aliases) AS alias(value)
              WHERE lower(alias.value) = lower(v_city_name)
            )
          )
        ORDER BY location.id
        LIMIT 1;
      END IF;
    END IF;
    IF v_district_name IS NOT NULL AND v_city_id IS NOT NULL THEN
      v_district_id := shipping.match_location_name(
        p_tenant_id, 'DISTRICT', v_country_code, v_city_id, v_district_name
      );
    END IF;

    SELECT location.name INTO v_region_label
    FROM shipping.locations AS location
    WHERE location.tenant_id = p_tenant_id AND location.id = v_region_id;
    SELECT location.name INTO v_city_label
    FROM shipping.locations AS location
    WHERE location.tenant_id = p_tenant_id AND location.id = v_city_id;
    SELECT location.name INTO v_district_label
    FROM shipping.locations AS location
    WHERE location.tenant_id = p_tenant_id AND location.id = v_district_id;

    IF v_district_name IS NOT NULL AND v_district_id IS NULL THEN
      v_validation_state := 'MANUAL_REVIEW'; v_confidence := 0.5000;
    ELSIF v_city_name IS NOT NULL AND v_city_id IS NULL THEN
      v_validation_state := 'MANUAL_REVIEW'; v_confidence := 0.4500;
    ELSIF v_region_name IS NOT NULL AND v_region_id IS NULL THEN
      v_validation_state := 'MANUAL_REVIEW'; v_confidence := 0.4000;
    ELSIF v_district_id IS NOT NULL THEN
      v_validation_state := 'MATCHED'; v_confidence := 1.0000;
    ELSIF v_city_id IS NOT NULL THEN
      v_validation_state := 'MATCHED';
      v_confidence := CASE WHEN v_region_id IS NOT NULL THEN 0.9500 ELSE 0.8000 END;
    ELSIF v_region_id IS NOT NULL THEN
      v_validation_state := 'MATCHED'; v_confidence := 0.7000;
    ELSE
      v_validation_state := 'MATCHED'; v_confidence := 0.4000;
    END IF;
  END IF;

  WITH RECURSIVE ancestry AS (
    SELECT location.id, location.parent_id, location.level,
           CASE location.level
             WHEN 'DISTRICT' THEN 4 WHEN 'CITY' THEN 3
             WHEN 'REGION' THEN 2 ELSE 1 END AS specificity
    FROM shipping.locations AS location
    WHERE location.tenant_id = p_tenant_id
      AND location.id = coalesce(v_district_id, v_city_id, v_region_id, v_country_id)
    UNION ALL
    SELECT parent.id, parent.parent_id, parent.level,
           CASE parent.level
             WHEN 'DISTRICT' THEN 4 WHEN 'CITY' THEN 3
             WHEN 'REGION' THEN 2 ELSE 1 END
    FROM shipping.locations AS parent
    JOIN ancestry AS child ON child.parent_id = parent.id
    WHERE parent.tenant_id = p_tenant_id
  )
  SELECT zone.id
  INTO v_zone_id
  FROM ancestry
  JOIN shipping.zone_locations AS membership
    ON membership.tenant_id = p_tenant_id
   AND membership.location_id = ancestry.id
  JOIN shipping.zones AS zone
    ON zone.tenant_id = membership.tenant_id
   AND zone.id = membership.zone_id
   AND zone.status = 'ACTIVE'
  WHERE membership.include_descendants
     OR ancestry.id = coalesce(v_district_id, v_city_id, v_region_id, v_country_id)
  ORDER BY ancestry.specificity DESC, zone.priority DESC, zone.id
  LIMIT 1;

  UPDATE shipping.shipments AS shipment
  SET normalized_destination = jsonb_strip_nulls(
        jsonb_build_object(
          'name', raw->>'name', 'company', raw->>'company',
          'line1', raw->>'line1', 'line2', raw->>'line2',
          'district', v_district_label,
          'city', coalesce(v_city_label, raw->>'city'),
          'region', coalesce(v_region_label, raw->>'region'),
          'postalCode', raw->>'postalCode',
          'countryCode', nullif(v_country_code, ''), 'phone', raw->>'phone'
        )
      ),
      address_validation_state = v_validation_state,
      address_validation_confidence = v_confidence,
      address_validation_source = 'AUTO',
      country_location_id = v_country_id,
      region_location_id = v_region_id,
      city_location_id = v_city_id,
      district_location_id = v_district_id,
      zone_id = v_zone_id,
      updated_at = now()
  WHERE shipment.tenant_id = p_tenant_id
    AND shipment.id = p_shipment_id;
END;
$$;

CREATE OR REPLACE FUNCTION shipping.shipments_refresh_routing_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM shipping.refresh_shipment_routing(NEW.tenant_id, NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER shipping_shipments_refresh_routing
  AFTER INSERT OR UPDATE OF destination ON shipping.shipments
  FOR EACH ROW EXECUTE FUNCTION shipping.shipments_refresh_routing_trigger();

CREATE OR REPLACE FUNCTION shipping.shipment_service_eligibility(
  p_tenant_id uuid,
  p_shipment_id uuid
)
RETURNS TABLE (eligible boolean, reason text, resolved_zone_id uuid)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  shipment_row record;
  rule_count integer;
  rule_value text;
BEGIN
  SELECT shipment.carrier_account_id, shipment.carrier_service_id,
         shipment.zone_id, shipment.address_validation_state
  INTO shipment_row
  FROM shipping.shipments AS shipment
  WHERE shipment.tenant_id = p_tenant_id
    AND shipment.id = p_shipment_id;

  IF shipment_row IS NULL THEN
    RETURN QUERY SELECT false, 'SHIPMENT_NOT_FOUND'::text, NULL::uuid;
    RETURN;
  END IF;
  IF shipment_row.carrier_service_id IS NULL THEN
    RETURN QUERY SELECT true, 'NO_SERVICE_SELECTED'::text, shipment_row.zone_id;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO rule_count
  FROM shipping.carrier_service_zone_rules AS rule
  WHERE rule.tenant_id = p_tenant_id
    AND rule.carrier_service_id = shipment_row.carrier_service_id;

  IF rule_count = 0 THEN
    RETURN QUERY SELECT true, 'NO_ZONE_RULES'::text, shipment_row.zone_id;
    RETURN;
  END IF;
  IF shipment_row.zone_id IS NULL THEN
    RETURN QUERY SELECT false, 'ADDRESS_ZONE_UNRESOLVED'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT rule.eligibility
  INTO rule_value
  FROM shipping.carrier_service_zone_rules AS rule
  WHERE rule.tenant_id = p_tenant_id
    AND rule.carrier_service_id = shipment_row.carrier_service_id
    AND rule.zone_id = shipment_row.zone_id
  LIMIT 1;

  IF rule_value = 'ALLOWED' THEN
    RETURN QUERY SELECT true, 'ZONE_ALLOWED'::text, shipment_row.zone_id;
  ELSIF rule_value = 'BLOCKED' THEN
    RETURN QUERY SELECT false, 'ZONE_BLOCKED'::text, shipment_row.zone_id;
  ELSE
    RETURN QUERY SELECT false, 'ZONE_NOT_ALLOWED'::text, shipment_row.zone_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION shipping.validate_provider_action_routing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  decision record;
BEGIN
  IF NEW.operation NOT IN ('CREATE_LABEL', 'REQUEST_PICKUP') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO decision
  FROM shipping.shipment_service_eligibility(NEW.tenant_id, NEW.shipment_id);

  IF decision IS NOT NULL AND NOT decision.eligible THEN
    RAISE EXCEPTION 'Carrier service is not eligible for shipment route: %', decision.reason
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shipping_provider_actions_validate_routing
  BEFORE INSERT ON shipping.shipment_provider_actions
  FOR EACH ROW EXECUTE FUNCTION shipping.validate_provider_action_routing();

CREATE OR REPLACE FUNCTION shipping.sync_label_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  provider_row record;
BEGIN
  IF NEW.operation <> 'CREATE_LABEL' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO shipping.labels (
      tenant_id, store_id, shipment_id, provider_action_id, state
    ) VALUES (
      NEW.tenant_id, NEW.store_id, NEW.shipment_id, NEW.provider_action_id, 'PENDING'
    )
    ON CONFLICT (tenant_id, provider_action_id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT action.result, action.last_error, action.finished_at
  INTO provider_row
  FROM integrations.provider_actions AS action
  WHERE action.tenant_id = NEW.tenant_id
    AND action.id = NEW.provider_action_id;

  IF NEW.state = 'SUCCEEDED' THEN
    UPDATE shipping.labels
    SET state = 'CREATED',
        provider_label_reference = coalesce(
          provider_row.result->>'labelReference',
          provider_row.result->>'labelUrl',
          provider_label_reference
        ),
        label_format = coalesce(provider_row.result->>'labelFormat', label_format),
        tracking_number = coalesce(provider_row.result->>'trackingNumber', tracking_number),
        tracking_url = coalesce(provider_row.result->>'trackingUrl', tracking_url),
        external_shipment_id = coalesce(
          provider_row.result->>'externalShipmentId', external_shipment_id
        ),
        error_code = null,
        completed_at = coalesce(provider_row.finished_at, now()),
        updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND provider_action_id = NEW.provider_action_id;
  ELSIF NEW.state = 'DEAD_LETTER' THEN
    UPDATE shipping.labels
    SET state = 'FAILED',
        error_code = provider_row.last_error,
        completed_at = coalesce(provider_row.finished_at, now()),
        updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND provider_action_id = NEW.provider_action_id;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER shipping_provider_actions_label_lifecycle_insert
  AFTER INSERT ON shipping.shipment_provider_actions
  FOR EACH ROW EXECUTE FUNCTION shipping.sync_label_lifecycle();
CREATE TRIGGER shipping_provider_actions_label_lifecycle_update
  AFTER UPDATE OF state ON shipping.shipment_provider_actions
  FOR EACH ROW EXECUTE FUNCTION shipping.sync_label_lifecycle();

CREATE OR REPLACE FUNCTION shipping.derive_delivery_attempt_from_tracking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_id uuid;
  next_number integer;
BEGIN
  IF NEW.event_type = 'OUT_FOR_DELIVERY' THEN
    SELECT id INTO attempt_id
    FROM shipping.delivery_attempts
    WHERE tenant_id = NEW.tenant_id
      AND shipment_id = NEW.shipment_id
      AND state IN ('SCHEDULED', 'OUT_FOR_DELIVERY')
    ORDER BY attempt_number DESC
    LIMIT 1
    FOR UPDATE;

    IF attempt_id IS NULL THEN
      SELECT coalesce(max(attempt_number), 0) + 1
      INTO next_number
      FROM shipping.delivery_attempts
      WHERE tenant_id = NEW.tenant_id AND shipment_id = NEW.shipment_id;
      INSERT INTO shipping.delivery_attempts (
        tenant_id, store_id, shipment_id, attempt_number, state, attempted_at,
        metadata
      ) VALUES (
        NEW.tenant_id, NEW.store_id, NEW.shipment_id, next_number,
        'OUT_FOR_DELIVERY', NEW.occurred_at,
        jsonb_build_object('trackingEventId', NEW.id, 'derived', true)
      );
    ELSE
      UPDATE shipping.delivery_attempts
      SET state = 'OUT_FOR_DELIVERY',
          attempted_at = coalesce(attempted_at, NEW.occurred_at),
          updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND id = attempt_id;
    END IF;
  ELSIF NEW.event_type = 'DELIVERY_FAILED' THEN
    SELECT id INTO attempt_id
    FROM shipping.delivery_attempts
    WHERE tenant_id = NEW.tenant_id
      AND shipment_id = NEW.shipment_id
      AND state IN ('SCHEDULED', 'OUT_FOR_DELIVERY')
    ORDER BY attempt_number DESC
    LIMIT 1
    FOR UPDATE;

    IF attempt_id IS NULL THEN
      SELECT coalesce(max(attempt_number), 0) + 1
      INTO next_number
      FROM shipping.delivery_attempts
      WHERE tenant_id = NEW.tenant_id AND shipment_id = NEW.shipment_id;
      INSERT INTO shipping.delivery_attempts (
        tenant_id, store_id, shipment_id, attempt_number, state, attempted_at,
        failure_code, failure_reason, metadata
      ) VALUES (
        NEW.tenant_id, NEW.store_id, NEW.shipment_id, next_number, 'FAILED',
        NEW.occurred_at, NEW.raw_code, NEW.description,
        jsonb_build_object('trackingEventId', NEW.id, 'derived', true)
      );
    ELSE
      UPDATE shipping.delivery_attempts
      SET state = 'FAILED',
          attempted_at = coalesce(attempted_at, NEW.occurred_at),
          failure_code = NEW.raw_code,
          failure_reason = NEW.description,
          updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND id = attempt_id;
    END IF;
  ELSIF NEW.event_type = 'DELIVERED' THEN
    SELECT id INTO attempt_id
    FROM shipping.delivery_attempts
    WHERE tenant_id = NEW.tenant_id
      AND shipment_id = NEW.shipment_id
      AND state IN ('SCHEDULED', 'OUT_FOR_DELIVERY')
    ORDER BY attempt_number DESC
    LIMIT 1
    FOR UPDATE;

    IF attempt_id IS NULL THEN
      SELECT coalesce(max(attempt_number), 0) + 1
      INTO next_number
      FROM shipping.delivery_attempts
      WHERE tenant_id = NEW.tenant_id AND shipment_id = NEW.shipment_id;
      INSERT INTO shipping.delivery_attempts (
        tenant_id, store_id, shipment_id, attempt_number, state, attempted_at,
        metadata
      ) VALUES (
        NEW.tenant_id, NEW.store_id, NEW.shipment_id, next_number, 'DELIVERED',
        NEW.occurred_at,
        jsonb_build_object('trackingEventId', NEW.id, 'derived', true)
      );
    ELSE
      UPDATE shipping.delivery_attempts
      SET state = 'DELIVERED',
          attempted_at = coalesce(attempted_at, NEW.occurred_at),
          updated_at = now()
      WHERE tenant_id = NEW.tenant_id AND id = attempt_id;
    END IF;
  ELSIF NEW.event_type IN ('RETURN_TO_SENDER', 'RETURNED', 'CANCELLED') THEN
    UPDATE shipping.delivery_attempts
    SET state = 'CANCELLED',
        failure_code = coalesce(failure_code, NEW.raw_code, NEW.event_type),
        failure_reason = coalesce(failure_reason, NEW.description),
        updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND shipment_id = NEW.shipment_id
      AND state IN ('SCHEDULED', 'OUT_FOR_DELIVERY');

    UPDATE shipping.shipments
    SET terminal_reason_code = coalesce(NEW.raw_code, NEW.event_type),
        terminal_reason_text = NEW.description,
        terminal_at = NEW.occurred_at,
        updated_at = now()
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.shipment_id;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER shipping_tracking_events_derive_delivery_attempt
  AFTER INSERT ON shipping.tracking_events
  FOR EACH ROW EXECUTE FUNCTION shipping.derive_delivery_attempt_from_tracking();

ALTER TABLE shipping.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.locations
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.zones
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.zone_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.zone_locations
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.carrier_location_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.carrier_location_mappings
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.carrier_service_zone_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.carrier_service_zone_rules
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());
ALTER TABLE shipping.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shipping.labels
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  shipping.locations,
  shipping.zones,
  shipping.zone_locations,
  shipping.carrier_location_mappings,
  shipping.carrier_service_zone_rules
TO platform_app;
GRANT SELECT ON shipping.labels TO platform_app;
GRANT EXECUTE ON FUNCTION shipping.refresh_shipment_routing(uuid, uuid) TO platform_app;
GRANT EXECUTE ON FUNCTION shipping.shipment_service_eligibility(uuid, uuid) TO platform_app;

REVOKE DELETE, TRUNCATE ON
  shipping.locations,
  shipping.zones,
  shipping.zone_locations,
  shipping.carrier_location_mappings,
  shipping.carrier_service_zone_rules,
  shipping.labels
FROM platform_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON shipping.labels FROM platform_app;

COMMIT;
