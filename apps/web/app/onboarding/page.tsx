import type { Metadata } from 'next';
import { identityRequest, resultMessage } from '../identity-api';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  Stack,
  StatusBadge,
  SurfaceCard,
} from '../ui-primitives';
import { saveBusinessProfile, setOnboardingStep } from './actions';

export const metadata: Metadata = { title: 'Onboarding | Platform' };

type VolumeBand =
  | 'NONE'
  | '1_100'
  | '101_1000'
  | '1001_5000'
  | '5001_20000'
  | '20000_PLUS';

interface OnboardingState {
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    locale: string;
  };
  profile: null | {
    countryCode: string;
    currencyCode: string;
    timezone: string;
    locale: string;
    industryCode: string;
    customerModel: 'B2C' | 'B2B' | 'HYBRID';
    commerceModel:
      | 'ECOMMERCE'
      | 'OMNICHANNEL'
      | 'SERVICES'
      | 'MARKETPLACE'
      | 'WHOLESALE'
      | 'HYBRID'
      | 'OTHER';
    monthlyOrderVolumeBand: VolumeBand;
    monthlyConversationVolumeBand: VolumeBand;
    goals: readonly string[];
    completedAt: string;
    updatedAt: string;
  };
  progress: {
    currentStep: 'BUSINESS_PROFILE' | 'TEAM' | 'INTEGRATION' | 'COMPLETE';
    complete: boolean;
    businessProfile: 'PENDING' | 'COMPLETE';
    team: 'PENDING' | 'SKIPPED' | 'COMPLETE';
    integration: 'PENDING' | 'SKIPPED' | 'COMPLETE';
    activeMemberCount: number;
    pendingInvitationCount: number;
    connectionCount: number;
    connectedConnectionCount: number;
  };
}

interface PageProps {
  searchParams: Promise<{ message?: string }>;
}

const goals = [
  ['SUPPORT_AUTOMATION', 'Customer support automation'],
  ['ORDER_OPERATIONS', 'Order operations'],
  ['RECOVERY', 'Revenue recovery'],
  ['SALES_GROWTH', 'Sales growth'],
  ['CAMPAIGNS', 'Campaigns'],
  ['SHIPPING', 'Shipping operations'],
  ['RETURNS', 'Returns & exchanges'],
  ['ANALYTICS', 'Analytics & ROI'],
  ['AI_OPERATORS', 'AI operators'],
] as const;

