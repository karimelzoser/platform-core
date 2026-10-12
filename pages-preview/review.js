const content = document.getElementById('content');
const directionButton = document.getElementById('directionButton');
const menuButton = document.getElementById('menuButton');
const notificationButton = document.getElementById('notificationButton');
const moduleSearch = document.getElementById('moduleSearch');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');

const tone = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: '',
};

function moduleSurface(label, eyebrow, description, metrics, lanes, rows, insights, actions) {
  return { label, eyebrow, description, metrics, lanes, rows, insights, actions };
}

const surfaces = {
  inbox: moduleSurface(
    'Unified inbox',
    'CUSTOMER OPERATIONS',
    'Operate WhatsApp, Instagram, Messenger, email, and web conversations from one assignment, SLA, and human-handover workspace.',
    [['Open conversations', '142'], ['Waiting customer', '38'], ['Human handovers', '17'], ['SLA risk', '9']],
    [
      ['New', 'info', ['WhatsApp · Mariam A.', 'Instagram · Ahmed K.', 'Messenger · Reem H.']],
      ['Assigned', 'warning', ['Sara · refund question', 'Omar · order edit', 'Aya · shipping delay']],
      ['Resolved', 'success', ['Web chat · product help', 'Email · invoice copy', 'WhatsApp · address fixed']],
    ],
    [
      ['Mariam Ahmed', 'WhatsApp · 2m ago', 'New', 'info', 'Order ORD-10431 · Arabic'],
      ['Ahmed Khaled', 'Instagram · 8m ago', 'Assigned', 'warning', 'Owner: Salma · sentiment neutral'],
      ['Reem Hassan', 'Messenger · 14m ago', 'Handover', 'warning', 'AI paused · human response required'],
    ],
    ['Nine conversations are approaching SLA breach.', 'Arabic conversations represent most of the current queue.', 'Human handover remains explicit and reversible.'],
    ['Open conversation', 'Assign queue', 'Review SLA risk'],
  ),
  customers: moduleSurface(
    'Customer 360',
    'CRM',
    'Maintain canonical customer identity, contact points, tags, segments, consent, timeline, order context, and merge-safe duplicate handling.',
    [['Customers', '48.2k'], ['New this month', '2,184'], ['Duplicate candidates', '63'], ['Opted out', '1.7%']],
    [
      ['New', 'info', ['Imported customers', 'New purchasers', 'Lead conversions']],
      ['Needs review', 'warning', ['Duplicate identities', 'Missing phone', 'Consent conflict']],
      ['Healthy', 'success', ['Verified contacts', 'Active segments', 'Merged profiles']],
    ],
    [
      ['Mona Ahmed', '+20 100 234 5678', 'Active', 'success', '12 orders · EGP 18.4k LTV'],
      ['Youssef Ali', 'youssef@example.test', 'Review', 'warning', 'Potential duplicate · same phone'],
      ['Nour Hassan', '+20 122 555 0194', 'Active', 'success', 'VIP segment · WhatsApp consent'],
    ],
    ['Identity remains canonical across commerce, support, and sales.', 'Duplicate merges require evidence and approval.', 'Consent and suppression are visible to every outbound workflow.'],
    ['Open customer', 'Review duplicates', 'Build segment'],
  ),
  tickets: moduleSurface(
    'Tickets',
    'SERVICE MANAGEMENT',
    'Track support work with assignment, comments, status, SLA clocks, approvals, and conversation-linked context.',
    [['Open tickets', '86'], ['Due today', '21'], ['SLA breached', '4'], ['Resolved 24h', '119']],
    [
      ['Open', 'info', ['TKT-8841 · wrong item', 'TKT-8839 · refund', 'TKT-8831 · late shipment']],
      ['In progress', 'warning', ['TKT-8818 · warehouse', 'TKT-8807 · finance', 'TKT-8795 · carrier']],
      ['Resolved', 'success', ['TKT-8789 · exchange', 'TKT-8782 · invoice', 'TKT-8777 · delivery']],
    ],
    [
      ['TKT-8841', 'Mona Ahmed', 'Open', 'info', 'Priority high · 38m SLA left'],
      ['TKT-8818', 'Ahmed Khaled', 'In progress', 'warning', 'Assigned to Warehouse Ops'],
      ['TKT-8789', 'Nour Hassan', 'Resolved', 'success', 'Exchange created · CSAT pending'],
    ],
    ['Four SLA breaches require manager review.', 'Shipping-related tickets are trending up today.', 'Ticket state remains linked to the originating conversation.'],
    ['Open ticket queue', 'Review SLA breaches', 'Manage SLA policy'],
  ),
  confirmation: moduleSurface(
    'Order confirmation',
    'COMMERCE OPERATIONS',
    'Review confirmation readiness, customer contact outcomes, duplicate risk, and orders that require a human decision before shipping.',
    [['Awaiting contact', '24'], ['Confirmed today', '118'], ['Duplicate review', '7'], ['SLA at risk', '5']],
    [
      ['Contact due', 'warning', ['ORD-10431 · WhatsApp', 'ORD-10428 · COD', 'ORD-10424 · callback']],
      ['Review', 'warning', ['ORD-10419 · duplicate risk', 'ORD-10412 · address mismatch', 'ORD-10408 · payment']],
      ['Confirmed', 'success', ['ORD-10402 · confirmed', 'ORD-10399 · confirmed', 'ORD-10395 · confirmed']],
    ],
    [
      ['ORD-10431', 'Mona Ahmed · Cairo', 'Contact due', 'warning', 'EGP 1,840 · WhatsApp preferred'],
      ['ORD-10428', 'Youssef Ali · Giza', 'New', 'info', 'EGP 2,410 · COD'],
      ['ORD-10402', 'Nour Hassan · Alexandria', 'Confirmed', 'success', 'EGP 990 · card paid'],
    ],
    ['High-value COD orders are concentrated in Cairo.', 'Two duplicate candidates share phone and delivery address.', 'Five contacts will breach the confirmation SLA within one hour.'],
    ['Open confirmation queue', 'Review duplicates', 'Inspect SLA policy'],
  ),
  returns: moduleSurface(
    'Returns & refunds',
    'POST-PURCHASE',
    'Operate return, exchange, inspection, resolution, restock, and refund decisions without mixing them into the original order aggregate.',
    [['Open requests', '18'], ['Awaiting inspection', '6'], ['Refund approvals', '4'], ['Exchange value', 'EGP 12.8k']],
    [
      ['Eligible', 'info', ['RET-2031 · exchange', 'RET-2029 · return', 'RET-2027 · return']],
      ['Inspection', 'warning', ['RET-2028 · damaged item', 'RET-2025 · opened box', 'RET-2021 · warehouse']],
      ['Resolved', 'success', ['RET-2018 · exchanged', 'RET-2014 · refunded', 'RET-2009 · restocked']],
    ],
    [
      ['RET-2031', 'Order ORD-10377', 'Eligible', 'success', 'Exchange · 1 item · EGP 780'],
      ['RET-2028', 'Order ORD-10355', 'Inspection', 'warning', 'Refund · damage evidence attached'],
      ['RET-2019', 'Order ORD-10312', 'Approval', 'warning', 'EGP 2,950 · finance approval required'],
    ],
    ['Size-related exchanges are the largest request category.', 'One SKU has repeated damage reports and should be reviewed.', 'Refunds over threshold remain approval-gated.'],
    ['Review eligibility', 'Open inspection workspace', 'Audit refund approvals'],
  ),
  recovery: moduleSurface(
    'Recovery',
    'REVENUE RECOVERY',
    'Prioritize eligible abandoned journeys, suppress unsafe outreach, coordinate attempts and offers, and attribute recovered revenue to the exact opportunity.',
    [['Eligible now', '73'], ['In sequence', '41'], ['Recovered today', 'EGP 34.6k'], ['Suppressed', '19']],
    [
      ['Qualified', 'info', ['REC-8801 · EGP 2,740', 'REC-8798 · EGP 1,980', 'REC-8791 · EGP 3,150']],
      ['In sequence', 'warning', ['REC-8784 · attempt 1', 'REC-8779 · attempt 2', 'REC-8772 · offer active']],
      ['Recovered', 'success', ['REC-8768 · ORD-10420', 'REC-8761 · ORD-10411', 'REC-8754 · ORD-10404']],
    ],
    [
      ['REC-8801', 'Cart value EGP 2,740', 'Qualified', 'info', 'WhatsApp consent valid · no recent order'],
      ['REC-8784', 'Cart value EGP 1,320', 'Attempt 1', 'warning', 'Offer: free shipping · expires in 3h'],
      ['REC-8768', 'Recovered order ORD-10420', 'Recovered', 'success', 'Attributed value EGP 3,680'],
    ],
    ['Suppression blocks outreach after a later purchase.', 'Recovered orders remain linked to the originating opportunity.', 'Channel cost and conversion stay visible together.'],
    ['Review eligible opportunities', 'Inspect suppression', 'Open attribution report'],
  ),
  orders: moduleSurface(
    'Orders',
    'COMMERCE',
    'Operate canonical orders, lines, payment state, confirmation, modification, cancellation, fulfillment, and provider synchronization.',
    [['Orders today', '486'], ['GMV today', 'EGP 624k'], ['Awaiting action', '37'], ['Canceled', '3.1%']],
    [
      ['Created', 'info', ['ORD-10431 · COD', 'ORD-10430 · card', 'ORD-10429 · COD']],
      ['Confirmed', 'warning', ['ORD-10422 · shipping', 'ORD-10418 · packed', 'ORD-10414 · carrier']],
      ['Completed', 'success', ['ORD-10391 · delivered', 'ORD-10387 · delivered', 'ORD-10374 · delivered']],
    ],
    [
      ['ORD-10431', 'Mona Ahmed · Cairo', 'Created', 'info', 'EGP 1,840 · COD · 3 items'],
      ['ORD-10422', 'Youssef Ali · Giza', 'Confirmed', 'warning', 'EGP 2,410 · shipping pending'],
      ['ORD-10391', 'Nour Hassan · Alexandria', 'Delivered', 'success', 'EGP 990 · card paid'],
    ],
    ['COD confirmation is the largest operational queue.', 'Provider writes occur after canonical state commit.', 'Cancellation and high-risk edits remain policy controlled.'],
    ['Open order', 'Review confirmations', 'Inspect provider sync'],
  ),
  shipping: moduleSurface(
    'Shipping',
    'FULFILLMENT',
    'Normalize destinations, select eligible carrier services, create shipments, track labels/events, and manage delivery rescue.',
    [['Ready to ship', '74'], ['In transit', '319'], ['Delivery exceptions', '12'], ['Delivered today', '227']],
    [
      ['Ready', 'info', ['SHP-4821 · Cairo', 'SHP-4818 · Giza', 'SHP-4811 · Mansoura']],
      ['In transit', 'warning', ['SHP-4772 · out for delivery', 'SHP-4768 · hub', 'SHP-4759 · linehaul']],
      ['Delivered', 'success', ['SHP-4721 · delivered', 'SHP-4719 · delivered', 'SHP-4716 · delivered']],
    ],
    [
      ['SHP-4821', 'ORD-10422', 'Ready', 'info', 'Cairo · normalized confidence 98%'],
      ['SHP-4772', 'ORD-10381', 'Out for delivery', 'warning', 'Carrier ETA 15:30'],
      ['SHP-4730', 'ORD-10355', 'Rescue', 'danger', 'Second failed attempt · customer contact due'],
    ],
    ['Twelve delivery exceptions need active rescue.', 'Destination confidence is visible before dispatch.', 'Carrier references remain mapped to canonical shipments.'],
    ['Create shipment', 'Review routing', 'Open rescue queue'],
  ),
  sales: moduleSurface(
    'Sales',
    'PIPELINE',
    'Qualify CRM-backed leads, manage pipelines and opportunities, coordinate next actions, and expose structured AI signals without duplicating customer identity.',
    [['Open pipeline', 'EGP 1.84m'], ['Qualified leads', '64'], ['Due today', '17'], ['Weighted forecast', 'EGP 742k']],
    [
      ['Qualified', 'info', ['LEAD-219 · Cairo Home', 'LEAD-214 · Nile Retail', 'LEAD-208 · Delta Shop']],
      ['Proposal', 'warning', ['OPP-118 · Nile Commerce', 'OPP-111 · Cairo Retail', 'OPP-109 · Delta Group']],
      ['Commit', 'success', ['OPP-103 · Delta Retail', 'OPP-098 · Gulf Store', 'OPP-095 · Cairo Home']],
    ],
    [
      ['OPP-118', 'Nile Commerce Group', 'Proposal', 'warning', 'EGP 140k · 60% · owner: Salma'],
      ['OPP-103', 'Delta Retail', 'Commit', 'success', 'EGP 220k · 90% · next call today'],
      ['LEAD-219', 'Cairo Home', 'Qualified', 'info', 'Score 82 · WhatsApp + website activity'],
    ],
    ['Three high-value opportunities have no next action after today.', 'Lead qualification references CRM identity.', 'AI recommendations remain advisory and auditable.'],
    ['Open pipeline board', 'Review due activities', 'Inspect lead scoring'],
  ),
  campaigns: moduleSurface(
    'Campaigns',
    'OUTBOUND',
    'Build frozen audiences, enforce consent and suppression, launch deterministic batches, and measure receipts, cost, conversion, and attribution.',
    [['Draft campaigns', '6'], ['Scheduled recipients', '4,820'], ['Suppressed', '312'], ['Attributed revenue', 'EGP 96.4k']],
    [
      ['Draft', 'info', ['VIP reactivation', 'October offer', 'Win-back segment']],
      ['Scheduled', 'warning', ['Weekend offer · 18:00', 'Product drop · 20:00', 'Loyalty reminder · tomorrow']],
      ['Running', 'success', ['October WhatsApp · 2,176 sent', 'Email reactivation · 840 sent', 'Messenger VIP · 280 sent']],
    ],
    [
      ['October WhatsApp', '3,200 frozen recipients', 'Running', 'success', '2,176 sent · 36 conversions'],
      ['Weekend offer', '940 frozen recipients', 'Scheduled', 'info', 'Africa/Cairo · 18:00'],
      ['VIP reactivation', '420 estimated audience', 'Draft', 'warning', 'Approval required before launch'],
    ],
    ['Audience snapshots are immutable after launch.', 'Successful recipients are never duplicated on retry.', 'Consent and suppression run before provider intent.'],
    ['Open campaign builder', 'Review suppression', 'Inspect attribution'],
  ),
  analytics: moduleSurface(
    'Analytics & ROI',
    'BUSINESS OUTCOMES',
    'Measure operational throughput, provider cost, automation value, AI cost, conversion, recovery, and attributable revenue from canonical events.',
    [['Revenue influenced', 'EGP 1.26m'], ['Recovered revenue', 'EGP 214k'], ['Automation savings', '386h'], ['AI/provider cost', 'EGP 18.7k']],
    [
      ['Revenue', 'success', ['Recovery · EGP 214k', 'Campaigns · EGP 96k', 'Sales · EGP 742k forecast']],
      ['Operations', 'info', ['FRT down 22%', 'Confirmation 94.5%', 'Shipping rescue 12']],
      ['Cost watch', 'warning', ['AI cost/order +6%', 'Provider messaging +3%', 'Carrier exception cost']],
    ],
    [
      ['Customer operations', 'Support + tickets', 'Healthy', 'success', 'FRT down 22% month over month'],
      ['Recovery', 'Attributed orders', 'Growing', 'success', 'EGP 214k recovered'],
      ['AI operators', 'Usage + spend', 'Watch', 'warning', 'Cost/order increased 6%'],
    ],
    ['ROI uses measured canonical events rather than estimated counters.', 'Provider cost is separated from platform value.', 'Attribution keeps source workflow and order evidence.'],
    ['Open executive dashboard', 'Review cost drivers', 'Export report'],
  ),
  billing: moduleSurface(
    'Billing & usage',
    'COMMERCIAL CONTROL',
    'Review plan entitlements, canonical meter usage, quota state, overages, provider cost allocation, invoices, and suspension boundaries.',
    [['Plan', 'Growth'], ['Usage period', '68%'], ['Projected overage', 'EGP 2.4k'], ['Provider cost', 'EGP 18.7k']],
    [
      ['Healthy', 'success', ['Messages · 80%', 'Automation · 48%', 'Storage · 35%']],
      ['Watch', 'warning', ['AI tool calls · 88%', 'WhatsApp provider spend', 'One quota nearing limit']],
      ['Commercial', 'info', ['Current plan · Growth', 'Period ends in 9d', 'Projected overage EGP 2.4k']],
    ],
    [
      ['Messages', '1.2m / 1.5m', 'Healthy', 'success', '80% quota consumed'],
      ['AI tool calls', '88k / 100k', 'Watch', 'warning', '88% quota consumed'],
      ['Automation runs', '241k / 500k', 'Healthy', 'success', '48% quota consumed'],
    ],
    ['Billing consumes the canonical usage ledger.', 'Entitlements gate capabilities before execution.', 'Suspension hooks remain explicit and auditable.'],
    ['Review usage', 'Compare plans', 'Inspect invoice'],
  ),
  automation: moduleSurface(
    'Automation Studio',
    'ORCHESTRATION',
    'Design durable typed workflows using triggers, conditions, branches, waits, approvals, and canonical platform actions without arbitrary tenant code execution.',
    [['Published workflows', '14'], ['Running now', '286'], ['Awaiting approval', '9'], ['Failed 24h', '3']],
    [
      ['Published', 'success', ['Order confirmation v12', 'Recovery sequence v7', 'Shipping rescue v4']],
      ['Draft', 'info', ['High-value refund v3', 'VIP campaign v2', 'Lead routing v5']],
      ['Attention', 'warning', ['3 failed runs', '9 approvals waiting', '1 retry storm suppressed']],
    ],
    [
      ['Order confirmation', 'v12 · published', 'Healthy', 'success', '128 active runs · durable waits'],
      ['Recovery sequence', 'v7 · published', 'Healthy', 'success', '41 active runs · 2 approvals'],
      ['High-value refund', 'v3 · draft', 'Draft', 'info', 'Policy gate not published'],
    ],
    ['Only registered typed actions can mutate platform state.', 'Durable waits and retries belong to Temporal.', 'Approvals bind to exact action digests.'],
    ['Open workflow builder', 'Review active runs', 'Inspect failed executions'],
  ),
  operators: moduleSurface(
    'AI Operators',
    'TRUSTWORTHY AI',
    'Configure specialized operators with scoped knowledge, typed tool allowlists, evaluation thresholds, spend controls, and explicit autonomy modes.',
    [['Configured operators', '9'], ['Copilot mode', '4'], ['Approval mode', '3'], ['Autonomous mode', '2']],
    [
      ['Copilot', 'info', ['Support operator', 'Campaign assistant', 'Sales assistant']],
      ['Approval', 'warning', ['Recovery operator', 'Returns operator', 'Order operator']],
      ['Autonomous', 'success', ['Moderator', 'Lead qualifier', 'Shipping status operator']],
    ],
    [
      ['Support operator', 'COPILOT', 'Eval 96%', 'success', '8 tools · support knowledge scope'],
      ['Recovery operator', 'APPROVAL', 'Eval 94%', 'success', '5 tools · offer actions gated'],
      ['Campaign assistant', 'COPILOT', 'Eval 91%', 'warning', 'No direct send permission'],
    ],
    ['Operators never write directly to databases or providers.', 'Autonomy mode never bypasses policy.', 'Prompt, model, tool, latency, and cost remain auditable.'],
    ['Review operator policies', 'Inspect eval results', 'Open tool registry'],
  ),
  knowledge: moduleSurface(
    'Knowledge',
    'RAG & CONTENT',
    'Manage tenant-scoped sources, ingestion freshness, access controls, retrieval quality, and citation-ready knowledge for users and AI operators.',
    [['Indexed sources', '42'], ['Documents', '3,184'], ['Fresh < 7d', '91%'], ['Retrieval pass', '95%']],
    [
      ['Healthy', 'success', ['Help center', 'Policies', 'Shipping handbook']],
      ['Syncing', 'info', ['Product FAQ', 'Sales playbook', 'Return policy updates']],
      ['Stale', 'warning', ['Product catalog · 8d', 'Old campaign guide', 'One external source']],
    ],
    [
      ['Help center', 'Public support content', 'Healthy', 'success', '1,240 documents · synced 2h ago'],
      ['Policies', 'Restricted operations', 'Healthy', 'success', '418 documents · ACL scoped'],
      ['Product catalog', 'Commerce knowledge', 'Stale', 'warning', 'Last full sync 8d ago'],
    ],
    ['Retrieval remains tenant and access scoped.', 'Citations expose source provenance.', 'Stale sources are visible before operator use.'],
    ['Add knowledge source', 'Inspect retrieval quality', 'Review stale sources'],
  ),
  approvals: moduleSurface(
    'Approvals',
    'GOVERNANCE',
    'Review high-risk and critical actions with digest-bound evidence so an approval cannot be replayed for a different command.',
    [['Requested', '14'], ['Critical', '3'], ['Approved today', '27'], ['Expired', '2']],
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
    ['Approvals bind to exact action digests.', 'Expired approvals cannot execute.', 'Critical actions retain actor, resource, and evidence.'],
    ['Review request', 'Inspect action digest', 'Open audit trail'],
  ),
  integrations: moduleSurface(
    'Integrations',
    'CONNECTIVITY',
    'Manage provider connections, assets, health, webhooks, synchronization, typed actions, and secret references without exposing raw credentials.',
    [['Connected', '7'], ['Degraded', '1'], ['Sync runs 24h', '86'], ['Webhook errors', '3']],
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
    ['Secrets are referenced rather than exposed.', 'Retries are bounded and dead-lettered.', 'Production provider capability stays separate from fixtures.'],
    ['Connect provider', 'Run sync', 'Inspect webhook health'],
  ),
  developer: moduleSurface(
    'Developer platform',
    'APIS & WEBHOOKS',
    'Manage scoped API keys, rotation, revocation, rate limits, signed outbound webhooks, delivery retries, logs, and developer documentation.',
    [['Active API keys', '8'], ['Webhook endpoints', '12'], ['Deliveries 24h', '18.4k'], ['Failed deliveries', '23']],
    [
      ['API keys', 'success', ['Production API', 'Analytics export', 'Warehouse API']],
      ['Webhooks', 'info', ['ERP endpoint', 'Warehouse endpoint', 'BI endpoint']],
      ['Attention', 'warning', ['23 retrying deliveries', 'One key rotates in 5d', 'Warehouse latency elevated']],
    ],
    [
      ['Production API', 'orders:read customers:read', 'Active', 'success', 'Rotates in 21d'],
      ['ERP webhook', 'order.updated', 'Healthy', 'success', '99.98% delivery success'],
      ['Warehouse webhook', 'shipment.created', 'Degraded', 'warning', '23 retrying deliveries'],
    ],
    ['API keys are hashed, scoped, rotatable, and revocable.', 'Outbound webhook signatures are verifiable.', 'Dead-lettered deliveries remain inspectable and retryable.'],
    ['Create API key', 'Add webhook', 'Inspect delivery logs'],
  ),
  onboarding: moduleSurface(
    'Onboarding',
    'ORGANIZATION SETUP',
    'Configure reusable business profile, team setup, first integration, and launch readiness from canonical organization state.',
    [['Profile', 'Complete'], ['Team', '3 members'], ['Integrations', '2 connected'], ['Readiness', '75%']],
    [
      ['Business profile', 'success', ['Egypt · EGP', 'E-commerce · B2C', 'Arabic + English']],
      ['Team', 'success', ['Owner', 'Support manager', 'Operations agent']],
      ['Integration', 'warning', ['WhatsApp connected', 'Shopify connected', 'Shipping pending']],
    ],
    [
      ['Business profile', 'Egypt · EGP · Africa/Cairo', 'Complete', 'success', 'Goals: support, orders, recovery'],
      ['Team', '3 active · 1 invite pending', 'Complete', 'success', 'Role boundaries configured'],
      ['First integration', 'WhatsApp + Shopify', 'Complete', 'success', 'Provider health available'],
    ],
    ['Onboarding reuses canonical organization, membership, and connection state.', 'Setup can resume without duplicated business state.', 'Skipped steps stay explicit and reversible.'],
    ['Edit business profile', 'Invite team', 'Connect provider'],
  ),
  team: moduleSurface(
    'Team & roles',
    'IDENTITY & ACCESS',
    'Manage organization membership, invitations, system/custom roles, MFA policy visibility, and privileged-role boundaries.',
    [['Active members', '18'], ['Pending invites', '3'], ['Custom roles', '4'], ['MFA policy', 'Privileged']],
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
    ['Final active owner cannot be suspended or removed.', 'Privileged custom roles are guarded like Owner/Admin.', 'Invitation acceptance is verified-email bound.'],
    ['Invite member', 'Edit custom role', 'Review MFA policy'],
  ),
  settings: moduleSurface(
    'Organization settings',
    'TENANT CONFIGURATION',
    'Review business profile, locale, timezone, security, notification, data-governance, and platform behavior settings in one governed workspace.',
    [['Locale', 'ar-EG'], ['Timezone', 'Africa/Cairo'], ['MFA policy', 'Privileged'], ['Data retention', '365d']],
    [
      ['Configured', 'success', ['Business profile', 'Security policy', 'Timezone & locale']],
      ['Review', 'warning', ['Retention policy', 'One pending approval', 'Provider spend threshold']],
      ['Governance', 'info', ['Audit retention', 'Consent rules', 'Data export controls']],
    ],
    [
      ['Business profile', 'Egypt · EGP · B2C', 'Configured', 'success', 'Onboarding profile complete'],
      ['Security', 'MFA + roles', 'Configured', 'success', 'Privileged actions protected'],
      ['Retention', 'Customer + audit data', 'Review', 'warning', 'One policy awaiting approval'],
    ],
    ['High-risk configuration changes use canonical approvals.', 'Published configuration remains versioned and auditable.', 'Security policy never lives only in the browser.'],
    ['Edit profile', 'Review security', 'Open governance policy'],
  ),
  organizations: moduleSurface(
    'Organizations',
    'MULTI-TENANT',
    'Switch between authorized tenant workspaces and keep roles, settings, data, automation, and provider state isolated.',
    [['Workspaces', '3'], ['Active', '3'], ['Owner roles', '2'], ['Admin roles', '1']],
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
    ['Tenant selection changes the server-side data boundary.', 'RLS and relationship guards prevent cross-tenant access.', 'Global identity is separate from tenant membership.'],
    ['Open workspace', 'Create organization', 'Review memberships'],
  ),
};

