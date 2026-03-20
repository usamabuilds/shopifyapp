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
