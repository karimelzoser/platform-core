-- Resolution-specific compensation guards for exchanges and refunds.

BEGIN;

CREATE OR REPLACE FUNCTION returns.validate_exchange_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, returns
AS $$
DECLARE
  requested_resolution text;
  accepted integer;
  already_exchanged integer;
BEGIN
  SELECT line.requested_resolution
  INTO requested_resolution
  FROM returns.return_lines line
  WHERE line.tenant_id = NEW.tenant_id
    AND line.return_id = NEW.return_id
    AND line.id = NEW.return_line_id;

  IF requested_resolution IS DISTINCT FROM 'EXCHANGE' THEN
    RAISE EXCEPTION 'Exchange line must reference a return line requesting EXCHANGE'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(inspection.accepted_quantity), 0)::integer
  INTO accepted
  FROM returns.inspection_lines inspection
  WHERE inspection.tenant_id = NEW.tenant_id
    AND inspection.return_id = NEW.return_id
    AND inspection.return_line_id = NEW.return_line_id;

  SELECT coalesce(sum(line.quantity), 0)::integer
  INTO already_exchanged
  FROM returns.exchange_lines line
  JOIN returns.exchange_requests exchange
    ON exchange.tenant_id = line.tenant_id
   AND exchange.id = line.exchange_id
  WHERE line.tenant_id = NEW.tenant_id
    AND line.return_line_id = NEW.return_line_id
    AND exchange.status NOT IN ('CANCELLED', 'FAILED')
    AND (TG_OP <> 'UPDATE' OR line.id <> NEW.id);

  IF already_exchanged + NEW.quantity > accepted THEN
    RAISE EXCEPTION 'Exchange quantity exceeds accepted inspected quantity'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER returns_exchange_lines_validate
BEFORE INSERT OR UPDATE OF quantity, return_line_id ON returns.exchange_lines
FOR EACH ROW EXECUTE FUNCTION returns.validate_exchange_line();

CREATE OR REPLACE FUNCTION returns.validate_refund_return_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, returns
AS $$
DECLARE
  eligible_value bigint;
  already_refunded bigint;
BEGIN
  SELECT coalesce(sum(
    floor(line.proposed_refund_minor::numeric * inspection.accepted_quantity / line.quantity)
  ), 0)::bigint
  INTO eligible_value
  FROM returns.return_lines line
  JOIN returns.inspection_lines inspection
    ON inspection.tenant_id = line.tenant_id
   AND inspection.return_id = line.return_id
   AND inspection.return_line_id = line.id
  WHERE line.tenant_id = NEW.tenant_id
    AND line.return_id = NEW.return_id
    AND line.requested_resolution = 'REFUND';

  SELECT coalesce(sum(refund.amount_minor), 0)::bigint
  INTO already_refunded
  FROM returns.refunds refund
  WHERE refund.tenant_id = NEW.tenant_id
    AND refund.return_id = NEW.return_id
    AND refund.status NOT IN ('FAILED', 'CANCELLED')
    AND (TG_OP <> 'UPDATE' OR refund.id <> NEW.id);

  IF already_refunded + NEW.amount_minor > eligible_value THEN
    RAISE EXCEPTION 'Cumulative refund exceeds accepted REFUND resolution value'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER returns_refunds_resolution_validate
BEFORE INSERT OR UPDATE OF amount_minor, status, return_id ON returns.refunds
FOR EACH ROW EXECUTE FUNCTION returns.validate_refund_return_value();

COMMIT;
