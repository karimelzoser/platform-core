import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import {
  ConnectorRegistry,
  outboundMessageRequestSchema,
  type MessagingConnector,
  type OutboundMessageRequest,
} from '@platform/connectors';
import { sql, withTenantTransaction } from '@platform/database';
import { LocalMediaStore } from '@platform/media';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { MediaService } from '../../apps/api/src/media.service.js';
import { MessagingService } from '../../apps/api/src/messaging.service.js';
import { MessagingWebhookProcessor } from '../../apps/worker/src/messaging-webhook-processor.js';
import { OutboundMessageProcessor } from '../../apps/worker/src/outbound-message-processor.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const conversationA = 'aaaaaaaa-0000-0000-0000-000000000101';
const conversationB = 'bbbbbbbb-0000-0000-0000-000000000101';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000002';
const connectionB = 'bbbbbbbb-0000-0000-0000-000000000002';
const customerA = 'aaaaaaaa-0000-0000-0000-000000000401';
const customerB = 'bbbbbbbb-0000-0000-0000-000000000401';

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `integration-${suffix}`,
    requestId: `messaging-lifecycle-${suffix}`,
    correlationId: `messaging-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions: [
      'messaging.conversations.reply',
      'messaging.templates.read',
      'messaging.templates.manage',
    ],
  };
}

const contextA = context(tenantA, '11111111-1111-1111-1111-111111111111', 'a');
const contextB = context(tenantB, '22222222-2222-2222-2222-222222222222', 'b');

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-messaging-'));
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update messaging.conversations set connection_id = ${connectionA}::uuid
        where id = ${conversationA}::uuid`.execute(transaction);
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerA}::uuid, ${tenantA}::uuid, 'Consent customer A')`.execute(transaction);
    });
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`insert into integrations.connections (
        id, tenant_id, connector_key, display_name, status
      ) values (
        ${connectionB}::uuid, ${tenantB}::uuid, 'test-connector', 'Messaging B', 'CONNECTED'
      )`.execute(transaction);
      await sql`update messaging.conversations set connection_id = ${connectionB}::uuid
        where id = ${conversationB}::uuid`.execute(transaction);
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerB}::uuid, ${tenantB}::uuid, 'Consent customer B')`.execute(transaction);
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for messaging integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const messaging = new MessagingService(databaseService, commands);
    const templateA = await messaging.createTemplate(contextA, 'lifecycle-template-a', {
      name: 'Tenant A welcome',
      locale: 'en',
      channel: undefined,
      body: 'Hello from A',
    });
    const replayTemplateA = await messaging.createTemplate(contextA, 'lifecycle-template-a', {
      name: 'Tenant A welcome',
      locale: 'en',
      channel: undefined,
      body: 'Hello from A',
    });
    assert.equal(replayTemplateA.replayed, true);
    assert.equal(replayTemplateA.result.templateId, templateA.result.templateId);
    const templateB = await messaging.createTemplate(contextB, 'lifecycle-template-b', {
      name: 'Tenant B welcome',
      locale: 'ar',
      channel: undefined,
      body: 'مرحبا من ب',
    });
    assert.deepEqual(
      (await messaging.listTemplates(contextA)).map((template) => template.id),
      [templateA.result.templateId],
    );
    assert.deepEqual(
      (await messaging.listTemplates(contextB)).map((template) => template.id),
      [templateB.result.templateId],
    );
    const media = new MediaService(new LocalMediaStore(root), databaseService);
    const attachmentA = await media.registerLocalBytes(contextA, {
      mediaType: 'IMAGE',
      contentType: 'image/png',
      fileName: 'a.png',
      bytes: new Uint8Array([1, 2, 3]),
    });
    const attachmentB = await media.registerLocalBytes(contextB, {
      mediaType: 'DOCUMENT',
      contentType: 'application/pdf',
      fileName: 'b.pdf',
      bytes: new Uint8Array([4, 5, 6]),
    });

    await assert.rejects(
      messaging.send(contextB, 'lifecycle-cross-tenant', conversationB, 'Invalid', [attachmentA]),
    );
    const rejectedCount = await withTenantTransaction(database, contextB, async (transaction) => {
      const result = await sql<{ count: number }>`select count(*)::integer as count
        from messaging.messages where direction = 'OUTBOUND'`.execute(transaction);
      return result.rows[0]?.count;
    });
    assert.equal(rejectedCount, 0, 'Cross-tenant media must roll back the message');

    const sentA = await messaging.send(contextA, 'lifecycle-send-a', conversationA, 'Hello A', [
      attachmentA,
    ]);
    const replayA = await messaging.send(contextA, 'lifecycle-send-a', conversationA, 'Hello A', [
      attachmentA,
    ]);
    assert.equal(replayA.replayed, true);
    assert.equal(replayA.result.messageId, sentA.result.messageId);
    const sentB = await messaging.send(contextB, 'lifecycle-send-b', conversationB, 'Hello B', [
      attachmentB,
    ]);

    const calls: OutboundMessageRequest[] = [];
    const connectors = new ConnectorRegistry();
    const connector: MessagingConnector = {
      manifest: {
        key: 'test-connector',
        version: '1.0.0',
        category: 'MESSAGING',
        capabilities: ['messaging.send'],
        credentialSchema: {},
        settingsSchema: {},
      },
      verifyWebhook: () => Promise.resolve(true),
      identifyWebhook: () => ({ deliveryId: 'synthetic', eventType: 'message.delivery' }),
      normalizeWebhook: ({ body }) =>
        Promise.resolve({
          deliveryId: 'synthetic',
          eventType: 'message.delivery',
          resource: { type: 'message', providerId: 'synthetic' },
          payload: body as Record<string, unknown>,
        }),
      validateConnection: () => Promise.resolve(),
      health: () => Promise.resolve({ latencyMs: 0 }),
      sendMessage: async (raw: OutboundMessageRequest) => {
        const request = outboundMessageRequestSchema.parse(raw);
        const tenantContext = request.connectionId === connectionA ? contextA : contextB;
        const committed = await withTenantTransaction(
          database,
          tenantContext,
          async (transaction) => {
            const message = await sql<{ id: string }>`select id from messaging.messages
              where id = ${request.idempotencyKey}::uuid`.execute(transaction);
            const event = await sql<{ id: string }>`select id from platform.outbox_events
              where event_type = 'messaging.message.dispatch_requested'
                and resource_id = ${request.idempotencyKey}`.execute(transaction);
            return Boolean(message.rows[0] && event.rows[0]);
          },
        );
        assert.ok(committed, 'Connector was called before message and outbox commit');
        calls.push(request);
        if (request.body === 'FAIL B') throw new Error('Synthetic provider failure');
        return {
          providerMessageId: `provider-${request.idempotencyKey}`,
          acceptedAt: new Date().toISOString(),
        };
      },
    };
    connectors.register(connector);

    assert.equal(calls.length, 0, 'Provider must not be called by the send transaction');
    const outbound = new OutboundMessageProcessor(database, connectors, 'lifecycle-outbound');
    assert.equal(await outbound.processBatch(), 2);
    assert.equal(calls.length, 2);
    assert.deepEqual(
      calls.find((call) => call.idempotencyKey === sentA.result.messageId)?.attachments,
      [attachmentA],
    );
    assert.deepEqual(
      calls.find((call) => call.idempotencyKey === sentB.result.messageId)?.attachments,
      [attachmentB],
    );
    await assertStatus(databaseService, contextA, sentA.result.messageId, 'SENT');
    await assertStatus(databaseService, contextB, sentB.result.messageId, 'SENT');
    await withTenantTransaction(database, contextB, async (transaction) => {
      const hidden = await sql<{ id: string }>`select id from messaging.messages
        where id = ${sentA.result.messageId}::uuid`.execute(transaction);
      assert.equal(hidden.rows.length, 0, 'Tenant B can read Tenant A sent message');
    });

    await addReceipt(databaseService, contextA, connectionA, sentA.result.messageId, 'DELIVERED');
    await addReceipt(databaseService, contextB, connectionB, sentB.result.messageId, 'DELIVERED');
    const webhook = new MessagingWebhookProcessor(database, connectors, 'lifecycle-webhook');
    assert.equal(await webhook.processBatch(), 2);
    await assertStatus(databaseService, contextA, sentA.result.messageId, 'DELIVERED');
    await assertStatus(databaseService, contextB, sentB.result.messageId, 'DELIVERED');

    await addReceipt(databaseService, contextA, connectionA, sentA.result.messageId, 'READ');
    assert.equal(await webhook.processBatch(), 1);
    await addReceipt(databaseService, contextA, connectionA, sentA.result.messageId, 'SENT');
    assert.equal(await webhook.processBatch(), 1);
    await assertStatus(databaseService, contextA, sentA.result.messageId, 'READ');

    await addVerifiedConsent(databaseService, contextA, connectionA, customerA, 'EMAIL');
    await addVerifiedConsent(databaseService, contextB, connectionB, customerB, 'WHATSAPP');
    assert.equal(await webhook.processBatch(), 2);
    await assertVerifiedConsent(databaseService, contextA, customerA, 'EMAIL');
    await assertVerifiedConsent(databaseService, contextB, customerB, 'WHATSAPP');
    await withTenantTransaction(database, contextB, async (transaction) => {
      const hidden = await sql<{ id: string }>`select id from crm.communication_consent_evidence
        where customer_id = ${customerA}::uuid`.execute(transaction);
      assert.equal(hidden.rows.length, 0, 'Tenant B can read Tenant A consent evidence');
    });

    const failure = await messaging.send(contextB, 'lifecycle-failure', conversationB, 'FAIL B');
    assert.equal(await outbound.processBatch(), 1);
    await assertStatus(databaseService, contextB, failure.result.messageId, 'FAILED');
    for (let attempt = 2; attempt <= 8; attempt += 1) {
      await withTenantTransaction(database, contextB, async (transaction) => {
        await sql`update messaging.messages set next_delivery_attempt_at = now() - interval '1 second'
          where id = ${failure.result.messageId}::uuid`.execute(transaction);
      });
      assert.equal(await outbound.processBatch(), 1);
    }
    await assertStatus(databaseService, contextB, failure.result.messageId, 'DEAD_LETTER');
    await withTenantTransaction(database, contextB, async (transaction) => {
      const deadLetter = await sql<{ id: string }>`select id from platform.dead_letters
        where source_event_id = ${failure.result.messageId}
          and error_code = 'OUTBOUND_MESSAGE_MAX_ATTEMPTS'`.execute(transaction);
      assert.equal(deadLetter.rows.length, 1);
    });
  } finally {
    await databaseService.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
}