window.addEventListener('hashchange', render);
window.addEventListener('load', () => {
  restoreDirection();
  render();
});

menuButton?.addEventListener('click', () => sidebar.classList.toggle('open'));
notificationButton?.addEventListener('click', () => showToast('Review mode: 9 SLA risks and 3 provider warnings are represented in the demo.'));
directionButton?.addEventListener('click', () => {
  const next = document.documentElement.dir === 'rtl' ? 'en' : 'ar';
  applyDirection(next);
});
moduleSearch?.addEventListener('input', filterNavigation);

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-review-action]');
  if (target) {
    showToast(`${target.dataset.reviewAction} is a review-only control. Live execution remains disabled here.`);
  }
  const anchor = event.target.closest('a[data-route]');
  if (anchor && window.innerWidth <= 820) sidebar.classList.remove('open');
});

function render() {
  const route = (location.hash || '#dashboard').slice(1);
  document.querySelectorAll('.nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === route);
  });
  content.innerHTML = route === 'dashboard' ? renderDashboard() : renderSurface(route);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderDashboard() {
  return `${pageHeader(
    'FULL PRODUCT REVIEW',
    'One operating system for customer operations and revenue',
    'This static workspace lets you inspect the complete product structure without relying on API, database, identity, provider, or worker availability.',
    '<a class="button primary" href="#inbox" data-route="inbox">Start product tour</a>',
  )}
    <div class="review-notice">
      <div><strong>Representative data only</strong><span>Nothing on this site writes to production systems. Backend correctness remains a separate release gate.</span></div>
      ${badge('NO BACKEND REQUIRED', 'info')}
    </div>
    <div class="metrics">
      ${metric('Product surfaces', '22', 'All major workspaces reviewable')}
      ${metric('Direction', 'LTR + RTL', 'Persistent browser preference')}
      ${metric('Responsive', '3 breakpoints', 'Desktop · tablet · mobile')}
      ${metric('Review mode', 'Static', 'No credentials or provider calls')}
    </div>
    <div class="product-groups">
      ${groupCard('Customer operations', ['inbox','customers','tickets','confirmation','returns','recovery'])}
      ${groupCard('Commerce & revenue', ['orders','shipping','sales','campaigns','analytics','billing'])}
      ${groupCard('Automation & AI', ['automation','operators','knowledge','approvals','integrations','developer'])}
      ${groupCard('Organization', ['onboarding','team','settings','organizations'])}
    </div>
    <section class="card review-contract">
      <div class="card-head"><div><p class="eyebrow">PRODUCT CONTRACT</p><h2>What this preview proves—and what it does not</h2></div>${badge('REVIEW SAFE', 'success')}</div>
      <div class="contract-grid">
        ${contract('UX structure', 'Navigation, information hierarchy, representative states, responsive layout, and RTL/LTR behavior are reviewable here.')}
        ${contract('Live actions', 'Buttons in review mode never mutate server or provider state. They explain the intended operator action instead.')}
        ${contract('Backend evidence', 'Tenant isolation, authorization, idempotency, audit, outbox, Temporal, and provider behavior remain verified separately in application CI.')}
      </div>
    </section>`;
}

