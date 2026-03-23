# Phase 1 compliance/safeguard layer

This document summarizes practical safeguards implemented for the current admin-app foundation.

## What is enforced in product surfaces

### Automations

- Blocks enabling order confirmation when no template key is configured.
- Blocks enabling order status updates when any status mapping template key is missing.
- Blocks enabling cart recovery when no template key is configured.
- Surfaces operator-facing opt-in assumptions for utility vs marketing sends.

### Campaigns

- Blocks schedule/send-now creation when no effective template key is configured (campaign-level key or merchant default).
- Blocks manual-audience schedule/send-now when no valid manual recipients are provided.
- Blocks schedule actions when schedule datetime is missing, invalid, or not in the future.
- Surfaces merchant warning that broadcast recipients must be marketing-opted-in.

### Templates and mapping

- Exposes flow-to-template mapping status including missing key, missing library entry, and category mismatch.
- Surfaces warnings for paused/rejected/unavailable templates and category mismatch assumptions.

### Settings and support tools

- Adds merchant/operator reminders for consent and recipient eligibility assumptions.
- Clarifies current Phase 1 limitation: no per-recipient consent ledger is enforced yet.

## Foundation limits not fully enforceable yet

- No canonical consent model per contact exists in current persistence.
- No live provider template sync/status reconciliation exists yet.
- Placeholder provider adapter means production delivery/compliance verification is out of scope for this phase.

## Operator runbook (Phase 1)

1. Confirm use case category mapping in `docs/PHASE1_MESSAGE_CATEGORY_MAPPING.md`.
2. Verify template key presence and mapping state in Templates + Automations/Campaigns.
3. Resolve warnings/blockers before enabling or queueing sends.
4. Use Support tools to inspect failures and run targeted recovery actions.
