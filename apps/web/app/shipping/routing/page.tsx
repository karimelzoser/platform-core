import Link from 'next/link';
import { cookies } from 'next/headers';
import './routing.css';

export const dynamic = 'force-dynamic';

interface LocationItem {
  id: string;
  parentId: string | null;
  level: 'COUNTRY' | 'REGION' | 'CITY' | 'DISTRICT';
  countryCode: string;
  code: string;
  name: string;
  aliases: unknown;
  status: string;
}

interface ZoneItem {
  id: string;
  code: string;
  name: string;
  priority: number;
  status: string;
}

interface ZoneLocationItem {
  zone_id?: string;
  zone_code?: string;
  zone_name?: string;
  location_id?: string;
  location_level?: string;
  location_code?: string;
  location_name?: string;
  include_descendants?: boolean;
}

interface CarrierMappingItem {
  id?: string;
  carrier_account_id?: string;
  carrier_name?: string;
  location_id?: string;
  location_level?: string;
  location_name?: string;
  external_code?: string;
  external_name?: string | null;
  state?: string;
}

interface ServiceZoneRuleItem {
  carrier_account_id?: string;
  carrier_name?: string;
  carrier_service_id?: string;
  service_name?: string;
  zone_id?: string;
  zone_name?: string;
  eligibility?: string;
}

interface RoutingCatalog {
  locations: LocationItem[];
  zones: ZoneItem[];
  zoneLocations: ZoneLocationItem[];
  carrierMappings: CarrierMappingItem[];
  serviceZoneRules: ServiceZoneRuleItem[];
}

type LoadResult =
  | { kind: 'success'; catalog: RoutingCatalog }
  | { kind: 'error'; detail: string };

export default async function ShippingRoutingPage() {
  const result = await loadRoutingCatalog();

  return (
    <main className="customers-page shipping-routing-page">
      <header className="customer-profile-header shipping-routing-header">
        <div>
          <p className="eyebrow">SHIPPING / ROUTING</p>
          <h1>Routing intelligence</h1>
          <p dir="auto">
            Canonical geography, normalized customer addresses, shipping zones, carrier-native
            mappings, and service eligibility remain separated so provider changes never corrupt
            customer or order data.
          </p>
        </div>
        <Link className="shipping-routing-back" href="/shipping">
          Back to shipments
        </Link>
      </header>

      {result.kind === 'success' ? (
        <RoutingWorkspace catalog={result.catalog} />
      ) : (
        <section className="state-panel customer-state">
          <h2>Routing configuration unavailable</h2>
          <p>{result.detail}</p>
        </section>
      )}
    </main>
  );
}

