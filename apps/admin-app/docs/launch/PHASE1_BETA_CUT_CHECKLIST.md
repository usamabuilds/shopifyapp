# Phase 1 Beta-Cut Checklist (Final V1 Must-Haves)

> Purpose: freeze a practical, foundation-accurate Phase 1 beta build and confirm launch blockers are handled before controlled rollout.

## Release identity

- Release tag/build ID:
- Planned beta start date:
- Release owner:
- Incident commander (during launch window):

## 1) Scope lock (must stay true)

- [ ] No new product features added after beta-cut decision.
- [ ] Existing app foundations remain intact (auth/session, embedded shell, current routes/navigation, webhook intake + queue persistence, support tools).
- [ ] Current limitations are documented without over-claiming future capabilities.
- [ ] Any open defects are explicitly triaged into either `blocker-now` or `known-issue-acceptable`.

## 2) Functional must-haves (current app reality)

- [ ] Merchant can install/open embedded app and reach Dashboard.
- [ ] Settings page loads and save path works for currently supported configuration.
- [ ] Support tools page loads and operators can run intended recovery checks/actions.
- [ ] Templates, Automations, Workflows, Campaigns, and Analytics routes render without crashing.
- [ ] Webhook endpoints receive and process expected Phase 1 topics through intake pipeline.
- [ ] Shop foundation bootstrap (`ensureShopFoundation`) runs successfully for target stores.

## 3) Operational readiness (must be usable day 1)

- [ ] On-call owner + backup assigned for beta launch window.
- [ ] Support response collateral is available and shared with support/ops team.
- [ ] Runbook and hardening docs are linked in launch channel.
- [ ] Escalation path defined (who can hotfix, who communicates to beta cohort, expected SLA by severity).

## 4) Quality & risk gate

- [ ] High-severity defects = 0 open at cut time.
- [ ] Medium-severity defects have workaround + owner.
- [ ] Known issues are documented with user impact and temporary guidance.
- [ ] Data safety checks completed for expected beta usage patterns.

## 5) Evidence pack (attach before sign-off)

- [ ] Commit SHA / deploy reference:
- [ ] QA artifact reference:
- [ ] This checklist completion date + approver:
- [ ] Go/No-Go review document link:
- [ ] Cohort tracker link:
- [ ] Launch monitoring log link:

## 6) Cut decision

- Decision: `GO` / `NO-GO`
- Date/time (UTC):
- Decision notes:
- If NO-GO: explicit blockers + next review date:
