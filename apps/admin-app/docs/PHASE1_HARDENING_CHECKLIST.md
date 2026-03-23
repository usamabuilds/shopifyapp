# Phase 1 Hardening Checklist (Admin App)

Practical checklist for ongoing operational safety in the current Phase 1 foundations.

## 1) Intake and queue safety

- Verify every Shopify webhook route uses `processShopifyWebhookIntake` and marks final status (`processed`/`failed`).
- Confirm duplicate intake events are suppressed through dedupe keys.
- Confirm webhook failures include a persisted reason (`failureReason` / queue `lastError`).

## 2) Outbound dispatch diagnosability

- Confirm outbound lifecycle logs are present for:
  - queue
  - dispatch start
  - dispatch success
  - retry scheduled / terminal failure
  - callback received / callback reconciled
- Confirm each outbound record has retry counters and reason fields for operator interpretation.

## 3) Automation state clarity

For order confirmation, order status updates, and cart recovery:

- Ensure skip reasons are explicit and stored (disabled, missing recipient, missing template, not eligible).
- Ensure processed outcomes are visible (`SENT`, `FAILED`, skip states).
- Ensure dedupe behavior is documented for support responders.

## 4) Campaign and workflow visibility

- Campaigns: status + status reason + recipient rollups are visible in support tools.
- Workflows: failed/pending/running runs are visible with failure reason.
- Dispatcher exceptions are logged with campaign/workflow context ids.

## 5) Support-tool operator UX

- Operational alerts are surfaced for stuck webhook states, overdue retries, failed campaigns, and failed workflows.
- Common incident playbooks are visible directly in the support page.
- Manual recovery actions remain scoped to existing Phase 1 dispatchers only.

## 6) Runbook readiness

Keep these docs current as the Phase 1 implementation evolves:

- `docs/PHASE1_HARDENING_OBSERVABILITY_RECOVERY.md`
- `docs/PHASE1_OPERATOR_RUNBOOK.md`
- this checklist (`docs/PHASE1_HARDENING_CHECKLIST.md`)

## Non-goal reminder

This checklist intentionally avoids infrastructure redesign and heavy monitoring platforms.
