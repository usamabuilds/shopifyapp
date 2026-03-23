# Phase 1 Hardening / Observability / Recovery Summary

## Purpose

This document summarizes practical Phase 1 hardening work focused on operational safety and diagnosability without changing product behavior.

## What was added

### 1) Structured operational logging

Added shared operational logger (`app/observability.server.ts`) and wired it into:
- webhook intake lifecycle (accepted, duplicate, processed, failed)
- outbound messaging lifecycle (queued, dispatch failure classification, callback unresolved)
- order confirmation processing outcomes
- order status update processing outcomes
- cart recovery dispatch + attribution outcomes
- campaign dispatcher exceptions and batch loading visibility
- workflow publish validation blocks + preview run outcomes
- support-tools manual recovery actions
- outbound dispatch start/success and callback receive/reconcile lifecycle events
- explicit skip-state logging for order confirmation, order status updates, and cart recovery

The logs are JSON records with consistent keys:
- `domain`, `event`, `shopDomain`, `webhookEventId`, `entityId`, `reason`, `metadata`, `ts`

### 2) Support-tools operational visibility expansion

Support tools now include:
- **Operational alerts** for common stuck/failure hotspots:
  - webhook queue items stalled in queued/processing states
  - outbound retries overdue beyond retry window
  - failed campaigns
  - failed workflow runs
- **Campaign operational state** table
- **Workflow run operational state** table
- runbook pointers for responder workflow

### 3) Recovery guidance + runbooks

Added explicit Phase 1 runbook:
- `docs/PHASE1_OPERATOR_RUNBOOK.md`
- `docs/PHASE1_HARDENING_CHECKLIST.md`

Covers:
- webhook failures
- queue/retry stuck states
- bad template config
- outbound dispatch failures
- duplicate suppression confusion
- campaign misconfiguration
- workflow run failures
- operator-first hardening checklist for continued Phase 1 maintenance

## Non-goals preserved

- No infrastructure redesign.
- No heavy monitoring platform introduced.
- No deployment/hosting platform expansion.
- No new merchant/product features added.

## How operators should use this

1. Start in `/app/support-tools`.
2. Check **Operational alerts** first for active hotspots.
3. Use **Recent failures and next actions** + runbook guidance.
4. Trigger only scoped recovery actions after fixing root cause.
5. Confirm state transitions in webhook/outbound/campaign/workflow sections.
