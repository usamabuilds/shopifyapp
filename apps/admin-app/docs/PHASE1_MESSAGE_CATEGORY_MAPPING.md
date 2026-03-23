# Phase 1 message category and use-case mapping

This artifact defines the **explicit category assumptions** used by the current Phase 1 foundations.

| Use case | Category assumption | Current foundation surface | Opt-in / eligibility assumption surfaced in app |
| --- | --- | --- | --- |
| `order_confirmation` | `UTILITY` | Automations: Order confirmation | Recipient phone is present, event is an eligible order state, and merchant has customer messaging consent before enabling. |
| `order_status_update` | `UTILITY` | Automations: Order status updates | Recipient phone is present and merchant has transactional messaging eligibility for status updates. |
| `cart_recovery` | `MARKETING` | Automations: Cart recovery | Merchant only sends to customers with valid marketing opt-in for recovery messages. |
| `broadcast` | `MARKETING` | Campaigns: Broadcast campaigns | Merchant only targets opted-in contacts for campaign sends and avoids manual recipient imports without consent. |

## Template mapping assumptions

- Utility use cases should map to utility templates.
- Marketing use cases should map to marketing templates.
- Missing template keys or missing template-library matches are treated as unsafe states and should block/skip sends.
- Category mismatches are surfaced as warnings and should be remediated before publishing/queueing.

## Explicit limitations (Phase 1)

- The app does **not** yet enforce per-recipient legal consent records in storage.
- The app does **not** yet sync live provider template metadata; local template-library records are used for guardrails.
- Operators must validate recipient eligibility and approved template state in provider systems until deeper integrations are added.
