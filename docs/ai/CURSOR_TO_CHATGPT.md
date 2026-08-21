# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                                  | Value                                                         |
| -------------------------------------- | ------------------------------------------------------------- |
| **CURRENT_STAGE**                      | 3 — V2 Hub Core (discovery gate)                              |
| **CURRENT_TASK**                       | `V2-DEEP-RETROSPECTIVE-POLISH-AND-AUTO-DISCORD-SYNC-001`       |
| **FINAL_STATUS**                       | `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT`                        |
| **CURRENT_HEAD**                       | see `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA` in PROJECT_STATE |
| **PR**                                 | #19                                                           |
| **P4_6_FINAL_CHECKPOINT_SHA**          | `6d80ea7716b439ec6827141707a6bf7ec5974147`                    |
| **ADMIN_GUILD_INVENTORY_FIX_SHA**      | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859`                    |
| **AUTO_DISCORD_SYNC_STATUS**           | PASS                                                          |
| **NORMAL_PRODUCT_MANUAL_SYNC_STEPS**   | 0                                                             |
| **OPEN_CRITICAL**                      | 0                                                             |
| **OPEN_HIGH**                          | 0                                                             |

## Deep retrospective (this checkpoint)

Primary defect: activity outbox enqueued thin payloads that Discord deliver rejected; `messageId` never written back → auto event Discord sync was effectively dead and would spam creates if partially fixed.

Remediation: enrich `PROJECTION_REQUESTED`, write back `messageId`, deliver only projection events, enqueue missing mutations, Admin hub save auto-reconciles, stable client Idempotency-Key, timing-safe projection secrets.

Details: `docs/ai/DEEP_RETROSPECTIVE_AUDIT.md`

## Next

1. Redeploy Zeabur tip (activity + discord + admin) and live-prove create→RSVP same messageId.
2. Owner Discord login for Admin inventory PASS (orthogonal).
3. Resume Hub Core discovery (`HUB-CORE-001`) — do not invent Hub IA.
