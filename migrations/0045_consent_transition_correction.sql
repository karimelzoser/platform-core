-- Forward correction after 0044 applied successfully: avoid a PL/pgSQL
-- variable/column name collision and fail closed for missing proof metadata.
BEGIN;

CREATE OR REPLACE FUNCTION crm.assert_verified_opt_in_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, crm, integrations, platform
AS $$
DECLARE
  consent_delivery_reference text;
BEGIN
  IF NEW.status = 'OPTED_IN'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'OPTED_IN') THEN
    consent_delivery_reference := NEW.metadata ->> 'webhookDeliveryId';

    IF NEW.source IS DISTINCT FROM 'provider_webhook'
       OR NEW.metadata ->> 'evidenceType' IS DISTINCT FROM 'VERIFIED_PROVIDER_WEBHOOK'
       OR consent_delivery_reference IS NULL
       OR coalesce(platform.current_subject(), '') NOT LIKE 'worker:webhook:%'
       OR NOT EXISTS (
         SELECT 1
         FROM crm.communication_consent_evidence evidence
         JOIN integrations.webhook_deliveries delivery
           ON delivery.tenant_id = evidence.tenant_id
          AND delivery.id = evidence.webhook_delivery_id
         WHERE evidence.tenant_id = NEW.tenant_id
           AND evidence.customer_id = NEW.customer_id
           AND evidence.channel = NEW.channel
           AND evidence.webhook_delivery_id::text = consent_delivery_reference
           AND evidence.occurred_at = NEW.captured_at
           AND delivery.state = 'PROCESSING'
           AND delivery.claimed_by IS NOT NULL
           AND delivery.signature_valid = true
           AND delivery.replay_valid = true
           AND (TG_OP = 'INSERT' OR OLD.captured_at IS NULL
                OR evidence.occurred_at > OLD.captured_at)
       ) THEN
      RAISE EXCEPTION 'OPTED_IN requires verified provider webhook consent evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
