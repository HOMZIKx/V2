# PROJECT_STATE

## Status

`V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001` — **IN PROGRESS**  
Prior audit `006C` — **COMPLETE** (Decisions **D-051** / **D-052** ACCEPTED)

Product / merge PR #19: **NOT APPROVED** · **NOT MERGED**

Canonical audit: `docs/ai/PLAYER_TOOLKIT_CONTRACT_AUDIT_006C.md`

## Ownership (binding)

| Party               | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| **Cursor**          | Backend + integrations + Zeabur/runtime; integrate Owner-approved frontend    |
| **Owner + ChatGPT** | Product, UX, production member WWW (`codex/phase5-*`, `preview/destiled-web`) |

SoT: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (**D-050**).

## Model freeze (D-051 / D-052)

| Concept | Rule |
| ------- | ---- |
| GameAccount | **SOLO ONLY** (no multi-user sharing / no GameAccountMember) |
| Team | **MULTI-USER COLLABORATION BOUNDARY** (`player-workspace-service`) |
| Canonical Identity Character | **PROFILE / LFG / ACTIVITY IDENTITY** |
| Team Character Board | **TEAM PLANNING/COLLABORATION RESOURCE** |
| Optional link | `TeamCharacterBoard.linkedPlayerCharacterId` → Identity character (nullable) |

## Current execution

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| CURRENT_TASK       | `V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001`             |
| BASE_LINEAGE       | `cursor/p4-1-activity-domain` / **#19**                               |
| STACKED_BRANCH     | `cursor/player-workspace-team-character-board-foundation`             |
| MERGED_MAIN        | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                            |
| OUT_OF_SCOPE       | EQ, Sets, Trackers, Notifications, Discord Team reminders, Task 007  |

## Owner acceptance

- 005 Admin: **PENDING** (parallel; not blocking this isolated slice)
- 006 Player Core: **PENDING** (parallel; not blocking this isolated slice)

## Deferred — DO NOT TOUCH

- Task 007 Trackers / Biolog / Elixirs / Marketplace / Reservations / G8 / Guild Control / finances / Community / Music
- Competing redesign of member WWW
- Merging PR #19

## Checkpoint ledger (selected)

| Marker                                  | SHA                                        | Class          |
| --------------------------------------- | ------------------------------------------ | -------------- |
| MERGED_MAIN                             | `8c1b0959ae51d131e62ed587d81be1aae5012d37` | main tip       |
| **ADMIN_CONTROL_CENTER_UX_V1_SHA**      | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` | 005            |
| **PLAYER_TOOLKIT_CORE_V1_SHA**          | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` | 006 foundation |
| **CURRENT_HEAD_STABILIZATION_006A_SHA** | `8a6afd6015d93466871801fa5c03a96080820277` | 006A           |
| 006B migrate entrypoint tip             | `7c4382cbac25297c9c26f0b47cd00af7a778829b` | runtime safety |

## Last updated

2026-09-02 — D-051/D-052 recorded; foundation-001 implementation started.
