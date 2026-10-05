# Shipping Routing Model

This document defines the provider-neutral routing model used by the Shipping domain.

## Canonical geography

`shipping.locations` stores the tenant-owned canonical hierarchy used by the platform. The supported levels are `COUNTRY`, `REGION`, `CITY`, and `DISTRICT`. A child must belong to the same tenant and country as its canonical parent.

Aliases may contain local-language or operational spellings, but the canonical name and code remain stable. Carrier-native geography is never written into customer or order addresses.

## Raw and normalized addresses

`shipping.shipments.destination` preserves the raw address captured from the customer or source commerce system.

`shipping.shipments.normalized_destination` stores the canonical interpretation used for routing. The shipment also records:

- address validation state;
- validation confidence;
- validation source;
- resolved country, region, city, and district identifiers;
- resolved shipping zone.

Automatic normalization may produce `MATCHED`, `UNSUPPORTED`, or `MANUAL_REVIEW`. A reviewed override is explicit and auditable instead of silently replacing the original customer address.

## Shipping zones

`shipping.zones` groups canonical geography into operational delivery areas. `shipping.zone_locations` assigns a location to a zone and can include descendant locations.

Zone resolution prefers the most specific matching canonical location and then the highest zone priority.

## Carrier geography mappings

`shipping.carrier_location_mappings` maps a canonical platform location to a carrier-native location code. These mappings are scoped to a carrier account and remain outside CRM, order, and raw shipment address data.

This boundary allows a carrier integration to change its codes without corrupting canonical customer information.

## Service eligibility

`shipping.carrier_service_zone_rules` declares whether a carrier service is allowed or blocked for a shipping zone.

Label creation and pickup requests fail closed when configured zone rules make the selected service ineligible or when a configured service requires a zone that cannot be resolved.

The absence of any zone rules for a service preserves backwards-compatible eligibility until the tenant configures routing restrictions.

## Label lifecycle

A `CREATE_LABEL` provider action derives a `shipping.labels` record. Runtime application code does not receive direct write access to the label table.

The label moves from `PENDING` to `CREATED` or `FAILED` from canonical provider-action completion state. Provider label reference, format, tracking number, tracking URL, and external shipment identifier are stored as derived evidence.

## Delivery attempts and terminal semantics

Normalized tracking events derive delivery-attempt evidence:

- `OUT_FOR_DELIVERY` opens or advances an active attempt;
- `DELIVERY_FAILED` records a failed attempt and failure evidence;
- `DELIVERED` records successful delivery;
- `RETURN_TO_SENDER`, `RETURNED`, and `CANCELLED` close active attempts and persist terminal shipment reason and timestamp.

Tracking events remain append-only to the runtime role. Tests must insert complete event evidence atomically rather than mutating tracking history after insertion.

## Tenant isolation and command boundaries

All routing configuration is tenant-scoped and protected by PostgreSQL RLS plus composite relationship constraints. Cross-tenant location, zone, carrier, service, shipment, and label relationships must fail closed.

Routing configuration and reviewed-address mutations use the normal command-execution boundary for authorization, idempotency, audit, events, and approval requirements. Provider network execution remains post-commit through typed integration provider actions.
