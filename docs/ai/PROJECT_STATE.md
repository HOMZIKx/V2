# PROJECT_STATE

## Status

`V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001` — **IN PROGRESS → validation/deploy**

Prior audit `006C` — **COMPLETE** (Decisions **D-051** / **D-052** ACCEPTED)

Product / merge PR #19: **NOT APPROVED** · **NOT MERGED**

## Model freeze (D-051 / D-052)

| Concept                      | Rule                                                      |
| ---------------------------- | --------------------------------------------------------- |
| GameAccount                  | **SOLO ONLY**                                             |
| Team                         | **MULTI-USER COLLABORATION** (`player-workspace-service`) |
| Canonical Identity Character | **PROFILE / LFG / ACTIVITY IDENTITY**                     |
| Team Character Board         | **TEAM PLANNING RESOURCE** (own UUID)                     |
| Optional link                | `linkedPlayerCharacterId` → Identity character            |

## Current execution

| Field          | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| CURRENT_TASK   | `V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001`           |
| BASE_SHA       | `84716b3ca40a831a04580a5b2e0e943a4ebe4af8` (006C docs)              |
| STACKED_BRANCH | `cursor/player-workspace-team-character-board-foundation`           |
| STACKED_PR     | `NOT_CREATED_AUTH_UNAVAILABLE`                                      |
| SERVICE        | `player-workspace-service` port 4500, advisory lock id 4            |
| OUT_OF_SCOPE   | EQ, Sets, Trackers, Notifications, Discord Team reminders, Task 007 |

## Owner acceptance

- 005 Admin: **PENDING**
- 006 Player Core: **PENDING**

## Last updated

2026-09-02 — foundation-001 implementation on stacked branch.
