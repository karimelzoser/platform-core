BEGIN;

SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'onboarding-rls-a'
);

INSERT INTO identity.organization_business_profiles (
  tenant_id,
  country_code,
  currency_code,
  industry_code,
  customer_model,
  commerce_model,
  monthly_order_volume_band,
  monthly_conversation_volume_band,
  goals
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'EG',
  'EGP',
  'ECOMMERCE',
  'B2C',
  'ECOMMERCE',
  '101_1000',
  '1001_5000',
  ARRAY['SUPPORT_AUTOMATION', 'ORDER_OPERATIONS']::text[]
);

INSERT INTO identity.organization_onboarding_progress (
  tenant_id,
  team_step_status,
  integration_step_status
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'SKIPPED',
  'PENDING'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  team_step_status = EXCLUDED.team_step_status,
  integration_step_status = EXCLUDED.integration_step_status,
  updated_at = now();

DO $$
DECLARE profile_count integer;
DECLARE progress_count integer;
BEGIN
  SELECT count(*) INTO profile_count
  FROM identity.organization_business_profiles;
  SELECT count(*) INTO progress_count
  FROM identity.organization_onboarding_progress;
  IF profile_count <> 1 THEN
    RAISE EXCEPTION 'Tenant A expected one visible onboarding profile, got %', profile_count;
  END IF;
  IF progress_count <> 1 THEN
    RAISE EXCEPTION 'Tenant A expected one visible onboarding progress row, got %', progress_count;
  END IF;
END;
$$;

SELECT platform.set_request_context(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'test-subject-b',
  'onboarding-rls-b'
);

DO $$
DECLARE profile_count integer;
DECLARE progress_count integer;
DECLARE affected integer;
BEGIN
  SELECT count(*) INTO profile_count
  FROM identity.organization_business_profiles;
  SELECT count(*) INTO progress_count
  FROM identity.organization_onboarding_progress
  WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF profile_count <> 0 THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A onboarding profile';
  END IF;
  IF progress_count <> 0 THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A onboarding progress';
  END IF;

  UPDATE identity.organization_business_profiles
  SET currency_code = 'USD'
  WHERE tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'Tenant B updated Tenant A onboarding profile';
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO identity.organization_business_profiles (
      tenant_id,
      country_code,
      currency_code,
      industry_code,
      customer_model,
      commerce_model,
      monthly_order_volume_band,
      monthly_conversation_volume_band,
      goals
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'US',
      'USD',
      'OTHER',
      'B2B',
      'SERVICES',
      '1_100',
      '1_100',
      ARRAY['ANALYTICS']::text[]
    );
    RAISE EXCEPTION 'Tenant B inserted a Tenant A onboarding profile';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
