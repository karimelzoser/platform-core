import { ImportForm } from './import-form';
export default function ImportPage() {
  return (
    <main className="customers-page">
      <a className="back-link" href="/customers">
        Back to customers
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1>Import customers</h1>
          <p>Imports run against real tenant authorization and canonical identity checks.</p>
        </div>
      </header>
      <section className="customer-card customer-card-wide">
        <ImportForm />
      </section>
    </main>
  );
}
