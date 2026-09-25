import type { Metadata } from 'next';
import { CustomerForm } from './customer-form';

export const metadata: Metadata = { title: 'Create customer | Platform' };

export default function NewCustomerPage() {
  return (
    <main className="customers-page" aria-labelledby="create-customer-title">
      <a className="back-link" href="/customers">
        Back to customers
      </a>
      <header className="customer-profile-header">
        <div>
          <p className="eyebrow">CUSTOMER 360</p>
          <h1 id="create-customer-title">Create customer</h1>
          <p>Record an authorized customer profile using live platform services.</p>
        </div>
      </header>
      <CustomerForm />
    </main>
  );
}
