import {
  CommandExecutor,
  type CommandResult,
  type TenantRequestContext,
} from '@platform/command-execution';
import { sql, withTenantTransaction, type PlatformDatabase } from '@platform/database';
import { z } from 'zod';

const localeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const timezoneSchema = z.string().trim().min(1).max(100);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
const industryCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const customerModelSchema = z.enum(['B2C', 'B2B', 'HYBRID']);
const commerceModelSchema = z.enum([
  'ECOMMERCE',
  'OMNICHANNEL',
  'SERVICES',
  'MARKETPLACE',
  'WHOLESALE',
  'HYBRID',
  'OTHER',
]);
const volumeBandSchema = z.enum([
  'NONE',
  '1_100',
  '101_1000',
  '1001_5000',
  '5001_20000',
  '20000_PLUS',
]);
const goalSchema = z.enum([
  'SUPPORT_AUTOMATION',
  'ORDER_OPERATIONS',
  'RECOVERY',
  'SALES_GROWTH',
  'CAMPAIGNS',
  'SHIPPING',
  'RETURNS',
  'ANALYTICS',
  'AI_OPERATORS',
]);

const profileInputSchema = z
  .object({
    countryCode: countryCodeSchema,
    currencyCode: currencyCodeSchema,
    timezone: timezoneSchema,
    locale: localeSchema,
    industryCode: industryCodeSchema,
    customerModel: customerModelSchema,
    commerceModel: commerceModelSchema,
    monthlyOrderVolumeBand: volumeBandSchema,
    monthlyConversationVolumeBand: volumeBandSchema,
    goals: z.array(goalSchema).min(1).max(10),
  })
  .strict();

const stepSchema = z.enum(['TEAM', 'INTEGRATION']);
const stepDispositionSchema = z.enum(['PENDING', 'SKIPPED']);

export type OnboardingProfileInput = z.input<typeof profileInputSchema>;
export type OnboardingStep = z.input<typeof stepSchema>;
export type OnboardingStepDisposition = z.input<typeof stepDispositionSchema>;
export type OnboardingTeamStatus = 'PENDING' | 'INVITED' | 'SKIPPED' | 'COMPLETE';
export type OnboardingIntegrationStatus =
  | 'PENDING'
  | 'ACTION_REQUIRED'
  | 'SKIPPED'
  | 'CONNECTED'
  | 'DEGRADED';

export class OnboardingInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OnboardingInputError';
  }
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
}

interface ProfileRow {
  country_code: string;
  currency_code: string;
  industry_code: string;
  customer_model: z.infer<typeof customerModelSchema>;
  commerce_model: z.infer<typeof commerceModelSchema>;
  monthly_order_volume_band: z.infer<typeof volumeBandSchema>;
  monthly_conversation_volume_band: z.infer<typeof volumeBandSchema>;
  goals: string[];
  completed_at: Date;
  updated_at: Date;
}

interface ProgressRow {
  team_step_status: z.infer<typeof stepDispositionSchema>;
  integration_step_status: z.infer<typeof stepDispositionSchema>;
}

interface EvidenceRow {
  active_member_count: string;
  pending_invitation_count: string;
  connection_count: string;
  connected_connection_count: string;
  degraded_connection_count: string;
  action_required_connection_count: string;
}

export interface OnboardingState {
  organization: OrganizationRow;
  profile: null | {
    countryCode: string;
    currencyCode: string;
    timezone: string;
    locale: string;
    industryCode: string;
    customerModel: z.infer<typeof customerModelSchema>;
    commerceModel: z.infer<typeof commerceModelSchema>;
    monthlyOrderVolumeBand: z.infer<typeof volumeBandSchema>;
    monthlyConversationVolumeBand: z.infer<typeof volumeBandSchema>;
    goals: readonly string[];
    completedAt: string;
    updatedAt: string;
  };
  progress: {
    currentStep: 'BUSINESS_PROFILE' | 'TEAM' | 'INTEGRATION' | 'READY';
    ready: boolean;
    businessProfile: 'PENDING' | 'COMPLETE';
    team: OnboardingTeamStatus;
    integration: OnboardingIntegrationStatus;
    activeMemberCount: number;
    pendingInvitationCount: number;
    connectionCount: number;
    connectedConnectionCount: number;
    degradedConnectionCount: number;
    actionRequiredConnectionCount: number;
  };
}

