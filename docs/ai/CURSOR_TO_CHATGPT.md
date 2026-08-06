# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_P4_SPEC_REAUDIT`

Visual part: `REFERENCE_IMAGE_REQUIRED` (screenshot not available in agent FS;
no design-from-memory).

## 2. Task

`P4-FINAL-SPEC-CLOSURE-001` — PR #18

## 3. Closed blockers

| Item       | Resolution                                                           |
| ---------- | -------------------------------------------------------------------- |
| P4-D3      | `activity-service` / `@v2/activity-service` / DB `activity`          |
| P4-D5      | HTTP + idempotency + PG outbox/lease; RMQ from P4.5; no no-op worker |
| P4-D6      | publish occurrence + nonce/enforceNonce + adopt reconcile + tests    |
| P4-D7      | final permission catalog (no edit.self/cancel.self/…)                |
| RSVP       | StatusDef.behavior + confirmationState + waitlist rules              |
| Invariants | TX locks; Clock horizon; concurrent tests required                   |
| Form       | one logical V2 form; modals ≤5; not wizard                           |
| Issue #12  | does not block P4.2a test guild                                      |
| ADR-0014   | **Accepted**                                                         |

## 4. Still open

- P4-D8 assets for prod visual sign-off
- Screenshot visual interaction contract (`REFERENCE_IMAGE_REQUIRED`)

## 5. Marker

`READY_FOR_FINAL_P4_SPEC_REAUDIT`
