export type PreviewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface PreviewMetric {
  label: string;
  value: string;
  detail: string;
}

export interface PreviewLane {
  title: string;
  tone: PreviewTone;
  items: readonly string[];
}

export interface PreviewRow {
  primary: string;
  secondary: string;
  status: string;
  tone: PreviewTone;
  meta: string;
}

export interface PreviewSurface {
  label: string;
  shortLabel: string;
  group: string;
  eyebrow: string;
  description: string;
  liveRoute?: string;
  metrics: readonly PreviewMetric[];
  lanes: readonly PreviewLane[];
  rows: readonly PreviewRow[];
  insightTitle: string;
  insights: readonly string[];
  nextActions: readonly string[];
}

function surface(config: PreviewSurface): PreviewSurface {
  return config;
}

export const previewSurfaces = {
  inbox: surface({
    label: 'Unified inbox', shortLabel: 'Inbox', group: 'Customer operations', eyebrow: 'CUSTOMER OPERATIONS', liveRoute: '/inbox',
    description: 'One queue for WhatsApp, Instagram, Messenger, email, web chat, ownership, human handover, SLA, and AI-assisted replies.',
    metrics: [
      { label: 'Open conversations', value: '186', detail: 'Sample operational state' },
      { label: 'Waiting on team', value: '34', detail: 'Sample operational state' },
      { label: 'AI-contained', value: '61%', detail: 'Sample operational state' },
      { label: 'SLA at risk', value: '12', detail: 'Sample operational state' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['WhatsApp · Sara M.', 'Instagram · Ahmed K.', 'Web chat · Guest 482'] },
      { title: 'Assigned', tone: 'warning', items: ['Mariam · refund question', 'Omar · shipping delay', 'Salma · product advice'] },
      { title: 'Resolved', tone: 'success', items: ['Handover completed', 'Order linked', 'Ticket closed'] },
    ],
    rows: [
      { primary: 'Sara Mahmoud', secondary: 'WhatsApp · Order ORD-10431', status: 'Human', tone: 'warning', meta: 'Last reply 3m · VIP customer' },
      { primary: 'Ahmed Khaled', secondary: 'Instagram · Pre-sale', status: 'AI copilot', tone: 'info', meta: 'Intent: sizing · confidence 92%' },
      { primary: 'Guest 482', secondary: 'Web chat · Checkout', status: 'Open', tone: 'neutral', meta: 'Cart EGP 2,740 · 1m waiting' },
    ],
    insightTitle: 'Queue signals',
    insights: ['Twelve conversations are projected to breach SLA in the next 30 minutes.', 'WhatsApp has the highest open volume and the fastest resolution time.', 'Three customers have both an open conversation and a pending order decision.'],
    nextActions: ['Open conversation', 'Assign queue', 'Review SLA'],
  }),

  customers: surface({
    label: 'Customer 360', shortLabel: 'Customers', group: 'Customer operations', eyebrow: 'CUSTOMER DATA', liveRoute: '/customers',
    description: 'A tenant-safe customer record with identity resolution, channels, orders, tickets, consent, tags, segments, and timeline evidence.',
    metrics: [
      { label: 'Customers', value: '48.2k', detail: 'Sample customer base' },
      { label: 'Active 30d', value: '16.4k', detail: 'Sample customer base' },
      { label: 'VIP', value: '1,284', detail: 'Sample customer base' },
      { label: 'Merge candidates', value: '23', detail: 'Sample customer base' },
    ],
    lanes: [
      { title: 'Identity', tone: 'info', items: ['Verified phone', 'Verified email', 'Provider identities'] },
      { title: 'Engagement', tone: 'warning', items: ['3 open conversations', '1 ticket', '2 campaigns'] },
      { title: 'Commerce', tone: 'success', items: ['12 orders', 'EGP 18.4k LTV', '2 returns'] },
    ],
    rows: [
      { primary: 'Mona Ahmed', secondary: '+20 100 234 5678', status: 'VIP', tone: 'success', meta: 'LTV EGP 18.4k · Cairo' },
      { primary: 'Youssef Ali', secondary: 'youssef@example.com', status: 'Active', tone: 'info', meta: '7 orders · last seen today' },
      { primary: 'Nour Hassan', secondary: '2 linked identities', status: 'Review', tone: 'warning', meta: 'Possible duplicate · approval gated merge' },
    ],
    insightTitle: 'Customer signals',
    insights: ['Identity merge stays approval-gated and auditable.', 'Consent and suppression are visible beside channel identities.', 'Timeline unifies customer, commerce, support, and automation events.'],
    nextActions: ['Open customer', 'Review merge candidate', 'Create segment'],
  }),

  tickets: surface({
    label: 'Tickets', shortLabel: 'Tickets', group: 'Customer operations', eyebrow: 'SERVICE MANAGEMENT', liveRoute: '/tickets',
    description: 'Structured cases with assignment, SLA, conversation links, comments, priority, approvals, and escalation history.',
    metrics: [
      { label: 'Open tickets', value: '74', detail: 'Sample service state' },
      { label: 'Critical', value: '6', detail: 'Sample service state' },
      { label: 'SLA pass', value: '96%', detail: 'Sample service state' },
      { label: 'Avg resolution', value: '3h 42m', detail: 'Sample service state' },
    ],
    lanes: [
      { title: 'Triage', tone: 'info', items: ['TKT-841 · damaged item', 'TKT-837 · payment', 'TKT-829 · wrong address'] },
      { title: 'Working', tone: 'warning', items: ['TKT-818 · L2 support', 'TKT-811 · finance', 'TKT-803 · shipping'] },
      { title: 'Resolved', tone: 'success', items: ['TKT-799 · refunded', 'TKT-794 · replaced', 'TKT-786 · answered'] },
    ],
    rows: [
      { primary: 'TKT-841', secondary: 'Mona Ahmed · ORD-10431', status: 'Critical', tone: 'danger', meta: 'SLA 18m remaining' },
      { primary: 'TKT-818', secondary: 'Youssef Ali', status: 'Escalated', tone: 'warning', meta: 'L2 owner · 2h active' },
      { primary: 'TKT-803', secondary: 'Nour Hassan', status: 'Waiting', tone: 'info', meta: 'Carrier response pending' },
    ],
    insightTitle: 'Service signals',
    insights: ['Six critical tickets have direct commerce impact.', 'Shipping-related cases account for 31% of open volume.', 'SLA decisions stay policy-driven rather than UI-only.'],
    nextActions: ['Open triage', 'Reassign ticket', 'Review SLA policy'],
  }),

  orders: surface({
    label: 'Orders', shortLabel: 'Orders', group: 'Customer operations', eyebrow: 'COMMERCE OPERATIONS', liveRoute: '/orders',
    description: 'Canonical order lifecycle for confirmation, duplicate review, guarded changes, payment state, fulfillment readiness, and timeline evidence.',
    metrics: [
      { label: 'Today', value: '428', detail: 'Sample commerce state' },
      { label: 'Gross value', value: 'EGP 684k', detail: 'Sample commerce state' },
      { label: 'Needs action', value: '37', detail: 'Sample commerce state' },
      { label: 'Cancellation risk', value: '4.2%', detail: 'Sample commerce state' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['ORD-10431 · COD', 'ORD-10428 · card', 'ORD-10417 · COD'] },
      { title: 'Operational', tone: 'warning', items: ['ORD-10399 · confirm', 'ORD-10388 · modify', 'ORD-10371 · duplicate'] },
      { title: 'Ready', tone: 'success', items: ['ORD-10402 · ship', 'ORD-10396 · paid', 'ORD-10391 · fulfilled'] },
    ],
    rows: [
      { primary: 'ORD-10431', secondary: 'Mona Ahmed · Cairo', status: 'Confirmation', tone: 'warning', meta: 'EGP 1,840 · COD' },
      { primary: 'ORD-10428', secondary: 'Youssef Ali · Giza', status: 'Paid', tone: 'success', meta: 'EGP 2,410 · card' },
      { primary: 'ORD-10371', secondary: 'Nour Hassan · Alexandria', status: 'Duplicate review', tone: 'warning', meta: 'Phone + address match' },
    ],
    insightTitle: 'Order signals',
    insights: ['High-value COD orders are prioritized for confirmation.', 'Potential duplicates stay blocked until reviewed.', 'Provider actions remain post-commit and replay-safe.'],
    nextActions: ['Open order', 'Review exceptions', 'Inspect timeline'],
  }),

  confirmation: surface({
    label: 'Order confirmation', shortLabel: 'Confirmation', group: 'Customer operations', eyebrow: 'COMMERCE OPERATIONS',
    description: 'Review confirmation readiness, customer contact outcomes, duplicate risk, and orders that require a human decision before shipping.',
    metrics: [
      { label: 'Awaiting contact', value: '24', detail: 'Sample operational state' },
      { label: 'Confirmed today', value: '118', detail: 'Sample operational state' },
      { label: 'Duplicate review', value: '7', detail: 'Sample operational state' },
      { label: 'SLA at risk', value: '5', detail: 'Sample operational state' },
    ],
    lanes: [
      { title: 'New', tone: 'info', items: ['ORD-10431 · WhatsApp', 'ORD-10428 · Phone', 'ORD-10417 · Messenger'] },
      { title: 'Waiting customer', tone: 'warning', items: ['ORD-10399 · retry in 45m', 'ORD-10388 · second attempt', 'ORD-10371 · address question'] },
      { title: 'Ready', tone: 'success', items: ['ORD-10402 · confirmed', 'ORD-10396 · payment verified', 'ORD-10391 · shipping-ready'] },
    ],
    rows: [
      { primary: 'ORD-10431', secondary: 'Mona Ahmed · Cairo', status: 'Contact due', tone: 'warning', meta: 'EGP 1,840 · WhatsApp preferred' },
      { primary: 'ORD-10428', secondary: 'Youssef Ali · Giza', status: 'New', tone: 'info', meta: 'EGP 2,410 · COD' },
      { primary: 'ORD-10402', secondary: 'Nour Hassan · Alexandria', status: 'Confirmed', tone: 'success', meta: 'EGP 990 · card paid' },
    ],
    insightTitle: 'Confirmation signals',
    insights: ['High-value COD orders are concentrated in Cairo.', 'Two duplicate candidates share phone and delivery address.', 'Five contacts will breach the confirmation SLA within one hour.'],
    nextActions: ['Open confirmation queue', 'Review duplicate candidates', 'Inspect SLA policy'],
  }),

  shipping: surface({
    label: 'Shipping', shortLabel: 'Shipping', group: 'Customer operations', eyebrow: 'FULFILLMENT', liveRoute: '/shipping',
    description: 'Carrier routing, destination normalization, labels, tracking, delivery attempts, rescue cases, and shipping-provider evidence.',
    metrics: [
      { label: 'Ready to ship', value: '126', detail: 'Sample fulfillment state' },
      { label: 'In transit', value: '612', detail: 'Sample fulfillment state' },
      { label: 'Delivery risk', value: '29', detail: 'Sample fulfillment state' },
      { label: 'Delivered today', value: '384', detail: 'Sample fulfillment state' },
    ],
    lanes: [
      { title: 'Ready', tone: 'info', items: ['SHP-5901 · Cairo', 'SHP-5898 · Giza', 'SHP-5894 · Alex'] },
      { title: 'In transit', tone: 'warning', items: ['SHP-5878 · attempt 1', 'SHP-5862 · delayed', 'SHP-5851 · address review'] },
      { title: 'Delivered', tone: 'success', items: ['SHP-5839 · 12:41', 'SHP-5833 · 12:18', 'SHP-5820 · 11:54'] },
    ],
    rows: [
      { primary: 'SHP-5901', secondary: 'ORD-10402 · Cairo', status: 'Ready', tone: 'info', meta: 'Carrier A · next pickup 16:00' },
      { primary: 'SHP-5862', secondary: 'ORD-10388 · Mansoura', status: 'Delayed', tone: 'warning', meta: '1 day late · rescue eligible' },
      { primary: 'SHP-5851', secondary: 'ORD-10371 · New Damietta', status: 'Review', tone: 'warning', meta: 'Destination confidence 72%' },
    ],
    insightTitle: 'Routing signals',
    insights: ['Twenty-nine shipments qualify for proactive rescue.', 'Destination confidence falls below threshold for four orders.', 'Carrier selection remains policy- and zone-driven.'],
    nextActions: ['Open routing queue', 'Review rescue cases', 'Inspect carrier health'],
  }),

  returns: surface({
    label: 'Returns & refunds', shortLabel: 'Returns', group: 'Customer operations', eyebrow: 'POST-PURCHASE',
    description: 'Operate return, exchange, inspection, resolution, restock, and refund decisions without mixing them into the original order aggregate.',
    metrics: [
      { label: 'Open requests', value: '18', detail: 'Sample post-purchase state' },
      { label: 'Awaiting inspection', value: '6', detail: 'Sample post-purchase state' },
      { label: 'Refund approvals', value: '4', detail: 'Sample post-purchase state' },
      { label: 'Exchange value', value: 'EGP 12.8k', detail: 'Sample post-purchase state' },
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
  }),

  recovery: surface({
    label: 'Recovery', shortLabel: 'Recovery', group: 'Growth & revenue', eyebrow: 'REVENUE RECOVERY',
    description: 'Prioritize eligible abandoned journeys, suppress unsafe outreach, coordinate attempts and offers, and attribute recovered revenue to the exact opportunity.',
    metrics: [
      { label: 'Eligible now', value: '73', detail: 'Sample recovery state' },
      { label: 'In sequence', value: '41', detail: 'Sample recovery state' },
      { label: 'Recovered today', value: 'EGP 34.6k', detail: 'Sample recovery state' },
      { label: 'Suppressed', value: '19', detail: 'Sample recovery state' },
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
    insights: ['WhatsApp is the highest-converting sample channel.', 'Suppression prevents outreach after a customer completes a purchase.', 'Attribution stays linked to the original opportunity and recovered order.'],
    nextActions: ['Review eligible opportunities', 'Inspect suppression reasons', 'Open attribution report'],
  }),

  sales: surface({
    label: 'Sales', shortLabel: 'Sales', group: 'Growth & revenue', eyebrow: 'PIPELINE',
    description: 'Qualify CRM-backed leads, manage pipelines and opportunities, coordinate next actions, and expose structured AI signals without duplicating customer identity.',
    metrics: [
      { label: 'Open pipeline', value: 'EGP 1.84m', detail: 'Sample sales state' },
      { label: 'Qualified leads', value: '64', detail: 'Sample sales state' },
      { label: 'Due today', value: '17', detail: 'Sample sales state' },
      { label: 'Weighted forecast', value: 'EGP 742k', detail: 'Sample sales state' },
    ],
    lanes: [
      { title: 'Qualified', tone: 'info', items: ['LEAD-219 · score 82', 'LEAD-214 · score 78', 'LEAD-207 · score 74'] },
      { title: 'Proposal', tone: 'warning', items: ['OPP-118 · EGP 140k', 'OPP-114 · EGP 85k', 'OPP-109 · EGP 61k'] },
      { title: 'Commit', tone: 'success', items: ['OPP-103 · 90%', 'OPP-098 · 85%', 'OPP-091 · 80%'] },
    ],
    rows: [
      { primary: 'OPP-118', secondary: 'Nile Commerce Group', status: 'Proposal', tone: 'warning', meta: 'EGP 140k · 60% · owner Salma' },
      { primary: 'OPP-103', secondary: 'Delta Retail', status: 'Commit', tone: 'success', meta: 'EGP 220k · 90% · next call today' },
      { primary: 'LEAD-219', secondary: 'Cairo Home', status: 'Qualified', tone: 'info', meta: 'Score 82 · WhatsApp + web activity' },
    ],
    insightTitle: 'Sales signals',
    insights: ['Three high-value opportunities have no next action after today.', 'Lead qualification is CRM-referenced rather than a duplicate contact store.', 'AI recommendations are advisory, typed, and auditable.'],
    nextActions: ['Open pipeline board', 'Review due activities', 'Inspect lead scoring'],
  }),

  campaigns: surface({
    label: 'Campaigns', shortLabel: 'Campaigns', group: 'Growth & revenue', eyebrow: 'OUTBOUND',
    description: 'Build frozen audiences, enforce consent and suppression, launch deterministic batches, and measure receipts, cost, conversion, and attribution.',
    metrics: [
      { label: 'Draft campaigns', value: '6', detail: 'Sample campaign state' },
      { label: 'Scheduled recipients', value: '4,820', detail: 'Sample campaign state' },
      { label: 'Suppressed', value: '312', detail: 'Sample campaign state' },
      { label: 'Attributed revenue', value: 'EGP 96.4k', detail: 'Sample campaign state' },
    ],
    lanes: [
      { title: 'Draft', tone: 'neutral', items: ['Winter launch', 'VIP reactivation', 'COD nurture'] },
      { title: 'Scheduled', tone: 'info', items: ['Weekend offer · 18:00', 'Loyalty reminder · 20:00', 'B2B newsletter · Tue'] },
      { title: 'Running', tone: 'success', items: ['October WhatsApp · 68%', 'Email cross-sell · 91%', 'Recovery assist · 43%'] },
    ],
    rows: [
      { primary: 'October WhatsApp', secondary: '3,200 frozen recipients', status: 'Running', tone: 'success', meta: '2,176 sent · 36 conversions' },
      { primary: 'Weekend offer', secondary: '940 frozen recipients', status: 'Scheduled', tone: 'info', meta: 'Africa/Cairo · 18:00' },
      { primary: 'VIP reactivation', secondary: '420 estimated audience', status: 'Draft', tone: 'neutral', meta: 'Approval required before launch' },
    ],
    insightTitle: 'Campaign controls',
    insights: ['Audience snapshots are immutable after launch.', 'Successful recipients are never duplicated on retry.', 'Suppression and consent checks happen before provider intent is created.'],
    nextActions: ['Open campaign builder', 'Review suppression', 'Inspect attribution'],
  }),

  analytics: surface({
    label: 'Analytics & ROI', shortLabel: 'Analytics', group: 'Growth & revenue', eyebrow: 'MEASUREMENT',
    description: 'Measure customer operations, commerce, recovery, campaigns, automation, AI usage, provider cost, and business outcomes from canonical events.',
    metrics: [
      { label: 'Revenue influenced', value: 'EGP 412k', detail: 'Sample analytics state' },
      { label: 'Support containment', value: '61%', detail: 'Sample analytics state' },
      { label: 'Recovery ROI', value: '7.4×', detail: 'Sample analytics state' },
      { label: 'AI cost / outcome', value: 'EGP 3.80', detail: 'Sample analytics state' },
    ],
    lanes: [
      { title: 'Customer ops', tone: 'info', items: ['First response 4m', 'SLA pass 96%', 'CSAT 4.6/5'] },
      { title: 'Revenue', tone: 'success', items: ['Recovery +12%', 'Campaign ROAS 5.2×', 'Pipeline +8%'] },
      { title: 'Cost', tone: 'warning', items: ['AI EGP 18.4k', 'Provider EGP 42.1k', 'Automation EGP 6.7k'] },
    ],
    rows: [
      { primary: 'Recovery', secondary: 'Attributed revenue', status: '+12.4%', tone: 'success', meta: 'EGP 134k influenced' },
      { primary: 'Campaigns', secondary: 'Attributed revenue', status: '5.2× ROAS', tone: 'success', meta: 'EGP 96.4k influenced' },
      { primary: 'AI operators', secondary: 'Provider + model cost', status: 'Within budget', tone: 'info', meta: 'EGP 18.4k · 84% budget' },
    ],
    insightTitle: 'Measurement principles',
    insights: ['Dashboards consume canonical events and usage records, not screen-scraped state.', 'Cost is allocated by tenant, provider, model, and bounded dimensions.', 'ROI links operational actions to measurable business outcomes.'],
    nextActions: ['Open executive dashboard', 'Inspect cost allocation', 'Review attribution model'],
  }),

  automation: surface({
    label: 'Automation studio', shortLabel: 'Automation', group: 'Automation & AI', eyebrow: 'ORCHESTRATION',
    description: 'Design durable typed workflows using triggers, conditions, branches, waits, approvals, and canonical platform actions without arbitrary tenant code execution.',
    metrics: [
      { label: 'Published workflows', value: '14', detail: 'Sample workflow state' },
      { label: 'Running now', value: '286', detail: 'Sample workflow state' },
      { label: 'Awaiting approval', value: '9', detail: 'Sample workflow state' },
      { label: 'Failed 24h', value: '3', detail: 'Sample workflow state' },
    ],
    lanes: [
      { title: 'Triggers', tone: 'info', items: ['Order created', 'Message received', 'Recovery eligible'] },
      { title: 'Decisions', tone: 'warning', items: ['COD > threshold', 'Customer opted out?', 'Approval required?'] },
      { title: 'Actions', tone: 'success', items: ['Send template', 'Create shipment', 'Update canonical state'] },
    ],
    rows: [
      { primary: 'Order confirmation', secondary: 'v12 · published', status: 'Healthy', tone: 'success', meta: '128 active runs · durable waits' },
      { primary: 'Recovery sequence', secondary: 'v7 · published', status: 'Healthy', tone: 'success', meta: '41 active runs · 2 approvals' },
      { primary: 'High-value refund', secondary: 'v3 · draft', status: 'Draft', tone: 'neutral', meta: 'Policy gate not published' },
    ],
    insightTitle: 'Execution model',
    insights: ['Only registered typed actions may mutate platform state.', 'Durable waits and retries belong to Temporal rather than browser state.', 'Approvals bind to the exact action digest before execution.'],
    nextActions: ['Open workflow builder', 'Review active runs', 'Inspect failed executions'],
  }),

  configuration: surface({
    label: 'Configuration', shortLabel: 'Configuration', group: 'Automation & AI', eyebrow: 'VERSIONED CONFIG',
    description: 'Compile tenant business policies, templates, thresholds, routing, automation settings, and defaults into versioned, diffable configuration bundles.',
    metrics: [
      { label: 'Published version', value: 'v34', detail: 'Sample configuration state' },
      { label: 'Draft changes', value: '7', detail: 'Sample configuration state' },
      { label: 'Approval required', value: '2', detail: 'Sample configuration state' },
      { label: 'Rollback points', value: '12', detail: 'Sample configuration state' },
    ],
    lanes: [
      { title: 'Inputs', tone: 'info', items: ['Business profile', 'Policies', 'Templates'] },
      { title: 'Validation', tone: 'warning', items: ['2 sensitive diffs', '1 routing warning', '0 schema errors'] },
      { title: 'Published', tone: 'success', items: ['v34 active', 'v33 rollback-ready', 'v32 archived'] },
    ],
    rows: [
      { primary: 'Order policy', secondary: 'Confirmation threshold', status: 'Changed', tone: 'warning', meta: 'EGP 1,500 → EGP 2,000' },
      { primary: 'Shipping routing', secondary: 'Cairo zone', status: 'Validated', tone: 'success', meta: '2 eligible carriers' },
      { primary: 'Campaign window', secondary: 'WhatsApp', status: 'Draft', tone: 'neutral', meta: '18:00–21:00 Africa/Cairo' },
    ],
    insightTitle: 'Configuration controls',
    insights: ['Configuration changes are diffable before publish.', 'Sensitive policy changes can require approval.', 'Every publish keeps a deterministic rollback target.'],
    nextActions: ['Review diff', 'Validate bundle', 'Publish version'],
  }),

  simulation: surface({
    label: 'Simulation', shortLabel: 'Simulation', group: 'Automation & AI', eyebrow: 'DRY RUN',
    description: 'Run synthetic events through policy, automation, AI-tool planning, approvals, and provider intent generation without mutating production or calling providers.',
    metrics: [
      { label: 'Scenarios', value: '28', detail: 'Sample simulation state' },
      { label: 'Passing', value: '25', detail: 'Sample simulation state' },
      { label: 'Warnings', value: '3', detail: 'Sample simulation state' },
      { label: 'Provider calls', value: '0', detail: 'Simulation invariant' },
    ],
    lanes: [
      { title: 'Input', tone: 'info', items: ['COD order EGP 3,200', 'VIP inbound message', 'Refund request EGP 4,500'] },
      { title: 'Decision', tone: 'warning', items: ['Approval required', 'Route to human', 'Suppress outreach'] },
      { title: 'Plan', tone: 'success', items: ['2 typed actions', '1 Temporal wait', '0 external calls'] },
    ],
    rows: [
      { primary: 'High-value COD', secondary: 'Order created', status: 'Pass', tone: 'success', meta: 'Confirmation + approval planned' },
      { primary: 'Refund over threshold', secondary: 'Return inspected', status: 'Warning', tone: 'warning', meta: 'Finance approval required' },
      { primary: 'Opted-out customer', secondary: 'Campaign recipient', status: 'Suppressed', tone: 'success', meta: 'No provider intent produced' },
    ],
    insightTitle: 'Simulation evidence',
    insights: ['Dry runs cannot mutate production state.', 'Planned actions expose policy and approval reasoning.', 'Estimated cost and trace evidence are visible before publish.'],
    nextActions: ['Run scenario', 'Compare versions', 'Inspect action plan'],
  }),

  operators: surface({
    label: 'AI operators', shortLabel: 'AI operators', group: 'Automation & AI', eyebrow: 'TRUSTWORTHY AI',
    description: 'Configure specialized operators with scoped knowledge, typed tool allowlists, evaluation thresholds, spend controls, and explicit autonomy modes.',
    metrics: [
      { label: 'Configured operators', value: '9', detail: 'Sample AI state' },
      { label: 'Copilot mode', value: '4', detail: 'Sample AI state' },
      { label: 'Approval mode', value: '3', detail: 'Sample AI state' },
      { label: 'Autonomous mode', value: '2', detail: 'Sample AI state' },
    ],
    lanes: [
      { title: 'Customer ops', tone: 'info', items: ['Support operator', 'Order operator', 'Returns operator'] },
      { title: 'Revenue', tone: 'warning', items: ['Sales operator', 'Recovery operator', 'Campaign assistant'] },
      { title: 'Control', tone: 'success', items: ['Moderator', 'Lead qualification', 'Shipping operator'] },
    ],
    rows: [
      { primary: 'Support operator', secondary: 'COPILOT', status: 'Eval 96%', tone: 'success', meta: '8 tools · support knowledge scope' },
      { primary: 'Recovery operator', secondary: 'APPROVAL', status: 'Eval 94%', tone: 'success', meta: '5 tools · offer actions gated' },
      { primary: 'Campaign assistant', secondary: 'COPILOT', status: 'Eval 91%', tone: 'warning', meta: 'No direct send permission' },
    ],
    insightTitle: 'AI safety model',
    insights: ['Operators never write directly to the database or providers.', 'Mode changes do not bypass command risk or approval policy.', 'Prompt, model, tool, latency, and cost evidence remain auditable.'],
    nextActions: ['Review operator policies', 'Inspect eval results', 'Open tool registry'],
  }),

  knowledge: surface({
    label: 'Knowledge', shortLabel: 'Knowledge', group: 'Automation & AI', eyebrow: 'RAG & CONTENT',
    description: 'Manage tenant-scoped sources, ingestion freshness, access controls, retrieval quality, and citation-ready knowledge for users and AI operators.',
    metrics: [
      { label: 'Indexed sources', value: '42', detail: 'Sample knowledge state' },
      { label: 'Documents', value: '3,184', detail: 'Sample knowledge state' },
      { label: 'Fresh < 7d', value: '91%', detail: 'Sample knowledge state' },
      { label: 'Retrieval pass', value: '95%', detail: 'Sample knowledge state' },
    ],
    lanes: [
      { title: 'Sources', tone: 'info', items: ['Help center', 'Policies', 'Product catalog'] },
      { title: 'Ingestion', tone: 'warning', items: ['2 sources stale', '1 parser warning', '7 queued documents'] },
      { title: 'Ready', tone: 'success', items: ['Arabic FAQ', 'Shipping policy', 'Returns policy'] },
    ],
    rows: [
      { primary: 'Support handbook', secondary: '1,246 chunks', status: 'Fresh', tone: 'success', meta: 'Updated 2h ago · support scope' },
      { primary: 'Return policy', secondary: '84 chunks', status: 'Fresh', tone: 'success', meta: 'Updated yesterday · commerce scope' },
      { primary: 'Legacy catalog', secondary: '612 chunks', status: 'Stale', tone: 'warning', meta: 'Last synced 12 days ago' },
    ],
    insightTitle: 'Retrieval controls',
    insights: ['Every retrieval is tenant- and resource-scoped.', 'Citations preserve source identity and freshness metadata.', 'Prompt-injection and cross-tenant retrieval tests remain mandatory gates.'],
    nextActions: ['Review stale sources', 'Run retrieval evaluation', 'Inspect access scopes'],
  }),

  approvals: surface({
    label: 'Approvals', shortLabel: 'Approvals', group: 'Automation & AI', eyebrow: 'POLICY CONTROL', liveRoute: '/approvals',
    description: 'A single decision inbox for high-risk commands, exact action digests, MFA-sensitive changes, and human authorization evidence.',
    metrics: [
      { label: 'Requested', value: '9', detail: 'Sample approval state' },
      { label: 'Critical', value: '3', detail: 'Sample approval state' },
      { label: 'Expiring < 1h', value: '2', detail: 'Sample approval state' },
      { label: 'Approved today', value: '18', detail: 'Sample approval state' },
    ],
    lanes: [
      { title: 'Requested', tone: 'warning', items: ['Refund EGP 4,500', 'Role privilege change', 'Secret rotation'] },
      { title: 'Approved', tone: 'success', items: ['Customer merge', 'Campaign launch', 'Order cancel'] },
      { title: 'Rejected', tone: 'danger', items: ['Bulk export', 'Policy override', 'Provider disconnect'] },
    ],
    rows: [
      { primary: 'APR-3108', secondary: 'commerce.refund.issue', status: 'Requested', tone: 'warning', meta: 'EGP 4,500 · expires 42m' },
      { primary: 'APR-3105', secondary: 'organization.role.update', status: 'MFA required', tone: 'warning', meta: 'Privileged role mutation' },
      { primary: 'APR-3099', secondary: 'crm.customer.merge', status: 'Approved', tone: 'success', meta: 'Exact digest bound' },
    ],
    insightTitle: 'Approval integrity',
    insights: ['Approval evidence binds to an exact action digest.', 'Replay or substitution must fail after decision.', 'Critical actions can require both authorization and MFA assurance.'],
    nextActions: ['Review request', 'Inspect evidence', 'Open policy'],
  }),

  integrations: surface({
    label: 'Integrations', shortLabel: 'Integrations', group: 'Platform & data', eyebrow: 'PROVIDER CONNECTIONS', liveRoute: '/integrations',
    description: 'Connection lifecycle, OAuth/credentials, provider assets, webhooks, sync, health, reconciliation, rate limits, and typed provider actions.',
    metrics: [
      { label: 'Connections', value: '8', detail: 'Sample provider state' },
      { label: 'Healthy', value: '6', detail: 'Sample provider state' },
      { label: 'Degraded', value: '2', detail: 'Sample provider state' },
      { label: 'Dead letters', value: '3', detail: 'Sample provider state' },
    ],
    lanes: [
      { title: 'Messaging', tone: 'info', items: ['WhatsApp', 'Instagram', 'Messenger'] },
      { title: 'Commerce', tone: 'success', items: ['Shopify', 'WooCommerce', 'Generic API'] },
      { title: 'Attention', tone: 'warning', items: ['Email token refresh', 'Carrier rate limit', '3 dead letters'] },
    ],
    rows: [
      { primary: 'WhatsApp Cloud API', secondary: 'Messaging', status: 'Healthy', tone: 'success', meta: 'Webhook active · 182ms health' },
      { primary: 'Shopify', secondary: 'Commerce', status: 'Healthy', tone: 'success', meta: 'Incremental sync · 4m ago' },
      { primary: 'Email', secondary: 'Messaging', status: 'Degraded', tone: 'warning', meta: 'Credential rotation due' },
    ],
    insightTitle: 'Integration controls',
    insights: ['Provider calls are post-commit typed intents.', 'Webhook ingestion is deduplicated and replay-safe.', 'Health and reconciliation state are visible per connection.'],
    nextActions: ['Open connection', 'Run reconciliation', 'Review dead letters'],
  }),

  'custom-data': surface({
    label: 'Custom data', shortLabel: 'Custom data', group: 'Platform & data', eyebrow: 'EXTENSIBLE DATA',
    description: 'Tenant-defined tables, fields, records, validation, row/field permissions, imports, exports, APIs, automation hooks, and AI tools without arbitrary SQL.',
    metrics: [
      { label: 'Custom tables', value: '12', detail: 'Sample custom-data state' },
      { label: 'Records', value: '84.6k', detail: 'Sample custom-data state' },
      { label: 'Automations', value: '19', detail: 'Sample custom-data state' },
      { label: 'Validation errors', value: '27', detail: 'Sample custom-data state' },
    ],
    lanes: [
      { title: 'Schemas', tone: 'info', items: ['Stores', 'Sales territories', 'VIP agreements'] },
      { title: 'Imports', tone: 'warning', items: ['Territories · validating', 'Stores · 27 errors', 'Agreements · queued'] },
      { title: 'Ready', tone: 'success', items: ['Supplier registry', 'Product attributes', 'Agent targets'] },
    ],
    rows: [
      { primary: 'Stores', secondary: '18 fields · 2,148 records', status: 'Active', tone: 'success', meta: '3 automations · API enabled' },
      { primary: 'Sales territories', secondary: '9 fields · 126 records', status: 'Validating', tone: 'warning', meta: 'Import in progress' },
      { primary: 'VIP agreements', secondary: '14 fields · 418 records', status: 'Active', tone: 'success', meta: 'Field-level restrictions' },
    ],
    insightTitle: 'Extensibility model',
    insights: ['Tenant customization never exposes arbitrary SQL.', 'Schema changes remain validated and auditable.', 'Custom records can participate in typed automation and AI tools.'],
    nextActions: ['Open table', 'Create schema', 'Review import errors'],
  }),

  billing: surface({
    label: 'Billing & usage', shortLabel: 'Billing', group: 'Platform & data', eyebrow: 'COMMERCIAL',
    description: 'Review plan entitlements, measured usage, quotas, provider cost allocation, overages, subscription state, and invoices from the canonical usage ledger.',
    metrics: [
      { label: 'Current plan', value: 'Growth', detail: 'Sample commercial state' },
      { label: 'Monthly usage', value: '72%', detail: 'Sample commercial state' },
      { label: 'Provider cost', value: 'EGP 42.1k', detail: 'Sample commercial state' },
      { label: 'Projected overage', value: 'EGP 4.8k', detail: 'Sample commercial state' },
    ],
    lanes: [
      { title: 'Entitlements', tone: 'info', items: ['50 team seats', '250k messages', '20 AI operators'] },
      { title: 'Usage', tone: 'warning', items: ['Messages 78%', 'AI tokens 69%', 'Storage 54%'] },
      { title: 'State', tone: 'success', items: ['Subscription active', 'No suspension', 'Invoice current'] },
    ],
    rows: [
      { primary: 'Messaging', secondary: '195,400 / 250,000', status: '78%', tone: 'warning', meta: 'Reset in 19 days' },
      { primary: 'AI usage', secondary: 'Canonical meter family', status: '69%', tone: 'info', meta: 'Provider cost EGP 18.4k' },
      { primary: 'Team seats', secondary: '18 / 50', status: '36%', tone: 'success', meta: 'No overage risk' },
    ],
    insightTitle: 'Commercial controls',
    insights: ['Billing reads the append-only usage ledger.', 'Entitlements gate capability independently from UI visibility.', 'Suspension hooks never delete tenant data or audit history.'],
    nextActions: ['Review plan', 'Inspect usage ledger', 'Open invoices'],
  }),

  developer: surface({
    label: 'Developer platform', shortLabel: 'Developer', group: 'Platform & data', eyebrow: 'APIS & WEBHOOKS',
    description: 'Manage scoped API keys, outbound webhooks, delivery logs, rate limits, signing, rotation, revocation, and developer documentation.',
    metrics: [
      { label: 'Active API keys', value: '7', detail: 'Sample developer state' },
      { label: 'Webhook endpoints', value: '5', detail: 'Sample developer state' },
      { label: 'Deliveries 24h', value: '18.2k', detail: 'Sample developer state' },
      { label: 'Failed deliveries', value: '14', detail: 'Sample developer state' },
    ],
    lanes: [
      { title: 'API keys', tone: 'info', items: ['ERP read/write', 'BI read-only', 'Warehouse integration'] },
      { title: 'Webhooks', tone: 'success', items: ['orders.*', 'customers.updated', 'shipping.updated'] },
      { title: 'Attention', tone: 'warning', items: ['1 key rotation due', '14 webhook failures', '2 rate-limit spikes'] },
    ],
    rows: [
      { primary: 'ERP integration', secondary: 'orders:read orders:write', status: 'Active', tone: 'success', meta: 'Rotated 21 days ago' },
      { primary: 'Analytics warehouse', secondary: 'analytics:read', status: 'Active', tone: 'success', meta: 'Rate limit 300 rpm' },
      { primary: 'orders.updated', secondary: 'Webhook endpoint', status: 'Degraded', tone: 'warning', meta: '11 retries · signed delivery' },
    ],
    insightTitle: 'Developer controls',
    insights: ['API key secrets are shown only once and stored hashed.', 'Webhook deliveries are signed, retried, and dead-lettered deterministically.', 'Scopes map to canonical platform permissions and tenant boundaries.'],
    nextActions: ['Manage API keys', 'Review webhook logs', 'Open API docs'],
  }),

  admin: surface({
    label: 'Admin control center', shortLabel: 'Admin', group: 'Platform & data', eyebrow: 'OPERATIONS CONTROL',
    description: 'Tenant and integration health, workflow queues, webhooks, outbox, dead letters, AI spend, billing state, data governance, and safe audited remediation.',
    metrics: [
      { label: 'Tenant health', value: '98.7%', detail: 'Sample platform state' },
      { label: 'Open incidents', value: '4', detail: 'Sample platform state' },
      { label: 'Dead letters', value: '11', detail: 'Sample platform state' },
      { label: 'Spend alerts', value: '2', detail: 'Sample platform state' },
    ],
    lanes: [
      { title: 'Healthy', tone: 'success', items: ['API', 'Workers', 'Temporal'] },
      { title: 'Attention', tone: 'warning', items: ['Email provider', '2 tenant quotas', '11 dead letters'] },
      { title: 'Governance', tone: 'info', items: ['Retention', 'Exports', 'Deletion requests'] },
    ],
    rows: [
      { primary: 'Tenant ACME Egypt', secondary: 'Operations', status: 'Healthy', tone: 'success', meta: 'All SLOs within target' },
      { primary: 'Email connector', secondary: 'Provider health', status: 'Degraded', tone: 'warning', meta: 'Token refresh failures' },
      { primary: 'DLQ-9841', secondary: 'provider.action', status: 'Review', tone: 'warning', meta: '3 attempts · safe replay available' },
    ],
    insightTitle: 'Operational controls',
    insights: ['Remediation actions are typed and audited.', 'Tenant suspension and deletion remain separate lifecycle operations.', 'Governance surfaces retention, export, anonymization, and secret-rotation evidence.'],
    nextActions: ['Open incident', 'Review dead letters', 'Inspect governance'],
  }),

  onboarding: surface({
    label: 'Self-service onboarding', shortLabel: 'Onboarding', group: 'Organization control', eyebrow: 'SETUP', liveRoute: '/onboarding',
    description: 'Capture reusable business profile, country, currency, timezone, language, operating model, volume bands, goals, team readiness, and first integration.',
    metrics: [
      { label: 'Setup complete', value: '75%', detail: 'Sample organization state' },
      { label: 'Business profile', value: 'Complete', detail: 'Sample organization state' },
      { label: 'Team', value: '3 members', detail: 'Sample organization state' },
      { label: 'Integrations', value: '1 connected', detail: 'Sample organization state' },
    ],
    lanes: [
      { title: 'Business profile', tone: 'success', items: ['Egypt', 'EGP', 'E-commerce'] },
      { title: 'Team', tone: 'success', items: ['Owner', 'Admin', 'Support agent'] },
      { title: 'Integration', tone: 'warning', items: ['Shopify connected', 'WhatsApp pending', 'Shipping pending'] },
    ],
    rows: [
      { primary: 'Business profile', secondary: 'Country, currency, timezone', status: 'Complete', tone: 'success', meta: 'Reusable tenant configuration' },
      { primary: 'Team setup', secondary: '3 active members', status: 'Complete', tone: 'success', meta: 'Roles assigned' },
      { primary: 'First integration', secondary: 'Shopify', status: 'Connected', tone: 'success', meta: 'Initial sync ready' },
    ],
    insightTitle: 'Setup guidance',
    insights: ['Profile data feeds later configuration and automation.', 'Team readiness is derived from canonical memberships rather than duplicated flags.', 'Integration readiness is derived from real connection state when the backend is enabled.'],
    nextActions: ['Edit business profile', 'Invite teammate', 'Connect provider'],
  }),

  organizations: surface({
    label: 'Organizations', shortLabel: 'Organizations', group: 'Organization control', eyebrow: 'TENANT SELECTION', liveRoute: '/organizations',
    description: 'Select authorized tenant workspaces, inspect status and roles, and create a new organization through a controlled bootstrap boundary.',
    metrics: [
      { label: 'Organizations', value: '3', detail: 'Sample identity state' },
      { label: 'Active', value: '3', detail: 'Sample identity state' },
      { label: 'Owner roles', value: '2', detail: 'Sample identity state' },
      { label: 'Pending invites', value: '4', detail: 'Sample identity state' },
    ],
    lanes: [
      { title: 'Primary', tone: 'success', items: ['AI PRENEURA', 'Owner'] },
      { title: 'Client', tone: 'info', items: ['Vabilla Beática', 'Admin'] },
      { title: 'Sandbox', tone: 'neutral', items: ['Platform demo', 'Owner'] },
    ],
    rows: [
      { primary: 'AI PRENEURA', secondary: 'aipreneura', status: 'Active', tone: 'success', meta: 'Owner · Cairo timezone' },
      { primary: 'Vabilla Beática', secondary: 'vabilla-beatica', status: 'Active', tone: 'success', meta: 'Admin · E-commerce' },
      { primary: 'Platform demo', secondary: 'platform-demo', status: 'Active', tone: 'success', meta: 'Owner · sample workspace' },
    ],
    insightTitle: 'Tenant boundary',
    insights: ['Only active memberships appear in workspace selection.', 'Tenant cookies select context but never grant access themselves.', 'Organization bootstrap creates the first owner through a constrained identity boundary.'],
    nextActions: ['Open workspace', 'Create organization', 'Review memberships'],
  }),

  team: surface({
    label: 'Team & roles', shortLabel: 'Team', group: 'Organization control', eyebrow: 'IDENTITY & ACCESS', liveRoute: '/team',
    description: 'Manage memberships, invitations, system/custom roles, privileged-role guards, suspension/removal, and MFA-sensitive access changes.',
    metrics: [
      { label: 'Active members', value: '18', detail: 'Sample access state' },
      { label: 'Pending invites', value: '4', detail: 'Sample access state' },
      { label: 'Custom roles', value: '6', detail: 'Sample access state' },
      { label: 'MFA coverage', value: '83%', detail: 'Sample access state' },
    ],
    lanes: [
      { title: 'Owners & admins', tone: 'success', items: ['Karim · Owner', 'Salma · Admin', 'Omar · Admin'] },
      { title: 'Operations', tone: 'info', items: ['Support team', 'Commerce team', 'Shipping team'] },
      { title: 'Attention', tone: 'warning', items: ['4 invitations', '2 MFA enrollments', '1 role review'] },
    ],
    rows: [
      { primary: 'Karim', secondary: 'Owner', status: 'Active', tone: 'success', meta: 'MFA satisfied' },
      { primary: 'Salma', secondary: 'Admin', status: 'Active', tone: 'success', meta: 'MFA satisfied' },
      { primary: 'Support supervisor', secondary: 'Custom role', status: 'Review', tone: 'warning', meta: '12 permissions · quarterly review due' },
    ],
    insightTitle: 'Access controls',
    insights: ['Final active owner cannot be suspended or stripped of Owner.', 'Privileged role assignment and removal require role-management authority.', 'Custom roles carrying security permissions are treated as privileged.'],
    nextActions: ['Invite member', 'Review roles', 'Inspect MFA policy'],
  }),

  settings: surface({
    label: 'Organization settings', shortLabel: 'Settings', group: 'Organization control', eyebrow: 'TENANT CONTROL', liveRoute: '/settings',
    description: 'Configure organization identity, locale, timezone, security policy, business profile, operational defaults, and governance boundaries.',
    metrics: [
      { label: 'Configuration status', value: '92%', detail: 'Sample tenant state' },
      { label: 'MFA policy', value: 'Privileged', detail: 'Sample tenant state' },
      { label: 'Active members', value: '18', detail: 'Sample tenant state' },
      { label: 'Connected systems', value: '6', detail: 'Sample tenant state' },
    ],
    lanes: [
      { title: 'Organization', tone: 'info', items: ['Locale English / Arabic', 'Timezone Africa/Cairo', 'Currency EGP'] },
      { title: 'Security', tone: 'success', items: ['Privileged MFA required', 'Last-owner protection', 'Approval policy active'] },
      { title: 'Governance', tone: 'warning', items: ['Retention review due', '1 secret rotation due', '2 stale integrations'] },
    ],
    rows: [
      { primary: 'Business profile', secondary: 'Egypt · EGP · E-commerce', status: 'Complete', tone: 'success', meta: 'Updated this month' },
      { primary: 'Security policy', secondary: 'MFA for privileged actions', status: 'Enforced', tone: 'success', meta: 'Approval required to change' },
      { primary: 'Data retention', secondary: 'Operational events', status: 'Review', tone: 'warning', meta: 'Policy review due in 12 days' },
    ],
    insightTitle: 'Governance posture',
    insights: ['Security-sensitive changes remain canonical commands.', 'Locale and timezone feed downstream automation and campaign behavior.', 'Configuration is designed to become versioned, diffable, approvable, and rollbackable.'],
    nextActions: ['Edit organization profile', 'Review security', 'Open governance settings'],
  }),
} as const satisfies Record<string, PreviewSurface>;

export type PreviewSurfaceKey = keyof typeof previewSurfaces;

export function isPreviewSurface(value: string): value is PreviewSurfaceKey {
  return value in previewSurfaces;
}

export const previewGroups = [
  {
    title: 'Customer operations',
    description: 'Service, CRM, commerce, confirmation, fulfillment, returns, and recovery.',
    slugs: ['inbox', 'customers', 'tickets', 'orders', 'confirmation', 'shipping', 'returns'] as const,
  },
  {
    title: 'Growth & revenue',
    description: 'Recovery, sales, campaigns, and measurable ROI.',
    slugs: ['recovery', 'sales', 'campaigns', 'analytics'] as const,
  },
  {
    title: 'Automation & AI',
    description: 'Typed workflows, versioned configuration, simulation, approvals, knowledge, and AI operators.',
    slugs: ['automation', 'configuration', 'simulation', 'operators', 'knowledge', 'approvals'] as const,
  },
  {
    title: 'Platform & data',
    description: 'Provider integrations, custom data, billing, developer APIs, and operational administration.',
    slugs: ['integrations', 'custom-data', 'billing', 'developer', 'admin'] as const,
  },
  {
    title: 'Organization control',
    description: 'Self-service setup, tenant selection, team access, and governance settings.',
    slugs: ['onboarding', 'organizations', 'team', 'settings'] as const,
  },
] as const;