async function assertStatus(
  databaseService: ApiDatabaseService,
  tenantContext: TenantRequestContext,
  messageId: string,
  expected: string,
): Promise<void> {
  await withTenantTransaction(databaseService.database, tenantContext, async (transaction) => {
    const response = await sql<{ delivery_status: string }>`select delivery_status
      from messaging.messages where id = ${messageId}::uuid`.execute(transaction);
    assert.equal(response.rows[0]?.delivery_status, expected);
  });
}

async function addReceipt(
  databaseService: ApiDatabaseService,
  tenantContext: TenantRequestContext,
  connectionId: string,
  messageId: string,
  status: 'SENT' | 'DELIVERED' | 'READ',
): Promise<void> {
  await withTenantTransaction(databaseService.database, tenantContext, async (transaction) => {
    await sql`insert into integrations.webhook_deliveries (
      tenant_id, connection_id, provider_delivery_id, event_type,
      signature_valid, payload, dedupe_key
    ) values (
      ${tenantContext.tenantId}::uuid, ${connectionId}::uuid,
      ${`receipt-${messageId}-${status}`}, 'message.delivery', true,
      ${JSON.stringify({ kind: 'messaging.delivery_receipt', providerMessageId: `provider-${messageId}`, status })}::jsonb,
      ${`receipt-${messageId}-${status}`}
    )`.execute(transaction);
  });
}

