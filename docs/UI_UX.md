# UI / UX Requirements

## General

Build a professional operational SaaS interface, not a generic generated
dashboard and not a set of unrelated module-specific pages.

Use a shared design system from the beginning of remaining implementation. The
later full-product UX gate verifies consistency and completeness; it is not the
first time RTL, accessibility, responsive behavior, loading/error states, or
shared components are considered.

The frontend never owns authoritative business rules, authorization, provider
secrets, or provider network execution.

## Shared design system

Create and reuse direction-aware primitives for at least:

- typography, spacing, density, radius, elevation and semantic state tokens;
- application shell/navigation;
- Button / IconButton;
- Input / Textarea / Select / Combobox / Date/Time / FormField;
- Table / operational DataGrid;
- FilterBar / search / saved view shell where useful;
- Card / Metric / Status / Badge;
- Tabs / breadcrumbs;
- Dialog / Drawer / Sheet;
- Timeline / ActivityFeed;
- Approval/high-risk action panel;
- EmptyState / LoadingState / ErrorState / ForbiddenState;
- Toast/notification/progress state;
- pagination/infinite-loading pattern;
- chart/reporting shell;
- responsive master-detail/list-detail pattern;
- message/composer/media primitives where reusable.

Do not create page-local substitutes for a shared primitive without a measured
reason.

## Languages and direction

Mandatory:

- English LTR;
- Arabic RTL.

RTL is a first-class layout mode, not a final CSS flip. Test:

- navigation;
- breadcrumbs;
- directional icons;
- drawers/dialogs;
- tables and responsive column priority;
- pagination;
- charts/legends/tooltips;
- forms and validation;
- phone/address rendering;
- message bubbles/composer;
- timelines/activity feeds;
- filters/date/time;
- high-risk action summaries.

Text that has natural direction such as phone numbers, IDs, URLs and code-like
values must remain readable inside RTL layouts.

## Accessibility

Target practical WCAG 2.2 AA behavior:

- keyboard navigation;
- logical tab order;
- focus visibility;
- semantic labels/landmarks;
- contrast;
- form errors and descriptions;
- accessible dialogs/drawers;
- reduced-motion behavior;
- announced async status where needed;
- screen-reader names for icon-only controls;
- touch-target sizing on mobile;
- charts supplemented by accessible values/summary where meaningful.

Automated scans are necessary but do not replace keyboard/manual critical-flow
checks.

## Responsive behavior

Support:

- desktop;
- laptop;
- tablet;
- mobile.

Operational grids prioritize the most important columns/actions instead of
squeezing every desktop column onto a small screen. Use explicit responsive
column priority or list/detail alternatives.

Dense operational workflows should remain efficient on desktop without making
mobile unusable.

## Navigation model

The final information architecture should group capabilities by user job rather
than expose a flat module catalog. A target grouping is:

```text
OPERATE
  Dashboard
  Inbox
  Customers
  Orders
  Shipping
  Returns
  Recovery
  Tickets

GROW
  Sales
  Campaigns

AUTOMATE
  Automations
  AI Operators
  Knowledge

ANALYZE
  Analytics

PLATFORM
  Integrations
  Custom Data
  Approvals
  Developer

SETTINGS
  Team
  Billing
  Organization
```

Exact labels may evolve through product review, but major workflows should remain
predictable and role/permission-aware.

## Major surfaces

- onboarding/setup;
- business profile;
- configuration compiler/diff;
- configuration simulation/publish;
- dashboard;
- unified inbox;
- Customer 360;
- tickets/SLA;
- orders/confirmation;
- shipping;
- returns/refunds;
- recovery;
- sales;
- campaigns;
- Automation Studio;
- AI operators;
- approvals;
- integrations;
- knowledge;
- custom data;
- analytics/ROI;
- billing/usage;
- developer settings;
- team/roles;
- organization settings;
- admin control center.

## Self-service onboarding and configuration UX

