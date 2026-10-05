-- Harden internal Shipping derivation triggers. Runtime application code may
-- create provider-action links, but it must not receive direct write privileges
-- over derived label lifecycle state.

BEGIN;

ALTER FUNCTION shipping.sync_label_lifecycle()
  SECURITY DEFINER
  SET search_path = pg_catalog, shipping, integrations;

REVOKE ALL ON FUNCTION shipping.sync_label_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION shipping.sync_label_lifecycle() FROM platform_app;

COMMENT ON FUNCTION shipping.sync_label_lifecycle() IS
  'Internal trigger-only function owned by the migration role. Derives label lifecycle from canonical shipment provider-action state without granting platform_app direct label writes.';

COMMIT;