function renderSurface(route) {
  const surface = surfaces[route];
  if (!surface) return renderDashboard();
  return `${pageHeader(
    surface.eyebrow,
    surface.label,
    surface.description,
    '<a class="button" href="#dashboard" data-route="dashboard">Product home</a>',
  )}
    <div class="review-notice">
      <div><strong>Frontend product review mode</strong><span>Deterministic representative data is shown without authentication or API availability.</span></div>
      ${badge('NO BACKEND REQUIRED', 'info')}
    </div>
    <div class="metrics">${surface.metrics.map(([label, value]) => metric(label, value, 'Representative review data')).join('')}</div>
    <div class="review-layout">
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">OPERATIONS</p><h2>Workflow board</h2></div>${badge('REPRESENTATIVE STATE', 'neutral')}</div>
        <div class="board">${surface.lanes.map(renderLane).join('')}</div>
      </section>
      <section class="card signal-card">
        <div class="card-head"><div><p class="eyebrow">SIGNALS</p><h2>${surface.label} signals</h2></div></div>
        <ul class="signal-list">${surface.insights.map((item) => `<li>${item}</li>`).join('')}</ul>
      </section>
    </div>
    <section class="card queue-card">
      <div class="card-head"><div><p class="eyebrow">WORK QUEUE</p><h2>Current items</h2></div><span class="muted">Sample records only</span></div>
      ${reviewTable(surface.rows)}
    </section>
    <div class="grid-2 review-controls">
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">PRIMARY ACTIONS</p><h2>Operator controls</h2></div></div>
        <div class="page-actions">${surface.actions.map((action, index) => `<button class="button ${index === 0 ? 'primary' : ''}" data-review-action="${action}">${action}</button>`).join('')}</div>
        <p class="review-footnote">These controls intentionally show a toast instead of executing commands. The live platform binds equivalent actions to authorization, policy, audit, and canonical command contracts.</p>
      </section>
      <section class="card">
        <div class="card-head"><div><p class="eyebrow">PRODUCT CONTRACT</p><h2>Review expectations</h2></div></div>
        <div class="contract-list">
          ${contract('Tenant boundary', 'Every live record remains tenant-scoped and authorization-checked.')}
          ${contract('Actions', 'State changes bind to typed commands, approvals, audit, and outbox.')}
          ${contract('Experience', 'Desktop, tablet, mobile, keyboard, LTR, and RTL share one product language.')}
        </div>
      </section>
    </div>`;
}