export class OnboardingService {
  public constructor(
    private readonly database: PlatformDatabase,
    private readonly commands: CommandExecutor,
  ) {}

  public async getState(context: TenantRequestContext): Promise<OnboardingState> {
    return withTenantTransaction(this.database, context, async (transaction) => {
      const [organizationResult, profileResult, progressResult, evidenceResult] = await Promise.all(
        [
          sql<OrganizationRow>`
            select id, name, slug, timezone, locale
            from identity.organizations
            where id = ${context.tenantId}::uuid
          `.execute(transaction),
          sql<ProfileRow>`
            select country_code, currency_code, industry_code, customer_model,
                   commerce_model, monthly_order_volume_band,
                   monthly_conversation_volume_band, goals, completed_at, updated_at
            from identity.organization_business_profiles
            where tenant_id = ${context.tenantId}::uuid
          `.execute(transaction),
          sql<ProgressRow>`
            select team_step_status, integration_step_status
            from identity.organization_onboarding_progress
            where tenant_id = ${context.tenantId}::uuid
          `.execute(transaction),
          sql<EvidenceRow>`
            select
              (select count(*)::text
               from identity.memberships membership
               where membership.tenant_id = ${context.tenantId}::uuid
                 and membership.status = 'ACTIVE') as active_member_count,
              (select count(*)::text
               from identity.organization_invitations invitation
               where invitation.tenant_id = ${context.tenantId}::uuid
                 and invitation.status = 'PENDING'
                 and invitation.expires_at > now()) as pending_invitation_count,
              (select count(*)::text
               from integrations.connections connection
               where connection.tenant_id = ${context.tenantId}::uuid
                 and connection.status <> 'REVOKED') as connection_count,
              (select count(*)::text
               from integrations.connections connection
               where connection.tenant_id = ${context.tenantId}::uuid
                 and connection.status = 'CONNECTED') as connected_connection_count,
              (select count(*)::text
               from integrations.connections connection
               where connection.tenant_id = ${context.tenantId}::uuid
                 and connection.status = 'DEGRADED') as degraded_connection_count,
              (select count(*)::text
               from integrations.connections connection
               where connection.tenant_id = ${context.tenantId}::uuid
                 and connection.status in ('PENDING', 'DISCONNECTED', 'FAILED'))
                as action_required_connection_count
          `.execute(transaction),
        ],
      );

      const organization = organizationResult.rows[0];
      const evidence = evidenceResult.rows[0];
      if (!organization) throw new Error('Organization was not found');
      if (!evidence) throw new Error('Onboarding evidence could not be loaded');

      const profile = profileResult.rows[0] ?? null;
      const progress = progressResult.rows[0] ?? null;
      const activeMemberCount = Number(evidence.active_member_count);
      const pendingInvitationCount = Number(evidence.pending_invitation_count);
      const connectionCount = Number(evidence.connection_count);
      const connectedConnectionCount = Number(evidence.connected_connection_count);
      const degradedConnectionCount = Number(evidence.degraded_connection_count);
      const actionRequiredConnectionCount = Number(evidence.action_required_connection_count);

      const businessProfile = profile ? ('COMPLETE' as const) : ('PENDING' as const);
      const team = deriveTeamStatus(
        activeMemberCount,
        pendingInvitationCount,
        progress?.team_step_status,
      );
      const integration = deriveIntegrationStatus(
        connectedConnectionCount,
        degradedConnectionCount,
        actionRequiredConnectionCount,
        progress?.integration_step_status,
      );
      const teamReady = team === 'COMPLETE' || team === 'SKIPPED';
      const integrationReady =
        integration === 'CONNECTED' || integration === 'DEGRADED' || integration === 'SKIPPED';
      const ready = businessProfile === 'COMPLETE' && teamReady && integrationReady;
      const currentStep =
        businessProfile === 'PENDING'
          ? ('BUSINESS_PROFILE' as const)
          : !teamReady
            ? ('TEAM' as const)
            : !integrationReady
              ? ('INTEGRATION' as const)
              : ('READY' as const);

      return {
        organization,
        profile: profile
          ? {
              countryCode: profile.country_code,
              currencyCode: profile.currency_code,
              timezone: organization.timezone,
              locale: organization.locale,
              industryCode: profile.industry_code,
              customerModel: profile.customer_model,
              commerceModel: profile.commerce_model,
              monthlyOrderVolumeBand: profile.monthly_order_volume_band,
              monthlyConversationVolumeBand: profile.monthly_conversation_volume_band,
              goals: profile.goals,
              completedAt: profile.completed_at.toISOString(),
              updatedAt: profile.updated_at.toISOString(),
            }
          : null,
        progress: {
          currentStep,
          ready,
          businessProfile,
          team,
          integration,
          activeMemberCount,
          pendingInvitationCount,
          connectionCount,
          connectedConnectionCount,
          degradedConnectionCount,
          actionRequiredConnectionCount,
        },
      };
    });
  }