async function addVerifiedConsent(
  databaseService: ApiDatabaseService,
  tenantContext: TenantRequestContext,
  connectionId: string,
  customerId: string,
  channel: 'EMAIL' | 'WHATSAPP',
): Promise<void> {
  await withTenantTransaction(databaseService.database, tenantContext, async (transaction) => {
    await sql`insert into integrations.webhook_deliveries (
      tenant_id, connection_id, provider_delivery_id, event_type,
      signature_valid, payload, dedupe_key
    ) values (
      ${tenantContext.tenantId}::uuid, ${connectionId}::uuid,
      ${`consent-${customerId}-${channel}`}, 'customer.consent.updated', true,
      ${JSON.stringify({
        kind: 'crm.communication_consent_verified',
        customerId,
        channel,
        providerConsentId: `provider-consent-${customerId}-${channel}`,
      })}::jsonb,
      ${`consent-${customerId}-${channel}`}
    )`.execute(transaction);
  });
}

async function assertVerifiedConsent(
  databaseService: ApiDatabaseService,
  tenantContext: TenantRequestContext,
  customerId: string,
  channel: 'EMAIL' | 'WHATSAPP',
): Promise<void> {
  await withTenantTransaction(databaseService.database, tenantContext, async (transaction) => {
    const preference = await sql<{ status: string; source: string }>`select status, source
      from crm.communication_preferences where customer_id = ${customerId}::uuid
        and channel = ${channel}`.execute(transaction);
    assert.deepEqual(preference.rows[0], { status: 'OPTED_IN', source: 'provider_webhook' });
    const evidence = await sql<{ id: string }>`select id from crm.communication_consent_evidence
      where customer_id = ${customerId}::uuid and channel = ${channel}`.execute(transaction);
    assert.equal(evidence.rows.length, 1);
  });
}

void main();
