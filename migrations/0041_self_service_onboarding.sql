-- Canonical self-service onboarding and reusable organization business profile.
-- Onboarding records setup disposition only. Team and integration evidence is derived
-- from canonical identity/integration state so this does not create a second backend.

BEGIN;

CREATE TABLE identity.organization_business_profiles (
  tenant_id uuid PRIMARY KEY
    REFERENCES identity.organizations(id) ON DELETE CASCADE,
  country_code text NOT NULL
    CHECK (country_code ~ '^[A-Z]{2}$'),
  currency_code text NOT NULL
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  industry_code text NOT NULL
    CHECK (industry_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  customer_model text NOT NULL
    CHECK (customer_model IN ('B2C', 'B2B', 'HYBRID')),
  commerce_model text NOT NULL
    CHECK (commerce_model IN (
      'ECOMMERCE', 'OMNICHANNEL', 'SERVICES', 'MARKETPLACE',
      'WHOLESALE', 'HYBRID', 'OTHER'
    )),
  monthly_order_volume_band text NOT NULL
    CHECK (monthly_order_volume_band IN (
      'NONE', '1_100', '101_1000', '1001_5000', '5001_20000', '20000_PLUS'
    )),
  monthly_conversation_volume_band text NOT NULL
    CHECK (monthly_conversation_volume_band IN (
      'NONE', '1_100', '101_1000', '1001_5000', '5001_20000', '20000_PLUS'
    )),
  goals text[] NOT NULL DEFAULT array[]::text[]
    CHECK (cardinality(goals) BETWEEN 1 AND 10)
    CHECK (goals <@ ARRAY[
      'SUPPORT_AUTOMATION',
      'ORDER_OPERATIONS',
      'RECOVERY',
      'SALES_GROWTH',
      'CAMPAIGNS',
      'SHIPPING',
      'RETURNS',
      'ANALYTICS',
      'AI_OPERATORS'
    ]::text[]),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organization_business_profiles_touch_updated_at
BEFORE UPDATE ON identity.organization_business_profiles
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE identity.organization_onboarding_progress (
  tenant_id uuid PRIMARY KEY
    REFERENCES identity.organizations(id) ON DELETE CASCADE,
  team_step_status text NOT NULL DEFAULT 'PENDING'
    CHECK (team_step_status IN ('PENDING', 'SKIPPED')),
  integration_step_status text NOT NULL DEFAULT 'PENDING'
    CHECK (integration_step_status IN ('PENDING', 'SKIPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organization_onboarding_progress_touch_updated_at
BEFORE UPDATE ON identity.organization_onboarding_progress
FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE OR REPLACE FUNCTION identity.initialize_organization_onboarding_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, identity
AS $$
BEGIN
  INSERT INTO identity.organization_onboarding_progress (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_initialize_onboarding_progress
AFTER INSERT ON identity.organizations
FOR EACH ROW EXECUTE FUNCTION identity.initialize_organization_onboarding_progress();

INSERT INTO identity.organization_onboarding_progress (tenant_id)
SELECT organization.id
FROM identity.organizations organization
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE identity.organization_business_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.organization_business_profiles
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

ALTER TABLE identity.organization_onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON identity.organization_onboarding_progress
  USING (tenant_id = platform.current_tenant_id())
  WITH CHECK (tenant_id = platform.current_tenant_id());

GRANT SELECT, INSERT, UPDATE
ON identity.organization_business_profiles,
   identity.organization_onboarding_progress
TO platform_app;

COMMIT;
