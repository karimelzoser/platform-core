import { previewSurfaces, type PreviewSurface } from './preview-surfaces';

const implementedSurfaceReviews = {
  inbox: {
    label: 'Unified inbox',
    eyebrow: 'CUSTOMER OPERATIONS',
    description:
      'Operate WhatsApp, Instagram, Messenger, email, and web conversations from one assignment and human-handover workspace.',
    metrics: [
      { label: 'Open conversations', value: '142', detail: 'Representative review data' },
      { label: 'Waiting customer', value: '38', detail: 'Representative review data' },
      { label: 'Human handovers', value: '17', detail: 'Representative review data' },
      { label: 'SLA risk', value: '9', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['WhatsApp · Mariam A.', 'Instagram · Ahmed K.', 'Messenger · Reem H.'] },
      { title: 'Assigned', tone: 'warning', items: ['Sara · refund question', 'Omar · order edit', 'Aya · shipping delay'] },
      { title: 'Resolved', tone: 'success', items: ['Web chat · product help', 'Email · invoice copy', 'WhatsApp · address fixed'] },
    ],
    rows: [
      { primary: 'Mariam Ahmed', secondary: 'WhatsApp · 2m ago', status: 'New', tone: 'info', meta: 'Order ORD-10431 · Arabic' },
      { primary: 'Ahmed Khaled', secondary: 'Instagram · 8m ago', status: 'Assigned', tone: 'warning', meta: 'Owner: Salma · sentiment neutral' },
      { primary: 'Reem Hassan', secondary: 'Messenger · 14m ago', status: 'Handover', tone: 'warning', meta: 'AI paused · human response required' },
    ],
    insightTitle: 'Inbox signals',
    insights: ['Nine conversations are approaching SLA breach.', 'Arabic conversations represent most of the current queue.', 'Human handover remains explicit and reversible.'],
    nextActions: ['Open conversation', 'Assign queue', 'Review SLA risk'],
  },
  customers: {
    label: 'Customer 360',
    eyebrow: 'CRM',
    description:
      'Maintain canonical customer identity, contact points, tags, segments, consent, timeline, order context, and merge-safe duplicate handling.',
    metrics: [
      { label: 'Customers', value: '48.2k', detail: 'Representative review data' },
      { label: 'New this month', value: '2,184', detail: 'Representative review data' },
      { label: 'Duplicate candidates', value: '63', detail: 'Representative review data' },
      { label: 'Opted out', value: '1.7%', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['Imported customers', 'New purchasers', 'Lead conversions'] },
      { title: 'Needs review', tone: 'warning', items: ['Duplicate identities', 'Missing phone', 'Consent conflict'] },
      { title: 'Healthy', tone: 'success', items: ['Verified contacts', 'Active segments', 'Merged profiles'] },
    ],
    rows: [
      { primary: 'Mona Ahmed', secondary: '+20 100 234 5678', status: 'Active', tone: 'success', meta: '12 orders · EGP 18.4k LTV' },
      { primary: 'Youssef Ali', secondary: 'youssef@example.test', status: 'Review', tone: 'warning', meta: 'Potential duplicate · same phone' },
      { primary: 'Nour Hassan', secondary: '+20 122 555 0194', status: 'Active', tone: 'success', meta: 'VIP segment · WhatsApp consent' },
    ],
    insightTitle: 'Customer signals',
    insights: ['Identity remains canonical across commerce, support, and sales.', 'Duplicate merges require evidence and approval.', 'Consent and suppression are visible to every outbound workflow.'],
    nextActions: ['Open customer', 'Review duplicates', 'Build segment'],
  },
  tickets: {
    label: 'Tickets',
    eyebrow: 'SERVICE MANAGEMENT',
    description:
      'Track support work with assignment, comments, status, SLA clocks, approvals, and conversation-linked context.',
    metrics: [
      { label: 'Open tickets', value: '86', detail: 'Representative review data' },
      { label: 'Due today', value: '21', detail: 'Representative review data' },
      { label: 'SLA breached', value: '4', detail: 'Representative review data' },
      { label: 'Resolved 24h', value: '119', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Open', tone: 'info', items: ['TKT-8841 · wrong item', 'TKT-8839 · refund', 'TKT-8831 · late shipment'] },
      { title: 'In progress', tone: 'warning', items: ['TKT-8818 · warehouse', 'TKT-8807 · finance', 'TKT-8795 · carrier'] },
      { title: 'Resolved', tone: 'success', items: ['TKT-8789 · exchange', 'TKT-8782 · invoice', 'TKT-8777 · delivery'] },
    ],
    rows: [
      { primary: 'TKT-8841', secondary: 'Mona Ahmed', status: 'Open', tone: 'info', meta: 'Priority high · 38m SLA left' },
      { primary: 'TKT-8818', secondary: 'Ahmed Khaled', status: 'In progress', tone: 'warning', meta: 'Assigned to Warehouse Ops' },
      { primary: 'TKT-8789', secondary: 'Nour Hassan', status: 'Resolved', tone: 'success', meta: 'Exchange created · CSAT pending' },
    ],
    insightTitle: 'Service signals',
    insights: ['Four SLA breaches require manager review.', 'Shipping-related tickets are trending up today.', 'Ticket state remains linked to the originating conversation.'],
    nextActions: ['Open ticket queue', 'Review SLA breaches', 'Manage SLA policy'],
  },
  orders: {
    label: 'Orders',
    eyebrow: 'COMMERCE',
    description:
      'Operate canonical orders, lines, payment state, confirmation, modification, cancellation, fulfillment, and provider synchronization.',
    metrics: [
      { label: 'Orders today', value: '486', detail: 'Representative review data' },
      { label: 'GMV today', value: 'EGP 624k', detail: 'Representative review data' },
      { label: 'Awaiting action', value: '37', detail: 'Representative review data' },
      { label: 'Canceled', value: '3.1%', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Created', tone: 'info', items: ['ORD-10431 · COD', 'ORD-10430 · card', 'ORD-10429 · COD'] },
      { title: 'Confirmed', tone: 'warning', items: ['ORD-10422 · shipping', 'ORD-10418 · packed', 'ORD-10414 · carrier'] },
      { title: 'Completed', tone: 'success', items: ['ORD-10391 · delivered', 'ORD-10387 · delivered', 'ORD-10374 · delivered'] },
    ],
    rows: [
      { primary: 'ORD-10431', secondary: 'Mona Ahmed · Cairo', status: 'Created', tone: 'info', meta: 'EGP 1,840 · COD · 3 items' },
      { primary: 'ORD-10422', secondary: 'Youssef Ali · Giza', status: 'Confirmed', tone: 'warning', meta: 'EGP 2,410 · shipping pending' },
      { primary: 'ORD-10391', secondary: 'Nour Hassan · Alexandria', status: 'Delivered', tone: 'success', meta: 'EGP 990 · card paid' },
    ],
    insightTitle: 'Order signals',
    insights: ['COD confirmation remains the largest operational queue.', 'Provider writes occur after canonical state commit.', 'Cancellation and high-risk edits remain policy controlled.'],
    nextActions: ['Open order', 'Review confirmations', 'Inspect provider sync'],
  },
  shipping: {
    label: 'Shipping',
    eyebrow: 'FULFILLMENT',
    description:
      'Normalize destinations, select eligible carrier services, create shipments, track labels/events, and manage delivery rescue.',
    metrics: [
      { label: 'Ready to ship', value: '74', detail: 'Representative review data' },
      { label: 'In transit', value: '319', detail: 'Representative review data' },
      { label: 'Delivery exceptions', value: '12', detail: 'Representative review data' },
      { label: 'Delivered today', value: '227', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Ready', tone: 'info', items: ['SHP-4821 · Cairo', 'SHP-4818 · Giza', 'SHP-4811 · Mansoura'] },
      { title: 'In transit', tone: 'warning', items: ['SHP-4772 · out for delivery', 'SHP-4768 · hub', 'SHP-4759 · linehaul'] },
      { title: 'Delivered', tone: 'success', items: ['SHP-4721 · delivered', 'SHP-4719 · delivered', 'SHP-4716 · delivered'] },
    ],
    rows: [
      { primary: 'SHP-4821', secondary: 'ORD-10422', status: 'Ready', tone: 'info', meta: 'Cairo · normalized confidence 98%' },
      { primary: 'SHP-4772', secondary: 'ORD-10381', status: 'Out for delivery', tone: 'warning', meta: 'Carrier ETA 15:30' },
      { primary: 'SHP-4730', secondary: 'ORD-10355', status: 'Rescue', tone: 'danger', meta: 'Second failed attempt · customer contact due' },
    ],
    insightTitle: 'Shipping signals',
    insights: ['Twelve delivery exceptions need active rescue.', 'Destination normalization confidence is visible before dispatch.', 'Carrier provider references remain mapped to canonical shipments.'],
    nextActions: ['Create shipment', 'Review routing', 'Open rescue queue'],
  },
  approvals: {
    label: 'Approvals',
    eyebrow: 'GOVERNANCE',
    description:
      'Review high-risk and critical actions with digest-bound evidence so an approval cannot be replayed for a different command.',
    metrics: [
      { label: 'Requested', value: '14', detail: 'Representative review data' },
      { label: 'Critical', value: '3', detail: 'Representative review data' },
      { label: 'Approved today', value: '27', detail: 'Representative review data' },
      { label: 'Expired', value: '2', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Requested', tone: 'warning', items: ['Refund EGP 8,400', 'Role escalation', 'Campaign launch'] },
      { title: 'Approved', tone: 'success', items: ['Customer merge', 'Order cancel', 'Secret rotation'] },
      { title: 'Rejected', tone: 'danger', items: ['Bulk export', 'Unsafe role change', 'Refund mismatch'] },
    ],
    rows: [
      { primary: 'APR-9921', secondary: 'commerce.refund.issue', status: 'Requested', tone: 'warning', meta: 'EGP 8,400 · finance policy' },
      { primary: 'APR-9918', secondary: 'organization.role.update', status: 'Requested', tone: 'warning', meta: 'Privileged role change' },
      { primary: 'APR-9905', secondary: 'crm.customer.merge', status: 'Approved', tone: 'success', meta: 'Digest matched · executed' },
    ],
    insightTitle: 'Approval safety',
    insights: ['Approvals bind to exact action digests.', 'Expired approvals cannot execute.', 'Critical actions remain visible with actor, resource, and evidence.'],
    nextActions: ['Review request', 'Inspect action digest', 'Open audit trail'],
  },
  integrations: {
    label: 'Integrations',
    eyebrow: 'CONNECTIVITY',
    description:
      'Manage provider connections, assets, health, webhooks, synchronization, typed actions, and secret references without exposing raw credentials.',
    metrics: [
      { label: 'Connected', value: '7', detail: 'Representative review data' },
      { label: 'Degraded', value: '1', detail: 'Representative review data' },
      { label: 'Sync runs 24h', value: '86', detail: 'Representative review data' },
      { label: 'Webhook errors', value: '3', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Messaging', tone: 'info', items: ['WhatsApp Cloud API', 'Instagram Messaging', 'Messenger'] },
      { title: 'Commerce', tone: 'success', items: ['Shopify', 'WooCommerce', 'Generic API'] },
      { title: 'Attention', tone: 'warning', items: ['Email · degraded', '3 webhook retries', '1 token rotation due'] },
    ],
    rows: [
      { primary: 'WhatsApp Cloud API', secondary: 'Messaging', status: 'Healthy', tone: 'success', meta: 'Webhook active · assets synced' },
      { primary: 'Shopify', secondary: 'Commerce', status: 'Healthy', tone: 'success', meta: 'Incremental sync 4m ago' },
      { primary: 'Email', secondary: 'Messaging', status: 'Degraded', tone: 'warning', meta: 'Provider latency elevated' },
    ],
    insightTitle: 'Integration signals',
    insights: ['Secrets are referenced, not exposed to application audit payloads.', 'Retries are bounded and dead-lettered.', 'Production provider capability is separated from development fixtures.'],
    nextActions: ['Connect provider', 'Run sync', 'Inspect webhook health'],
  },
  onboarding: {
    label: 'Onboarding',
    eyebrow: 'ORGANIZATION SETUP',
    description:
      'Configure reusable business profile, team setup, first integration, and launch readiness from canonical organization state.',
    metrics: [
      { label: 'Profile', value: 'Complete', detail: 'Representative review data' },
      { label: 'Team', value: '3 members', detail: 'Representative review data' },
      { label: 'Integrations', value: '2 connected', detail: 'Representative review data' },
      { label: 'Readiness', value: '75%', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Business profile', tone: 'success', items: ['Egypt · EGP', 'E-commerce · B2C', 'Arabic + English'] },
      { title: 'Team', tone: 'success', items: ['Owner', 'Support manager', 'Operations agent'] },
      { title: 'Integration', tone: 'warning', items: ['WhatsApp connected', 'Shopify connected', 'Shipping pending'] },
    ],
    rows: [
      { primary: 'Business profile', secondary: 'Egypt · EGP · Africa/Cairo', status: 'Complete', tone: 'success', meta: 'Goals: support, orders, recovery' },
      { primary: 'Team', secondary: '3 active · 1 invite pending', status: 'Complete', tone: 'success', meta: 'Role boundaries configured' },
      { primary: 'First integration', secondary: 'WhatsApp + Shopify', status: 'Complete', tone: 'success', meta: 'Provider health available' },
    ],
    insightTitle: 'Setup readiness',
    insights: ['Onboarding reuses canonical organization, membership, and connection state.', 'Setup can be resumed without duplicating business data.', 'Skipped steps remain explicit and reversible.'],
    nextActions: ['Edit business profile', 'Invite team', 'Connect provider'],
  },
  team: {
    label: 'Team & roles',
    eyebrow: 'IDENTITY & ACCESS',
    description:
      'Manage organization membership, invitations, system/custom roles, MFA policy visibility, and privileged-role boundaries.',
    metrics: [
      { label: 'Active members', value: '18', detail: 'Representative review data' },
      { label: 'Pending invites', value: '3', detail: 'Representative review data' },
      { label: 'Custom roles', value: '4', detail: 'Representative review data' },
      { label: 'MFA policy', value: 'Privileged', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Owners/Admins', tone: 'warning', items: ['Karim · Owner', 'Salma · Admin', 'Omar · Admin'] },
      { title: 'Operations', tone: 'info', items: ['Support manager', 'Order operator', 'Shipping operator'] },
      { title: 'Invitations', tone: 'neutral', items: ['3 pending', '1 expiring soon', '0 revoked today'] },
    ],
    rows: [
      { primary: 'Karim', secondary: 'Owner', status: 'Active', tone: 'success', meta: 'MFA assured · all permissions' },
      { primary: 'Salma', secondary: 'Admin', status: 'Active', tone: 'success', meta: 'Privileged role · MFA required' },
      { primary: 'Mariam', secondary: 'Support manager', status: 'Active', tone: 'success', meta: 'Custom role · 12 permissions' },
    ],
    insightTitle: 'Access control signals',
    insights: ['Final active owner cannot be suspended or removed.', 'Privileged custom roles are guarded like Owner/Admin.', 'Invitation acceptance is bound to verified identity email.'],
    nextActions: ['Invite member', 'Edit custom role', 'Review MFA policy'],
  },
  organizations: {
    label: 'Organizations',
    eyebrow: 'MULTI-TENANT',
    description:
      'Switch between authorized tenant workspaces and keep roles, settings, data, automation, and provider state isolated.',
    metrics: [
      { label: 'Workspaces', value: '3', detail: 'Representative review data' },
      { label: 'Active', value: '3', detail: 'Representative review data' },
      { label: 'Owner roles', value: '2', detail: 'Representative review data' },
      { label: 'Admin roles', value: '1', detail: 'Representative review data' },
    ],
    lanes: [
      { title: 'Primary', tone: 'success', items: ['AI PRENEURA', 'Egypt operations'] },
      { title: 'Client', tone: 'info', items: ['Commerce client', 'Real estate client'] },
      { title: 'Security', tone: 'warning', items: ['Tenant isolation enforced', 'Role context changes on switch'] },
    ],
    rows: [
      { primary: 'AI PRENEURA', secondary: 'aipreneura', status: 'Owner', tone: 'success', meta: 'Primary workspace' },
      { primary: 'Commerce client', secondary: 'commerce-eg', status: 'Admin', tone: 'info', meta: 'E-commerce operations' },
      { primary: 'Real estate client', secondary: 'realestate-eg', status: 'Owner', tone: 'success', meta: 'Sales operations' },
    ],
    insightTitle: 'Tenant safety',
    insights: ['Tenant selection changes the server-side data boundary.', 'RLS and relationship guards prevent cross-tenant reads and writes.', 'Global identity is separated from tenant membership.'],
    nextActions: ['Open workspace', 'Create organization', 'Review memberships'],
  },
} satisfies Record<string, PreviewSurface>;

export const reviewSurfaces = {
  ...implementedSurfaceReviews,
  ...previewSurfaces,
} satisfies Record<string, PreviewSurface>;

export type ReviewSurfaceKey = keyof typeof reviewSurfaces;

export function isReviewSurface(value: string): value is ReviewSurfaceKey {
  return value in reviewSurfaces;
}
