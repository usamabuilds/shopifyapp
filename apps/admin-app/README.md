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
- Operational hardening and runbooks for Phase 1 are documented in:
  - `docs/PHASE1_HARDENING_OBSERVABILITY_RECOVERY.md`
  - `docs/PHASE1_OPERATOR_RUNBOOK.md`
  - `docs/PHASE1_HARDENING_CHECKLIST.md`

## Phase 1 launch/listing/support collateral

Practical launch assets for listing/review/onboarding/support (foundation-accurate, no feature expansion) are in:

- `docs/launch/PHASE1_LISTING_COPY_DRAFT.md`
- `docs/launch/PHASE1_REVIEWER_TESTER_NOTES.md`
- `docs/launch/PHASE1_FIRST_RUN_ONBOARDING_HELP.md`
- `docs/launch/PHASE1_FAQ_TROUBLESHOOTING.md`
- `docs/launch/PHASE1_INTERNAL_LAUNCH_CHECKLIST.md`
- `docs/launch/PHASE1_SUPPORT_RESPONSE_COLLATERAL.md`

## Phase 1 beta-cut / launch prep package

For final beta-cut readiness, controlled launch operation, feedback capture, and Phase 1.1 backlog prep, use:

- `docs/launch/PHASE1_BETA_CUT_CHECKLIST.md`
- `docs/launch/PHASE1_BETA_GO_NO_GO_REVIEW.md`
- `docs/launch/PHASE1_BETA_COHORT_ONBOARDING_TRACKER.md`
- `docs/launch/PHASE1_LAUNCH_MONITORING_FEEDBACK_LOG.md`
- `docs/launch/PHASE1_POST_LAUNCH_REVIEW_TEMPLATE.md`
- `docs/launch/PHASE1_1_BACKLOG_STRUCTURE.md`
