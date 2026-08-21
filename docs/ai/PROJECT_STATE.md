# PROJECT_STATE

## Status

`READY_FOR_OWNER_LIVE_LOGIN_PROOF` — `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001`
code+Zeabur deployed; Owner Discord login still required to tick LIVE_GUILD_INVENTORY=PASS.
Then resume Core Foundation Stage 3 Hub (discovery gate).

Issue #26 OWNER AMENDMENT continuous execution. ChatGPT audits async.

Not APPROVED. Not merged.

## Current execution

| Field                   | Value                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| CURRENT_STAGE           | 3 — V2 Hub Core (GATE: OWNER_DECISION_REQUIRED)                        |
| CURRENT_TASK            | `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001`              |
| CURRENT_BRANCH          | `cursor/p4-1-activity-domain`                                          |
| CURRENT_HEAD / PR_HEAD  | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859`                             |
| PR                      | #19                                                                    |
| BASE_SHA                | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                             |
| CURRENT_CI              | pending on tip                                                         |
| CURRENT_ZEABUR_REVISION | api+discord+activity+admin on `2c2b3e9…`; Discord bot `ready`          |

## Checkpoint ledger (immutable)

| Marker                                    | SHA                                        | Status                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| P4_0_FINAL_CHECKPOINT_SHA                 | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA |
| P4_0_EFFECTIVE_CHECKPOINT_SHA             | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | historical visual+security tip             |
| P4_5_PLAN_CHECKPOINT_SHA                  | `8834559e38f5d55160eb5de8510420651b26b829` | plan locked                                |
| P4_5_FINAL_CHECKPOINT_SHA                 | `e3c694fcc3980cd309843cac2c42c346083c8cb1` | READY_FOR_CHATGPT_P4_5_ASYNC_AUDIT         |
| P4_6_FINAL_CHECKPOINT_SHA                 | `6d80ea7716b439ec6827141707a6bf7ec5974147` | READY_FOR_CHATGPT_P4_6_ASYNC_AUDIT         |
| ADMIN_GUILD_INVENTORY_FIX_SHA             | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859` | deployed; owner login proof pending        |
| V2_HUB_CORE_CHECKPOINT_SHA                | _(pending)_                                | blocked on Hub discovery                   |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA         | _(pending)_                                | —                                          |
| ACTIVITY_2_LFG_CHECKPOINT_SHA             | _(pending)_                                | —                                          |
| RESERVATIONS_CHECKPOINT_SHA               | _(pending)_                                | —                                          |
| MARKETPLACE_CHECKPOINT_SHA                | _(pending)_                                | —                                          |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | _(pending)_                                | —                                          |

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- P4.5 final @ `e3c694fcc3980cd309843cac2c42c346083c8cb1`
- P4.6 final @ `6d80ea7716b439ec6827141707a6bf7ec5974147`

## Admin guild inventory hotfix checkpoint

| Field | Value |
| ----- | ----- |
| ROOT_CAUSE | Activity→Discord used `service-<id>:8080` while API Discord probe used `discord-gateway.zeabur.internal:8080`; Admin flattened failures to `CONFIG_INVALID`; diagnostics conflated Gateway/bot/metadata; tip Docker build missing `@v2/messaging` kept Zeabur on stale activity |
| FIX_SHA | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859` |
| ZEABUR_SERVICES_REDEPLOYED | activity-service, discord-gateway, api-gateway, admin |
| LIVE_GUILD_INVENTORY | PENDING_OWNER_LOGIN (session required) |
| AUTHORIZATION_FILTER | PASS (unit tests; server-side CONFIG_MANAGE filter unchanged) |
| DIAGNOSTICS | PASS (Gateway OK / Bot Połączony / Activity→Discord unknown until login — no false Discord YES) |
| CRITICAL | 0 open code; owner login proof remaining |
| HIGH | 0 |

## Explicit gates

- NO MERGE / NO Stage 8+ / additive only
- Stage 3 Hub Core: see `docs/ai/PENDING_DECISIONS.md` item `HUB-CORE-001`

## Last updated

2026-08-21 — Admin guild inventory hotfix deployed @ `2c2b3e9`; await Owner Discord login for LIVE_GUILD_INVENTORY=PASS; then resume Hub
