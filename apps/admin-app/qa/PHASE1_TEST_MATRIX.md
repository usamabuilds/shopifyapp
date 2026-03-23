# Phase 1 Test Matrix

Date: 2026-03-23

This matrix is the practical scenario inventory for Phase 1 coverage across existing admin-app features.

| Feature area | Scenario IDs |
| --- | --- |
| onboarding/settings flow | ONB-HP-001, ONB-ED-002, ONB-FL-003 |
| template library/preview | TPL-HP-001, TPL-ED-002, TPL-FL-003 |
| order confirmation | OC-HP-001, OC-ED-002, OC-DP-003, OC-FL-004 |
| order status updates | OSU-HP-001, OSU-ED-002, OSU-DP-003, OSU-FL-004 |
| cart recovery | CR-HP-001, CR-ED-002, CR-DP-003, CR-FL-004 |
| broadcast campaigns | BC-HP-001, BC-ED-002, BC-DP-003, BC-FL-004 |
| workflow builder | WF-HP-001, WF-ED-002, WF-FL-003 |
| analytics views | AN-HP-001, AN-ED-002, AN-FL-003 |
| support tools / failure visibility | SUP-HP-001, SUP-ED-002, SUP-FL-003 |

## Coverage requirements by scenario type

- Happy path: required for all feature areas.
- Edge case: required for all feature areas.
- Duplicate suppression: required for order confirmation, order status updates, cart recovery, and broadcast campaigns.
- Failure state: required for all feature areas.

## Execution commands

- `node qa/scripts/validate-phase1-scenarios.mjs`
- `node qa/scripts/run-phase1-validation.mjs`
