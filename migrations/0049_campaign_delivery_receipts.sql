-- Keep Campaign delivery evidence aligned with canonical Messaging receipts.
-- Provider workers update messaging.messages; this trigger projects only bounded
-- delivery state into Campaigns without creating a second provider path.

BEGIN;

CREATE OR REPLACE FUNCTION campaigns.sync_delivery_from_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mapped_status text;
  affected_campaign_id uuid;
BEGIN
  mapped_status := CASE NEW.delivery_status
    WHEN 'PENDING' THEN 'QUEUED'
    WHEN 'SENT' THEN 'SENT'
    WHEN 'DELIVERED' THEN 'DELIVERED'
    WHEN 'READ' THEN 'READ'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'DEAD_LETTER' THEN 'DEAD_LETTER'
    ELSE NULL
  END;

  IF mapped_status IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE campaigns.deliveries delivery
  SET status = mapped_status,
      provider_message_id = coalesce(NEW.provider_message_id, delivery.provider_message_id),
      sent_at = CASE WHEN mapped_status IN ('SENT','DELIVERED','READ')
                    THEN coalesce(delivery.sent_at, NEW.sent_at, now()) ELSE delivery.sent_at END,
      delivered_at = CASE WHEN mapped_status IN ('DELIVERED','READ')
                         THEN coalesce(delivery.delivered_at, NEW.delivered_at, now()) ELSE delivery.delivered_at END,
      read_at = CASE WHEN mapped_status = 'READ'
                    THEN coalesce(delivery.read_at, NEW.delivered_at, now()) ELSE delivery.read_at END,
      failed_at = CASE WHEN mapped_status IN ('FAILED','DEAD_LETTER')
                      THEN coalesce(delivery.failed_at, now()) ELSE delivery.failed_at END,
      last_error = CASE WHEN mapped_status IN ('FAILED','DEAD_LETTER')
                       THEN NEW.last_delivery_error ELSE NULL END,
      updated_at = now()
  WHERE delivery.tenant_id = NEW.tenant_id
    AND delivery.message_id = NEW.id
  RETURNING delivery.campaign_id INTO affected_campaign_id;

  IF affected_campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE campaigns.recipients recipient
  SET delivery_status = mapped_status,
      updated_at = now()
  FROM campaigns.deliveries delivery
  WHERE delivery.tenant_id = NEW.tenant_id
    AND delivery.message_id = NEW.id
    AND recipient.tenant_id = delivery.tenant_id
    AND recipient.id = delivery.recipient_id
    AND (
      recipient.delivery_status NOT IN ('DELIVERED','READ')
      OR mapped_status = 'READ'
    );

  -- A campaign is operationally complete only when no consent-eligible recipient
  -- remains pending, queued, or retryable-failed. Provider acceptance (SENT) is
  -- terminal for dispatch completion; later delivery/read receipts still refine metrics.
  UPDATE campaigns.campaigns campaign
  SET status = 'COMPLETED', completed_at = coalesce(completed_at, now()), updated_at = now()
  WHERE campaign.tenant_id = NEW.tenant_id
    AND campaign.id = affected_campaign_id
    AND campaign.status = 'RUNNING'
    AND NOT EXISTS (
      SELECT 1
      FROM campaigns.recipients recipient
      WHERE recipient.tenant_id = campaign.tenant_id
        AND recipient.campaign_id = campaign.id
        AND recipient.eligibility = 'ELIGIBLE'
        AND recipient.delivery_status IN ('PENDING','QUEUED','FAILED')
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_delivery_message_receipt_sync ON messaging.messages;
CREATE TRIGGER campaign_delivery_message_receipt_sync
AFTER UPDATE OF delivery_status, provider_message_id, delivered_at, last_delivery_error
ON messaging.messages
FOR EACH ROW
WHEN (OLD.direction = 'OUTBOUND')
EXECUTE FUNCTION campaigns.sync_delivery_from_message();

COMMIT;
