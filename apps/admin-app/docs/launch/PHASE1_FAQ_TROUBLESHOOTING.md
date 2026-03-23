# Phase 1 FAQ & Troubleshooting Basics

## FAQ

### 1) Why can’t I enable an automation?
Most often a required template key is missing. In this build:
- Order confirmation requires a template key.
- Cart recovery requires a template key.
- Order status updates require template keys for each tracked status.

### 2) Why can’t I schedule or send a campaign?
Check for one of these blockers:
- No campaign template key (campaign-level or default)
- Manual audience selected with no valid recipients
- Scheduled time is missing or not in the future

### 3) Why does Templates show mismatch warnings?
Template category/use-case alignment is validated. Utility flows and marketing flows should not share the wrong category.

### 4) Why is Analytics sparse or empty?
Analytics reflects current recorded events/messages/campaigns. New shops may show low/no data until events are processed.

### 5) When should I use Support tools actions?
Use support actions only to retry/dispatch existing due work. They are operational recovery utilities, not feature shortcuts.

## Troubleshooting quick checks

1. Confirm app settings were saved in **Settings**.
2. Confirm all required template keys exist in **Templates/Automations**.
3. Confirm campaign defaults are present if campaign-level template key is blank.
4. Review **Support tools** for queue status, retry counts, and failure reasons.
5. Retry only the relevant support action after fixing root cause.

## Common error-to-action map

- **“Cannot enable … without a template key”** → add template key, save settings, retry.
- **“Missing template keys for …”** → fill every missing status template.
- **“Cannot schedule … without a future datetime”** → pick a future date/time.
- **“Cannot schedule manual-audience … without valid recipients”** → add valid recipients list.

## Escalation bundle for internal support

Collect before escalating:

- Shop domain
- Affected area (automation/campaign/workflow)
- Exact error message
- Timestamp (UTC)
- Relevant row from support tables (webhook/outbound/campaign/workflow state)
