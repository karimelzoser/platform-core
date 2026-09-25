import { MergeRequestForm } from './merge-request-form';
export default async function MergeReviewPage({
  params,
}: {
  params: Promise<{ customerId: string; targetCustomerId: string }>;
}) {
  const { customerId, targetCustomerId } = await params;
  if (customerId === targetCustomerId)
    return (
      <main className="customers-page">
        <p className="form-error">Source and target must be different customers.</p>
      </main>
    );
  return (
    <main className="customers-page">
      <a className="back-link" href={`/customers/${customerId}`}>
        Back to source customer
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">HIGH-RISK CUSTOMER MERGE</p>
          <h1>Review canonical customer</h1>
          <p>
            <strong>Source</strong> will become merged and historical. <strong>Target</strong>{' '}
            remains canonical.
          </p>
        </div>
      </header>
      <section className="customer-card customer-card-wide">
        <dl className="detail-list definitions">
          <div>
            <dt>Source</dt>
            <dd>{customerId}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{targetCustomerId}</dd>
          </div>
        </dl>
        <p className="muted">
          Contact points, identities, external identities, addresses, preferences, tags, and
          segments are reconciled only after an independent approval.
        </p>
      </section>
      <MergeRequestForm sourceCustomerId={customerId} targetCustomerId={targetCustomerId} />
    </main>
  );
}
