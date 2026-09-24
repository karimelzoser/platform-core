const capabilities = [
  'Tenant health',
  'Connector health',
  'Workflow state',
  'Webhook failures',
  'Outbox lag',
  'Dead letters',
  'Provider issues',
  'AI usage and spend',
] as const;

export default function ControlCenter() {
  return (
    <main>
      <p className="eyebrow">PLATFORM ADMIN</p>
      <h1>Control center</h1>
      <p className="intro">
        Operational views are populated only with authorized live telemetry. Safe actions require
        explicit policy and audit context.
      </p>
      <ul aria-label="Available operations">
        {capabilities.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </main>
  );
}
