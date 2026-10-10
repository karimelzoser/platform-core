#!/usr/bin/env sh
set -eu
compose='docker compose -f docker/integration/compose.yml'

$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/fixtures.sql
$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/identity-fixtures.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - <<'SQL'
BEGIN;
SELECT platform.set_request_context(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'test-subject-a',
  'provider-action-worker-cleanup'
);
DO $$
DECLARE affected integer;
BEGIN
  UPDATE integrations.provider_actions
  SET state = 'CANCELED',
      claimed_by = NULL,
      claimed_at = NULL,
      finished_at = now(),
      updated_at = now()
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000107'
    AND state = 'RUNNING'
    AND claimed_by = 'integration-test-worker';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Provider action lease fixture cleanup expected exactly one row, updated %', affected;
  END IF;
END;
$$;
COMMIT;
SQL
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/commerce-rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/shipping-rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/shipping-routing-rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/usage-metering-rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/identity-organization-rls.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/onboarding-rls.sql
$compose exec -T postgres psql -U platform_migrator -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/identity-privileged-role-fixtures.sql
PGPASSWORD=platform-test-app-password $compose exec -T --env PGPASSWORD postgres psql -U platform_app -d platform -v ON_ERROR_STOP=1 -f - < tests/integration/identity-privileged-role-guards.sql

$compose exec -T postgres psql -U platform_migrator -d platform -Atqc "SELECT to_regclass('integrations.connections'), to_regclass('integrations.webhook_subscriptions'), to_regclass('integrations.provider_actions'), to_regclass('policy.approval_requests'), to_regclass('messaging.conversations'), to_regclass('messaging.messages'), to_regclass('messaging.message_attachments'), to_regclass('messaging.media_uploads'), to_regclass('messaging.templates'), to_regclass('tickets.records'), to_regclass('tickets.comments'), to_regclass('commerce.stores'), to_regclass('commerce.products'), to_regclass('commerce.variants'), to_regclass('commerce.inventory_levels'), to_regclass('commerce.orders'), to_regclass('commerce.order_lines'), to_regclass('commerce.payments'), to_regclass('commerce.fulfillments'), to_regclass('commerce.provider_mappings'), to_regclass('commerce.order_timeline'), to_regclass('shipping.carrier_accounts'), to_regclass('shipping.carrier_services'), to_regclass('shipping.shipments'), to_regclass('shipping.shipment_lines'), to_regclass('shipping.packages'), to_regclass('shipping.tracking_events'), to_regclass('shipping.delivery_attempts'), to_regclass('shipping.rescue_cases'), to_regclass('shipping.provider_references'), to_regclass('shipping.shipment_provider_actions'), to_regclass('shipping.shipment_timeline'), to_regclass('shipping.locations'), to_regclass('shipping.zones'), to_regclass('shipping.zone_locations'), to_regclass('shipping.carrier_location_mappings'), to_regclass('shipping.carrier_service_zone_rules'), to_regclass('shipping.labels'), to_regclass('platform.meter_definitions'), to_regclass('platform.usage_records'), to_regclass('identity.organization_invitations'), to_regclass('identity.organization_invitation_roles'), to_regclass('identity.organization_business_profiles'), to_regclass('identity.organization_onboarding_progress'), to_regprocedure('integrations.resolve_webhook_connection(text,uuid)'), to_regprocedure('integrations.claim_webhook_deliveries(text,integer,integer)'), to_regprocedure('integrations.claim_sync_runs(text,integer,integer)'), to_regprocedure('integrations.claim_webhook_subscriptions(text,integer,integer)'), to_regprocedure('integrations.claim_provider_actions(text,integer,integer)'), to_regprocedure('messaging.claim_outbound_messages(text,integer,integer)'), to_regprocedure('shipping.refresh_shipment_routing(uuid,uuid)'), to_regprocedure('shipping.shipment_service_eligibility(uuid,uuid)'), to_regprocedure('identity.create_organization_for_current_subject(text,text,text,text,text,text,text)'), to_regprocedure('identity.accept_organization_invitation(uuid,text,text,text,text,text)');" | grep -qx 'integrations.connections|integrations.webhook_subscriptions|integrations.provider_actions|policy.approval_requests|messaging.conversations|messaging.messages|messaging.message_attachments|messaging.media_uploads|messaging.templates|tickets.records|tickets.comments|commerce.stores|commerce.products|commerce.variants|commerce.inventory_levels|commerce.orders|commerce.order_lines|commerce.payments|commerce.fulfillments|commerce.provider_mappings|commerce.order_timeline|shipping.carrier_accounts|shipping.carrier_services|shipping.shipments|shipping.shipment_lines|shipping.packages|shipping.tracking_events|shipping.delivery_attempts|shipping.rescue_cases|shipping.provider_references|shipping.shipment_provider_actions|shipping.shipment_timeline|shipping.locations|shipping.zones|shipping.zone_locations|shipping.carrier_location_mappings|shipping.carrier_service_zone_rules|shipping.labels|platform.meter_definitions|platform.usage_records|identity.organization_invitations|identity.organization_invitation_roles|identity.organization_business_profiles|identity.organization_onboarding_progress|integrations.resolve_webhook_connection(text,uuid)|integrations.claim_webhook_deliveries(text,integer,integer)|integrations.claim_sync_runs(text,integer,integer)|integrations.claim_webhook_subscriptions(text,integer,integer)|integrations.claim_provider_actions(text,integer,integer)|messaging.claim_outbound_messages(text,integer,integer)|shipping.refresh_shipment_routing(uuid,uuid)|shipping.shipment_service_eligibility(uuid,uuid)|identity.create_organization_for_current_subject(text,text,text,text,text,text,text)|identity.accept_organization_invitation(uuid,text,text,text,text,text)'
