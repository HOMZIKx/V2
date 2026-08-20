# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field | Value |
| ----- | ----- |
| **CURRENT_STAGE** | 1 ? P4.5 (IN PROGRESS) |
| **CURRENT_TASK** | `V2-CONTINUOUS-CORE-FOUNDATION-EXECUTION-001` |
| **FINAL_STATUS** | `IN_PROGRESS_P4_5_IMPLEMENTATION` |
| **CURRENT_HEAD** | tip after fan-out/consumer commit (see PR #19) |
| **PR** | #19 |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9` |
| **P4_5_PLAN_CHECKPOINT_SHA** | `8834559e38f5d55160eb5de8510420651b26b829` |
| **P4_5_FINAL_CHECKPOINT_SHA** | pending (do not treat WIP as final) |
| **OPEN_CRITICAL** | 0 |
| **OPEN_HIGH** | 0 |
| **BANNER_STATUS** | OWNER_ASSET_REQUIRED |
| **ACTION_EMOJI_STATUS** | OWNER_ASSET_UPLOAD_REQUIRED |

## Issue #26

OWNER AMENDMENT continuous execution (2026-08-20) + #27 profile/interests folded into Stages 3/4.
ChatGPT audits async. Cursor does not wait between stages.

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- P4.5 final (pending)

## Stage 1 delivered (additive)

| Area | Content |
| ---- | ------- |
| Schema | migrations 005-009 |
| Messaging | `@v2/messaging` + activity outbox Rabbit publisher |
| Auth | multi-guild publish org sensitive permission |
| Domain | publication targets persist; projection fan-out; SEPARATE RSVP/capacity |
| Discord | RMQ consumer + shared delivery service; guild allowlist |
| Docs | Zeabur owner vars for RMQ / allowlist |

## Still required for P4_5_FINAL_CHECKPOINT_SHA

- Failure-matrix + multi-guild isolation security tests (full matrix)
- Minimal Admin mode/targets UX
- Full validate + green CI on final tip
- Zeabur RabbitMQ + runtime proof (`dual`/`rabbitmq`)

## Gates

NO MERGE / NO Stage 8+ / additive only / continue Stage 1 without waiting for ChatGPT
