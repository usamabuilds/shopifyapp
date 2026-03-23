# Phase 1 Reviewer & Tester Notes

> Purpose: concise notes for app review/beta testers to verify existing flows quickly.

## 1) What exists in this build

Primary navigation areas:

- Dashboard
- Settings
- Support tools
- Templates
- Automations
- Workflows
- Campaigns
- Analytics

## 2) Quick verification flow (happy path)

1. **Install/open app** and confirm embedded navigation loads.
2. Open **Settings** and save merchant profile defaults.
3. Open **Templates** and verify mapping status table renders.
4. Open **Automations**:
   - Save order confirmation with template key.
   - Save order status templates per status.
   - Save cart recovery settings.
5. Open **Campaigns**:
   - Create draft campaign.
   - Schedule campaign with future datetime.
6. Open **Workflows**:
   - Create draft workflow.
   - Run preview execution.
   - Publish or pause.
7. Open **Support tools** and verify operational tables render (or empty-state banners).
8. Open **Analytics** and verify summary/section rendering.

## 3) Intentional guardrails reviewers should see

- Enabling order confirmation without template key is blocked.
- Enabling order status updates without all status template keys is blocked.
- Enabling cart recovery without template key is blocked.
- Scheduling campaigns without template key, recipients (manual mode), or future datetime is blocked.

## 4) Expected data-state behavior

- Fresh shops may show many empty-state banners.
- Dashboard/support/analytics should still render with no runtime error when data is empty.
- Support tools may show no alerts/failures if no activity exists yet.

## 5) Current Phase 1 limitations to acknowledge in review

- Consent is not programmatically enforced per recipient contact yet.
- Templates view uses a local sample library for mapping/reference behavior in this foundation state.
- Recovery actions in support tools are scoped to existing dispatch foundations, not new behaviors.

## 6) Suggested reviewer notes format

When filing review notes, use:

- Area: (Settings/Templates/Automations/...)
- Steps performed
- Observed result
- Expected result
- Blocking or non-blocking
- Any error message text