  public async updateProfile(
    context: TenantRequestContext,
    idempotencyKey: string,
    input: OnboardingProfileInput,
  ): Promise<CommandResult<{ tenantId: string; profileComplete: true }>> {
    const validated = profileInputSchema.parse(input);
    const goals = [...new Set(validated.goals)];

    return this.commands.execute(
      {
        action: 'onboarding.business_profile.update',
        permission: 'organization.update',
        risk: 'MEDIUM',
        resource: () => ({ type: 'identity.organization', id: context.tenantId }),
        event: {
          type: 'onboarding.business_profile.updated',
          data: () => ({
            tenantId: context.tenantId,
            countryCode: validated.countryCode,
            currencyCode: validated.currencyCode,
            industryCode: validated.industryCode,
            customerModel: validated.customerModel,
            commerceModel: validated.commerceModel,
            goalCount: goals.length,
          }),
          dedupeKey: () => `onboarding:business-profile:${idempotencyKey}`,
        },
        audit: {
          afterState: () => ({
            countryCode: validated.countryCode,
            currencyCode: validated.currencyCode,
            timezone: validated.timezone,
            locale: validated.locale,
            industryCode: validated.industryCode,
            customerModel: validated.customerModel,
            commerceModel: validated.commerceModel,
            monthlyOrderVolumeBand: validated.monthlyOrderVolumeBand,
            monthlyConversationVolumeBand: validated.monthlyConversationVolumeBand,
            goals,
          }),
        },
        execute: async (transaction) => {
          const timezone = await sql<{ valid: boolean }>`
            select exists(select 1 from pg_timezone_names where name = ${validated.timezone}) as valid
          `.execute(transaction);
          if (!timezone.rows[0]?.valid) throw new OnboardingInputError('Unknown timezone');

          const organization = await sql<{ id: string }>`
            update identity.organizations
            set timezone = ${validated.timezone},
                locale = ${validated.locale},
                updated_at = now()
            where id = ${context.tenantId}::uuid
            returning id
          `.execute(transaction);
          if (!organization.rows[0]) throw new Error('Organization was not found');

          await sql`
            insert into identity.organization_business_profiles (
              tenant_id, country_code, currency_code, industry_code, customer_model,
              commerce_model, monthly_order_volume_band, monthly_conversation_volume_band,
              goals, completed_at
            ) values (
              ${context.tenantId}::uuid, ${validated.countryCode}, ${validated.currencyCode},
              ${validated.industryCode}, ${validated.customerModel}, ${validated.commerceModel},
              ${validated.monthlyOrderVolumeBand}, ${validated.monthlyConversationVolumeBand},
              ${goals}::text[], now()
            )
            on conflict (tenant_id) do update set
              country_code = excluded.country_code,
              currency_code = excluded.currency_code,
              industry_code = excluded.industry_code,
              customer_model = excluded.customer_model,
              commerce_model = excluded.commerce_model,
              monthly_order_volume_band = excluded.monthly_order_volume_band,
              monthly_conversation_volume_band = excluded.monthly_conversation_volume_band,
              goals = excluded.goals,
              completed_at = now(),
              updated_at = now()
          `.execute(transaction);

          await sql`
            insert into identity.organization_onboarding_progress (tenant_id)
            values (${context.tenantId}::uuid)
            on conflict (tenant_id) do nothing
          `.execute(transaction);

          return { tenantId: context.tenantId, profileComplete: true as const };
        },
      },
      { context, input: { ...validated, goals }, idempotencyKey },
    );
  }

