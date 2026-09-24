# UI / UX Requirements

## General

Professional operational SaaS UI, not a generic generated dashboard.

Use a shared design system.

## Languages

Mandatory:

- English LTR
- Arabic RTL

RTL testing includes navigation, breadcrumbs, icons, drawers, tables, pagination, charts, forms, phone/address rendering, message bubbles, and timelines.

## Accessibility

Target practical WCAG 2.2 AA behavior:

- keyboard navigation
- focus visibility
- semantic labels
- contrast
- form errors
- accessible dialogs
- reduced motion
- announced async status where needed

## Responsive

Desktop, laptop, tablet, mobile.

Operational grids should prioritize columns rather than squeeze all content.

## Major surfaces

- onboarding/setup
- dashboard
- unified inbox
- customer 360
- tickets
- orders
- confirmation
- shipping
- recovery
- returns/refunds
- sales
- campaigns
- automation studio
- AI operators
- approvals
- integrations
- knowledge
- analytics
- billing
- developer settings
- team/roles
- organization settings
- admin control center

## Inbox

Needs conversation list, filters, assignment, unread, SLA/ticket context, customer panel, order context, AI suggestions, conversation mode, composer, templates, media, and provider status.

## Customer 360

Timeline joins conversations, tickets, orders, shipments, returns, recovery, sales, campaigns, notes, and relevant AI/automation activity.

## High-risk actions

Show exact resource, consequence, approval requirement, provider side effect, progress, and result evidence.

## States

Every screen has loading, empty, forbidden, recoverable-error, and unrecoverable-error states with request/correlation ID where useful.

## Frontend boundary

- no provider secrets
- no direct provider API calls
- no frontend-only security rule
- API is authoritative
- typed API/contracts
