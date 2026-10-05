# Module Catalog

This is the complete product scope. Modules may be implemented in dependency
order, but the release candidate requires all release-critical modules and the
cross-cutting platform capabilities below.

Domain ownership follows `PLATFORM_EXECUTION_BLUEPRINT.md` and ADR 0004. Later
modules reference canonical earlier domains rather than creating competing
sources of truth.

## Cross-cutting platform capabilities

These apply to every module where relevant and are not optional late hardening:

- typed domain commands and runtime validation;
- tenant-qualified schema/relationships and PostgreSQL RLS;
- authentication, membership, RBAC, OPA and approval policy;
- idempotency, immutable audit and transactional outbox;
- versioned domain events with correlation/causation;
- Temporal hooks for long-running processes;
- provider actions through typed post-commit connectors;
- structured logs, correlation IDs, trace/metric hooks;
- canonical usage/cost records for metered operations;
- analytics/ROI instrumentation;
- shared design-system components;
- English LTR, Arabic RTL, responsive and accessible states;
- two-tenant, authorization, contract and E2E evidence as applicable.

## 1. Identity / Organization

Existing foundation:

- users;
- organizations;
- memberships;
- permissions;
- tenant roles and assignments.

Build/close:

- organization onboarding shell;
- invitations / accept / revoke;
- organization selector;
- user profile;
- locale/timezone;
- business settings/profile ownership;
- custom-role editor;
- system-role display;
- suspension/member lifecycle;
- Keycloak/MFA integration boundary;
- approval visibility and security E2E.

## 2. CRM / Customer 360

Canonical owner of customer/contact identity.

Existing DB foundation:

- customers;
- contact points;
- canonical identity keys;
- external identities;
- addresses;
- communication preferences;
- tags;
- segments;
- merge history.

Build/close:

- identity resolution service;
- duplicate candidate detection;
- merge workflow;
- customer timeline;
- consent/suppression;
- import/export;
- search;
- bulk tagging;
- segment evaluation.

Sales, campaigns, recovery, tickets, messaging and AI reference CRM identity
rather than creating separate authoritative contact records.

## 3. Integrations / Connector Platform

Entities:

- connector definitions;
- tenant connections;
- secret references;
- provider accounts/assets;
- webhook registrations;
- inbound webhook deliveries;
- sync jobs/cursors;
- reconciliation jobs;
- provider errors;
- connection health;
- typed provider actions/results.

Behavior:

- connect/disconnect;
- OAuth/auth flows where applicable;
- credential refresh/rotation;
- provider asset discovery;
- webhook lifecycle;
- backfill;
- incremental sync;
- reconciliation;
- provider error normalization;
- rate-limit handling;
- health;
- uninstall/disconnect semantics;
- production secret backend behind opaque references.

Production launch adapters include, as applicable:

- Shopify;
- WooCommerce;
- WhatsApp Cloud API;
- Instagram Messaging;
- Messenger Platform;
- Email;
- Web Chat / generic API ingress;
- launch shipping carriers;
- payment providers;
- generic REST/webhook.

Development fixtures/emulators are contract-test infrastructure only and never
count as production provider adapters.

## 4. Messaging / Unified Inbox

Canonical owner of conversations and outbound message execution.

Entities:

- channel accounts;
- conversations;
- participants;
- messages;
- message parts/media;
- provider mappings;
- delivery statuses;
- assignment;
- conversation mode;
- handover;
- saved replies/templates.

Modes:

- AI;
- COPILOT;
- HUMAN;
- PAUSED.

Channels:

- WhatsApp;
- Instagram;
- Messenger;
- Email;
- Web Chat;
- API.

Campaigns, recovery, AI and automation request outbound messaging through this
module rather than implementing parallel provider-send logic.

## 5. Tickets / SLA

- tickets;
- categories;
- priorities/statuses;
- assignment;
- customer/conversation links;
- comments/tasks;
- SLA policy/clocks/breaches;
- pause/resume;
- escalation;
- reporting events.

## 6. Commerce

Canonical owner of commerce state:

- stores;
- products/variants;
- inventory locations/levels;
- orders/order lines;
- discounts/taxes;
- payments;
- fulfillments;
- provider mappings;
- order timeline.

Operations:

- confirmation;
- duplicate detection/review;
- modification;
- cancellation;
- manual confirmation;
- readiness for shipping;
- provider synchronization evidence.

