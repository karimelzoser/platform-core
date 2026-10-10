import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import {
  CommandExecutionError,
  CommandExecutor,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import {
  OnboardingInputError,
  OnboardingService,
  type OnboardingProfileInput,
} from '../../apps/api/src/onboarding.service.js';

const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const actorA = '11111111-1111-1111-1111-111111111111';
const actorB = '22222222-2222-2222-2222-222222222222';
const permissions = ['organization.read', 'organization.update'] as const;

function context(tenantId: string, actorId: string, suffix: string): TenantRequestContext {
  return {
    tenantId,
    actorId,
    subject: `onboarding-lifecycle-${suffix}`,
    requestId: `onboarding-lifecycle-${suffix}`,
    correlationId: `onboarding-lifecycle-${suffix}`,
    actorType: 'USER',
    permissions,
  };
}

const contextA = context(tenantA, actorA, 'a');
const contextB = context(tenantB, actorB, 'b');

const profileBInput: OnboardingProfileInput = {
  countryCode: 'SA',
  currencyCode: 'SAR',
  timezone: 'Asia/Riyadh',
  locale: 'ar',
  industryCode: 'ECOMMERCE',
  customerModel: 'B2C',
  commerceModel: 'ECOMMERCE',
  monthlyOrderVolumeBand: '101_1000',
  monthlyConversationVolumeBand: '1001_5000',
  goals: ['SUPPORT_AUTOMATION', 'ORDER_OPERATIONS', 'ANALYTICS'],
};

async function main(): Promise<void> {
  const databaseService = new ApiDatabaseService();
  const database = databaseService.database;
  try {
    const opaUrl = process.env.OPA_URL;
    assert.ok(opaUrl, 'OPA_URL is required for onboarding integration');
    const commands = new CommandExecutor(
      database,
      new CommandAuthorizer(
        new OpaClient({ endpoint: new URL('/v1/data/platform/authorization/decision', opaUrl) }),
      ),
    );
    const onboarding = new OnboardingService(database, commands);

    // Earlier integration lifecycles intentionally exercise canonical connector records.
    // Onboarding is last in the chain and needs a deterministic tenant-B baseline so it
    // can prove every integration state transition without depending on prior fixtures.
    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        update integrations.connections
        set status = 'REVOKED', updated_at = now()
        where tenant_id = ${tenantB}::uuid
          and status <> 'REVOKED'
      `.execute(transaction);
    });

    const initialB = await onboarding.getState(contextB);
    assert.equal(initialB.organization.id, tenantB);
    assert.equal(initialB.profile, null);
    assert.equal(initialB.progress.businessProfile, 'PENDING');
    assert.equal(initialB.progress.team, 'PENDING');
    assert.equal(initialB.progress.integration, 'PENDING');
    assert.equal(initialB.progress.currentStep, 'BUSINESS_PROFILE');
    assert.equal(initialB.progress.ready, false);

    await assertInvalidInputRollback(onboarding);

    const profileB = await onboarding.updateProfile(
      contextB,
      'onboarding-profile-b',
      profileBInput,
    );
    const profileBReplay = await onboarding.updateProfile(
      contextB,
      'onboarding-profile-b',
      profileBInput,
    );
    assert.equal(profileB.result.profileComplete, true);
    assert.equal(profileBReplay.replayed, true);

    await assertIdempotencyConflict(onboarding);

    const afterProfileB = await onboarding.getState(contextB);
    assert.equal(afterProfileB.progress.currentStep, 'TEAM');
    assert.equal(afterProfileB.progress.team, 'PENDING');

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        insert into identity.organization_invitations (
          id, tenant_id, email, invited_by_user_id, expires_at
        ) values (
          'bbbbbbbb-0000-0000-0000-000000000901'::uuid,
          ${tenantB}::uuid,
          'onboarding-invite-b@example.test',
          ${actorB}::uuid,
          now() + interval '7 days'
        )
      `.execute(transaction);
    });

    const invitedB = await onboarding.getState(contextB);
    assert.equal(invitedB.progress.team, 'INVITED');
    assert.equal(invitedB.progress.currentStep, 'TEAM');
    assert.equal(invitedB.progress.ready, false);

    const skippedTeam = await onboarding.setStepDisposition(
      contextB,
      'onboarding-team-b-skip',
      'TEAM',
      'SKIPPED',
    );
    assert.equal(skippedTeam.result.status, 'SKIPPED');
    assert.equal(
      (await onboarding.getState(contextB)).progress.team,
      'INVITED',
      'Canonical invitation evidence must remain visible even when a defer disposition exists',
    );

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        update identity.organization_invitations
        set status = 'REVOKED', revoked_at = now(), updated_at = now()
        where id = 'bbbbbbbb-0000-0000-0000-000000000901'::uuid
      `.execute(transaction);
    });

    const deferredTeamB = await onboarding.getState(contextB);
    assert.equal(deferredTeamB.progress.team, 'SKIPPED');
    assert.equal(deferredTeamB.progress.currentStep, 'INTEGRATION');

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        insert into integrations.connections (
          id, tenant_id, connector_key, display_name, status
        ) values (
          'bbbbbbbb-0000-0000-0000-000000000902'::uuid,
          ${tenantB}::uuid,
          'test-connector',
          'Onboarding pending connection',
          'PENDING'
        )
      `.execute(transaction);
    });

    const actionRequiredB = await onboarding.getState(contextB);
    assert.equal(actionRequiredB.progress.integration, 'ACTION_REQUIRED');
    assert.equal(actionRequiredB.progress.ready, false);

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        update integrations.connections
        set status = 'DEGRADED', updated_at = now()
        where id = 'bbbbbbbb-0000-0000-0000-000000000902'::uuid
      `.execute(transaction);
    });

    const degradedB = await onboarding.getState(contextB);
    assert.equal(degradedB.progress.integration, 'DEGRADED');
    assert.equal(degradedB.progress.currentStep, 'READY');
    assert.equal(degradedB.progress.ready, true);

    await withTenantTransaction(database, contextB, async (transaction) => {
      await sql`
        update integrations.connections
        set status = 'CONNECTED', updated_at = now()
        where id = 'bbbbbbbb-0000-0000-0000-000000000902'::uuid
      `.execute(transaction);
    });

    const connectedB = await onboarding.getState(contextB);
    assert.equal(connectedB.progress.integration, 'CONNECTED');
    assert.equal(connectedB.progress.ready, true);
    assert.ok(connectedB.profile, 'Tenant B onboarding profile was not persisted');
    assert.equal(connectedB.profile.countryCode, 'SA');
    assert.equal(connectedB.profile.currencyCode, 'SAR');
    assert.equal(connectedB.profile.timezone, 'Asia/Riyadh');
    assert.equal(connectedB.profile.locale, 'ar');

    const initialA = await onboarding.getState(contextA);
    assert.equal(initialA.profile, null, 'Tenant A can see Tenant B onboarding profile');
    assert.equal(initialA.progress.team, 'COMPLETE', 'Tenant A fixture has two active memberships');

    const profileA = await onboarding.updateProfile(contextA, 'onboarding-profile-a', {
      countryCode: 'EG',
      currencyCode: 'EGP',
      timezone: 'Africa/Cairo',
      locale: 'en',
      industryCode: 'SERVICES',
      customerModel: 'B2B',
      commerceModel: 'SERVICES',
      monthlyOrderVolumeBand: '1_100',
      monthlyConversationVolumeBand: '101_1000',
      goals: ['SALES_GROWTH', 'ANALYTICS'],
    });
    assert.equal(profileA.result.profileComplete, true);

    const stateA = await onboarding.getState(contextA);
    assert.ok(stateA.profile, 'Tenant A onboarding profile was not persisted');
    assert.equal(stateA.profile.countryCode, 'EG');
    assert.equal(stateA.profile.currencyCode, 'EGP');
    assert.notEqual(stateA.profile.countryCode, connectedB.profile.countryCode);

    await assertAuditAndTenantIsolation(database);
  } finally {
    await databaseService.onModuleDestroy();
  }
}

async function assertInvalidInputRollback(onboarding: OnboardingService): Promise<void> {
  await assert.rejects(
    onboarding.updateProfile(contextB, 'onboarding-invalid-timezone-b', {
      ...profileBInput,
      timezone: 'Not/A_Timezone',
    }),
    OnboardingInputError,
  );
  const state = await onboarding.getState(contextB);
  assert.equal(state.profile, null, 'Invalid timezone created a partial profile');
  assert.equal(
    state.organization.timezone,
    'UTC',
    'Invalid timezone partially mutated organization',
  );

  await assert.rejects(
    onboarding.updateProfile(contextB, 'onboarding-invalid-locale-b', {
      ...profileBInput,
      locale: 'invalid-locale',
    }),
    (error: unknown) => error instanceof Error && error.name === 'ZodError',
  );
}

async function assertIdempotencyConflict(onboarding: OnboardingService): Promise<void> {
  await assert.rejects(
    onboarding.updateProfile(contextB, 'onboarding-profile-b', {
      ...profileBInput,
      currencyCode: 'USD',
    }),
    (error: unknown) =>
      error instanceof CommandExecutionError && error.code === 'idempotency_conflict',
  );
}

async function assertAuditAndTenantIsolation(
  database: ApiDatabaseService['database'],
): Promise<void> {
  await withTenantTransaction(database, contextA, async (transaction) => {
    const [profiles, profileAudit, profileOutbox] = await Promise.all([
      sql<{ tenant_id: string }>`
        select tenant_id from identity.organization_business_profiles order by tenant_id
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from platform.audit_log
        where tenant_id = ${tenantA}::uuid
          and action = 'onboarding.business_profile.update'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from platform.outbox_events
        where tenant_id = ${tenantA}::uuid
          and event_type = 'onboarding.business_profile.updated'
      `.execute(transaction),
    ]);
    assert.deepEqual(
      profiles.rows.map((row) => row.tenant_id),
      [tenantA],
      'Tenant A can read another tenant onboarding profile',
    );
    assert.equal(profileAudit.rows[0]?.count, '1');
    assert.equal(profileOutbox.rows[0]?.count, '1');
  });

  await withTenantTransaction(database, contextB, async (transaction) => {
    const visibleA = await sql<{ tenant_id: string }>`
      select tenant_id
      from identity.organization_business_profiles
      where tenant_id = ${tenantA}::uuid
    `.execute(transaction);
    assert.equal(visibleA.rows.length, 0, 'Tenant B can read Tenant A onboarding profile');

    const organization = await sql<{ timezone: string; locale: string }>`
      select timezone, locale
      from identity.organizations
      where id = ${tenantB}::uuid
    `.execute(transaction);
    assert.equal(organization.rows[0]?.timezone, 'Asia/Riyadh');
    assert.equal(organization.rows[0]?.locale, 'ar');

    const [stepAudit, stepOutbox] = await Promise.all([
      sql<{ count: string }>`
        select count(*)::text as count
        from platform.audit_log
        where action = 'onboarding.step.disposition.update'
      `.execute(transaction),
      sql<{ count: string }>`
        select count(*)::text as count
        from platform.outbox_events
        where event_type = 'onboarding.step.disposition.updated'
      `.execute(transaction),
    ]);
    assert.equal(stepAudit.rows[0]?.count, '1');
    assert.equal(stepOutbox.rows[0]?.count, '1');
  });
}

await main();
