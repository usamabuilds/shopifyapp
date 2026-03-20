# Admin App (Shopify Embedded)

This package contains the Shopify embedded admin application for the Phase 1 product.

## Current status

The default Shopify React Router scaffold has been reduced to a clean embedded app shell:

- Shopify auth/session flow remains in place
- Embedded app provider and app navigation remain in place
- Template/demo product and metaobject sample UI has been removed
- Placeholder pages are available for:
  - Overview
  - Templates
  - Automations
  - Campaigns
  - Analytics
  - Settings

## Run locally

```sh
pnpm dev
```

## Build

```sh
pnpm build
```

## Notes

- Keep routes under `app/routes` aligned with app navigation in `app/routes/app.tsx`.
- Preserve the authentication setup in `app/shopify.server.ts` and route loaders using `authenticate.admin(request)`.
- Webhook intake now follows a verify -> persist -> normalize -> enqueue flow through `app/webhooks.shopify-intake.server.ts`.
- Webhook intake persistence models are in `prisma/schema.prisma` (`WebhookEvent` and `WebhookQueueItem`) and are intended for async worker pickup in later phases.
