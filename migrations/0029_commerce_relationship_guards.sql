-- Fulfillment lines must belong to the same order as their fulfillment. The
-- base tables are created by 0027 and contain no rows before this append-only
-- guard migration is applied.

BEGIN;

ALTER TABLE commerce.order_lines
  ADD CONSTRAINT commerce_order_lines_order_identity_unique
  UNIQUE (tenant_id, store_id, order_id, id);

ALTER TABLE commerce.fulfillments
  ADD CONSTRAINT commerce_fulfillments_order_identity_unique
  UNIQUE (tenant_id, store_id, order_id, id);

ALTER TABLE commerce.fulfillment_lines
  ADD COLUMN order_id uuid NOT NULL;

ALTER TABLE commerce.fulfillment_lines
  ADD CONSTRAINT commerce_fulfillment_lines_fulfillment_order_fk
  FOREIGN KEY (tenant_id, store_id, order_id, fulfillment_id)
  REFERENCES commerce.fulfillments(tenant_id, store_id, order_id, id),
  ADD CONSTRAINT commerce_fulfillment_lines_order_line_order_fk
  FOREIGN KEY (tenant_id, store_id, order_id, order_line_id)
  REFERENCES commerce.order_lines(tenant_id, store_id, order_id, id);

COMMIT;
