# PROJECT_STATE

## Status

`V2_HUB_CORE` — Stage 3 Hub Core scope locked (`HUB-CORE-001` = OWNER_ACCEPTED) and implemented on tip.
Repository visibility still PUBLIC (Owner).

Not APPROVED. Not merged.

## Current execution

| Field                   | Value                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| CURRENT_STAGE           | 3 — V2 Hub Core (implemented; checkpoint on tip)                       |
| CURRENT_TASK            | `V2-HUB-CORE-OWNER-SCOPE-LOCK-002`                                     |
| CURRENT_BRANCH          | `cursor/p4-1-activity-domain`                                          |
| CURRENT_HEAD / PR_HEAD  | _(set to tip after Hub Core commit)_                                   |
| PR                      | #19                                                                    |
| BASE_SHA                | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                             |
| CURRENT_CI              | pending on Hub Core tip push                                           |
| CURRENT_ZEABUR_REVISION | discord tip may lag until rebuild                                      |

## Checkpoint ledger (immutable)

| Marker                                    | SHA                                        | Status                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| P4_0_FINAL_CHECKPOINT_SHA                 | `22ba38b6f8a195ef3dcac2ffe8d0d356a92ebd8f` | SUPERSEDED_FOR_FINAL_AUDIT_BY_VISUAL_DELTA |
| P4_0_EFFECTIVE_CHECKPOINT_SHA             | `2fd4635c3b0aca118a3554e3439acc089558f3d9` | historical visual+security tip             |
| P4_5_PLAN_CHECKPOINT_SHA                  | `8834559e38f5d55160eb5de8510420651b26b829` | plan locked                                |
| P4_5_FINAL_CHECKPOINT_SHA                 | `e3c694fcc3980cd309843cac2c42c346083c8cb1` | READY_FOR_CHATGPT_P4_5_ASYNC_AUDIT         |
| P4_6_FINAL_CHECKPOINT_SHA                 | `6d80ea7716b439ec6827141707a6bf7ec5974147` | READY_FOR_CHATGPT_P4_6_ASYNC_AUDIT         |
| ADMIN_GUILD_INVENTORY_FIX_SHA             | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859` | deployed; owner login proof pending        |
| DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA  | `5e95dcff35e78edca8ceba70ae8f2d7bccb88146` | AUTO_DISCORD_SYNC_STATUS=PASS              |
| CI_SECURITY_CLOSURE_SHA                   | `f4577fb0e5860c34e269fa3183eef17d4d6106a7` | format+lint CI closure                     |
| V2_HUB_CORE_CHECKPOINT_SHA                | _(tip after Hub Core commit)_              | READY_FOR_CHATGPT_HUB_CORE_AUDIT           |
| NOTIFICATIONS_CORE_CHECKPOINT_SHA         | _(pending)_                                | Stage 4 next per Issue #26                 |
| ACTIVITY_2_LFG_CHECKPOINT_SHA             | _(pending)_                                | —                                          |
| RESERVATIONS_CHECKPOINT_SHA               | _(pending)_                                | —                                          |
| MARKETPLACE_CHECKPOINT_SHA                | _(pending)_                                | —                                          |
| CORE_FOUNDATION_INTEGRATED_CHECKPOINT_SHA | _(pending)_                                | —                                          |

## Hub Core deliverables (this stage)

- SoT: `docs/ai/HUB_CORE_SCOPE_LOCK.md`, ADR-0015, `HUB-CORE-001` = OWNER_ACCEPTED
- `@v2/hub-core` registry / deep-links / catalogs / retirement / sync rules
- Discord V2 Centrum shell (StringSelect navigation; ephemeral module flows)
- Identity player profile + interests foundation (migration + API)
- Activity legacy-channel retirement + hub module overrides (Admin)
- WWW nav: Profil / Dla mnie foundations

## Repository visibility (Issue #25)

| Field                                    | Value                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| REPOSITORY_VISIBILITY                    | **PUBLIC** (GitHub API `private=false`)                                                               |
| SEVERITY                                 | **HIGH** — source/IP exposure vs Issue #25                                                            |
| OWNER_ACTION_REQUIRED_REPOSITORY_PRIVATE | Yes — no agent GitHub admin token                                                                     |
| Owner action                             | GitHub → `HOMZIKx/V2` → Settings → General → Danger Zone → **Change repository visibility** → Private |

## Explicit gates

- NO MERGE / NO Stage 8+ / additive only
- Hub discovery gate closed (`HUB-CORE-001` OWNER_ACCEPTED)
- HIGH remains until repo is private

## Last updated

2026-08-21 — Hub Core scope lock + implementation; `pnpm validate` PASS locally.