Shipping, returns, refunds and recovery reference canonical Commerce rather than
provider-native order records.

## 7. Shipping

- countries/regions/governorates/cities/districts or equivalent canonical
  location hierarchy;
- raw and normalized addresses;
- address validation state/confidence;
- carriers and carrier connections;
- zones;
- carrier/service eligibility;
- carrier location mappings;
- shipments and shipment lines;
- packages;
- labels/provider references;
- tracking events;
- delivery attempts/failure reasons;
- delivery rescue;
- return-to-sender terminal handling where required.

Provider-native location IDs remain in provider mapping records rather than
canonical customer/order addresses.

## 8. Returns / Exchanges / Refunds

Keep return, exchange and refund as related but distinct aggregates/processes.

- return requests/lines;
- eligibility;
- evidence/media references;
- inspection;
- resolution;
- exchange records/lines;
- refund request and execution state;
- payment/provider reference;
- restocking decision;
- financial approval/audit;
- provider/payment execution;
- Temporal workflows and UI.

A refund may exist without a physical return; a return may resolve without a
refund.

## 9. Recovery

Commercial revenue recovery, distinct from Shipping Delivery Rescue.

- recovery opportunity;
- abandoned cart/checkout/order or failed-commercial-state context;
- eligibility;
- suppression;
- attempts;
- outbound message requests through Messaging;
- offers/coupon/code references;
- expiry;
- recovered order/conversion;
- attribution method/confidence/value;
- recovered revenue and cost instrumentation.

## 10. Sales

Sales-specific state references canonical CRM identity.

- leads;
- sources;
- qualification;
- score;
- assignment/owner;
- pipelines/stages;
- opportunities;
- activity/notes/tasks;
- next action;
- expected value;
- probability;
- expected close;
- conversion;
- structured AI/operator signals.

Do not duplicate canonical phone/email/name/address ownership from CRM.

## 11. Campaigns

- campaigns/channels;
- audiences;
- immutable/frozen audience snapshots per run;
- deterministic recipient snapshots/identity;
- consent/suppression decisions;
- template/creative reference;
- scheduling/timezones;
- batches/sends;
- delivery/read/failure state;
- retries without duplicate successful sends;
- usage/provider cost;
- conversion/attribution;
- approval controls;
- durable Temporal execution.

## 12. Automation Studio

- definitions/versions;
- draft/published state;
- typed triggers;
- typed conditions/branching;
- waits/timers;
- typed canonical action graph;
- approval nodes;
- runs/node executions;
- retries/cancellation;
- audit/events/usage;
- Temporal-backed durability;
- operational UI.

Do not build a general untrusted code-execution platform. No arbitrary SQL,
unrestricted HTTP, JavaScript, Python or shell execution.

## 13. Self-Service Configuration / Compiler

Basic onboarding captures durable business profile data. The compiler turns
approved inputs into versioned declarative platform configuration.

Inputs may include:

- country/currency/timezone/languages;
- industry and business type;
- B2B/B2C;
- commerce model;
- order/support volume bands;
- objectives;
- integration selections;
- business policies;
- approved templates/vertical blueprints.

Configuration bundle may include:

- business profile references;
- policy set;
- integration settings;
- automation blueprints;
- AI operator profiles/modes;
- notification rules;
- plan/limit references;
- dashboard presets.

Lifecycle:

- compile;
- validate;
- diff/impact preview;
- simulation;
- approval where required;
- idempotent publish/apply;
- version history;
- rollback or forward correction.

The compiler generates configuration, not arbitrary executable source code.

## 14. Configuration Simulation

- synthetic events/records;
- non-mutating policy evaluation;
- automation traversal;
- proposed AI tool actions;
- proposed provider intents;
- approval requirements;
- expected resulting state;
- warnings;
- trace/explanation;
- estimated cost where known;
- no production provider call;
- no canonical production-state mutation.

## 15. AI Gateway / Tool Platform / Operators

### AI Gateway

- provider adapters;
- model catalog/capabilities;
- deterministic/rules tier;
- local/small adapter boundary;
- economical/strong routing;
- embeddings/reranker boundaries;
- fallback/human escalation;
- model requests;
- latency/usage/cost telemetry.

### Typed tool registry

- stable ID/version;
- description/purpose;
- input/output schemas;
- required permission;
- risk;
- approval policy;
- idempotency;
- timeout/retry;
- data sensitivity;
- allowed actors/operator modes;
- audit and usage fields;
- execution only through canonical domain commands.

