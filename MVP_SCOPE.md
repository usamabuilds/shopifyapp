# MVP_SCOPE.md

## Scope status

Locked.

This file is the source of truth for Phase 1 scope.

## Phase 1 in scope

### 1. Shopify install
- embedded Shopify app setup
- merchant auth
- merchant session
- app shell

### 2. Merchant onboarding
- setup checklist
- readiness states
- connection and template prerequisites
- persisted merchant settings

### 3. WhatsApp connection support
- provider setup state
- template sync support
- template mapping support

### 4. Order confirmation
- trigger on eligible new orders
- configurable enable/disable
- template mapping
- status visibility
- retry/failure visibility

### 5. Order status updates
- mapped statuses
- template-per-status setup
- duplicate suppression
- message history visibility

### 6. Abandoned cart recovery
- checkout signal intake
- configurable delay
- suppression rules
- attribution to recovered orders/revenue

### 7. Broadcast campaigns
- audience selection
- template selection
- preview
- scheduling
- batching
- campaign result visibility

### 8. Basic workflow builder
- trigger
- delay
- condition
- send message
- end
- publish/pause/draft states

### 9. Simple analytics
- sent/delivered/failed visibility
- confirmation visibility
- recovery visibility
- campaign results
- template performance
- simple attribution assumptions

### 10. Settings and supportability
- merchant settings
- mapping controls
- feature toggles
- internal replay/rerun/trace tools

## Phase 1 explicitly out of scope

- robocall / IVR
- shared inbox
- chatbot builder
- CRM
- email/SMS/other channels
- advanced no-code workflow platform
- advanced AI features
- deep custom enterprise integrations
- large template marketplace
- full customer service platform behavior

## Release blockers

These are blockers for beta:
- install/auth broken
- onboarding cannot reach ready state
- template mapping unusable
- order confirmation unreliable
- status updates unreliable
- cart recovery broken
- campaign sending broken
- analytics numbers clearly untrustworthy
- no support visibility into failures

## Nice-to-haves, not blockers

- extra UI polish
- richer charts
- more audience types
- more workflow conditions
- more comparison analytics
- deeper template-preview options

## Scope protection rules

If a new request appears:
- classify it as V1, V1.1, or V2
- do not silently absorb it into V1
- prefer deferral over bloat

## Acceptance criteria by feature

### Shopify install
Merchant can install and access embedded app successfully.

### Onboarding
Merchant can complete setup in a clear sequence and reach a ready state.

### Templates
Merchant can sync, inspect, map, and preview templates.

### Order confirmation
Eligible orders trigger mapped confirmation message with status visibility.

### Order status updates
Mapped statuses send once correctly and appear in history.

### Abandoned cart recovery
Eligible abandoned checkouts trigger delayed recovery and recovered revenue is tracked.

### Broadcast campaigns
Merchant can create, preview, schedule, and review campaigns.

### Workflow builder
Merchant can configure simple flows using supported block types only.

### Analytics
Merchant can understand what was sent and what commercial result was influenced.

### Settings/support
Merchant can configure the product safely and support tooling can diagnose common failures.

## Final rule

Phase 1 must ship as a focused product, not as a broad platform.