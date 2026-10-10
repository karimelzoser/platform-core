-- Relationship and advertised-resolution closure for Returns.
-- This intentionally removes STORE_CREDIT from the accepted resolution catalog until a
-- canonical store-credit financial aggregate exists; the platform must not advertise
-- an operation that has no durable execution model.

BEGIN;

ALTER TABLE commerce.provider_mappings
  DROP CONSTRAINT IF EXISTS provider_mappings_entity_type_check;
ALTER TABLE commerce.provider_mappings
  DROP CONSTRAINT IF EXISTS commerce_provider_mappings_entity_type_check;
ALTER TABLE commerce.provider_mappings
  ADD CONSTRAINT provider_mappings_entity_type_check
  CHECK (entity_type IN (
    'STORE', 'PRODUCT', 'VARIANT', 'INVENTORY_LOCATION',
    'ORDER', 'PAYMENT', 'FULFILLMENT', 'RETURN', 'EXCHANGE', 'REFUND'
  ));

ALTER TABLE returns.return_lines
  DROP CONSTRAINT IF EXISTS return_lines_requested_resolution_check;
ALTER TABLE returns.return_lines
  ADD CONSTRAINT return_lines_requested_resolution_check
  CHECK (requested_resolution IN ('REFUND', 'EXCHANGE', 'NO_REFUND'));

ALTER TABLE returns.refunds
  ADD CONSTRAINT returns_refunds_order_fk
  FOREIGN KEY (tenant_id, order_id)
  REFERENCES commerce.orders(tenant_id, id);

COMMIT;
