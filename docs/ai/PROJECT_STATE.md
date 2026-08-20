# PROJECT_STATE

## Status

`IN_PROGRESS_P4_5_IMPLEMENTATION` — continuous Core Foundation execution
(`V2-CONTINUOUS-CORE-FOUNDATION-EXECUTION-001`)

Issue #26 OWNER AMENDMENT (2026-08-20): Cursor builds continuously; ChatGPT
audits asynchronously. Do not wait between stages.

Not APPROVED. Not merged.

## Current execution

| Field                   | Value                                      |
| ----------------------- | ------------------------------------------ |
| CURRENT_STAGE           | 1 — P4.5                                   |
| CURRENT_TASK            | `P4.5-MULTI-GUILD-RABBITMQ-001`            |
| CURRENT_BRANCH          | `cursor/p4-1-activity-domain`              |
| CURRENT_HEAD / PR_HEAD  | `274402d814c194ad0922e57da5ec4fe59f19d8d1` |
| PR                      | #19                                        |
| BASE_SHA                | `8c1b0959ae51d131e62ed587d81be1aae5012d37` |
| CURRENT_CI              | PASS on tip (`32419502772`)                |
| CURRENT_ZEABUR_REVISION | discord `2fd4635…`; API stack `22ba38b…`   |

## Checkpoint ledger (immutable)

| Marker                                    | SHA                                        | Status                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| P4_0_FINAL_CHECKPOINT_SHA                 | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA |
| P4_0_EFFECTIVE_CHECKPOINT_SHA             | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | historical visual+security tip             |
| P4_5_PLAN_CHECKPOINT_SHA                  | `8834559e38f5d55160eb5de8510420651b26b829` | plan locked                                |
| P4_5_FINAL_CHECKPOINT_SHA                 | _(pending)_                                | —                                          |
| P4_6_FINAL_CHECKPOINT_SHA                 | _(pending)_                                | —                                          |
| V2_HUB_CORE_CHECKPOINT_SHA                | _(pending)_                                | —                                          |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA         | _(pending)_                                | —                                          |
| ACTIVITY_2_LFG_CHECKPOINT_SHA             | _(pending)_                                | —                                          |
| RESERVATIONS_CHECKPOINT_SHA               | _(pending)_                                | —                                          |
| MARKETPLACE_CHECKPOINT_SHA                | _(pending)_                                | —                                          |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | _(pending)_                                | —                                          |

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- (P4.5 final pending)

## Owner external (non-blocking)

| Field                    | Value                        |
| ------------------------ | ---------------------------- |
| BANNER_STATUS            | OWNER_ASSET_REQUIRED         |
| ACTION_EMOJI_STATUS      | OWNER_ASSET_UPLOAD_REQUIRED  |
| OPEN_CRITICAL            | 0                            |
| OPEN_HIGH                | 0                            |
| OWNER_DECISIONS_REQUIRED | none for P4.5 Accepted scope |

## Explicit gates

- NO MERGE until Core Foundation audits + Owner integrated review policy
- NO Stage 8+ (Support / G8 / Community / Activity embedded / Overlay / Music)
- Additive commits only during audit queue

## Last updated

2026-08-20 — continuous execution entry; Stage 1 P4.5 start
