-- Cross-entity Shipping references must preserve the canonical order identity,
-- not merely match tenant/store scope.

BEGIN;

ALTER TABLE shipping.shipments
  ADD CONSTRAINT shipping_shipments_order_identity_unique
    UNIQUE (tenant_id, store_id, order_id, id);

ALTER TABLE shipping.rescue_cases
  ADD CONSTRAINT shipping_rescue_cases_shipment_order_fk
    FOREIGN KEY (tenant_id, store_id, order_id, shipment_id)
    REFERENCES shipping.shipments(tenant_id, store_id, order_id, id);

COMMIT;
