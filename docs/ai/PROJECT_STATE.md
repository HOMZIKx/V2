# PROJECT_STATE

## Status

`IN_PROGRESS` — `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001` (product blocker)
then resume Core Foundation Stage 3 Hub (still gated on discovery).

Issue #26 OWNER AMENDMENT continuous execution. ChatGPT audits async.

Not APPROVED. Not merged.

## Current execution

| Field                   | Value                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| CURRENT_STAGE           | 3 — V2 Hub Core (GATE: OWNER_DECISION_REQUIRED)                        |
| CURRENT_TASK            | `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001`              |
| CURRENT_BRANCH          | `cursor/p4-1-activity-domain`                                          |
| CURRENT_HEAD / PR_HEAD  | _(pending commit)_                                                     |
| PR                      | #19                                                                    |
| BASE_SHA                | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                             |
| CURRENT_CI              | pending after hotfix push                                              |
| CURRENT_ZEABUR_REVISION | activity stuck on `955fa8…` until Dockerfile messaging fix deploys     |

## Checkpoint ledger (immutable)

| Marker                                    | SHA                                        | Status                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| P4_0_FINAL_CHECKPOINT_SHA                 | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA |
| P4_0_EFFECTIVE_CHECKPOINT_SHA             | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | historical visual+security tip             |
| P4_5_PLAN_CHECKPOINT_SHA                  | `8834559e38f5d55160eb5de8510420651b26b829` | plan locked                                |
| P4_5_FINAL_CHECKPOINT_SHA                 | `e3c694fcc3980cd309843cac2c42c346083c8cb1` | READY_FOR_CHATGPT_P4_5_ASYNC_AUDIT         |
| P4_6_FINAL_CHECKPOINT_SHA                 | `6d80ea7716b439ec6827141707a6bf7ec5974147` | READY_FOR_CHATGPT_P4_6_ASYNC_AUDIT         |
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

## P4.6 evidence

| Gate                                | Result                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Green CI tip                        | PASS `6d80ea7`                                                           |
| Series publish / cancel-edit scopes | API + unit tests                                                         |
| Private visibility + invite hash    | API + role/token checks; hash redacted on read                           |
| Attendance 24h + self/guild stats   | API + unit tests; WWW self stats                                         |
| Admin / Discord / WWW surfaces      | visibility/series display; Discord payload-driven series/private publish |
| Discord attendance component UX     | deferred (HTTP client ready)                                             |
| Zeabur RabbitMQ                     | still BLOCKED_EXTERNAL; HTTP projection default                          |

## Admin guild inventory hotfix (in flight)

| Field | Value |
| ----- | ----- |
| ROOT_CAUSE (verified) | Activity→Discord used `service-<id>:8080` vs API probe `discord-gateway.zeabur.internal:8080`; Admin flattened failures to `CONFIG_INVALID`; diagnostics conflated Gateway/bot/metadata; tip Docker build missing `@v2/messaging` |
| LIVE_PROOF | Discord internal guilds + secret → HTTP 200 (1 guild) while bot `degraded`; secret/hash match; Authz key fingerprints match |
| CODE | Distinct error codes + `/activity/v1/admin/diagnostics/dependencies`; Admin diagnostics split |
| ZEABUR | `ACTIVITY_DISCORD_*` URLs set to `discord-gateway.zeabur.internal:8080` |

## Explicit gates

- NO MERGE / NO Stage 8+ / additive only
- Stage 3 Hub Core: see `docs/ai/PENDING_DECISIONS.md` item `HUB-CORE-001`

## Last updated

2026-08-21 — Admin Discord guild inventory 503 root-cause fix in progress; resume Hub after live PASS
