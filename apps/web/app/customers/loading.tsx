export default function CustomersLoading() {
  return (
    <main className="customers-page" aria-busy="true" aria-label="Loading customers">
      <div className="customer-skeleton heading" />
      <div className="customer-skeleton search" />
      <div className="customer-skeleton table" />
    </main>
  );
}
