import { previewSurfaces, type PreviewSurface, type PreviewTone } from './preview-surfaces';

function surface(
  label: string,
  eyebrow: string,
  description: string,
  metrics: readonly [string, string][],
  lanes: readonly [string, PreviewTone, readonly string[]][],
  rows: readonly [string, string, string, PreviewTone, string][],
  insights: readonly string[],
  actions: readonly string[],
): PreviewSurface {
  return {
    label,
    eyebrow,
    description,
    metrics: metrics.map(([metricLabel, value]) => ({
      label: metricLabel,
      value,
      detail: 'Representative review data',
    })),
    lanes: lanes.map(([title, tone, items]) => ({ title, tone, items })),
    rows: rows.map(([primary, secondary, status, tone, meta]) => ({
      primary,
      secondary,
      status,
      tone,
      meta,
    })),
    insightTitle: `${label} signals`,
    insights,
    nextActions: actions,
  };
}

const implemented = {
  inbox: surface(
    'Unified inbox',
    'CUSTOMER OPERATIONS',
    'Operate WhatsApp, Instagram, Messenger, email, and web conversations from one assignment and human-handover workspace.',
    [
      ['Open conversations', '142'],
      ['Waiting customer', '38'],
      ['Human handovers', '17'],
      ['SLA risk', '9'],
    ],
    [
      ['New', 'info', ['WhatsApp · Mariam A.', 'Instagram · Ahmed K.', 'Messenger · Reem H.']],
      [
        'Assigned',
        'warning',
        ['Sara · refund question', 'Omar · order edit', 'Aya · shipping delay'],
      ],
      [
        'Resolved',
        'success',
        ['Web chat · product help', 'Email · invoice copy', 'WhatsApp · address fixed'],
      ],
    ],
    [
      ['Mariam Ahmed', 'WhatsApp · 2m ago', 'New', 'info', 'Order ORD-10431 · Arabic'],
      [
        'Ahmed Khaled',
        'Instagram · 8m ago',
        'Assigned',
        'warning',
        'Owner: Salma · sentiment neutral',
      ],
      [
        'Reem Hassan',
        'Messenger · 14m ago',
        'Handover',
        'warning',
        'AI paused · human response required',
      ],
    ],
    [
      'Nine conversations are approaching SLA breach.',
      'Arabic conversations represent most of the current queue.',
      'Human handover remains explicit and reversible.',
    ],
    ['Open conversation', 'Assign queue', 'Review SLA risk'],
  ),
  customers: surface(
    'Customer 360',
    'CRM',
    'Maintain canonical customer identity, contact points, tags, segments, consent, timeline, order context, and merge-safe duplicate handling.',
    [
      ['Customers', '48.2k'],
      ['New this month', '2,184'],
      ['Duplicate candidates', '63'],
      ['Opted out', '1.7%'],
    ],
    [
      ['New', 'info', ['Imported customers', 'New purchasers', 'Lead conversions']],
      ['Needs review', 'warning', ['Duplicate identities', 'Missing phone', 'Consent conflict']],
      ['Healthy', 'success', ['Verified contacts', 'Active segments', 'Merged profiles']],
    ],
    [
      ['Mona Ahmed', '+20 100 234 5678', 'Active', 'success', '12 orders · EGP 18.4k LTV'],
      [
        'Youssef Ali',
        'youssef@example.test',
        'Review',
        'warning',
        'Potential duplicate · same phone',
      ],
      ['Nour Hassan', '+20 122 555 0194', 'Active', 'success', 'VIP segment · WhatsApp consent'],
    ],
    [
      'Identity remains canonical across commerce, support, and sales.',
      'Duplicate merges require evidence and approval.',
      'Consent and suppression are visible to outbound workflows.',
    ],
    ['Open customer', 'Review duplicates', 'Build segment'],
  ),
  tickets: surface(
    'Tickets',
    'SERVICE MANAGEMENT',
    'Track support work with assignment, comments, status, SLA clocks, approvals, and conversation-linked context.',
    [
      ['Open tickets', '86'],
      ['Due today', '21'],
      ['SLA breached', '4'],
      ['Resolved 24h', '119'],
    ],
    [
      ['Open', 'info', ['TKT-8841 · wrong item', 'TKT-8839 · refund', 'TKT-8831 · late shipment']],
      [
        'In progress',
        'warning',
        ['TKT-8818 · warehouse', 'TKT-8807 · finance', 'TKT-8795 · carrier'],
      ],
      ['Resolved', 'success', ['TKT-8789 · exchange', 'TKT-8782 · invoice', 'TKT-8777 · delivery']],
    ],
    [
      ['TKT-8841', 'Mona Ahmed', 'Open', 'info', 'Priority high · 38m SLA left'],
      ['TKT-8818', 'Ahmed Khaled', 'In progress', 'warning', 'Assigned to Warehouse Ops'],
      ['TKT-8789', 'Nour Hassan', 'Resolved', 'success', 'Exchange created · CSAT pending'],
    ],
    [
      'Four SLA breaches require manager review.',
      'Shipping-related tickets are trending up today.',
      'Ticket state remains linked to the originating conversation.',
    ],
    ['Open ticket queue', 'Review SLA breaches', 'Manage SLA policy'],
  ),
  orders: surface(
    'Orders',
    'COMMERCE',
    'Operate canonical orders, lines, payment state, confirmation, modification, cancellation, fulfillment, and provider synchronization.',
    [
      ['Orders today', '486'],
      ['GMV today', 'EGP 624k'],
      ['Awaiting action', '37'],
      ['Canceled', '3.1%'],
    ],
    [
      ['Created', 'info', ['ORD-10431 · COD', 'ORD-10430 · card', 'ORD-10429 · COD']],
      [
        'Confirmed',
        'warning',
        ['ORD-10422 · shipping', 'ORD-10418 · packed', 'ORD-10414 · carrier'],
      ],
      [
        'Completed',
        'success',
        ['ORD-10391 · delivered', 'ORD-10387 · delivered', 'ORD-10374 · delivered'],
      ],
    ],
    [
      ['ORD-10431', 'Mona Ahmed · Cairo', 'Created', 'info', 'EGP 1,840 · COD · 3 items'],
      ['ORD-10422', 'Youssef Ali · Giza', 'Confirmed', 'warning', 'EGP 2,410 · shipping pending'],
      ['ORD-10391', 'Nour Hassan · Alexandria', 'Delivered', 'success', 'EGP 990 · card paid'],
    ],
    [
      'COD confirmation is the largest operational queue.',
      'Provider writes occur after canonical state commit.',
      'Cancellation and high-risk edits remain policy controlled.',
    ],
    ['Open order', 'Review confirmations', 'Inspect provider sync'],
  ),
  shipping: surface(
    'Shipping',
    'FULFILLMENT',
    'Normalize destinations, select eligible carrier services, create shipments, track labels/events, and manage delivery rescue.',
    [
      ['Ready to ship', '74'],
      ['In transit', '319'],
      ['Delivery exceptions', '12'],
      ['Delivered today', '227'],
    ],
    [
      ['Ready', 'info', ['SHP-4821 · Cairo', 'SHP-4818 · Giza', 'SHP-4811 · Mansoura']],
      [
        'In transit',
        'warning',
        ['SHP-4772 · out for delivery', 'SHP-4768 · hub', 'SHP-4759 · linehaul'],
      ],
      [
        'Delivered',
        'success',
        ['SHP-4721 · delivered', 'SHP-4719 · delivered', 'SHP-4716 · delivered'],
      ],
    ],
    [
      ['SHP-4821', 'ORD-10422', 'Ready', 'info', 'Cairo · normalized confidence 98%'],
      ['SHP-4772', 'ORD-10381', 'Out for delivery', 'warning', 'Carrier ETA 15:30'],
      ['SHP-4730', 'ORD-10355', 'Rescue', 'danger', 'Second failed attempt · customer contact due'],
    ],
    [
      'Twelve delivery exceptions need active rescue.',
      'Destination confidence is visible before dispatch.',
      'Carrier references remain mapped to canonical shipments.',
    ],
    ['Create shipment', 'Review routing', 'Open rescue queue'],
  ),
  approvals: surface(
    'Approvals',
    'GOVERNANCE',
    'Review high-risk and critical actions with digest-bound evidence so an approval cannot be replayed for a different command.',
    [
      ['Requested', '14'],
      ['Critical', '3'],
      ['Approved today', '27'],
      ['Expired', '2'],
    ],
    [
      ['Requested', 'warning', ['Refund EGP 8,400', 'Role escalation', 'Campaign launch']],
      ['Approved', 'success', ['Customer merge', 'Order cancel', 'Secret rotation']],
      ['Rejected', 'danger', ['Bulk export', 'Unsafe role change', 'Refund mismatch']],
    ],
    [
      ['APR-9921', 'commerce.refund.issue', 'Requested', 'warning', 'EGP 8,400 · finance policy'],
      ['APR-9918', 'organization.role.update', 'Requested', 'warning', 'Privileged role change'],
      ['APR-9905', 'crm.customer.merge', 'Approved', 'success', 'Digest matched · executed'],
    ],
    [
      'Approvals bind to exact action digests.',
      'Expired approvals cannot execute.',
      'Critical actions retain actor, resource, and evidence.',
    ],
    ['Review request', 'Inspect action digest', 'Open audit trail'],
  ),
  integrations: surface(
    'Integrations',
    'CONNECTIVITY',
    'Manage provider connections, assets, health, webhooks, synchronization, typed actions, and secret references without exposing raw credentials.',
    [
      ['Connected', '7'],
      ['Degraded', '1'],
      ['Sync runs 24h', '86'],
      ['Webhook errors', '3'],
    ],
    [
      ['Messaging', 'info', ['WhatsApp Cloud API', 'Instagram Messaging', 'Messenger']],
      ['Commerce', 'success', ['Shopify', 'WooCommerce', 'Generic API']],
      ['Attention', 'warning', ['Email · degraded', '3 webhook retries', '1 token rotation due']],
    ],
    [
      ['WhatsApp Cloud API', 'Messaging', 'Healthy', 'success', 'Webhook active · assets synced'],
      ['Shopify', 'Commerce', 'Healthy', 'success', 'Incremental sync 4m ago'],
      ['Email', 'Messaging', 'Degraded', 'warning', 'Provider latency elevated'],
    ],
    [
      'Secrets are referenced rather than exposed.',
      'Retries are bounded and dead-lettered.',
      'Production provider capability stays separate from fixtures.',
    ],
    ['Connect provider', 'Run sync', 'Inspect webhook health'],
  ),
  onboarding: surface(
    'Onboarding',
    'ORGANIZATION SETUP',
    'Configure reusable business profile, team setup, first integration, and launch readiness from canonical organization state.',
    [
      ['Profile', 'Complete'],
      ['Team', '3 members'],
      ['Integrations', '2 connected'],
      ['Readiness', '75%'],
    ],
    [
      ['Business profile', 'success', ['Egypt · EGP', 'E-commerce · B2C', 'Arabic + English']],
      ['Team', 'success', ['Owner', 'Support manager', 'Operations agent']],
      ['Integration', 'warning', ['WhatsApp connected', 'Shopify connected', 'Shipping pending']],
    ],
    [
      [
        'Business profile',
        'Egypt · EGP · Africa/Cairo',
        'Complete',
        'success',
        'Goals: support, orders, recovery',
      ],
      ['Team', '3 active · 1 invite pending', 'Complete', 'success', 'Role boundaries configured'],
      [
        'First integration',
        'WhatsApp + Shopify',
        'Complete',
        'success',
        'Provider health available',
      ],
    ],
    [
      'Onboarding reuses canonical organization, membership, and connection state.',
      'Setup can resume without duplicated business state.',
      'Skipped steps stay explicit and reversible.',
    ],
    ['Edit business profile', 'Invite team', 'Connect provider'],
  ),
  team: surface(
    'Team & roles',
    'IDENTITY & ACCESS',
    'Manage organization membership, invitations, system/custom roles, MFA policy visibility, and privileged-role boundaries.',
    [
      ['Active members', '18'],
      ['Pending invites', '3'],
      ['Custom roles', '4'],
      ['MFA policy', 'Privileged'],
    ],
    [
      ['Owners/Admins', 'warning', ['Karim · Owner', 'Salma · Admin', 'Omar · Admin']],
      ['Operations', 'info', ['Support manager', 'Order operator', 'Shipping operator']],
      ['Invitations', 'neutral', ['3 pending', '1 expiring soon', '0 revoked today']],
    ],
    [
      ['Karim', 'Owner', 'Active', 'success', 'MFA assured · all permissions'],
      ['Salma', 'Admin', 'Active', 'success', 'Privileged role · MFA required'],
      ['Mariam', 'Support manager', 'Active', 'success', 'Custom role · 12 permissions'],
    ],
    [
      'Final active owner cannot be suspended or removed.',
      'Privileged custom roles are guarded like Owner/Admin.',
      'Invitation acceptance is verified-email bound.',
    ],
    ['Invite member', 'Edit custom role', 'Review MFA policy'],
  ),
  organizations: surface(
    'Organizations',
    'MULTI-TENANT',
    'Switch between authorized tenant workspaces and keep roles, settings, data, automation, and provider state isolated.',
    [
      ['Workspaces', '3'],
      ['Active', '3'],
      ['Owner roles', '2'],
      ['Admin roles', '1'],
    ],
    [
      ['Primary', 'success', ['AI PRENEURA', 'Egypt operations']],
      ['Client', 'info', ['Commerce client', 'Real estate client']],
      ['Security', 'warning', ['Tenant isolation enforced', 'Role context changes on switch']],
    ],
    [
      ['AI PRENEURA', 'aipreneura', 'Owner', 'success', 'Primary workspace'],
      ['Commerce client', 'commerce-eg', 'Admin', 'info', 'E-commerce operations'],
      ['Real estate client', 'realestate-eg', 'Owner', 'success', 'Sales operations'],
    ],
    [
      'Tenant selection changes the server-side data boundary.',
      'RLS and relationship guards prevent cross-tenant access.',
      'Global identity is separate from tenant membership.',
    ],
    ['Open workspace', 'Create organization', 'Review memberships'],
  ),
} satisfies Record<string, PreviewSurface>;

export const reviewSurfaces = { ...implemented, ...previewSurfaces } satisfies Record<
  string,
  PreviewSurface
>;

export type ReviewSurfaceKey = keyof typeof reviewSurfaces;

export function isReviewSurface(value: string): value is ReviewSurfaceKey {
  return value in reviewSurfaces;
}
