# STACK_AND_VENDORS.md

## Product type

Shopify public embedded app for WhatsApp commerce automation.

## Locked technical direction

### Frontend
- TypeScript
- Shopify embedded app frontend
- React Router app shell

### Backend
- TypeScript API
- worker-based async processing
- modular service structure

### Database
- Postgres

### Async processing
- queue plus workers

### Messaging provider
- Meta WhatsApp Cloud API

### Hosting
- frontend on own infrastructure
- backend API on own infrastructure
- workers on own infrastructure

## Repository structure direction

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