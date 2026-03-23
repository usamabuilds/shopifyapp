# Phase 1 Support Response Collateral (Current App)

## 1) Suggested response macros

### Macro A — Missing template key blocker

Thanks for the details. The current Phase 1 app requires valid template keys before certain flows can be enabled/sent.

Please check:
1. **Templates** and **Automations** for missing keys.
2. Category alignment (utility vs marketing) for the affected flow.
3. Save settings, then retry.

If it still fails, share the exact error text and timestamp so we can trace it in **Support tools**.

### Macro B — Campaign schedule/send blocked

This usually happens when one of these is missing:
- campaign/default template key,
- manual recipients (for manual audience), or
- a future schedule time.

Please update the campaign and try again. If blocked again, send us the campaign name and the exact message shown in-app.

### Macro C — No data visible yet

For new installations, analytics/support tables can appear empty until webhook and outbound activity is recorded.

After running a test flow, refresh **Support tools** and **Analytics** to confirm new records.

### Macro D — Retry guidance

After fixing the root cause (template key/settings), you can run the relevant recovery action in **Support tools** to process due work.

Use only the action tied to the affected area to avoid unnecessary dispatch attempts.

## 2) Triage script (support operator)

1. Capture shop + incident summary.
2. Validate relevant settings/templates in app.
3. Open **Support tools** and inspect:
   - Operational alerts
   - Webhook intake state
   - Outbound message state
   - Recent failures and next actions
4. Confirm whether incident is config issue vs processing issue.
5. Recommend minimal corrective action.
6. Re-check status after merchant confirms fix.

## 3) Escalation handoff template

- Shop domain:
- Incident start time (UTC):
- Affected feature area:
- User-facing error text:
- Related entity id(s) (campaign/order/checkout/workflow):
- Support tools findings:
- Steps already attempted:
- Current status:

## 4) Internal references

- `docs/PHASE1_HARDENING_OBSERVABILITY_RECOVERY.md`
- `docs/PHASE1_OPERATOR_RUNBOOK.md`
- `docs/PHASE1_COMPLIANCE_SAFEGUARDS.md`
