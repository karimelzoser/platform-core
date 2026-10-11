import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { approvalActionDigest, type ApprovalAction } from '@platform/contracts';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { MessagingService } from '../../apps/api/src/messaging.service.js';
import { RecoveryService } from '../../apps/api/src/recovery.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const approverA = '13131313-1313-1313-1313-131313131313';
const storeA = 'aaaaaaaa-0000-0000-0000-000000000501';
const connectionA = 'aaaaaaaa-0000-0000-0000-000000000002';
const customerA = 'aaaaaaaa-0000-0000-0000-000000000671';
const sourceOrderA = 'aaaaaaaa-0000-0000-0000-000000000672';
const conversationA = 'aaaaaaaa-0000-0000-0000-000000000673';
const consentDeliveryA = 'aaaaaaaa-0000-0000-0000-000000000674';

const permissions = [
  'recovery.read',
  'recovery.execute',
  'recovery.manage',
  'messaging.conversations.reply',
] as const;

function context(
  tenantId: string,
  actorId: string,
  suffix: string,
  actorPermissions: readonly string[] = permissions,
): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `recovery-lifecycle-${suffix}`,
    requestId: `recovery-lifecycle-${suffix}`,
    correlationId: `recovery-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions: actorPermissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');
const approverContext: TenantRequestContext = {
  ...context(tenantA, approverA, 'approver', ['policy.approvals.decide']),
  subject: 'recovery-lifecycle-approver',
};
const consentWorkerContext: TenantRequestContext = {
  tenantId: tenantA,
  actorId: null,
  subject: 'worker:webhook:test-connector',
  requestId: 'recovery-lifecycle-consent-worker',
  correlationId: 'recovery-lifecycle-consent-worker',
  actorType: 'SERVICE',
  permissions: [],
};

async function approvedEvidence(
  database: PlatformDatabase,
  requestContext: TenantRequestContext,
  action: ApprovalAction,
): Promise<string> {
  const approvalId = randomUUID();
  await withTenantTransaction(database, requestContext, async (transaction) => {
    await sql`insert into policy.approval_requests (
      id, tenant_id, requested_by, action, permission, risk, resource_type,
      resource_id, action_digest, request_snapshot, policy_reason, status,
      decided_by, decided_at, expires_at
    ) values (
      ${approvalId}::uuid, ${requestContext.tenantId}::uuid,
      ${requestContext.actorId ?? null}::uuid, ${action.action}, ${action.permission},
      ${action.risk}, ${action.resource.type}, ${action.resource.id},
      ${approvalActionDigest(action)}, ${JSON.stringify(action)}::jsonb,
      'recovery_lifecycle_approved_fixture', 'APPROVED', ${approverA}::uuid,
      now(), now() + interval '1 hour'
    )`.execute(transaction);
  });
  return approvalId;
}

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    await withTenantTransaction(database, approverContext, async (transaction) => {
      await sql`insert into identity.users (id, keycloak_subject, email)
        values (${approverA}::uuid, 'recovery-lifecycle-approver', 'recovery-approver@example.test')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into identity.memberships (tenant_id, user_id, status)
        values (${tenantA}::uuid, ${approverA}::uuid, 'ACTIVE')
        on conflict (tenant_id, user_id) do nothing`.execute(transaction);
    });

    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`insert into crm.customers (id, tenant_id, display_name)
        values (${customerA}::uuid, ${tenantA}::uuid, 'Recovery Lifecycle Customer')
        on conflict (id) do nothing`.execute(transaction);
      await sql`insert into commerce.orders (
          id, tenant_id, store_id, customer_id, order_number, status, financial_status,
          fulfillment_status, currency, subtotal_minor, total_minor, source, updated_at
        ) values (
          ${sourceOrderA}::uuid, ${tenantA}::uuid, ${storeA}::uuid, ${customerA}::uuid,
          'RECOVERY-LIFECYCLE-1001', 'PENDING', 'PENDING', 'UNFULFILLED', 'EGP',
          4500, 4500, 'recovery-lifecycle', now() - interval '2 hours'
        ) on conflict (id) do update set
          customer_id = excluded.customer_id, status = 'PENDING', financial_status = 'PENDING',
          fulfillment_status = 'UNFULFILLED', total_minor = excluded.total_minor,
          updated_at = now() - interval '2 hours'`.execute(transaction);
      await sql`update integrations.connections set status = 'CONNECTED', updated_at = now()
        where id = ${connectionA}::uuid`.execute(transaction);
      await sql`insert into messaging.conversations (
          id, tenant_id, customer_id, channel, provider_conversation_id, connection_id, status, mode
        ) values (
          ${conversationA}::uuid, ${tenantA}::uuid, ${customerA}::uuid, 'EMAIL',
          'recovery-lifecycle-conversation', ${connectionA}::uuid, 'OPEN', 'HUMAN'
        ) on conflict (id) do update set customer_id = excluded.customer_id,
          channel = excluded.channel, provider_conversation_id = excluded.provider_conversation_id,
          connection_id = excluded.connection_id, status = 'OPEN'`.execute(transaction);
      await sql`insert into crm.communication_preferences (
          tenant_id, customer_id, channel, status, source, captured_at, reason
        ) values (
          ${tenantA}::uuid, ${customerA}::uuid, 'EMAIL', 'OPTED_OUT',
          'integration-fixture', now(), 'Initial suppression assertion'
        ) on conflict (tenant_id, customer_id, channel) do update set
          status = 'OPTED_OUT', source = excluded.source, captured_at = excluded.captured_at,
          suppressed_until = null, reason = excluded.reason, updated_at = now()`.execute(
        transaction,
      );
    });

    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for recovery integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const messaging = new MessagingService(databaseService, commands);
    const recovery = new RecoveryService(database, commands, messaging);

    const policyInput = {
      storeId: storeA,
      name: 'Lifecycle Recovery Policy',
      abandonmentDelayMinutes: 1,
      opportunityTtlHours: 72,
      maxAttempts: 3,
      cooldownMinutes: 60,
      attributionWindowHours: 168,
      channels: ['EMAIL'] as const,
      maxOfferPercentBasisPoints: 1000,
      maxOfferAmountMinor: 1000,
    };
    const policyApproval = await approvedEvidence(database, contextA, {
      action: 'recovery.policy.upsert',
      permission: 'recovery.manage',
      risk: 'HIGH',
      resource: { type: 'recovery.policy', id: storeA, tenantId: tenantA },
      input: { ...policyInput, channels: [...policyInput.channels] },
    });
    const policy = await recovery.upsertPolicy(
      contextA,
      'recovery-policy-lifecycle',
      policyInput,
      policyApproval,
    );
    assert.equal(policy.result.status, 'ACTIVE');

    const detected = await recovery.detect(contextA, 'recovery-detect-lifecycle', sourceOrderA);
    const replayed = await recovery.detect(contextA, 'recovery-detect-lifecycle', sourceOrderA);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.result.opportunityId, detected.result.opportunityId);
    assert.match(detected.result.workflowId, /^recovery:/u);
    assert.equal(await recovery.get(contextB, detected.result.opportunityId), undefined);

    const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const offerInput = {
      opportunityId: detected.result.opportunityId,
      offerType: 'PERCENT' as const,
      percentBasisPoints: 500,
      code: 'RECOVER5',
      expiresAt: offerExpiresAt,
    };
    const offerApproval = await approvedEvidence(database, contextA, {
      action: 'recovery.offer.create',
      permission: 'recovery.manage',
      risk: 'HIGH',
      resource: {
        type: 'recovery.opportunity',
        id: detected.result.opportunityId,
        tenantId: tenantA,
      },
      input: offerInput,
    });
    const offer = await recovery.createOffer(
      contextA,
      'recovery-offer-lifecycle',
      offerInput,
      offerApproval,
    );

    await assert.rejects(
      recovery.dispatchAttempt(contextA, 'recovery-attempt-opted-out', {
        opportunityId: detected.result.opportunityId,
        conversationId: conversationA,
        channel: 'EMAIL',
        body: 'Complete your order and use RECOVER5.',
        offerId: offer.result.offerId,
      }),
      /opt-in/i,
    );

    await assert.rejects(
      withTenantTransaction(database, contextA, async (transaction) =>
        sql`update crm.communication_preferences
          set status = 'OPTED_IN', source = 'manual-fixture', captured_at = now(),
              metadata = '{}'::jsonb, updated_at = now()
          where customer_id = ${customerA}::uuid and channel = 'EMAIL'`.execute(transaction),
      ),
      /OPTED_IN requires verified provider webhook consent evidence/i,
    );

    await withTenantTransaction(database, consentWorkerContext, async (transaction) => {
      await sql`insert into integrations.webhook_deliveries (
          id, tenant_id, connection_id, provider_delivery_id, event_type,
          signature_valid, replay_valid, headers, payload, dedupe_key, state,
          attempts, claimed_by, claimed_at, next_attempt_at
        ) values (
          ${consentDeliveryA}::uuid, ${tenantA}::uuid, ${connectionA}::uuid,
          'recovery-consent-provider-delivery', 'consent.updated', true, true,
          '{}'::jsonb, '{}'::jsonb, 'recovery-consent-evidence', 'PROCESSING',
          1, 'recovery-consent-worker', now(), now()
        ) on conflict (id) do update set
          state = 'PROCESSING', signature_valid = true, replay_valid = true,
          claimed_by = 'recovery-consent-worker', claimed_at = now(), last_error = null`.execute(
        transaction,
      );
    });

    await assert.rejects(
      withTenantTransaction(database, contextA, async (transaction) =>
        sql`insert into crm.communication_consent_evidence (
            tenant_id, customer_id, channel, webhook_delivery_id,
            provider_consent_id, occurred_at, metadata
          ) values (
            ${tenantA}::uuid, ${customerA}::uuid, 'EMAIL', ${consentDeliveryA}::uuid,
            'recovery-consent-forged', now(), '{}'::jsonb
          )`.execute(transaction),
      ),
      /may only be recorded by the webhook worker/i,
    );

    await withTenantTransaction(database, consentWorkerContext, async (transaction) => {
      await sql`insert into crm.communication_consent_evidence (
          tenant_id, customer_id, channel, webhook_delivery_id,
          provider_consent_id, occurred_at, metadata
        ) values (
          ${tenantA}::uuid, ${customerA}::uuid, 'EMAIL', ${consentDeliveryA}::uuid,
          'recovery-consent-verified', now(), '{"connectorKey":"test-connector"}'::jsonb
        ) on conflict (tenant_id, customer_id, channel, provider_consent_id) do nothing`.execute(
        transaction,
      );
      await sql`update crm.communication_preferences
        set status = 'OPTED_IN', source = 'provider_webhook', captured_at = now(),
            suppressed_until = now() + interval '1 hour', reason = 'Temporary lifecycle suppression',
            metadata = ${JSON.stringify({
              evidenceType: 'VERIFIED_PROVIDER_WEBHOOK',
              webhookDeliveryId: consentDeliveryA,
            })}::jsonb,
            updated_at = now()
        where customer_id = ${customerA}::uuid and channel = 'EMAIL'`.execute(transaction);
    });

    await assert.rejects(
      recovery.dispatchAttempt(contextA, 'recovery-attempt-suppressed', {
        opportunityId: detected.result.opportunityId,
        conversationId: conversationA,
        channel: 'EMAIL',
        body: 'Complete your order and use RECOVER5.',
        offerId: offer.result.offerId,
      }),
      /temporarily suppressed/i,
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update crm.communication_preferences
        set suppressed_until = null, reason = 'Verified provider opt-in fixture', updated_at = now()
        where customer_id = ${customerA}::uuid and channel = 'EMAIL'`.execute(transaction);
    });
    const attemptInput = {
      opportunityId: detected.result.opportunityId,
      conversationId: conversationA,
      channel: 'EMAIL' as const,
      body: 'Complete your order and use RECOVER5.',
      offerId: offer.result.offerId,
    };
    const queued = await recovery.dispatchAttempt(
      contextA,
      'recovery-attempt-lifecycle',
      attemptInput,
    );
    const queuedReplay = await recovery.dispatchAttempt(
      contextA,
      'recovery-attempt-lifecycle',
      attemptInput,
    );
    assert.equal(queued.status, 'QUEUED');
    assert.equal(queuedReplay.attemptId, queued.attemptId);
    assert.equal(queuedReplay.messageId, queued.messageId);

    await assert.rejects(
      recovery.dispatchAttempt(contextA, 'recovery-attempt-cooldown', attemptInput),
      /cooldown/i,
    );

    await withTenantTransaction(database, contextA, async (transaction) => {
      await sql`update commerce.orders set status = 'CONFIRMED', placed_at = now(), updated_at = now()
        where id = ${sourceOrderA}::uuid`.execute(transaction);
    });
    const attributed = await recovery.markRecovered(contextA, 'recovery-attribution-lifecycle', {
      opportunityId: detected.result.opportunityId,
      recoveredOrderId: sourceOrderA,
    });
    assert.equal(attributed.result.recoveredOrderId, sourceOrderA);
    assert.equal(attributed.result.recoveredValueMinor, 4500);

    const detail = await recovery.get(contextA, detected.result.opportunityId);
    assert.ok(detail);
    assert.equal(detail.status, 'RECOVERED');
    assert.equal(detail.recoveredOrderId, sourceOrderA);
    assert.equal(detail.attempts.length, 1);
    assert.equal(detail.offers[0]?.status, 'REDEEMED');

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [audit, outbox] = await Promise.all([
        sql<{ count: string }>`select count(*)::text as count from platform.audit_log
          where action = 'recovery.opportunity.mark_recovered'
            and resource_id = ${detected.result.opportunityId}`.execute(transaction),
        sql<{ count: string }>`select count(*)::text as count from platform.outbox_events
          where event_type = 'recovery.opportunity.recovered'
            and resource_id = ${detected.result.opportunityId}`.execute(transaction),
      ]);
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
    });

    const listedA = await recovery.list(contextA);
    const listedB = await recovery.list(contextB);
    assert.ok(listedA.some((item) => item.id === detected.result.opportunityId));
    assert.equal(
      listedB.some((item) => item.id === detected.result.opportunityId),
      false,
    );
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