function RoutingWorkspace({ catalog }: { catalog: RoutingCatalog }) {
  const activeLocations = catalog.locations.filter((item) => item.status === 'ACTIVE');
  const activeZones = catalog.zones.filter((item) => item.status === 'ACTIVE');
  const allowedRules = catalog.serviceZoneRules.filter(
    (item) => item.eligibility === 'ALLOWED',
  ).length;
  const blockedRules = catalog.serviceZoneRules.filter(
    (item) => item.eligibility === 'BLOCKED',
  ).length;

  return (
    <>
      <section className="shipping-routing-summary" aria-label="Routing intelligence summary">
        <RoutingMetric label="Canonical locations" value={String(activeLocations.length)} />
        <RoutingMetric label="Active zones" value={String(activeZones.length)} />
        <RoutingMetric label="Carrier mappings" value={String(catalog.carrierMappings.length)} />
        <RoutingMetric
          label="Service rules"
          value={`${String(allowedRules)} allowed / ${String(blockedRules)} blocked`}
        />
      </section>

      <section className="shipping-routing-grid">
        <article className="shipping-routing-card shipping-routing-card-wide">
          <div className="shipping-routing-card-heading">
            <div>
              <p className="eyebrow">CANONICAL GEOGRAPHY</p>
              <h2>Location hierarchy</h2>
            </div>
            <span className="shipping-routing-count">{catalog.locations.length}</span>
          </div>
          {catalog.locations.length ? (
            <div className="shipping-routing-table" role="table" aria-label="Canonical locations">
              <div className="shipping-routing-row shipping-routing-row-head" role="row">
                <span role="columnheader">Level</span>
                <span role="columnheader">Canonical location</span>
                <span role="columnheader">Code</span>
                <span role="columnheader">Parent</span>
              </div>
              {catalog.locations.map((location) => (
                <div className="shipping-routing-row" key={location.id} role="row">
                  <span data-label="Level">
                    <RoutingStatus value={location.level} />
                  </span>
                  <span data-label="Canonical location">
                    <strong>{location.name}</strong>
                    <small dir="ltr">{location.countryCode}</small>
                  </span>
                  <span data-label="Code" dir="ltr">
                    {location.code}
                  </span>
                  <span data-label="Parent" dir="ltr">
                    {location.parentId ?? 'Root'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No canonical locations have been configured for this tenant." />
          )}
        </article>

        <article className="shipping-routing-card">
          <div className="shipping-routing-card-heading">
            <div>
              <p className="eyebrow">ZONES</p>
              <h2>Shipping zones</h2>
            </div>
            <span className="shipping-routing-count">{catalog.zones.length}</span>
          </div>
          {catalog.zones.length ? (
            <div className="shipping-routing-stack">
              {catalog.zones.map((zone) => (
                <div className="shipping-routing-stack-row" key={zone.id}>
                  <div>
                    <strong>{zone.name}</strong>
                    <small dir="ltr">{zone.code}</small>
                  </div>
                  <div className="shipping-routing-stack-meta">
                    <RoutingStatus value={zone.status} />
                    <span>Priority {zone.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No delivery zones have been defined." />
          )}
        </article>

        <article className="shipping-routing-card">
          <div className="shipping-routing-card-heading">
            <div>
              <p className="eyebrow">ZONE MEMBERSHIP</p>
              <h2>Coverage rules</h2>
            </div>
            <span className="shipping-routing-count">{catalog.zoneLocations.length}</span>
          </div>
          {catalog.zoneLocations.length ? (
            <div className="shipping-routing-stack">
              {catalog.zoneLocations.map((membership, index) => (
                <div
                  className="shipping-routing-stack-row"
                  key={`${membership.zone_id ?? 'zone'}:${membership.location_id ?? String(index)}`}
                >
                  <div>
                    <strong>{membership.zone_name ?? membership.zone_code ?? 'Zone'}</strong>
                    <small>
                      {membership.location_level ?? 'LOCATION'} ·{' '}
                      {membership.location_name ?? membership.location_code ?? 'Unknown'}
                    </small>
                  </div>
                  <RoutingStatus
                    value={membership.include_descendants ? 'DESCENDANTS' : 'EXACT'}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No canonical locations are assigned to shipping zones." />
          )}
        </article>

        <article className="shipping-routing-card shipping-routing-card-wide">
          <div className="shipping-routing-card-heading">
            <div>
              <p className="eyebrow">CARRIER ADAPTER BOUNDARY</p>
              <h2>Carrier location mappings</h2>
            </div>
            <span className="shipping-routing-count">{catalog.carrierMappings.length}</span>
          </div>
          {catalog.carrierMappings.length ? (
            <div className="shipping-routing-table" role="table" aria-label="Carrier mappings">
              <div className="shipping-routing-row shipping-routing-row-head" role="row">
                <span role="columnheader">Carrier</span>
                <span role="columnheader">Canonical location</span>
                <span role="columnheader">Provider code</span>
                <span role="columnheader">State</span>
              </div>
              {catalog.carrierMappings.map((mapping, index) => (
                <div className="shipping-routing-row" key={mapping.id ?? String(index)} role="row">
                  <span data-label="Carrier">
                    <strong>{mapping.carrier_name ?? 'Carrier'}</strong>
                  </span>
                  <span data-label="Canonical location">
                    <strong>{mapping.location_name ?? 'Location'}</strong>
                    <small>{mapping.location_level ?? 'LOCATION'}</small>
                  </span>
                  <span data-label="Provider code" dir="ltr">
                    {mapping.external_code ?? '—'}
                  </span>
                  <span data-label="State">
                    <RoutingStatus value={mapping.state ?? 'UNKNOWN'} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No provider-specific geography mappings exist yet." />
          )}
        </article>

        <article className="shipping-routing-card shipping-routing-card-wide">
          <div className="shipping-routing-card-heading">
            <div>
              <p className="eyebrow">SERVICE ELIGIBILITY</p>
              <h2>Carrier service-zone policy</h2>
            </div>
            <span className="shipping-routing-count">{catalog.serviceZoneRules.length}</span>
          </div>
          {catalog.serviceZoneRules.length ? (
            <div className="shipping-routing-table" role="table" aria-label="Service eligibility">
              <div className="shipping-routing-row shipping-routing-row-head" role="row">
                <span role="columnheader">Carrier</span>
                <span role="columnheader">Service</span>
                <span role="columnheader">Zone</span>
                <span role="columnheader">Eligibility</span>
              </div>
              {catalog.serviceZoneRules.map((rule, index) => (
                <div
                  className="shipping-routing-row"
                  key={`${rule.carrier_service_id ?? 'service'}:${rule.zone_id ?? String(index)}`}
                  role="row"
                >
                  <span data-label="Carrier">{rule.carrier_name ?? 'Carrier'}</span>
                  <span data-label="Service">
                    <strong>{rule.service_name ?? 'Service'}</strong>
                  </span>
                  <span data-label="Zone">{rule.zone_name ?? 'Zone'}</span>
                  <span data-label="Eligibility">
                    <RoutingStatus value={rule.eligibility ?? 'UNKNOWN'} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No carrier service eligibility rules have been configured." />
          )}
        </article>
      </section>
    </>
  );
}

function RoutingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="shipping-routing-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function RoutingStatus({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return <span className={`shipping-routing-status shipping-routing-status-${normalized}`}>{value}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="shipping-routing-empty">{text}</p>;
}

async function loadRoutingCatalog(): Promise<LoadResult> {
  const session = await sessionHeaders();
  if (!session) return { kind: 'error', detail: 'Sign in and select an organization.' };

  try {
    const response = await fetch(new URL('/v1/shipping/routing/catalog', session.baseUrl), {
      headers: session.headers,
      cache: 'no-store',
    });
    if (!response.ok) {
      return { kind: 'error', detail: 'Routing intelligence request failed.' };
    }
    const payload = (await response.json()) as Partial<RoutingCatalog>;
    return {
      kind: 'success',
      catalog: {
        locations: Array.isArray(payload.locations) ? payload.locations : [],
        zones: Array.isArray(payload.zones) ? payload.zones : [],
        zoneLocations: Array.isArray(payload.zoneLocations) ? payload.zoneLocations : [],
        carrierMappings: Array.isArray(payload.carrierMappings) ? payload.carrierMappings : [],
        serviceZoneRules: Array.isArray(payload.serviceZoneRules) ? payload.serviceZoneRules : [],
      },
    };
  } catch {
    return { kind: 'error', detail: 'Routing intelligence API is unavailable.' };
  }
}

async function sessionHeaders(): Promise<
  { baseUrl: string; headers: Record<string, string> } | undefined
> {
  const store = await cookies();
  const token = store.get('platform_access_token')?.value;
  const tenantId = store.get('platform_tenant_id')?.value;
  const baseUrl = process.env.API_INTERNAL_URL;
  if (!token || !tenantId || !baseUrl) return undefined;
  return {
    baseUrl,
    headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
  };
}
