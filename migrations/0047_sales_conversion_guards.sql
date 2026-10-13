-- Close the lead-to-opportunity conversion invariant at the canonical database boundary.
-- Every mutation path (API, automation, Temporal, future AI tools) must convert only a
-- QUALIFIED lead, preserve the CRM customer relationship, and create at most one
-- opportunity from a lead.

BEGIN;

CREATE UNIQUE INDEX sales_opportunities_one_per_lead_idx
  ON sales.opportunities (tenant_id, lead_id)
  WHERE lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sales.assert_convertible_opportunity_lead()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lead_customer_id uuid;
  lead_status text;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lead.customer_id, lead.status
  INTO lead_customer_id, lead_status
  FROM sales.leads AS lead
  WHERE lead.tenant_id = NEW.tenant_id
    AND lead.id = NEW.lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales opportunity lead was not found in the active tenant';
  END IF;

  IF lead_customer_id <> NEW.customer_id THEN
    RAISE EXCEPTION 'Sales lead and opportunity must reference the same customer';
  END IF;

  IF lead_status <> 'QUALIFIED' THEN
    RAISE EXCEPTION 'Sales opportunity creation requires a QUALIFIED lead';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_opportunity_convertible_lead_guard ON sales.opportunities;
CREATE TRIGGER sales_opportunity_convertible_lead_guard
BEFORE INSERT OR UPDATE OF tenant_id, lead_id, customer_id ON sales.opportunities
FOR EACH ROW EXECUTE FUNCTION sales.assert_convertible_opportunity_lead();

COMMIT;
