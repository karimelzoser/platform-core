-- A rescue case belongs to exactly one shipment. The shipment is the canonical
-- source of its store/order identity, so keeping a second rescue_cases.order_id
-- creates redundant state that can drift. Normalize the relationship instead.

BEGIN;

ALTER TABLE shipping.rescue_cases
  DROP CONSTRAINT IF EXISTS shipping_rescue_cases_shipment_order_fk,
  DROP CONSTRAINT IF EXISTS rescue_cases_tenant_id_store_id_order_id_fkey,
  DROP COLUMN order_id;

COMMIT;
