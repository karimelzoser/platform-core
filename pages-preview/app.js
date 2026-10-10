const content = document.getElementById('content');
const directionButton = document.getElementById('directionButton');
const menuButton = document.getElementById('menuButton');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');

const state = {
  onboarding: JSON.parse(localStorage.getItem('preneura-preview-onboarding') || 'null') || {
    profile: false,
    team: 'PENDING',
    integration: 'PENDING',
  },
};

const demoOrders = [
  ['#10482', 'Mariam Hassan', 'EGP 3,450', 'CONFIRMED', '2 min ago'],
  ['#10481', 'Ahmed Tarek', 'EGP 1,890', 'NEEDS REVIEW', '8 min ago'],
  ['#10480', 'Nour Ali', 'EGP 6,240', 'READY TO SHIP', '13 min ago'],
  ['#10479', 'Omar Samy', 'EGP 2,150', 'CANCEL REQUEST', '19 min ago'],
];

const demoCustomers = [
  ['Mariam Hassan', '+20 100 111 2211', 'VIP · Repeat buyer', 'EGP 18.4k', 'Today'],
  ['Ahmed Tarek', '+20 109 820 1144', 'New customer', 'EGP 1.9k', 'Today'],
  ['Nour Ali', 'nour@example.test', 'Wholesale lead', 'EGP 31.2k', 'Yesterday'],
  ['Omar Samy', '+20 102 225 6690', 'Recovery opportunity', 'EGP 2.1k', 'Yesterday'],
];

const demoTickets = [
  ['T-918', 'Order confirmation issue', 'Mariam Hassan', 'NORMAL', '18m'],
  ['T-917', 'Address correction before shipping', 'Ahmed Tarek', 'HIGH', '7m'],
  ['T-916', 'Return request', 'Nour Ali', 'NORMAL', '42m'],
];

const routes = {
  dashboard: renderDashboard,
  onboarding: renderOnboarding,
  customers: renderCustomers,
  inbox: renderInbox,
  tickets: renderTickets,
  orders: renderOrders,
  shipping: renderShipping,
  returns: () => renderPlanned('Returns / Exchanges / Refunds', 'Eligibility, inspection, resolution, restock and approval-sensitive finance are the next business workflow after onboarding.'),
  recovery: () => renderPlanned('Recovery', 'Opportunity detection, suppression, offer lifecycle, recovered-order attribution and ROI will live here.'),
  sales: () => renderPlanned('Sales', 'Leads, qualification, pipelines, opportunities, activities and expected-value forecasting will live here.'),
  campaigns: () => renderPlanned('Campaigns', 'Consent-safe audience snapshots, batching, receipts, metering and conversion attribution will live here.'),
  automation: () => renderPlanned('Automation Studio', 'Typed triggers, conditions, waits, approvals and canonical actions — no arbitrary SQL, HTTP, JS or Python.'),
  ai: () => renderPlanned('AI Operators', 'Support, sales, recovery, shipping, returns and campaign operators will use typed tools and explicit operating modes.'),
  analytics: renderAnalytics,
  integrations: renderIntegrations,
  team: renderTeam,
  settings: renderSettings,
};

window.addEventListener('hashchange', render);
window.addEventListener('load', render);
menuButton?.addEventListener('click', () => sidebar.classList.toggle('open'));
directionButton?.addEventListener('click', () => {
  const rtl = document.documentElement.dir === 'rtl';
  document.documentElement.dir = rtl ? 'ltr' : 'rtl';
  document.documentElement.lang = rtl ? 'en' : 'ar';
  directionButton.textContent = rtl ? 'العربية · RTL' : 'English · LTR';
  if (window.innerWidth <= 820) sidebar.classList.remove('open');
});

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-route]');
  if (anchor && window.innerWidth <= 820) sidebar.classList.remove('open');
});

