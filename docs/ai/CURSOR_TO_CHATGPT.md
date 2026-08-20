# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                             | Value                                         |
| --------------------------------- | --------------------------------------------- |
| **CURRENT_STAGE**                 | 2 ? P4.6 (IN PROGRESS)                        |
| **CURRENT_TASK**                  | `V2-CONTINUOUS-CORE-FOUNDATION-EXECUTION-001` |
| **FINAL_STATUS**                  | `IN_PROGRESS_P4_6_IMPLEMENTATION`             |
| **CURRENT_HEAD**                  | `b4c182b` (tip; after P4.6 domain foundation) |
| **PR**                            | #19                                           |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9`    |
| **P4_5_PLAN_CHECKPOINT_SHA**      | `8834559e38f5d55160eb5de8510420651b26b829`    |
| **P4_5_FINAL_CHECKPOINT_SHA**     | `e3c694fcc3980cd309843cac2c42c346083c8cb1`    |
| **P4_6_FINAL_CHECKPOINT_SHA**     | pending                                       |
| **OPEN_CRITICAL**                 | 0                                             |
| **OPEN_HIGH**                     | 0                                             |
| **BANNER_STATUS**                 | OWNER_ASSET_REQUIRED                          |
| **ACTION_EMOJI_STATUS**           | OWNER_ASSET_UPLOAD_REQUIRED                   |

## Issue #26

OWNER AMENDMENT continuous execution (2026-08-20). ChatGPT audits async.

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- P4.5 final @ `e3c694fcc3980cd309843cac2c42c346083c8cb1`

## P4.5 checkpoint (immutable)

`READY_FOR_CHATGPT_P4_5_ASYNC_AUDIT` @ `e3c694fcc3980cd309843cac2c42c346083c8cb1`  
Green CI. HTTP outbox default. Zeabur RMQ dual live proof: `BLOCKED_EXTERNAL`.

## P4.6 progress

- Scope lock: `docs/ai/P4_6_SCOPE_LOCK.md` (Issue #21 G8 voice OUT OF SCOPE)
- Migration `010_p46_series_privacy_attendance.sql`
- Domain: series expansion, private invite hashing, 24h attendance window + unit tests

Next: wire use-cases/API/Admin/Discord/WWW vertical for series + private + attendance + stats.
