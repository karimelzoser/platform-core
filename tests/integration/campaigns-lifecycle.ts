import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { CampaignsService } from '../../apps/api/src/campaigns.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000002';
const webhookEvidenceA = 'aaaaaaaa-0000-0000-0000-000000000104';
const templateA = 'aaaaaaaa-0000-0000-0000-000000000711';
const customerEligible = 'aaaaaaaa-0000-0000-0000-000000000712';
const customerSuppressed = 'aaaaaaaa-0000-0000-0000-000000000713';
const contactEligible = 'aaaaaaaa-0000-0000-0000-000000000714';
const contactSuppressed = 'aaaaaaaa-0000-0000-0000-000000000715';
const orderA = 'aaaaaaaa-0000-0000-0000-000000000716';
const approvalA = 'aaaaaaaa-0000-0000-0000-000000000717';

const campaignPermissions = [
  'campaigns.read',
  'campaigns.create',
  'campaigns.update',
  'campaigns.send',
  'campaigns.stop',
  'campaigns.audiences.manage',
] as const;

function context(tenantId: string, actorId: string, subject: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject,
    requestId: `campaigns-${subject}`,
    correlationId: `campaigns-${subject}`,
    actorType: 'USER',
    permissions: campaignPermissions,
  };
}

function activeSendWindow(): { start: number; end: number } {
  const now = new Date();
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  return { start: (current + 1439) % 1440, end: (current + 2) % 1440 };
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  const contextA = context(tenantA, actorA, 'test-subject-a');
  const contextB = context(tenantB, actorB, 'test-subject-b');
  try {
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update integrations.connections
        set status = 'CONNECTED', capabilities = '["messaging.outbound"]'::jsonb, updated_at = now()
        where id = ${connectionA}::uuid`.execute(transaction);

      await sql`insert into messaging.templates (
          id, tenant_id, name, locale, channel, body, status, created_by
        ) values (
          ${templateA}::uuid, ${tenantA}::uuid, 'Campaign lifecycle template', 'en',
          'WHATSAPP', 'Lifecycle campaign message', 'ACTIVE', ${actorA}::uuid
        ) on conflict (id) do update set body = excluded.body, status = 'ACTIVE', updated_at = now()`.execute(
        transaction,
      );

      await sql`insert into crm.customers (
          id, tenant_id, display_name, preferred_language, timezone
        ) values
          (${customerEligible}::uuid, ${tenantA}::uuid, 'Eligible campaign customer', 'en', 'UTC'),
          (${customerSuppressed}::uuid, ${tenantA}::uuid, 'Suppressed campaign customer', 'en', 'UTC')
        on conflict (id) do update set display_name = excluded.display_name, updated_at = now()`.execute(
        transaction,
      );

      await sql`insert into crm.contact_points (
          id, tenant_id, customer_id, channel, value_original, normalized_value,
          is_primary, is_verified, status
        ) values
          (${contactEligible}::uuid, ${tenantA}::uuid, ${customerEligible}::uuid,
           'WHATSAPP', '+201000000011', '+201000000011', true, true, 'ACTIVE'),
          (${contactSuppressed}::uuid, ${tenantA}::uuid, ${customerSuppressed}::uuid,
           'WHATSAPP', '+201000000012', '+201000000012', true, true, 'ACTIVE')
        on conflict (id) do update set status = 'ACTIVE', updated_at = now()`.execute(transaction);

      // The opt-in transition is deliberately evidence-first. The database trigger
      // rejects OPTED_IN unless verified provider-webhook evidence already exists.
      await sql`insert into crm.communication_consent_evidence (
          tenant_id, customer_id, channel, webhook_delivery_id, provider_consent_id,
          occurred_at, metadata
        ) values (
          ${tenantA}::uuid, ${customerEligible}::uuid, 'WHATSAPP', ${webhookEvidenceA}::uuid,
          'campaign-lifecycle-consent-a', now(), '{"verified":true}'::jsonb
        ) on conflict (webhook_delivery_id) do nothing`.execute(transaction);

      await sql`insert into crm.communication_preferences (
          tenant_id, customer_id, channel, status, source, captured_at, reason
        ) values
          (${tenantA}::uuid, ${customerEligible}::uuid, 'WHATSAPP', 'OPTED_IN',
           'verified-webhook', now(), 'Integration lifecycle consent'),
          (${tenantA}::uuid, ${customerSuppressed}::uuid, 'WHATSAPP', 'OPTED_OUT',
           'customer-request', now(), 'Integration lifecycle suppression')
        on conflict (tenant_id, customer_id, channel) do update
          set status = excluded.status, source = excluded.source, captured_at = excluded.captured_at,
              reason = excluded.reason, suppressed_until = null, updated_at = now()`.execute(
        transaction,
      );
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for Campaigns integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const campaigns = new CampaignsService(database, commands);
    const window = activeSendWindow();
    const input = {
      name: 'Lifecycle WhatsApp campaign',
      channel: 'WHATSAPP' as const,
      connectionId: connectionA,
      templateId: templateA,
      timezone: 'UTC',
      sendWindowStartMinute: window.start,
      sendWindowEndMinute: window.end,
      batchSize: 500,
      attributionWindowHours: 168,
    };

    const created = await campaigns.create(contextA, 'campaign-create-a', input);
    const replay = await campaigns.create(contextA, 'campaign-create-a', input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.campaignId, created.result.campaignId);

    const frozen = await campaigns.freezeAudience(
      contextA,
      'campaign-freeze-a',
      created.result.campaignId,
    );
    assert.equal(frozen.result.total >= 2, true);
    assert.equal(frozen.result.eligible >= 1, true);
    assert.equal(frozen.result.suppressed >= 1, true);
    assert.equal(frozen.result.batches >= 1, true);

    const startAction: ApprovalAction = {
      action: 'campaigns.campaign.start',
      permission: 'campaigns.send',
      risk: 'HIGH',
      resource: { type: 'campaign', id: created.result.campaignId, tenantId: tenantA },
      input: { campaignId: created.result.campaignId },
    };
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`insert into policy.approval_requests (
          id, tenant_id, requested_by, action, permission, risk, resource_type, resource_id,
          action_digest, request_snapshot, policy_reason, status, decided_by, decided_at, expires_at
        ) values (
          ${approvalA}::uuid, ${tenantA}::uuid, ${actorA}::uuid,
          ${startAction.action}, ${startAction.permission}, ${startAction.risk},
          ${startAction.resource.type}, ${startAction.resource.id}, ${approvalActionDigest(startAction)},
          ${JSON.stringify(startAction.input)}::jsonb, 'campaign lifecycle approval', 'APPROVED',
          ${actorA}::uuid, now(), now() + interval '1 hour'
        ) on conflict (id) do update set status = 'APPROVED', action_digest = excluded.action_digest,
          expires_at = excluded.expires_at, updated_at = now()`.execute(transaction);
    });

    const started = await campaigns.start(
      contextA,
      'campaign-start-a',
      created.result.campaignId,
      approvalA,
    );
    assert.equal(started.result.status, 'RUNNING');

    const batchId = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ id: string }>`select id from campaigns.batches
        where campaign_id = ${created.result.campaignId}::uuid order by sequence limit 1`.execute(
        transaction,
      );
      assert.ok(result.rows[0]?.id, 'Campaign batch was not created');
      return result.rows[0].id;
    });

    const dispatched = await campaigns.dispatchBatch(
      contextA,
      'campaign-dispatch-a',
      created.result.campaignId,
      batchId,
    );
    assert.equal(dispatched.result.queued >= 1, true);
    const dispatchReplay = await campaigns.dispatchBatch(
      contextA,
      'campaign-dispatch-a',
      created.result.campaignId,
      batchId,
    );
    assert.equal(dispatchReplay.replayed, true);
    assert.equal(dispatchReplay.result.queued, dispatched.result.queued);

    const delivery = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{
        message_id: string;
        recipient_id: string;
        connection_id: string;
      }>`select delivery.message_id, delivery.recipient_id, message.connection_id
        from campaigns.deliveries delivery
        join messaging.messages message
          on message.tenant_id = delivery.tenant_id and message.id = delivery.message_id
        where delivery.campaign_id = ${created.result.campaignId}::uuid
        order by delivery.created_at limit 1`.execute(transaction);
      const row = result.rows[0];
      assert.ok(row?.message_id, 'Campaign delivery did not create a canonical message');
      assert.equal(row.connection_id, connectionA);
      await sql`update messaging.messages
        set delivery_status = 'SENT', provider_message_id = 'campaign-provider-message-a',
            sent_at = now(), last_delivery_error = null
        where id = ${row.message_id}::uuid`.execute(transaction);
      return row;
    });

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [recipient, campaign] = await Promise.all([
        sql<{ delivery_status: string }>`select delivery_status from campaigns.recipients
          where id = ${delivery.recipient_id}::uuid`.execute(transaction),
        sql<{ status: string; started_at: Date }>`select status, started_at from campaigns.campaigns
          where id = ${created.result.campaignId}::uuid`.execute(transaction),
      ]);
      assert.equal(recipient.rows[0]?.delivery_status, 'SENT');
      assert.equal(campaign.rows[0]?.status, 'COMPLETED');

      const store = await sql<{
        id: string;
      }>`select id from commerce.stores order by created_at limit 1`.execute(transaction);
      assert.ok(store.rows[0]?.id, 'Commerce lifecycle store is required for attribution evidence');
      await sql`insert into commerce.orders (
          id, tenant_id, store_id, customer_id, order_number, status, financial_status,
          fulfillment_status, currency, subtotal_minor, total_minor, source, placed_at
        ) values (
          ${orderA}::uuid, ${tenantA}::uuid, ${store.rows[0].id}::uuid,
          ${customerEligible}::uuid, 'CAMPAIGN-LIFECYCLE-ORDER-A', 'CONFIRMED', 'PAID',
          'UNFULFILLED', 'EGP', 100000, 100000, 'campaign-lifecycle', now()
        ) on conflict (id) do nothing`.execute(transaction);
    });

    const campaignState = await withTenantTransaction(database, contextA, async (transaction) => {
      const result = await sql<{ started_at: Date }>`select started_at from campaigns.campaigns
        where id = ${created.result.campaignId}::uuid`.execute(transaction);
      assert.ok(result.rows[0]?.started_at);
      return result.rows[0].started_at.toISOString();
    });
    const conversion = await campaigns.attributeConversion(
      contextA,
      'campaign-conversion-a',
      created.result.campaignId,
      {
        orderId: orderA,
        customerId: customerEligible,
        attributedValueMinor: 75000,
        currency: 'EGP',
        occurredAt: campaignState,
      },
    );
    assert.equal(conversion.result.orderId, orderA);

    const dashboardA = await campaigns.dashboard(contextA);
    const campaignA = dashboardA.items.find((item) => item.id === created.result.campaignId);
    assert.ok(campaignA, 'Campaign was not present in tenant dashboard');
    assert.equal(campaignA.status, 'COMPLETED');
    assert.equal(campaignA.connectionId, connectionA);
    assert.equal(campaignA.metrics.conversions, 1);
    assert.equal(campaignA.metrics.conversionValueMinor, '75000');

    const dashboardB = await campaigns.dashboard(contextB);
    assert.equal(
      dashboardB.items.some((item) => item.id === created.result.campaignId),
      false,
      'Tenant B can read Tenant A campaign',
    );
    await assert.rejects(
      campaigns.create(contextB, 'campaign-cross-tenant-create', {
        ...input,
        name: 'Cross-tenant campaign must fail',
      }),
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox, timeline, duplicateMessages] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action like 'campaigns.%' and resource_id = ${created.result.campaignId}`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type like 'campaigns.%' and resource_id = ${created.result.campaignId}`.execute(
          transaction,
        ),
        sql<{ count: string }>`select count(*)::text as count from campaigns.timeline
          where campaign_id = ${created.result.campaignId}::uuid`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from messaging.messages
          where id in (
            select message_id from campaigns.deliveries
            where campaign_id = ${created.result.campaignId}::uuid
          )`.execute(transaction),
      ]);
      assert.ok(Number(audit.rows[0].count) >= 5);
      assert.ok(Number(outbox.rows[0].count) >= 5);
      assert.ok(Number(timeline.rows[0].count) >= 5);
      assert.equal(Number(duplicateMessages.rows[0].count), dispatched.result.queued);
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