  public async setStepDisposition(
    context: TenantRequestContext,
    idempotencyKey: string,
    step: OnboardingStep,
    disposition: OnboardingStepDisposition,
  ): Promise<
    CommandResult<{
      tenantId: string;
      step: OnboardingStep;
      status: OnboardingStepDisposition;
    }>
  > {
    const parsedStep = stepSchema.parse(step);
    const parsedDisposition = stepDispositionSchema.parse(disposition);

    return this.commands.execute(
      {
        action: 'onboarding.step.disposition.update',
        permission: 'organization.update',
        risk: 'LOW',
        resource: () => ({ type: 'identity.organization', id: context.tenantId }),
        event: {
          type: 'onboarding.step.disposition.updated',
          data: () => ({
            tenantId: context.tenantId,
            step: parsedStep,
            status: parsedDisposition,
          }),
          dedupeKey: () => `onboarding:step:${parsedStep}:${idempotencyKey}`,
        },
        audit: {
          afterState: () => ({ step: parsedStep, status: parsedDisposition }),
        },
        execute: async (transaction) => {
          if (parsedStep === 'TEAM') {
            await sql`
              insert into identity.organization_onboarding_progress (tenant_id, team_step_status)
              values (${context.tenantId}::uuid, ${parsedDisposition})
              on conflict (tenant_id) do update set
                team_step_status = excluded.team_step_status,
                updated_at = now()
            `.execute(transaction);
          } else {
            await sql`
              insert into identity.organization_onboarding_progress (
                tenant_id, integration_step_status
              ) values (${context.tenantId}::uuid, ${parsedDisposition})
              on conflict (tenant_id) do update set
                integration_step_status = excluded.integration_step_status,
                updated_at = now()
            `.execute(transaction);
          }

          return {
            tenantId: context.tenantId,
            step: parsedStep,
            status: parsedDisposition,
          };
        },
      },
      {
        context,
        input: { step: parsedStep, status: parsedDisposition },
        idempotencyKey,
      },
    );
  }
}

function deriveTeamStatus(
  activeMemberCount: number,
  pendingInvitationCount: number,
  disposition: z.infer<typeof stepDispositionSchema> | undefined,
): OnboardingTeamStatus {
  if (activeMemberCount > 1) return 'COMPLETE';
  if (pendingInvitationCount > 0) return 'INVITED';
  return disposition ?? 'PENDING';
}

function deriveIntegrationStatus(
  connectedConnectionCount: number,
  degradedConnectionCount: number,
  actionRequiredConnectionCount: number,
  disposition: z.infer<typeof stepDispositionSchema> | undefined,
): OnboardingIntegrationStatus {
  if (connectedConnectionCount > 0) return 'CONNECTED';
  if (degradedConnectionCount > 0) return 'DEGRADED';
  if (actionRequiredConnectionCount > 0) return 'ACTION_REQUIRED';
  return disposition ?? 'PENDING';
}
