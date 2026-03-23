# Phase 1 QA/Test Foundation

Date: 2026-03-23

## Purpose

Establish a practical QA baseline for existing admin app foundations without introducing new product behavior.

## Artifacts in this phase

- `qa/phase1-scenarios.json` – scenario coverage definitions grouped by feature area.
- `qa/PHASE1_TEST_MATRIX.md` – practical matrix view for feature-level scenario inventory.
- `qa/fixtures/scenario-fixtures.ts` – reusable payload fixtures and fixture lookup helpers for webhook-driven scenarios.
- `qa/scripts/validate-phase1-scenarios.mjs` – matrix consistency gate (required scenario types + evidence files).
- `qa/scripts/run-phase1-validation.mjs` – scenario-level validation run that produces `qa/PHASE1_VALIDATION_RESULTS.md`.
- `qa/PHASE1_VALIDATION_RESULTS.md` – generated validation snapshot for all covered scenarios.

## Coverage matrix summary

| Feature area | Happy path | Edge case | Duplicate suppression | Failure state | Notes |
| --- | --- | --- | --- | --- | --- |
| Onboarding/settings flow | ✅ | ✅ | N/A | ✅ | Focused on readiness + persistence paths. |
| Template library/preview | ✅ | ✅ | N/A | ✅ | Preview + mapping diagnostics covered. |
| Order confirmation | ✅ | ✅ | ✅ | ✅ | Includes eligibility + dispatch outcomes. |
| Order status updates | ✅ | ✅ | ✅ | ✅ | Covers orders + fulfillments topics. |
| Cart recovery | ✅ | ✅ | ✅ | ✅ | Includes due-dispatch behavior and recovery. |
| Broadcast campaigns | ✅ | ✅ | ✅ | ✅ | Audience de-dupe and dispatch controls covered. |
| Workflow builder | ✅ | ✅ | N/A | ✅ | Definition validation and publish gating covered. |
| Analytics views | ✅ | ✅ | N/A | ✅ | Scope fallback and summary safety covered. |
| Support tools / failure visibility | ✅ | ✅ | N/A | ✅ | Snapshot integrity and unsupported actions covered. |

## Scenario execution approach

Given this environment has no live Shopify event stream, no provider credentials, and no seeded runtime DB, scenario validation in Phase 1 is executed through:

1. **Code-path validation** against current route/server flows tied to each scenario.
2. **Fixture readiness checks** for representative webhook payloads and duplicate suppression cases.
3. **Matrix consistency automation** using `node qa/scripts/validate-phase1-scenarios.mjs`.
4. **Scenario-level validation report generation** using `node qa/scripts/run-phase1-validation.mjs`.
5. **Quality gates** via lint + typecheck.

## Known gaps / caveats discovered

1. **No fully automated integration test runner yet** (e.g., Vitest/Playwright) for end-to-end route/action assertions.
   - Impact: Scenario coverage is presently defined + validated by code-path and matrix checks, not full E2E execution.
2. **Outbound provider remains placeholder-driven** in foundational paths.
   - Impact: Real provider delivery, callback reconciliation, and provider-specific failure handling need staging validation.
3. **No deterministic seeded QA dataset script** for analytics/support pages.
   - Impact: Cross-feature KPI snapshots are structurally validated, but not baseline-compared against fixed fixture datasets.
4. **Manual campaign audience sources are large-list bounded in code** (bounded DB fetch limits).
   - Impact: Very large recipient populations require dedicated load/performance validation in Phase 2+.

## Recommended next step (still non-feature work)

- Add a minimal test runner (Vitest) with targeted server-module tests using these fixtures, then optionally add one smoke route-level test per critical flow.
