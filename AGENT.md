# AGENT.md

## Role

You are working inside the repository for a Shopify public embedded app focused on WhatsApp commerce automation.

Your job is to implement only what fits the locked Phase 1 scope.

Do not invent product direction.
Do not broaden scope.
Do not add V2 features unless explicitly instructed.

## Hard scope rule

This repository is Phase 1 only.

### Allowed
- Shopify install and embedded app shell
- merchant onboarding
- WhatsApp connection setup
- template sync and mapping
- order confirmation
- order status updates
- abandoned cart recovery
- broadcast campaigns
- basic workflow builder
- simple analytics
- settings and support tooling
- QA, hardening, and launch support

### Not allowed
- robocall / IVR
- shared inbox
- chatbot builder
- CRM
- non-Shopify channels
- advanced workflow platform
- AI feature sprawl
- broad marketing site work unless explicitly requested

## Architecture guardrails

Preserve this direction unless explicitly changed:
- Shopify public embedded app
- TypeScript-first
- frontend app in `apps/admin-app`
- backend API and workers in `apps/api`
- shared logic in `packages/*`
- async processing for webhook-driven flows
- provider integrations through isolated adapters
- clean module boundaries

## Module boundaries

Backend modules are expected to remain separated:
- auth
- shops
- onboarding
- webhooks
- messaging
- templates
- orders
- checkouts
- campaigns
- automations
- analytics
- settings
- support-tools
- common

Do not create random cross-cutting folders that blur responsibilities.

## Change rules

Before making changes:
1. read `README.md`
2. read `PROJECT_DOC.md`
3. read `MVP_SCOPE.md`
4. read `STACK_AND_VENDORS.md`
5. read `DELIVERY_RULES.md`

When making changes:
- prefer the smallest correct change
- do not rename major structures without instruction
- do not refactor working code just to make it look cleaner
- do not introduce unnecessary abstractions
- do not add dependencies casually
- do not silently change architecture

After making changes:
- update docs if architecture, flows, contracts, or assumptions changed
- keep naming consistent
- keep code placement consistent with repo structure

## Product truth rules

If a task conflicts with Phase 1 scope:
- do not implement the broader version
- implement the scoped version only
- or leave a clearly labeled note in docs if human input is required

If a request sounds like V2:
- do not merge it into V1 by default

## Data and flow rules

Prefer this system pattern:
1. inbound event arrives
2. verify it
3. persist it
4. normalize it
5. enqueue work
6. process async
7. log outcomes
8. update analytics/state

Do not do heavy business logic directly inside webhook intake handlers.

## Template and messaging rules

- template category must match use case
- variable resolution must be explicit
- failed or unresolved variables must not be hidden
- merchant-facing status visibility must exist for key sends
- duplicate suppression must be considered for event-driven messaging

## Documentation rules

If you change any of these, update docs:
- module structure
- event model
- entity model
- environment variables
- onboarding flow
- messaging lifecycle
- analytics definitions
- launch assumptions

## Output style for implementation work

When adding code:
- keep code practical
- keep naming boring and clear
- keep interfaces explicit
- keep comments minimal and useful
- prefer maintainability over cleverness

## Final instruction

Build this repo like a focused Phase 1 product, not like a giant platform.