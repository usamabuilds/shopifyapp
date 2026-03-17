# Shopify WhatsApp App

Shopify public embedded app for WhatsApp commerce automation.

## Phase 1

This repository is for Phase 1 only.

### In scope
- Shopify app install
- WhatsApp order confirmation
- Order status updates
- Abandoned cart recovery
- Broadcast campaigns
- Basic workflow builder
- Simple analytics
- Shopify variables and template mapping

## Product goal

Help Shopify merchants automate high-value WhatsApp flows from inside Shopify:
- confirm orders
- send post-purchase updates
- recover abandoned carts
- run promotional broadcasts
- measure message-driven outcomes

## Repository purpose

This repo is structured for a Codex-first workflow.

The first objective is to create a stable source of truth for:
- product
- scope
- architecture
- delivery rules
- starter structure

Codex should build from these docs, not invent product direction.

## Key docs

- `AGENT.md` - hard rules for Codex
- `PROJECT_DOC.md` - master technical and product context
- `PRODUCT_BRIEF.md` - buyer, pain, and value proposition
- `MVP_SCOPE.md` - exact Phase 1 scope contract
- `STACK_AND_VENDORS.md` - locked stack and account plan
- `DELIVERY_RULES.md` - execution and change rules
- `.env.example` - environment variable template

## Planned repository structure

```text
shopify-whatsapp-app/
├─ apps/
│  ├─ admin-app/
│  └─ api/
├─ packages/
│  ├─ shared-types/
│  ├─ shopify-client/
│  ├─ whatsapp-client/
│  ├─ template-engine/
│  ├─ automation-engine/
│  └─ analytics-core/
├─ infra/
│  ├─ env/
│  └─ deploy/
├─ docs/
│  ├─ product/
│  ├─ architecture/
│  ├─ integrations/
│  ├─ qa/
│  └─ runbooks/
└─ scripts/