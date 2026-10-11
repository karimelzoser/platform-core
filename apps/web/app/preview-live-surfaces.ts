import type { PreviewSurface } from './preview-surfaces';

export const livePreviewSurfaces = {
  inbox: {
    label: 'Unified inbox',
    eyebrow: 'CUSTOMER OPERATIONS',
    description:
      'Review omnichannel conversations, ownership, human handover, customer context, delivery state, and ticket escalation in one operational workspace.',
    metrics: [
      { label: 'Open conversations', value: '186', detail: 'Preview sample' },
      { label: 'Needs human', value: '23', detail: 'Preview sample' },
      { label: 'First response', value: '3m 42s', detail: 'Preview sample' },
      { label: 'SLA pass', value: '96.1%', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Unassigned', tone: 'warning', items: ['WhatsApp · Sara M.', 'Instagram · Ahmed H.', 'Web chat · Guest 8842'] },
      { title: 'Human owned', tone: 'info', items: ['Messenger · Nour A.', 'WhatsApp · Omar K.', 'Email · Delta Retail'] },
      { title: 'AI assisted', tone: 'success', items: ['Web chat · Mariam S.', 'WhatsApp · Hany R.', 'Instagram · Dina F.'] },
    ],
    rows: [
      { primary: 'Sara Mohamed', secondary: 'WhatsApp · 2m ago', status: 'Needs human', tone: 'warning', meta: 'Order ORD-10431 · high-value COD' },
      { primary: 'Nour Ali', secondary: 'Messenger · 5m ago', status: 'Assigned', tone: 'info', meta: 'Ticket TKT-9021 · agent: Salma' },
      { primary: 'Mariam Samir', secondary: 'Web chat · 8m ago', status: 'AI assisted', tone: 'success', meta: 'Knowledge answer cited · no action taken' },
    ],
    insightTitle: 'Inbox signals',
    insights: ['Human handover is explicit and reversible.', 'Customer identity and order context stay linked to canonical CRM records.', 'Outbound messages remain channel-policy and consent aware.'],
    nextActions: ['Open conversation', 'Assign owner', 'Create ticket'],
  },
  customers: {
    label: 'Customer 360',
    eyebrow: 'CRM',
    description:
      'Review canonical customer identity, contact points, consent, tags, segments, order history, conversations, tickets, recovery, and attribution without duplicating identity across modules.',
    metrics: [
      { label: 'Customers', value: '48,240', detail: 'Preview sample' },
      { label: 'Merged duplicates', value: '312', detail: 'Preview sample' },
      { label: 'Opted out', value: '4.8%', detail: 'Preview sample' },
      { label: 'Active segments', value: '28', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Identity', tone: 'info', items: ['Verified phone', 'Primary email', 'Merge history'] },
      { title: 'Engagement', tone: 'success', items: ['8 conversations', '3 orders', '2 campaigns'] },
      { title: 'Controls', tone: 'warning', items: ['WhatsApp consent', 'Email opt-out', 'Export permission'] },
    ],
    rows: [
      { primary: 'Mona Ahmed', secondary: '+20 100 234 5678', status: 'Active', tone: 'success', meta: '3 orders · EGP 8,420 lifetime value' },
      { primary: 'Youssef Ali', secondary: 'youssef@example.test', status: 'Review', tone: 'warning', meta: 'Possible duplicate · merge approval needed' },
      { primary: 'Nour Hassan', secondary: '+20 111 765 4321', status: 'Suppressed', tone: 'neutral', meta: 'WhatsApp opt-out · email allowed' },
    ],
    insightTitle: 'Customer signals',
    insights: ['Identity merge is approval-sensitive and fully audited.', 'Consent is channel-specific and used by campaigns/recovery before outreach.', 'Customer timelines aggregate canonical events rather than copied module state.'],
    nextActions: ['Open customer', 'Review duplicate', 'Create segment'],
  },
  tickets: {
    label: 'Tickets & SLA',
    eyebrow: 'SERVICE MANAGEMENT',
    description:
      'Operate structured support tickets, assignments, comments, priority, SLA clocks, escalation, and linked conversations through tenant-safe service workflows.',
    metrics: [
      { label: 'Open tickets', value: '94', detail: 'Preview sample' },
      { label: 'SLA at risk', value: '11', detail: 'Preview sample' },
      { label: 'Overdue', value: '4', detail: 'Preview sample' },
      { label: 'Resolved today', value: '63', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['TKT-9028 · delivery', 'TKT-9026 · payment', 'TKT-9024 · product'] },
      { title: 'In progress', tone: 'warning', items: ['TKT-9019 · 24m left', 'TKT-9014 · warehouse input', 'TKT-9008 · finance input'] },
      { title: 'Resolved', tone: 'success', items: ['TKT-8999 · refund', 'TKT-8994 · address', 'TKT-8988 · exchange'] },
    ],
    rows: [
      { primary: 'TKT-9028', secondary: 'Late delivery · Mona A.', status: 'New', tone: 'info', meta: 'Normal priority · first response due 42m' },
      { primary: 'TKT-9019', secondary: 'Payment issue · Karim S.', status: 'SLA risk', tone: 'warning', meta: 'High priority · 24m to breach' },
      { primary: 'TKT-8999', secondary: 'Refund status · Salma H.', status: 'Resolved', tone: 'success', meta: 'Resolution time 2h 11m' },
    ],
    insightTitle: 'Service signals',
    insights: ['SLA state derives from durable ticket events.', 'Ticket ownership can be changed without losing conversation history.', 'High-risk resolutions use the same approval boundary as other canonical commands.'],
    nextActions: ['Open ticket', 'Reassign queue', 'Review SLA policy'],
  },
  orders: {
    label: 'Orders',
    eyebrow: 'COMMERCE',
    description:
      'Review canonical order state, payment, confirmation, fulfillment, modification, cancellation, provider mappings, and timeline evidence.',
    metrics: [
      { label: 'Orders today', value: '428', detail: 'Preview sample' },
      { label: 'Gross value', value: 'EGP 684k', detail: 'Preview sample' },
      { label: 'Awaiting confirmation', value: '24', detail: 'Preview sample' },
      { label: 'Cancellation review', value: '6', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['ORD-10431 · EGP 1,840', 'ORD-10430 · EGP 3,110', 'ORD-10429 · EGP 760'] },
      { title: 'Processing', tone: 'warning', items: ['ORD-10412 · confirmed', 'ORD-10408 · packing', 'ORD-10399 · payment review'] },
      { title: 'Fulfilled', tone: 'success', items: ['ORD-10391 · shipped', 'ORD-10384 · delivered', 'ORD-10377 · delivered'] },
    ],
    rows: [
      { primary: 'ORD-10431', secondary: 'Mona Ahmed · Cairo', status: 'New', tone: 'info', meta: 'EGP 1,840 · COD · 2 items' },
      { primary: 'ORD-10412', secondary: 'Omar Fathy · Giza', status: 'Confirmed', tone: 'success', meta: 'EGP 3,650 · shipping pending' },
      { primary: 'ORD-10399', secondary: 'Nour Samir · Alexandria', status: 'Review', tone: 'warning', meta: 'Payment mismatch · modification blocked' },
    ],
    insightTitle: 'Order safety',
    insights: ['Payment and fulfillment state guard destructive modifications.', 'Cancellation and high-risk actions can require approval.', 'Provider actions occur post-commit and remain idempotent on replay.'],
    nextActions: ['Open order', 'Review exceptions', 'Export order list'],
  },
  shipping: {
    label: 'Shipping',
    eyebrow: 'FULFILLMENT',
    description:
      'Review destination normalization, zone/service eligibility, shipments, packages, labels, tracking, delivery attempts, and rescue operations.',
    metrics: [
      { label: 'Ready to ship', value: '76', detail: 'Preview sample' },
      { label: 'In transit', value: '214', detail: 'Preview sample' },
      { label: 'Delivery exceptions', value: '17', detail: 'Preview sample' },
      { label: 'Rescue cases', value: '9', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Routing', tone: 'info', items: ['SHP-7104 · Cairo', 'SHP-7102 · Giza', 'SHP-7098 · Damietta'] },
      { title: 'In transit', tone: 'success', items: ['SHP-7088 · out for delivery', 'SHP-7080 · hub scan', 'SHP-7074 · linehaul'] },
      { title: 'Exception', tone: 'warning', items: ['SHP-7069 · unreachable', 'SHP-7064 · address review', 'SHP-7057 · refused'] },
    ],
    rows: [
      { primary: 'SHP-7104', secondary: 'ORD-10412 · Cairo', status: 'Eligible', tone: 'success', meta: 'Carrier A · next-day service' },
      { primary: 'SHP-7069', secondary: 'ORD-10362 · Giza', status: 'Rescue', tone: 'warning', meta: 'Attempt 2 · customer unreachable' },
      { primary: 'SHP-7057', secondary: 'ORD-10344 · Alexandria', status: 'Refused', tone: 'danger', meta: 'Rescue workflow waiting operator' },
    ],
    insightTitle: 'Shipping signals',
    insights: ['Location normalization exposes confidence and manual review state.', 'Service eligibility is deterministic from tenant zone/carrier rules.', 'Tracking and rescue history is append-only operational evidence.'],
    nextActions: ['Create shipment', 'Review routing', 'Open rescue queue'],
  },
  returns: {
    label: 'Returns & refunds',
    eyebrow: 'POST-PURCHASE',
    description:
      'Operate return, exchange, inspection, resolution, restock, and refund decisions without mixing them into the original order aggregate.',
    metrics: [
      { label: 'Open requests', value: '18', detail: 'Preview sample' },
      { label: 'Awaiting inspection', value: '6', detail: 'Preview sample' },
      { label: 'Refund approvals', value: '4', detail: 'Preview sample' },
      { label: 'Exchange value', value: 'EGP 12.8k', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Requested', tone: 'info', items: ['RET-2031 · size issue', 'RET-2028 · damaged item', 'RET-2026 · wrong item'] },
      { title: 'Inspection', tone: 'warning', items: ['RET-2019 · warehouse A', 'RET-2016 · photos received', 'RET-2011 · courier pickup'] },
      { title: 'Resolved', tone: 'success', items: ['RET-2008 · exchanged', 'RET-2005 · refund approved', 'RET-1998 · restocked'] },
    ],
    rows: [
      { primary: 'RET-2031', secondary: 'Order ORD-10377', status: 'Eligible', tone: 'success', meta: 'Exchange · 1 item · EGP 780' },
      { primary: 'RET-2028', secondary: 'Order ORD-10355', status: 'Inspection', tone: 'warning', meta: 'Refund · damage evidence attached' },
      { primary: 'RET-2019', secondary: 'Order ORD-10312', status: 'Approval', tone: 'warning', meta: 'EGP 2,950 · finance approval required' },
    ],
    insightTitle: 'Return quality signals',
    insights: ['Size-related exchanges are the largest request category.', 'One SKU has repeated damage reports and should be reviewed.', 'Refund decisions over the configured threshold remain approval-gated.'],
    nextActions: ['Review eligibility queue', 'Open inspection workspace', 'Audit refund approvals'],
  },
  recovery: {
    label: 'Recovery',
    eyebrow: 'REVENUE RECOVERY',
    description:
      'Prioritize eligible abandoned journeys, suppress unsafe outreach, coordinate attempts and offers, and attribute recovered revenue to the exact opportunity.',
    metrics: [
      { label: 'Eligible now', value: '73', detail: 'Preview sample' },
      { label: 'In sequence', value: '41', detail: 'Preview sample' },
      { label: 'Recovered today', value: 'EGP 34.6k', detail: 'Preview sample' },
      { label: 'Suppressed', value: '19', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Qualified', tone: 'info', items: ['REC-8801 · cart', 'REC-8796 · COD follow-up', 'REC-8791 · payment failure'] },
      { title: 'Attempting', tone: 'warning', items: ['REC-8784 · WhatsApp 1/2', 'REC-8779 · offer expires 3h', 'REC-8772 · waiting customer'] },
      { title: 'Recovered', tone: 'success', items: ['REC-8768 · ORD-10420', 'REC-8759 · ORD-10411', 'REC-8746 · ORD-10390'] },
    ],
    rows: [
      { primary: 'REC-8801', secondary: 'Cart value EGP 2,740', status: 'Qualified', tone: 'info', meta: 'WhatsApp consent valid · no recent order' },
      { primary: 'REC-8784', secondary: 'Cart value EGP 1,320', status: 'Attempt 1', tone: 'warning', meta: 'Offer: free shipping · expires in 3h' },
      { primary: 'REC-8768', secondary: 'Recovered order ORD-10420', status: 'Recovered', tone: 'success', meta: 'Attributed value EGP 3,680' },
    ],
    insightTitle: 'Recovery signals',
    insights: ['WhatsApp is the highest-converting preview channel.', 'Suppression prevents outreach to customers who purchased after abandonment.', 'Attribution stays linked to the original opportunity and recovered order.'],
    nextActions: ['Review eligible opportunities', 'Inspect suppression reasons', 'Open attribution report'],
  },
  approvals: {
    label: 'Approvals',
    eyebrow: 'RISK CONTROL',
    description:
      'Review pending protected actions, exact action digests, request evidence, decision history, expiration, and execution status for high-risk platform commands.',
    metrics: [
      { label: 'Pending', value: '12', detail: 'Preview sample' },
      { label: 'Critical risk', value: '3', detail: 'Preview sample' },
      { label: 'Expiring < 1h', value: '4', detail: 'Preview sample' },
      { label: 'Approved today', value: '31', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Requested', tone: 'warning', items: ['Refund EGP 3,200', 'Custom role update', 'Campaign launch'] },
      { title: 'Approved', tone: 'success', items: ['Customer merge', 'Order cancel', 'Secret rotation'] },
      { title: 'Rejected', tone: 'danger', items: ['Bulk export', 'Role escalation', 'Refund EGP 8,900'] },
    ],
    rows: [
      { primary: 'APR-5519', secondary: 'commerce.refund.issue', status: 'Pending', tone: 'warning', meta: 'EGP 3,200 · expires 48m' },
      { primary: 'APR-5512', secondary: 'crm.customer.merge', status: 'Approved', tone: 'success', meta: 'Digest-bound · not yet executed' },
      { primary: 'APR-5504', secondary: 'organization.role.update', status: 'Rejected', tone: 'danger', meta: 'Privileged permission escalation' },
    ],
    insightTitle: 'Approval guarantees',
    insights: ['Approval binds to an exact action digest, not a reusable permission token.', 'Execution revalidates tenant, actor, resource, expiry, and digest.', 'Approval decisions and execution outcomes remain immutable audit evidence.'],
    nextActions: ['Review request', 'Compare action digest', 'Open decision history'],
  },
  integrations: {
    label: 'Integrations',
    eyebrow: 'CONNECTED SYSTEMS',
    description:
      'Review tenant connections, assets, webhook subscriptions, sync runs, provider-action queues, health, credential references, and operational errors.',
    metrics: [
      { label: 'Connections', value: '6', detail: 'Preview sample' },
      { label: 'Healthy', value: '5', detail: 'Preview sample' },
      { label: 'Syncing', value: '2', detail: 'Preview sample' },
      { label: 'Dead letters', value: '3', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Commerce', tone: 'success', items: ['Shopify · healthy', 'WooCommerce · healthy', 'Shipping API · healthy'] },
      { title: 'Messaging', tone: 'info', items: ['WhatsApp · healthy', 'Instagram · healthy', 'Messenger · degraded'] },
      { title: 'Operations', tone: 'warning', items: ['2 sync runs', '3 dead letters', '1 credential rotation due'] },
    ],
    rows: [
      { primary: 'WhatsApp Cloud API', secondary: 'Messaging', status: 'Healthy', tone: 'success', meta: 'Webhook active · token reference stored' },
      { primary: 'Shopify', secondary: 'Commerce', status: 'Healthy', tone: 'success', meta: 'Incremental sync · 4m ago' },
      { primary: 'Messenger', secondary: 'Messaging', status: 'Degraded', tone: 'warning', meta: 'Rate-limit pressure · retrying' },
    ],
    insightTitle: 'Integration boundaries',
    insights: ['Runtime stores opaque secret references, not raw credentials.', 'Provider actions are post-commit, idempotent, and retry bounded.', 'Development connector fixtures are never presented as production adapters.'],
    nextActions: ['Open connection', 'Review sync runs', 'Inspect provider actions'],
  },
  onboarding: {
    label: 'Onboarding',
    eyebrow: 'ORGANIZATION SETUP',
    description:
      'Review the guided setup for business profile, country/currency/timezone/language, goals, initial team, and first integration using canonical organization state.',
    metrics: [
      { label: 'Business profile', value: 'Complete', detail: 'Preview sample' },
      { label: 'Team', value: '2 members', detail: 'Preview sample' },
      { label: 'Integration', value: 'Connected', detail: 'Preview sample' },
      { label: 'Setup status', value: 'Ready', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Profile', tone: 'success', items: ['Egypt · EGP', 'Africa/Cairo', 'Arabic + English'] },
      { title: 'Team', tone: 'success', items: ['Owner active', '1 teammate invited', 'Roles bootstrapped'] },
      { title: 'Integration', tone: 'success', items: ['First connector selected', 'Connection verified', 'Setup ready'] },
    ],
    rows: [
      { primary: 'Business profile', secondary: 'E-commerce · B2C', status: 'Complete', tone: 'success', meta: 'Goals: support, orders, recovery' },
      { primary: 'Initial team', secondary: '2 active memberships', status: 'Complete', tone: 'success', meta: 'Owner + operations user' },
      { primary: 'First integration', secondary: 'Shopify', status: 'Connected', tone: 'success', meta: 'Canonical connection evidence' },
    ],
    insightTitle: 'Setup model',
    insights: ['Progress derives from canonical organization/team/integration state.', 'Setup never generates opaque workflows behind the user.', 'The business profile is reusable by configuration, AI routing, analytics, and billing.'],
    nextActions: ['Edit business profile', 'Invite teammate', 'Review integrations'],
  },
  team: {
    label: 'Team & roles',
    eyebrow: 'IDENTITY & ACCESS',
    description:
      'Review memberships, invitations, system roles, custom roles, permission assignments, suspension lifecycle, MFA posture, and last-owner protections.',
    metrics: [
      { label: 'Active members', value: '18', detail: 'Preview sample' },
      { label: 'Pending invites', value: '3', detail: 'Preview sample' },
      { label: 'Custom roles', value: '4', detail: 'Preview sample' },
      { label: 'MFA coverage', value: '89%', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Members', tone: 'success', items: ['Owner · 2', 'Admin · 3', 'Agent · 13'] },
      { title: 'Invitations', tone: 'info', items: ['ops@example.test', 'finance@example.test', 'sales@example.test'] },
      { title: 'Security', tone: 'warning', items: ['2 sessions no MFA', '1 role change pending', 'Last-owner guard active'] },
    ],
    rows: [
      { primary: 'Karim Mabrouk', secondary: 'Owner', status: 'Active', tone: 'success', meta: 'MFA satisfied · full tenant administration' },
      { primary: 'Salma Hassan', secondary: 'Admin', status: 'Active', tone: 'success', meta: 'MFA satisfied · operations admin' },
      { primary: 'ops@example.test', secondary: 'Invitation', status: 'Pending', tone: 'warning', meta: 'Agent role · expires in 4 days' },
    ],
    insightTitle: 'Access controls',
    insights: ['System roles are visible but immutable.', 'Privileged role assignment and removal require role-management authority.', 'The final active Owner cannot be suspended, removed, or stripped of ownership.'],
    nextActions: ['Invite teammate', 'Review roles', 'Inspect MFA posture'],
  },
  organizations: {
    label: 'Organizations',
    eyebrow: 'TENANT SELECTION',
    description:
      'Review authorized organization memberships and switch tenant context without exposing or mixing data from another workspace.',
    metrics: [
      { label: 'Organizations', value: '3', detail: 'Preview sample' },
      { label: 'Owner roles', value: '2', detail: 'Preview sample' },
      { label: 'Admin roles', value: '1', detail: 'Preview sample' },
      { label: 'Suspended', value: '0', detail: 'Preview sample' },
    ],
    lanes: [
      { title: 'Primary', tone: 'success', items: ['AI PRENEURA · Owner'] },
      { title: 'Client workspaces', tone: 'info', items: ['Delta Retail · Admin', 'Cairo Home · Owner'] },
      { title: 'Access policy', tone: 'warning', items: ['Active membership required', 'Tenant context explicit', 'No cross-tenant fallback'] },
    ],
    rows: [
      { primary: 'AI PRENEURA', secondary: 'aipreneura', status: 'Owner', tone: 'success', meta: 'Primary workspace' },
      { primary: 'Delta Retail', secondary: 'delta-retail', status: 'Admin', tone: 'info', meta: 'Customer operations workspace' },
      { primary: 'Cairo Home', secondary: 'cairo-home', status: 'Owner', tone: 'success', meta: 'Commerce workspace' },
    ],
    insightTitle: 'Tenant boundary',
    insights: ['Tenant selection verifies active membership before context changes.', 'Organization context is explicit in API requests and database transactions.', 'No organization can read records belonging to another tenant through fallback logic.'],
    nextActions: ['Open workspace', 'Create organization', 'Review memberships'],
  },
} as const satisfies Record<string, PreviewSurface>;

export type LivePreviewSurfaceKey = keyof typeof livePreviewSurfaces;

export function isLivePreviewSurface(value: string): value is LivePreviewSurfaceKey {
  return value in livePreviewSurfaces;
}