function render() {
  const route = (location.hash || '#dashboard').slice(1);
  document.querySelectorAll('.nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === route);
  });
  const renderer = routes[route] || routes.dashboard;
  content.innerHTML = renderer();
  bindActions(route);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function pageHeader(eyebrow, title, description, actions = '') {
  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        <p class="description">${description}</p>
      </div>
      <div class="page-actions">${actions}</div>
    </div>`;
}

function metric(label, value, detail) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function badge(value) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes('confirm') || normalized.includes('ready') || normalized.includes('connected') || normalized.includes('active')
    ? 'success'
    : normalized.includes('review') || normalized.includes('pending') || normalized.includes('high') || normalized.includes('degraded')
      ? 'warning'
      : normalized.includes('cancel') || normalized.includes('failed') || normalized.includes('suspend')
        ? 'danger'
        : 'info';
  return `<span class="badge ${tone}">${value}</span>`;
}

function renderDashboard() {
  return `${pageHeader(
    'EXECUTIVE WORKSPACE',
    'Operations at a glance',
    'A unified view of customer operations, commerce, shipping, revenue recovery and platform health.',
    '<a class="button primary" href="#onboarding" data-route="onboarding">Review setup</a>',
  )}
  <div class="metrics">
    ${metric('Open conversations', '64', '11 need human attention')}
    ${metric('Orders today', '128', '94.5% confirmed automatically')}
    ${metric('Shipping exceptions', '7', '3 require address review')}
    ${metric('Recovered revenue', 'EGP 30.4k', '+18% vs previous period')}
  </div>
  <div class="grid-2">
    <section class="card">
      <div class="card-head"><div><p class="eyebrow">LIVE OPERATIONS</p><h2>Priority queue</h2></div>${badge('11 ACTIONS')}</div>
      <div class="list">
        <div class="list-item"><div><strong>3 orders need duplicate review</strong><small>Potential duplicate payments or customer records</small></div>${badge('HIGH')}</div>
        <div class="list-item"><div><strong>4 chats waiting for human handover</strong><small>WhatsApp and Instagram</small></div>${badge('PENDING')}</div>
        <div class="list-item"><div><strong>2 shipping destinations need review</strong><small>Low-confidence normalization</small></div>${badge('REVIEW')}</div>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><div><p class="eyebrow">AUTOMATION</p><h2>Execution health</h2></div>${badge('HEALTHY')}</div>
      <div class="stack">
        <div><div class="kpi-strip"><span><strong>99.3%</strong> successful runs</span><span><strong>1.8s</strong> p95 command latency</span></div></div>
        <div class="progress"><span style="width:86%"></span></div>
        <div class="code-note">Canonical commands → audit → outbox → Temporal/provider action boundary</div>
      </div>
    </section>
  </div>`;
}

function renderOnboarding() {
  const s = state.onboarding;
  const current = !s.profile ? 1 : s.team === 'PENDING' ? 2 : s.integration === 'PENDING' ? 3 : 4;
  const ready = s.profile && s.team !== 'PENDING' && s.integration !== 'PENDING';
  return `${pageHeader(
    'SELF-SERVICE ONBOARDING',
    'Set up AI PRENEURA Demo',
    'Business context, team readiness and integration state are kept separate from canonical operational records. This preview persists only in your browser.',
    '<button class="button" data-reset-onboarding>Reset demo</button>',
  )}
  <div class="stepper">
    ${step(1, 'Business profile', s.profile ? 'Complete' : 'Required', current === 1)}
    ${step(2, 'Team', s.team, current === 2)}
    ${step(3, 'Integration', s.integration, current === 3)}
    ${step(4, 'Ready', ready ? 'READY' : 'In progress', current === 4)}
  </div>
  <section class="card">
    <div class="card-head"><div><p class="eyebrow">STEP 1</p><h2>Reusable business context</h2><p>Country, currency, locale, timezone, business model, volume bands and goals.</p></div>${badge(s.profile ? 'COMPLETE' : 'PENDING')}</div>
    <form id="profileForm" class="stack">
      <div class="form-grid">
        ${field('Country', '<select name="country"><option>Egypt</option><option>Saudi Arabia</option><option>UAE</option></select>')}
        ${field('Currency', '<select name="currency"><option>EGP</option><option>SAR</option><option>AED</option><option>USD</option></select>')}
        ${field('Timezone', '<select name="timezone"><option>Africa/Cairo</option><option>Asia/Riyadh</option><option>Asia/Dubai</option></select>')}
        ${field('Industry', '<select name="industry"><option>E-commerce</option><option>Retail</option><option>Services</option><option>Real estate</option></select>')}
        ${field('Customer model', '<select name="model"><option>B2C</option><option>B2B</option><option>Hybrid</option></select>')}
        ${field('Commerce model', '<select name="commerce"><option>E-commerce</option><option>Omnichannel</option><option>Services</option></select>')}
      </div>
      <fieldset><legend>Primary goals</legend><div class="choice-grid">
        ${choice('Support automation', true)}${choice('Order operations', true)}${choice('Recovery', false)}${choice('Campaigns', false)}${choice('Shipping', true)}${choice('Analytics', false)}
      </div></fieldset>
      <div><button class="button primary" type="submit">${s.profile ? 'Update business profile' : 'Save business profile'}</button></div>
    </form>
  </section>
  <section class="card">
    <div class="card-head"><div><p class="eyebrow">STEP 2</p><h2>Initial team</h2><p>Derived from active memberships and pending invitations in the real platform.</p></div>${badge(s.team)}</div>
    <div class="page-actions"><a class="button primary" href="#team" data-route="team">Open team & roles</a><button class="button" data-onboarding-step="team">${s.team === 'SKIPPED' ? 'Reopen step' : 'Skip for now'}</button></div>
  </section>
  <section class="card">
    <div class="card-head"><div><p class="eyebrow">STEP 3</p><h2>First integration</h2><p>Completion is derived from canonical provider connection state; this static demo does not call providers.</p></div>${badge(s.integration)}</div>
    <div class="page-actions"><a class="button primary" href="#integrations" data-route="integrations">Open integrations</a><button class="button" data-onboarding-step="integration">${s.integration === 'SKIPPED' ? 'Reopen step' : 'Skip for now'}</button></div>
  </section>`;
}

function renderCustomers() {
  return `${pageHeader('CUSTOMER 360', 'Customers', 'Unified customer identity, contact points, consent, tags, segments and timeline.', '<button class="button primary" data-toast="Customer creation uses the real API in the application build.">Create customer</button>')}
  <div class="metrics">${metric('Customers', '18,420', '+312 this month')}${metric('Verified contacts', '91.2%', 'Email + phone')}${metric('Suppressed', '284', 'Consent-safe outbound')}${metric('Merged duplicates', '73', 'Approval-controlled')}</div>
  ${table(['Customer','Contact','Segment','Lifetime value','Last activity'], demoCustomers)}`;
}

function renderInbox() {
  return `${pageHeader('UNIFIED MESSAGING', 'Inbox', 'WhatsApp, Instagram, Messenger, Web Chat and API-originated conversations converge on one conversation model.')}
  <div class="grid-2">
    <section class="card"><div class="card-head"><div><h2>Conversation queue</h2><p>Assignment, SLA and handover state</p></div>${badge('64 OPEN')}</div>
      <div class="list">
        ${['Mariam Hassan · WhatsApp','Ahmed Tarek · Instagram','Nour Ali · Messenger','Omar Samy · Web Chat'].map((name, i) => `<div class="list-item"><div><strong>${name}</strong><small>${['Need help changing my address','Is my order confirmed?','Can I return this item?','Do you ship tomorrow?'][i]}</small></div>${badge(i === 0 ? 'HUMAN' : 'AI')}</div>`).join('')}
      </div>
    </section>
    <section class="card"><div class="card-head"><div><h2>Selected conversation</h2><p>Mariam Hassan · WhatsApp</p></div>${badge('HUMAN HANDOVER')}</div>
      <div class="stack"><div class="code-note">Customer: I need to update my address before shipping.</div><div class="code-note">AI: I can help verify the order, but a human must approve the address change.</div><div class="code-note">Agent note: Waiting for customer confirmation.</div></div>
    </section>
  </div>`;
}

function renderTickets() {
  return `${pageHeader('SUPPORT OPERATIONS', 'Tickets', 'Ticket lifecycle, assignment, comments, SLA clocks and approval-sensitive actions.')}
  <div class="metrics">${metric('Open', '143', '12 created today')}${metric('SLA at risk', '9', '6 high-priority')}${metric('First response', '4m 12s', 'Median today')}${metric('Resolved today', '38', '91% within SLA')}</div>
  ${table(['Ticket','Title','Customer','Priority','Age'], demoTickets)}`;
}

function renderOrders() {
  return `${pageHeader('COMMERCE', 'Orders', 'Confirmation, duplicate evaluation, guarded modification/cancellation, payment and fulfillment safety.', '<button class="button primary" data-toast="Order import/sync is exercised in GitHub Actions, not this static preview.">Sync orders</button>')}
  <div class="metrics">${metric('Orders today', '128', 'EGP 221k GMV')}${metric('Confirmed', '121', '94.5%')}${metric('Needs review', '4', 'Duplicate/address/payment')}${metric('Ready to ship', '76', '59% of today')}</div>
  ${table(['Order','Customer','Total','State','Updated'], demoOrders)}`;
}

function renderShipping() {
  return `${pageHeader('FULFILLMENT', 'Shipping', 'Canonical destinations, routing, labels, tracking, delivery attempts and rescue cases.')}
  <div class="metrics">${metric('Shipments', '76', 'Created today')}${metric('In transit', '49', 'Across 4 services')}${metric('Address review', '3', 'Low confidence')}${metric('Delivery rescue', '5', 'Open rescue cases')}</div>
  <div class="grid-2">
    <section class="card"><div class="card-head"><div><h2>Routing readiness</h2><p>Service eligibility by normalized location</p></div>${badge('HEALTHY')}</div><div class="list"><div class="list-item"><div><strong>Cairo / Nasr City</strong><small>Express + Same Day eligible</small></div>${badge('READY')}</div><div class="list-item"><div><strong>New Damietta</strong><small>Standard eligible</small></div>${badge('READY')}</div><div class="list-item"><div><strong>South Sinai</strong><small>Manual mapping required</small></div>${badge('REVIEW')}</div></div></section>
    <section class="card"><div class="card-head"><div><h2>Tracking health</h2><p>Append-only provider events</p></div>${badge('49 ACTIVE')}</div><div class="progress"><span style="width:72%"></span></div><p class="muted">72% of active shipments received a tracking event in the last 6 hours.</p></section>
  </div>`;
}

function renderIntegrations() {
  const items = [
    ['WhatsApp Cloud API','CONNECTED','Messaging · webhooks · receipts'],
    ['Instagram Messaging','CONNECTED','Messaging · webhooks'],
    ['Shopify','DEMO ONLY','Orders · catalog · customers'],
    ['WooCommerce','DEMO ONLY','Orders · catalog · customers'],
    ['Email','PLANNED','Inbound/outbound email'],
  ];
  return `${pageHeader('PLATFORM CONNECTIONS', 'Integrations', 'The static preview shows intended connection UX only. Real adapter behavior is verified separately and is never simulated as production evidence.')}
  <section class="card"><div class="list">${items.map(([name,status,detail]) => `<div class="list-item"><div><strong>${name}</strong><small>${detail}</small></div>${badge(status)}</div>`).join('')}</div></section>`;
}

function renderTeam() {
  const members = [
    ['Karim Mabrouk','Owner','ACTIVE'],
    ['Operations Manager','Admin','ACTIVE'],
    ['Support Agent 01','Agent','ACTIVE'],
    ['Finance Reviewer','Approver','ACTIVE'],
  ];
  return `${pageHeader('IDENTITY & ACCESS', 'Team & Roles', 'Tenant memberships, invitations, custom roles, privileged-role guards and MFA policy visibility.')}
  <div class="metrics">${metric('Active members','4','1 owner · 1 admin')}${metric('Pending invitations','1','Expires in 5 days')}${metric('Custom roles','2','Tenant-defined')}${metric('MFA policy','OPTIONAL','High-risk actions can require MFA')}</div>
  ${table(['Member','Role','Status'], members)}`;
}

function renderAnalytics() {
  return `${pageHeader('ANALYTICS & ROI', 'Performance', 'A preview of the cross-domain reporting model that will consume canonical events, usage and provider cost data.')}
  <div class="metrics">${metric('Revenue influenced','EGP 184k','Recovery + campaigns')}${metric('Automation savings','126h','Estimated manual time')}${metric('AI cost','EGP 3.8k','Model + provider allocation')}${metric('Net automation ROI','4.7×','Preview calculation')}</div>
  <div class="grid-2"><section class="card"><div class="card-head"><div><h2>Revenue contribution</h2><p>Measured attribution, not vanity metrics</p></div></div><div class="list"><div class="list-item"><span>Recovery</span><strong>EGP 30.4k</strong></div><div class="list-item"><span>Campaign conversions</span><strong>EGP 92.1k</strong></div><div class="list-item"><span>Sales assisted</span><strong>EGP 61.5k</strong></div></div></section><section class="card"><div class="card-head"><div><h2>Cost allocation</h2><p>Provider + AI + automation usage</p></div></div><div class="progress"><span style="width:64%"></span></div><p class="muted">64% of preview operating cost is messaging/provider spend; AI accounts for 21%.</p></section></div>`;
}

function renderSettings() {
  return `${pageHeader('TENANT CONFIGURATION', 'Settings', 'Organization profile, locale/timezone, security policy, approvals and future declarative configuration publishing.')}
  <div class="grid-2"><section class="card"><div class="card-head"><div><h2>Organization</h2><p>AI PRENEURA Demo</p></div>${badge('ACTIVE')}</div><div class="stack"><div class="field"><label>Timezone</label><input value="Africa/Cairo" /></div><div class="field"><label>Locale</label><select><option>English</option><option>العربية</option></select></div><button class="button primary" data-toast="Static preview only — settings are not sent to the API.">Save settings</button></div></section><section class="card"><div class="card-head"><div><h2>Security</h2><p>High-risk operation controls</p></div></div><div class="list"><div class="list-item"><span>Privileged role changes</span>${badge('APPROVAL')}</div><div class="list-item"><span>Organization security policy</span>${badge('CRITICAL')}</div><div class="list-item"><span>Last active owner protection</span>${badge('ENFORCED')}</div></div></section></div>`;
}

function renderPlanned(title, description) {
  return `${pageHeader('NEXT PRODUCTION WORKSTREAM', title, description)}<section class="card"><div class="empty"><h2>${title}</h2><p>This surface is intentionally marked as planned until its canonical domain model, RLS, command path, integration evidence and browser acceptance are implemented.</p></div></section>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 3 && typeof cell === 'string' && /^[A-Z ]+$/.test(cell) ? badge(cell) : cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function field(label, control) {
  return `<div class="field"><label>${label}</label>${control}</div>`;
}
function choice(label, checked) {
  return `<label class="choice"><input type="checkbox" ${checked ? 'checked' : ''} /><span>${label}</span></label>`;
}
function step(number, title, status, active) {
  return `<div class="step ${active ? 'active' : ''}"><strong>${number}. ${title}</strong><span>${status}</span></div>`;
}

function bindActions(route) {
  document.querySelectorAll('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => showToast(button.dataset.toast));
  });
  if (route !== 'onboarding') return;
  document.getElementById('profileForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.onboarding.profile = true;
    persistOnboarding();
    showToast('Business profile saved in this browser preview.');
    render();
  });
  document.querySelectorAll('[data-onboarding-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.onboardingStep;
      state.onboarding[key] = state.onboarding[key] === 'SKIPPED' ? 'PENDING' : 'SKIPPED';
      persistOnboarding();
      render();
    });
  });
  document.querySelector('[data-reset-onboarding]')?.addEventListener('click', () => {
    state.onboarding = { profile: false, team: 'PENDING', integration: 'PENDING' };
    persistOnboarding();
    showToast('Onboarding preview reset.');
    render();
  });
}

function persistOnboarding() {
  localStorage.setItem('preneura-preview-onboarding', JSON.stringify(state.onboarding));
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