Basic onboarding and configuration compilation are separate user experiences.

### Basic onboarding

Guide a new organization through:

- business identity/profile;
- country/currency/timezone/language;
- industry/business model;
- primary goals;
- initial team;
- first integration.

The user should be able to enter the product even before advanced automation/AI
configuration is published.

### Configuration compiler

Show:

- selected business policies and templates;
- proposed integrations/settings;
- generated automation/operator configuration;
- validation warnings/errors;
- changes versus current version;
- approval requirements;
- version/publish state.

### Simulation

Before publish, let the user run representative/synthetic scenarios and inspect:

- input event/data;
- conditions/decisions;
- expected automation path;
- proposed AI/tool/provider actions;
- approval stops;
- expected state transitions;
- estimated provider/AI cost where available;
- warnings/errors.

Simulation must be visibly non-production and cannot silently send provider
messages or mutate canonical production state.

## Inbox

Needs:

- conversation list/search/filters;
- assignment/unread state;
- SLA/ticket context;
- customer panel;
- order/shipping/recovery context;
- AI suggestions and operator mode;
- handover/human control;
- composer;
- templates/saved replies;
- media;
- provider delivery/status evidence;
- clear failed/retry state.

## Customer 360

Timeline joins relevant activity from:

- conversations;
- tickets;
- orders;
- shipments;
- returns/refunds;
- recovery;
- sales;
- campaigns;
- notes/tasks;
- automation;
- AI tool/activity evidence where useful.

CRM remains the canonical identity; timeline views do not copy domain state into a
second source of truth.

## Operational lists

Orders, shipping, returns, recovery, sales, campaigns, tickets and customers need
consistent patterns for:

- search/filter/sort;
- saved or repeatable views where justified;
- status and ownership;
- bulk action only when safe;
- row selection semantics;
- pagination/cursor state;
- deep links to canonical detail pages;
- responsive priority;
- no horizontal overflow as an acceptance goal for key viewport classes.

## High-risk actions

For destructive, financial, provider-affecting, privileged or AI-autonomous
actions, show:

- exact resource;
- consequence;
- relevant before/after values;
- approval requirement/status;
- provider side effect/intended action;
- progress;
- final result/evidence;
- correlation/request reference when useful.

Do not present a provider call as successful before committed canonical evidence
confirms the result.

## AI UX

Clearly distinguish:

- suggestion;
- planned tool action;
- approval waiting;
- executing;
- succeeded;
- failed/escalated;
- human handover.

Show operator mode and why a user must approve when policy requires it. Do not
imply autonomous authority beyond the configured tool/risk policy.

## Analytics / cost UX

Where available, expose metric provenance and time range clearly. Distinguish:

- revenue/outcome;
- attributed/recovered revenue;
- provider cost;
- AI cost;
- automation volume;
- estimated versus finalized cost.

Avoid decorative charts that do not help an operational decision.

## States

Every screen/major panel has intentional:

- initial loading;
- incremental loading;
- empty;
- no-results/filter-empty;
- forbidden;
- recoverable error;
- unrecoverable error;
- offline/provider-degraded state where meaningful;
- pending/async execution state;
- request/correlation ID where useful for support.

## Frontend boundary

- no provider secrets;
- no direct provider API calls;
- no frontend-only security rule;
- API is authoritative;
- typed API/contracts;
- frontend optimistic state cannot fabricate a completed provider/business action;
- permissions may hide/disable UI affordances for usability, but server-side
  authorization/RLS remains mandatory.

## Full-product UX acceptance

The later UX closure gate verifies all required surfaces together for:

- consistent navigation/layout/design tokens;
- English LTR and Arabic RTL;
- desktop/laptop/tablet/mobile;
- keyboard operation;
- practical WCAG 2.2 AA;
- no unexpected critical-flow console errors;
- complete loading/empty/error/forbidden states;
- no generic placeholder pages for release-critical modules;
- coherent high-risk/approval/provider/AI state presentation.
