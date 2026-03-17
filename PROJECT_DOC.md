# PROJECT_DOC.md

## Project name

Shopify WhatsApp App

## Project type

Shopify public embedded app for WhatsApp commerce automation.

## Product summary

This product helps Shopify merchants automate important WhatsApp flows directly from Shopify data and merchant-controlled templates.

Phase 1 focuses on practical commerce operations:
- order confirmation
- order status updates
- abandoned cart recovery
- promotional broadcasts
- basic workflow automation
- simple analytics

## Why this product exists

Many Shopify merchants, especially those using WhatsApp heavily, need a practical way to:
- reduce manual messaging
- improve post-purchase communication
- recover abandoned carts
- run outbound promotional campaigns
- control templates and messaging logic from a central app

This product is not intended to be a broad CRM or chatbot suite in Phase 1.

## Target user

### Primary
Shopify merchant using WhatsApp as a meaningful customer communication channel.

### Secondary
Store operator or growth/operations person managing order communication and campaigns.

## Core Phase 1 capabilities

1. Shopify install and embedded admin
2. Merchant onboarding
3. WhatsApp provider connection
4. Template sync and template mapping
5. Order confirmation automation
6. Order status update automation
7. Abandoned cart recovery automation
8. Broadcast campaign creation and scheduling
9. Basic workflow builder
10. Simple analytics and attribution
11. Settings and support tooling

## Non-goals

Phase 1 does not include:
- robocall / IVR
- shared team inbox
- chatbot builder
- CRM
- non-Shopify channels
- advanced workflow engine
- broad AI feature set

## System overview

### High-level flow

1. Merchant installs app in Shopify
2. Merchant completes onboarding
3. Merchant connects WhatsApp setup
4. Templates are synced and mapped
5. Shopify events enter the system
6. Events are verified and persisted
7. Events are normalized
8. Work is queued for async processing
9. Workers execute messaging logic
10. Provider callbacks update delivery state
11. Merchant sees logs, status, and analytics in the app

## Core architectural pattern

### Inbound
- Shopify webhooks
- Meta/WhatsApp callbacks

### Processing
- verify
- persist raw event
- normalize
- dedupe
- enqueue

### Execution
- evaluate eligibility
- resolve variables
- choose template
- send message
- store message outcome
- update analytics and status

## Primary modules

### `auth`
Shopify auth, merchant session, embedded access control.

### `shops`
Shop identity, merchant-level state, install metadata.

### `onboarding`
Setup progress, readiness flags, onboarding checklist logic.

### `webhooks`
Inbound event verification, persistence, normalization, queue handoff.

### `messaging`
Outbound send logic, provider adapter, callback reconciliation, retry logic.

### `templates`
Template sync, template metadata, mapping, preview support, variable safety.

### `orders`
Order-level automations and status-linked messaging.

### `checkouts`
Checkout records, abandoned cart logic, recovery scheduling and attribution.

### `campaigns`
Broadcast campaign creation, scheduling, batching, audience selection.

### `automations`
Basic workflow builder and execution model.

### `analytics`
Metrics, attribution, summary calculations, merchant analytics views.

### `settings`
Merchant configuration, feature toggles, validations, audit trail.

### `support-tools`
Replay, rerun, message traces, diagnostic utilities.

## Suggested repo structure

```text
apps/
  admin-app/
  api/

packages/
  shared-types/
  shopify-client/
  whatsapp-client/
  template-engine/
  automation-engine/
  analytics-core/

infra/
docs/
scripts/