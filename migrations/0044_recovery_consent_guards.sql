-- Defense-in-depth for outbound consent. Recovery, Campaigns and future automation
-- consume crm.communication_preferences, so transitions into OPTED_IN must remain
-- bound to a signed/replay-valid provider webhook that the trusted webhook worker
-- is actively processing. Existing OPTED_IN rows may still be suppressed or
-- otherwise updated without recreating provider consent evidence.

BEGIN;

CREATE OR REPLACE FUNCTION crm.assert_verified_consent_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, crm, integrations, platform
AS $$
BEGIN
  IF coalesce(platform.current_subject(), '') NOT LIKE 'worker:webhook:%' THEN
    RAISE EXCEPTION 'Verified consent evidence may only be recorded by the webhook worker';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM integrations.webhook_deliveries delivery
    WHERE delivery.tenant_id = NEW.tenant_id
      AND delivery.id = NEW.webhook_delivery_id
      AND delivery.state = 'PROCESSING'
      AND delivery.claimed_by IS NOT NULL
      AND delivery.signature_valid = true
      AND delivery.replay_valid = true
  ) THEN
    RAISE EXCEPTION 'Verified consent evidence requires an actively claimed signed webhook delivery';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communication_consent_evidence_verified_insert
ON crm.communication_consent_evidence;
CREATE TRIGGER communication_consent_evidence_verified_insert
BEFORE INSERT ON crm.communication_consent_evidence
FOR EACH ROW EXECUTE FUNCTION crm.assert_verified_consent_evidence_insert();

CREATE OR REPLACE FUNCTION crm.assert_verified_opt_in_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, crm, integrations, platform
AS $$
DECLARE
  webhook_delivery_id text;
BEGIN
  IF NEW.status = 'OPTED_IN'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'OPTED_IN') THEN
    webhook_delivery_id := NEW.metadata ->> 'webhookDeliveryId';

    IF NEW.source <> 'provider_webhook'
       OR NEW.metadata ->> 'evidenceType' <> 'VERIFIED_PROVIDER_WEBHOOK'
       OR webhook_delivery_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM crm.communication_consent_evidence evidence
         WHERE evidence.tenant_id = NEW.tenant_id
           AND evidence.customer_id = NEW.customer_id
           AND evidence.channel = NEW.channel
           AND evidence.webhook_delivery_id::text = webhook_delivery_id
       ) THEN
      RAISE EXCEPTION 'OPTED_IN requires verified provider webhook consent evidence';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communication_preferences_verified_opt_in
ON crm.communication_preferences;
CREATE TRIGGER communication_preferences_verified_opt_in
BEFORE INSERT OR UPDATE OF status, source, metadata
ON crm.communication_preferences
FOR EACH ROW EXECUTE FUNCTION crm.assert_verified_opt_in_transition();

COMMIT;