### Operators

- Customer Support;
- Sales Assistant;
- Lead Qualification;
- Order;
- Confirmation;
- Recovery;
- Shipping;
- Returns;
- Campaign Assistant;
- Moderator.

Modes:

- OFF;
- COPILOT;
- APPROVAL;
- AUTONOMOUS.

Mode never bypasses risk policy or approval.

## 16. Policy / Approvals

- approval requests;
- action digest;
- decisions;
- expiration/cancellation;
- execution/failure link;
- risk overrides where explicitly permitted;
- tenant policy settings;
- OPA integration;
- approval inbox;
- approval observability.

## 17. Knowledge / RAG

- knowledge bases;
- sources;
- document versions;
- chunks;
- embeddings;
- ingestion runs;
- freshness;
- access scope;
- tenant filtering;
- optional reranking;
- citations/source metadata;
- pgvector retrieval initially.

## 18. AI Evaluation

- datasets/cases;
- results and thresholds;
- prompt/model/operator versions;
- support accuracy;
- English/Arabic/Egyptian/Gulf quality;
- classification/tool selection;
- escalation;
- policy compliance;
- hallucination;
- order/refund safety;
- prompt injection;
- PII/sensitive-data handling;
- wrong tenant/resource;
- unauthorized tool attempts;
- retrieval quality;
- latency and cost regression.

Autonomous operator rollout is blocked by required evaluation thresholds.

## 19. Custom Data

Spreadsheet-like tenant data:

- tables;
- typed fields;
- records;
- validation;
- row/field/operation permissions;
- imports/exports;
- indexes;
- API/UI actions;
- automation triggers/actions;
- safe AI tools;
- events and RLS.

No arbitrary SQL and no unmanaged per-tenant schema generation.

## 20. Analytics / ROI

Event-driven aggregates/materialized reporting for:

- business/executive;
- support;
- sales;
- commerce;
- shipping;
- returns;
- recovery;
- campaigns;
- automation;
- AI;
- operations;
- provider cost;
- ROI.

ROI examples:

- recovered revenue;
- saved orders;
- duplicate prevention;
- delivery failures rescued;
- conversion;
- campaign-attributed revenue;
- automated workload;
- AI cost;
- provider cost;
- automation outcome/cost.

Use PostgreSQL aggregates initially. Add a separate analytics store only after
measured need and an ADR.

## 21. Billing / Metering

Metering starts when metered features are implemented; commercial billing closes
later.

- canonical usage meter/record taxonomy;
- plans;
- subscriptions;
- entitlements;
- quotas;
- billing periods;
- usage aggregation;
- provider cost allocation;
- overages;
- invoice/reference;
- limits;
- trial;
- suspension hooks.

Keep payment-provider execution abstract until provider decision/implementation.

## 22. Developer Platform

- hashed API keys;
- scopes;
- expiration;
- rotation/revocation;
- rate limits;
- outbound webhook subscriptions from canonical events;
- signing secrets;
- delivery attempts;
- retries/dead letters;
- delivery logs;
- API docs/UI;
- audit.

## 23. Platform Admin Control Center

- tenant lookup/health;
- connector/sync health;
- workflow health;
- webhook failures;
- outbox lag/stuck records;
- dead letters;
- AI usage/spend;
- usage/billing state;
- storage/operational health;
- safe audited remediation commands;
- scoped privileged support access.

Do not implement unrestricted super-admin database mutation as the operational
control plane.

## 24. Data Governance

- retention policies;
- raw webhook retention;
- audit/evidence retention;
- AI trace retention;
- media cleanup;
- consent history;
- customer/tenant export;
- deletion/anonymization workflows;
- tenant suspension/deletion;
- secret rotation governance;
- backup/restore data handling expectations.

## 25. Shared Product UI / Design System

Cross-cutting rather than an isolated business module:

- design tokens;
- typography/spacing/density/radius/elevation;
- semantic status/color roles;
- Button/Input/Select/FormField;
- tables/grids/filter bars;
- dialogs/drawers;
- status/badges/metrics;
- timelines/activity feeds;
- loading/empty/error/forbidden states;
- approval/high-risk action surfaces;
- responsive navigation;
- charts/report shells;
- direction-aware primitives;
- English LTR and Arabic RTL;
- practical WCAG 2.2 AA behavior.
