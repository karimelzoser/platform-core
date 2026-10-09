import assert from 'node:assert/strict';
import { CommandAuthorizer, OpaClient } from '@platform/authorization';
import { CommandExecutor, type TenantRequestContext } from '@platform/command-execution';
import { sql, withTenantTransaction } from '@platform/database';
import { ApiDatabaseService } from '../../apps/api/src/api-database.service.js';
import { OnboardingService } from '../../apps/api/src/onboarding.service.js';

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

    const initialB = await onboarding.getState(contextB);
    assert.equal(initialB.organization.id, tenantB);
    assert.equal(initialB.profile, null);
    assert.equal(initialB.progress.businessProfile, 'PENDING');
    assert.equal(initialB.progress.team, 'PENDING');

    const profileBInput = {
      countryCode: 'SA',
      currencyCode: 'SAR',
      timezone: 'Asia/Riyadh',
      locale: 'ar',
      industryCode: 'ECOMMERCE',
      customerModel: 'B2C' as const,
      commerceModel: 'ECOMMERCE' as const,
      monthlyOrderVolumeBand: '101_1000' as const,
      monthlyConversationVolumeBand: '1001_5000' as const,
      goals: ['SUPPORT_AUTOMATION', 'ORDER_OPERATIONS', 'ANALYTICS'] as const,
    };
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

    const skippedTeam = await onboarding.setStepDisposition(
      contextB,
      'onboarding-team-b',
      'TEAM',
      'SKIPPED',
    );
    const skippedIntegration = await onboarding.setStepDisposition(
      contextB,
      'onboarding-integration-b',
      'INTEGRATION',
      'SKIPPED',
    );
    assert.equal(skippedTeam.result.status, 'SKIPPED');
    assert.equal(skippedIntegration.result.status, 'SKIPPED');

    const completedB = await onboarding.getState(contextB);
    assert.equal(completedB.profile?.countryCode, 'SA');
    assert.equal(completedB.profile?.currencyCode, 'SAR');
    assert.equal(completedB.profile?.timezone, 'Asia/Riyadh');
    assert.equal(completedB.profile?.locale, 'ar');
    assert.equal(completedB.progress.team, 'SKIPPED');
    assert.ok(
      completedB.progress.integration === 'SKIPPED' ||
        completedB.progress.integration === 'COMPLETE',
    );
    assert.equal(completedB.progress.complete, true);

    const initialA = await onboarding.getState(contextA);
    assert.equal(initialA.profile, null, 'Tenant A can see Tenant B onboarding profile');

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
    assert.equal(stateA.profile?.countryCode, 'EG');
    assert.equal(stateA.profile?.currencyCode, 'EGP');
    assert.notEqual(stateA.profile?.countryCode, completedB.profile?.countryCode);

    await withTenantTransaction(database, contextA, async (transaction) => {
      const [profiles, audit, outbox] = await Promise.all([
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
      assert.equal(audit.rows[0]?.count, '1');
      assert.equal(outbox.rows[0]?.count, '1');
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
    });
  } finally {
    await databaseService.onModuleDestroy();
  }
}

await main();
