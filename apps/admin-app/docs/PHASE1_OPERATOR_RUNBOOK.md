# Phase 1 Operator Runbook

This runbook is for operator/support responders working in `app/support-tools`.

## Scope covered

- webhook intake
- outbound messaging
- order confirmation
- order status updates
- cart recovery
- campaigns
- workflow runs

## 1) Webhook failures

**Symptoms**
- Support Tools shows webhook rows in `FAILED` / `DEAD_LETTER`.
- `lastError` or `failureReason` includes payload parsing/config reasons.

**Triage**
1. Open **Support tools → Common incident playbooks** and pick the webhook playbook.
2. Open **Support tools → Webhook intake state**.
3. Identify event topic + webhook event id.
3. Confirm reason:
   - `missing_order_id`
   - `missing_checkout_id`
   - template-related status reason
4. Verify corresponding settings in `/app/settings`.

**Recovery**
1. Correct config/data precondition.
2. Re-run the matching support action:
   - **Run due cart recovery dispatch**
   - **Run due campaign dispatch**
3. Confirm webhook/outbound status transitions in Support Tools.

## 2) Queue-style stuck states (webhook queued/processing, outbound retry overdue)

**Symptoms**
- Support Tools **Operational alerts** shows `webhook_queue` or `outbound_retry`.
- Item has not progressed for more than the expected threshold window.

**Triage**
1. Open the queue/retry playbook in Support tools for first checks.
2. Capture affected ids (webhook event id, outbound message id).
3. Check recent logs for structured records by `domain`:
   - `webhook_intake`
   - `outbound`
4. Determine if reason is provider/config/transient.

**Recovery**
1. If retry backlog is provider-related, wait or reduce throughput.
2. If config-related, fix settings/template key first.
3. Trigger relevant support action and verify statuses clear.

## 3) Bad template configuration

**Symptoms**
- Order/cart/status/campaign states with:
  - `SKIPPED_MISSING_TEMPLATE`
  - `missing_order_confirmation_template`
  - `missing_template_for_*`
  - campaign `FAILED` with template/config reason

**Recovery**
1. Update template mapping in `/app/settings`.
2. Re-run dispatch action from Support Tools.
3. Validate new records transition to `QUEUED` then `SENT/FAILED`.

## 4) Failed outbound dispatch

**Symptoms**
- Outbound state `FAILED` or long-lived `RETRY_SCHEDULED`.
- Status reason references provider placeholder/rate limit/service unavailable.

**Recovery**
1. Confirm provider state and credentials.
2. If placeholder adapter reason appears, do not retry repeatedly; escalate as integration gap.
3. If transient/rate-limited, wait for retry window and recheck.
4. Use support actions only after cause is understood.

## 5) Duplicate suppression confusion

**Symptoms**
- Operator expects send but sees `duplicate_suppressed`.

**Expected behavior**
- Phase 1 dedupe intentionally suppresses duplicate webhook/campaign/order status processing.

**Recovery**
1. Confirm whether original event already succeeded/failed.
2. If the original failed for fixable reasons, address root cause first.
3. Avoid forcing repeated sends without consent and root-cause correction.

## 6) Campaign misconfiguration

**Symptoms**
- Campaign remains `SCHEDULED`/`QUEUED`/`IN_PROGRESS` unexpectedly.
- Campaign `FAILED`, recipient failures increase.

**Triage + recovery**
1. Check **Campaign operational state** in Support Tools.
2. Validate:
   - campaign enabled flag
   - template key
   - audience configuration
3. Trigger **Run due campaign dispatch** after correction.
4. Re-check failed recipients + status reason.

## 7) Workflow run failures

**Symptoms**
- Workflow run table shows `FAILED`, with reason.

**Recovery**
1. Open workflow builder and inspect validation issues.
2. Fix invalid blocks/fields.
3. Run preview again; verify run transitions to `SUCCEEDED`.

---

## Escalation notes

- Preserve ids and timestamps from Support Tools when escalating.
- Include structured log lines (JSON) with matching `domain`, `event`, and ids.
- Do not broaden into infra/platform changes during Phase 1 response unless incident severity requires separate escalation.
