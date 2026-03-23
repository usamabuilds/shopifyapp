# Phase 1.1 Backlog Structure (Post-Beta)

> Group incoming work from beta evidence only. Avoid speculative feature expansion until Phase 1 scope is stable.

## Triage rules

1. Every item must link to evidence (feedback ID, issue, incident, or monitoring log row).
2. Every item must have a severity/impact and owning function.
3. Use one primary bucket only; avoid duplicates across buckets.
4. If an item introduces net-new feature scope, mark `out-of-scope` and defer to future product planning.

## Backlog buckets

## A) Bugfixes (correctness/reliability)

Use for defects where current behavior is broken or inconsistent with documented Phase 1 behavior.

| Item ID | Problem statement | Evidence link | User impact | Severity | Owner | Target sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BF-01 |  |  |  |  |  |  |  |

## B) UX polish (clarity/friction reduction)

Use for improvements that reduce operator/merchant confusion without introducing new product capabilities.

| Item ID | Friction point | Evidence link | Affected flow/page | Expected benefit | Owner | Target sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 |  |  |  |  |  |  |  |

## C) Adoption improvements (activation/supportability)

Use for onboarding/help/support changes that improve successful adoption of existing features.

| Item ID | Adoption blocker | Evidence link | Proposed adjustment (no new feature) | Success signal | Owner | Target sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AD-01 |  |  |  |  |  |  |  |

## D) Scale-readiness (operational robustness)

Use for reliability/operability improvements needed before larger rollout (alerting, runbooks, performance safety, process hardening).

| Item ID | Scale risk | Evidence link | Mitigation | Rollout risk reduced | Owner | Target sprint | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SR-01 |  |  |  |  |  |  |  |

## Prioritization overlay (apply to all buckets)

- Priority 0: launch blocker or critical reliability issue.
- Priority 1: high merchant impact or recurring support burden.
- Priority 2: meaningful friction; not launch-blocking.
- Priority 3: low-impact cleanup.

## Phase 1.1 planning checklist

- [ ] Top items in each bucket are evidence-linked.
- [ ] Owners and target sprint are assigned.
- [ ] Out-of-scope items are explicitly separated.
- [ ] Plan is reviewed by Product + Engineering + Support/Ops.