function groupCard(title, keys) {
  return `<section class="card product-group-card"><div class="card-head"><div><p class="eyebrow">WORKSPACE</p><h2>${title}</h2></div></div><div class="module-card-grid">${keys.map((key) => `<a href="#${key}" data-route="${key}" class="module-card"><strong>${surfaces[key].label}</strong><span>Open review workspace →</span></a>`).join('')}</div></section>`;
}

function renderLane([title, laneTone, items]) {
  return `<section class="lane"><div class="lane-head"><h3>${title}</h3>${badge(String(items.length), laneTone)}</div><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul></section>`;
}

function reviewTable(rows) {
  return `<div class="table-wrap"><table class="review-table"><thead><tr><th>Item</th><th>Context</th><th>Status</th><th>Details</th></tr></thead><tbody>${rows.map(([primary, secondary, status, statusTone, meta]) => `<tr><td data-label="Item"><strong>${primary}</strong></td><td data-label="Context">${secondary}</td><td data-label="Status">${badge(status, statusTone)}</td><td data-label="Details" class="muted">${meta}</td></tr>`).join('')}</tbody></table></div>`;
}

function pageHeader(eyebrow, title, description, actions = '') {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="description">${description}</p></div><div class="page-actions">${actions}</div></div>`;
}

function metric(label, value, detail) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function badge(value, forcedTone) {
  const normalized = String(value).toLowerCase();
  const automaticTone = normalized.includes('healthy') || normalized.includes('complete') || normalized.includes('active') || normalized.includes('delivered') || normalized.includes('approved') || normalized.includes('recovered')
    ? 'success'
    : normalized.includes('warning') || normalized.includes('review') || normalized.includes('pending') || normalized.includes('risk') || normalized.includes('degraded') || normalized.includes('scheduled') || normalized.includes('approval')
      ? 'warning'
      : normalized.includes('danger') || normalized.includes('failed') || normalized.includes('rejected') || normalized.includes('rescue')
        ? 'danger'
        : 'info';
  const selectedTone = forcedTone && tone[forcedTone] !== undefined ? tone[forcedTone] : automaticTone;
  return `<span class="badge ${selectedTone}">${value}</span>`;
}

function contract(title, text) {
  return `<div class="contract-item"><strong>${title}</strong><span>${text}</span></div>`;
}

function filterNavigation() {
  const query = moduleSearch.value.trim().toLowerCase();
  document.querySelectorAll('[data-nav-group]').forEach((group) => {
    let visible = 0;
    group.querySelectorAll('a[data-route]').forEach((link) => {
      const matches = !query || link.textContent.toLowerCase().includes(query);
      link.hidden = !matches;
      if (matches) visible += 1;
    });
    group.hidden = visible === 0;
  });
}

function restoreDirection() {
  const stored = localStorage.getItem('preneura-review-direction');
  applyDirection(stored === 'ar' ? 'ar' : 'en', false);
}

function applyDirection(locale, persist = true) {
  const rtl = locale === 'ar';
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
  directionButton.textContent = rtl ? 'English · LTR' : 'العربية · RTL';
  if (persist) localStorage.setItem('preneura-review-direction', locale);
  if (window.innerWidth <= 820) sidebar.classList.remove('open');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}