const volumeBands: readonly [VolumeBand, string][] = [
  ['NONE', 'None yet'],
  ['1_100', '1–100 / month'],
  ['101_1000', '101–1,000 / month'],
  ['1001_5000', '1,001–5,000 / month'],
  ['5001_20000', '5,001–20,000 / month'],
  ['20000_PLUS', '20,000+ / month'],
];

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const result = await identityRequest<OnboardingState>('/v1/onboarding');

  if (result.kind !== 'success') {
    return (
      <PageShell>
        <EmptyState
          title="Onboarding is unavailable"
          description={resultMessage(result)}
          action={
            <a className="ds-button ds-button--secondary" href="/organizations">
              Organizations
            </a>
          }
        />
      </PageShell>
    );
  }

  const state = result.data;
  const profile = state.profile;
  const currentStep = formatStep(state.progress.currentStep);

  return (
    <PageShell aria-labelledby="onboarding-title">
      <Stack gap="spacious">
        <PageHeader
          eyebrow="SELF-SERVICE ONBOARDING"
          title={<span id="onboarding-title">Set up {state.organization.name}</span>}
          description="Capture reusable business context, establish the initial team, and connect the first provider without generating opaque workflows or duplicating canonical platform state."
          actions={
            <>
              <a className="ds-button ds-button--secondary" href="/organizations">
                Switch organization
              </a>
              <a className="ds-button ds-button--secondary" href="/settings">
                Organization settings
              </a>
            </>
          }
        />

        {message ? (
          <div className="identity-notice" role="status">
            {message}
          </div>
        ) : null}

        <div className="ds-metric-grid" aria-label="Onboarding progress">
          <MetricCard
            label="Business profile"
            value={state.progress.businessProfile}
            detail={profile ? `${profile.countryCode} · ${profile.currencyCode}` : 'Required'}
          />
          <MetricCard
            label="Team"
            value={state.progress.team}
            detail={`${String(state.progress.activeMemberCount)} active · ${String(
              state.progress.pendingInvitationCount,
            )} pending invite(s)`}
          />
          <MetricCard
            label="Integration"
            value={state.progress.integration}
            detail={`${String(state.progress.connectedConnectionCount)} connected of ${String(
              state.progress.connectionCount,
            )}`}
          />
          <MetricCard
            label="Current step"
            value={currentStep}
            detail={
              state.progress.complete ? 'Workspace setup is ready' : 'Resume where you left off'
            }
          />
        </div>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">STEP 1 · BUSINESS PROFILE</p>
                <h2>Reusable business context</h2>
              </div>
              <StatusBadge
                tone={state.progress.businessProfile === 'COMPLETE' ? 'success' : 'warning'}
              >
                {state.progress.businessProfile}
              </StatusBadge>
            </div>
            <p className="identity-muted">
              This profile is canonical tenant configuration data used later by configuration,
              analytics, billing, AI routing, and operator setup. It does not create automation
              workflows by itself.
            </p>
            <form action={saveBusinessProfile} className="identity-form">
              <div className="identity-form-grid">
                <div className="identity-field">
                  <label htmlFor="onboarding-country">Country code</label>
                  <input
                    id="onboarding-country"
                    name="countryCode"
                    required
                    pattern="[A-Za-z]{2}"
                    maxLength={2}
                    defaultValue={profile?.countryCode ?? 'EG'}
                    autoCapitalize="characters"
                    aria-describedby="onboarding-country-help"
                  />
                  <small id="onboarding-country-help">ISO 3166-1 alpha-2, e.g. EG, SA, AE.</small>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-currency">Currency code</label>
                  <input
                    id="onboarding-currency"
                    name="currencyCode"
                    required
                    pattern="[A-Za-z]{3}"
                    maxLength={3}
                    defaultValue={profile?.currencyCode ?? 'EGP'}
                    autoCapitalize="characters"
                    aria-describedby="onboarding-currency-help"
                  />
                  <small id="onboarding-currency-help">ISO 4217, e.g. EGP, SAR, AED, USD.</small>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-locale">Primary language</label>
                  <select
                    id="onboarding-locale"
                    name="locale"
                    defaultValue={profile?.locale ?? state.organization.locale}
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-timezone">Timezone</label>
                  <input
                    id="onboarding-timezone"
                    name="timezone"
                    required
                    maxLength={100}
                    list="timezone-suggestions"
                    defaultValue={profile?.timezone ?? state.organization.timezone}
                  />
                  <datalist id="timezone-suggestions">
                    <option value="Africa/Cairo" />
                    <option value="Asia/Riyadh" />
                    <option value="Asia/Dubai" />
                    <option value="Asia/Kuwait" />
                    <option value="Asia/Qatar" />
                    <option value="Asia/Bahrain" />
                    <option value="Asia/Muscat" />
                    <option value="UTC" />
                  </datalist>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-industry">Industry</label>
                  <select
                    id="onboarding-industry"
                    name="industryCode"
                    defaultValue={profile?.industryCode ?? 'ECOMMERCE'}
                  >
                    <option value="ECOMMERCE">E-commerce</option>
                    <option value="RETAIL">Retail</option>
                    <option value="SERVICES">Services</option>
                    <option value="REAL_ESTATE">Real estate</option>
                    <option value="HEALTHCARE">Healthcare</option>
                    <option value="EDUCATION">Education</option>
                    <option value="HOSPITALITY">Hospitality</option>
                    <option value="LOGISTICS">Logistics</option>
                    <option value="MANUFACTURING">Manufacturing</option>
                    <option value="WHOLESALE">Wholesale</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-customer-model">Customer model</label>
                  <select
                    id="onboarding-customer-model"
                    name="customerModel"
                    defaultValue={profile?.customerModel ?? 'B2C'}
                  >
                    <option value="B2C">B2C</option>
                    <option value="B2B">B2B</option>
                    <option value="HYBRID">B2B + B2C</option>
                  </select>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-commerce-model">Commerce model</label>
                  <select
                    id="onboarding-commerce-model"
                    name="commerceModel"
                    defaultValue={profile?.commerceModel ?? 'ECOMMERCE'}
                  >
                    <option value="ECOMMERCE">E-commerce</option>
                    <option value="OMNICHANNEL">Omnichannel</option>
                    <option value="SERVICES">Services</option>
                    <option value="MARKETPLACE">Marketplace</option>
                    <option value="WHOLESALE">Wholesale</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-order-volume">Monthly order volume</label>
                  <select
                    id="onboarding-order-volume"
                    name="monthlyOrderVolumeBand"
                    defaultValue={profile?.monthlyOrderVolumeBand ?? '101_1000'}
                  >
                    {volumeBands.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="identity-field">
                  <label htmlFor="onboarding-conversation-volume">
                    Monthly conversation volume
                  </label>
                  <select
                    id="onboarding-conversation-volume"
                    name="monthlyConversationVolumeBand"
                    defaultValue={profile?.monthlyConversationVolumeBand ?? '101_1000'}
                  >
                    {volumeBands.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset className="identity-field">
                <legend>Primary goals</legend>
                <div className="identity-role-editor-grid">
                  {goals.map(([value, label], index) => (
                    <label className="identity-role-card" key={value}>
                      <input
                        type="checkbox"
                        name="goals"
                        value={value}
                        defaultChecked={profile ? profile.goals.includes(value) : index === 0}
                      />{' '}
                      <strong>{label}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button className="ds-button ds-button--primary" type="submit">
                {profile ? 'Update business profile' : 'Save business profile'}
              </button>
            </form>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">STEP 2 · TEAM</p>
                <h2>Establish the initial team</h2>
              </div>
              <StatusBadge tone={stepTone(state.progress.team)}>{state.progress.team}</StatusBadge>
            </div>
            <p className="identity-muted">
              Team completion is derived from canonical memberships and invitations. Onboarding does
              not copy member state into a separate setup table.
            </p>
            <div className="identity-role-list">
              <StatusBadge tone="info">
                {state.progress.activeMemberCount} active member(s)
              </StatusBadge>
              <StatusBadge tone="neutral">
                {state.progress.pendingInvitationCount} pending invitation(s)
              </StatusBadge>
            </div>
            <div className="identity-section-heading">
              <a className="ds-button ds-button--primary" href="/team">
                Open team & roles
              </a>
              {state.progress.team === 'COMPLETE' ? null : (
                <StepDisposition
                  step="TEAM"
                  status={state.progress.team === 'SKIPPED' ? 'PENDING' : 'SKIPPED'}
                />
              )}
            </div>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">STEP 3 · INTEGRATION</p>
                <h2>Connect the first provider</h2>
              </div>
              <StatusBadge tone={stepTone(state.progress.integration)}>
                {state.progress.integration}
              </StatusBadge>
            </div>
            <p className="identity-muted">
              Completion is derived from canonical integration connections. Development fixtures are
              never presented as production providers, and real credentials remain in the secret
              boundary rather than onboarding state.
            </p>
            <div className="identity-role-list">
              <StatusBadge tone="info">
                {state.progress.connectedConnectionCount} connected
              </StatusBadge>
              <StatusBadge tone="neutral">{state.progress.connectionCount} configured</StatusBadge>
            </div>
            <div className="identity-section-heading">
              <a className="ds-button ds-button--primary" href="/integrations">
                Open integrations
              </a>
              {state.progress.integration === 'COMPLETE' ? null : (
                <StepDisposition
                  step="INTEGRATION"
                  status={state.progress.integration === 'SKIPPED' ? 'PENDING' : 'SKIPPED'}
                />
              )}
            </div>
          </Stack>
        </SurfaceCard>

        <SurfaceCard>
          <Stack>
            <div className="identity-section-heading">
              <div>
                <p className="ds-eyebrow">STEP 4 · READY</p>
                <h2>
                  {state.progress.complete
                    ? 'Workspace setup is ready'
                    : 'Finish the required setup'}
                </h2>
              </div>
              <StatusBadge tone={state.progress.complete ? 'success' : 'warning'}>
                {state.progress.complete ? 'READY' : 'IN PROGRESS'}
              </StatusBadge>
            </div>
            <p className="identity-muted">
              {state.progress.complete
                ? 'Your reusable organization profile is saved and every remaining setup step is either complete or explicitly deferred.'
                : `Resume ${formatStep(state.progress.currentStep)} to finish onboarding.`}
            </p>
            <div className="identity-section-heading">
              <a className="ds-button ds-button--primary" href="/customers">
                Continue to workspace
              </a>
              <a className="ds-button ds-button--secondary" href="/settings">
                Review settings
              </a>
            </div>
          </Stack>
        </SurfaceCard>
      </Stack>
    </PageShell>
  );
}

function StepDisposition({
  step,
  status,
}: {
  step: 'TEAM' | 'INTEGRATION';
  status: 'PENDING' | 'SKIPPED';
}) {
  return (
    <form action={setOnboardingStep}>
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="status" value={status} />
      <button className="ds-button ds-button--secondary" type="submit">
        {status === 'SKIPPED' ? 'Skip for now' : 'Reopen step'}
      </button>
    </form>
  );
}

function stepTone(status: 'PENDING' | 'SKIPPED' | 'COMPLETE') {
  if (status === 'COMPLETE') return 'success' as const;
  if (status === 'SKIPPED') return 'neutral' as const;
  return 'warning' as const;
}

function formatStep(step: OnboardingState['progress']['currentStep']): string {
  if (step === 'BUSINESS_PROFILE') return 'Business profile';
  if (step === 'TEAM') return 'Team';
  if (step === 'INTEGRATION') return 'Integration';
  return 'Complete';
}
