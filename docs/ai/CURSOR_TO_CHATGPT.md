# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                             | Value                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **CURRENT_STAGE**                 | 1 ? P4.5 (IN PROGRESS)                                                          |
| **CURRENT_TASK**                  | `V2-CONTINUOUS-CORE-FOUNDATION-EXECUTION-001` / `P4.5-MULTI-GUILD-RABBITMQ-001` |
| **FINAL_STATUS**                  | `IN_PROGRESS_P4_5_IMPLEMENTATION`                                               |
| **CURRENT_BRANCH**                | `cursor/p4-1-activity-domain`                                                   |
| **PR**                            | #19                                                                             |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9`                                      |
| **P4_5_PLAN_CHECKPOINT_SHA**      | `8834559e38f5d55160eb5de8510420651b26b829`                                      |
| **P4_5_FINAL_CHECKPOINT_SHA**     | pending                                                                         |
| **OPEN_CRITICAL**                 | 0                                                                               |
| **OPEN_HIGH**                     | 0                                                                               |
| **BANNER_STATUS**                 | OWNER_ASSET_REQUIRED                                                            |
| **ACTION_EMOJI_STATUS**           | OWNER_ASSET_UPLOAD_REQUIRED                                                     |

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- P4.5 final (pending)

## Stage 1 progress (this push)

Delivered so far (additive WIP, not final checkpoint):

- Migrations `005`?`009` (participant_mode, publication_targets, multi projections, participation scope, outbox transport meta)
- Package `@v2/messaging` (topology constants, envelope zod, AMQP helpers, declare topology)
- Domain `participant-mode` + ActivityRecord `participantMode` / ParticipationRecord `scopeGuildId` / projection `id`
- Repository mapping + insert/upsert updates for P4.5 columns
- Issue #26 continuous-execution amendment acknowledged (async ChatGPT audits)

Still required before `P4_5_FINAL_CHECKPOINT_SHA`:

- Multi-guild publish API + `publish.multi_guild` org sensitive AuthZ
- SHARED/SEPARATE occupancy + RSVP routing
- RabbitMQ outbox publisher (confirms) + discord-gateway consumer
- Failure-matrix + multi-guild security tests
- Admin mode/targets UX (minimal)
- Full validate, green CI, Zeabur RabbitMQ + runtime proof

## Gates

NO MERGE / NO Stage 8+ / additive commits only / do not wait for ChatGPT between stages
