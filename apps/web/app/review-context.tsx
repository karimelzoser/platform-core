import type { Route } from 'next';
import Link from 'next/link';

interface ContextLink {
  label: string;
  module: string;
  detail: string;
}

const context: Record<string, readonly ContextLink[]> = {
  inbox: [
    { label: 'Customer profile', module: 'customers', detail: 'Identity, consent, value, timeline' },
    { label: 'Order context', module: 'orders', detail: 'Current order and payment state' },
    { label: 'Escalated ticket', module: 'tickets', detail: 'SLA and ownership' },
  ],
  customers: [
    { label: 'Conversations', module: 'inbox', detail: 'Cross-channel customer history' },
    { label: 'Orders', module: 'orders', detail: 'Purchases, payment, fulfillment' },
    { label: 'Sales opportunity', module: 'sales', detail: 'Pipeline and next action' },
  ],
  tickets: [
    { label: 'Customer', module: 'customers', detail: 'Canonical identity and consent' },
    { label: 'Conversation', module: 'inbox', detail: 'Originating support thread' },
    { label: 'Order', module: 'orders', detail: 'Commerce context' },
  ],
  orders: [
    { label: 'Customer', module: 'customers', detail: 'Identity and lifetime context' },
    { label: 'Confirmation', module: 'confirmation', detail: 'Customer decision workflow' },
    { label: 'Shipment', module: 'shipping', detail: 'Routing and delivery state' },
    { label: 'Returns', module: 'returns', detail: 'Post-purchase resolution' },
  ],
  confirmation: [
    { label: 'Order', module: 'orders', detail: 'Canonical order state' },
    { label: 'Customer', module: 'customers', detail: 'Contact and consent context' },
    { label: 'Conversation', module: 'inbox', detail: 'Confirmation contact evidence' },
  ],
  shipping: [
    { label: 'Order', module: 'orders', detail: 'Fulfillment origin' },
    { label: 'Customer', module: 'customers', detail: 'Destination and contact context' },
    { label: 'Support ticket', module: 'tickets', detail: 'Delivery exception escalation' },
  ],
  returns: [
    { label: 'Order', module: 'orders', detail: 'Eligibility and payment context' },
    { label: 'Customer', module: 'customers', detail: 'History and contact context' },
    { label: 'Approval', module: 'approvals', detail: 'Finance-sensitive resolution' },
  ],
  recovery: [
    { label: 'Customer', module: 'customers', detail: 'Consent and purchase history' },
    { label: 'Recovered order', module: 'orders', detail: 'Outcome link and value' },
    { label: 'ROI', module: 'analytics', detail: 'Attributed revenue and cost' },
  ],
  sales: [
    { label: 'Customer', module: 'customers', detail: 'Canonical lead identity' },
    { label: 'Campaign', module: 'campaigns', detail: 'Source and nurture context' },
    { label: 'Revenue analytics', module: 'analytics', detail: 'Pipeline-to-revenue view' },
  ],
  campaigns: [
    { label: 'Audience customers', module: 'customers', detail: 'Consent and segment membership' },
    { label: 'Sales impact', module: 'sales', detail: 'Opportunity attribution' },
    { label: 'Campaign ROI', module: 'analytics', detail: 'Delivery cost and conversion' },
  ],
  automation: [
    { label: 'Workflow runtime', module: 'workflows', detail: 'Durable execution history' },
    { label: 'Tenant configuration', module: 'configuration', detail: 'Published inputs and policy' },
    { label: 'Dry-run simulation', module: 'simulation', detail: 'Pre-publish behavior' },
  ],
  workflows: [
    { label: 'Automation definition', module: 'automation', detail: 'Published workflow source' },
    { label: 'Operations health', module: 'admin', detail: 'Queues, failures, remediation' },
    { label: 'Execution analytics', module: 'analytics', detail: 'Volume, latency, outcomes' },
  ],
  configuration: [
    { label: 'Automation studio', module: 'automation', detail: 'Consumers of published config' },
    { label: 'Simulation', module: 'simulation', detail: 'Draft-vs-published behavior' },
    { label: 'Approval', module: 'approvals', detail: 'Risk-gated publish evidence' },
  ],
  simulation: [
    { label: 'Configuration draft', module: 'configuration', detail: 'Version under simulation' },
    { label: 'Automation plan', module: 'automation', detail: 'Typed action plan' },
    { label: 'AI tools', module: 'ai-tools', detail: 'Planned tool calls' },
  ],
  integrations: [
    { label: 'Operational health', module: 'admin', detail: 'Provider errors and remediation' },
    { label: 'Developer platform', module: 'developer', detail: 'API/webhook extension surface' },
    { label: 'Secret governance', module: 'governance', detail: 'Rotation and retention evidence' },
  ],
  operators: [
    { label: 'Typed tools', module: 'ai-tools', detail: 'Allowed action registry' },
    { label: 'Model routing', module: 'ai-routing', detail: 'Quality/cost/latency policy' },
    { label: 'Knowledge', module: 'knowledge', detail: 'Scoped retrieval sources' },
  ],
  'ai-tools': [
    { label: 'AI operators', module: 'operators', detail: 'Tool allowlists by role' },
    { label: 'Model routing', module: 'ai-routing', detail: 'Execution provider policy' },
    { label: 'Approvals', module: 'approvals', detail: 'High-risk tool evidence' },
  ],
  'ai-routing': [
    { label: 'Operators', module: 'operators', detail: 'Workloads requesting inference' },
    { label: 'AI analytics', module: 'analytics', detail: 'Quality, latency, cost' },
    { label: 'Usage & billing', module: 'billing', detail: 'Allocated model cost' },
  ],
  knowledge: [
    { label: 'AI operators', module: 'operators', detail: 'Consumers and scopes' },
    { label: 'Routing', module: 'ai-routing', detail: 'Embedding/rerank/model boundaries' },
    { label: 'Governance', module: 'governance', detail: 'Retention and access controls' },
  ],
  analytics: [
    { label: 'Sales', module: 'sales', detail: 'Pipeline and realized revenue' },
    { label: 'Campaigns', module: 'campaigns', detail: 'Spend, delivery, attribution' },
    { label: 'Billing', module: 'billing', detail: 'Usage and provider cost' },
  ],
  billing: [
    { label: 'Analytics', module: 'analytics', detail: 'Usage and ROI context' },
    { label: 'Admin', module: 'admin', detail: 'Commercial health and suspension' },
    { label: 'Governance', module: 'governance', detail: 'Invoice/usage retention policy' },
  ],
  developer: [
    { label: 'Integrations', module: 'integrations', detail: 'Provider and webhook connectivity' },
    { label: 'Admin', module: 'admin', detail: 'API key and webhook health' },
    { label: 'Governance', module: 'governance', detail: 'Key rotation and audit' },
  ],
  'custom-data': [
    { label: 'Automation', module: 'automation', detail: 'Custom-record triggers/actions' },
    { label: 'AI tools', module: 'ai-tools', detail: 'Governed custom-data tools' },
    { label: 'Governance', module: 'governance', detail: 'Retention and field permissions' },
  ],
  admin: [
    { label: 'Workflows', module: 'workflows', detail: 'Durable execution health' },
    { label: 'Integrations', module: 'integrations', detail: 'Provider health and dead letters' },
    { label: 'Governance', module: 'governance', detail: 'Retention, deletion, secret lifecycle' },
  ],
  governance: [
    { label: 'Admin control', module: 'admin', detail: 'Safe remediation evidence' },
    { label: 'Billing', module: 'billing', detail: 'Commercial record retention' },
    { label: 'Developer', module: 'developer', detail: 'Keys and webhook lifecycle' },
  ],
  onboarding: [
    { label: 'Organizations', module: 'organizations', detail: 'Tenant workspace boundary' },
    { label: 'Team & roles', module: 'team', detail: 'Initial membership and RBAC' },
    { label: 'Integrations', module: 'integrations', detail: 'First provider connection' },
  ],
  team: [
    { label: 'Organizations', module: 'organizations', detail: 'Membership scope' },
    { label: 'Approvals', module: 'approvals', detail: 'Privileged role changes' },
    { label: 'Settings', module: 'settings', detail: 'Security and organization policy' },
  ],
  approvals: [
    { label: 'Team & roles', module: 'team', detail: 'Privileged identity changes' },
    { label: 'Admin', module: 'admin', detail: 'Risk and remediation evidence' },
    { label: 'Governance', module: 'governance', detail: 'Retention of approval evidence' },
  ],
  settings: [
    { label: 'Onboarding', module: 'onboarding', detail: 'Business profile source' },
    { label: 'Team & roles', module: 'team', detail: 'Security policy context' },
    { label: 'Configuration', module: 'configuration', detail: 'Compiled tenant settings' },
  ],
  organizations: [
    { label: 'Onboarding', module: 'onboarding', detail: 'Workspace setup journey' },
    { label: 'Team & roles', module: 'team', detail: 'Tenant membership context' },
    { label: 'Admin', module: 'admin', detail: 'Tenant health and lifecycle' },
  ],
};

export function ReviewContext({ surface }: { surface: string }) {
  const links = context[surface] ?? [];
  if (links.length === 0) return null;

  return (
    <section className="review-context" aria-labelledby="review-context-title">
      <div className="review-context__heading">
        <div>
          <p className="ds-eyebrow">CROSS-MODULE CONTEXT</p>
          <h2 id="review-context-title">Related operational context</h2>
        </div>
        <span>Preserve context while moving through the platform</span>
      </div>
      <div className="review-context__links">
        {links.map((item) => (
          <Link href={`/review/${item.module}` as Route} key={`${item.module}-${item.label}`}>
            <span>{item.label}</span>
            <strong>{item.detail}</strong>
            <small>Open {item.module.replaceAll('-', ' ')}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
