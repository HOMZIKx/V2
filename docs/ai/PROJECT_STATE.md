# PROJECT_STATE

## Status

`V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001` — **CODE + VALIDATE PASS**; **Zeabur runtime BLOCKED** (env/DB wiring)

Prior audit `006C` — **COMPLETE** (**D-051** / **D-052**)

PR #19: **NOT APPROVED** · **NOT MERGED**  
Stacked PR: **NOT_CREATED_AUTH_UNAVAILABLE**

## SHAs

| Marker | Value |
| ------ | ----- |
| BASE_SHA | `84716b3ca40a831a04580a5b2e0e943a4ebe4af8` |
| CURRENT_HEAD | `461a766c6bbd94410800d9cbd32b5749fe5f6bdb` (+ docs follow-up) |
| BRANCH | `cursor/player-workspace-team-character-board-foundation` |
| Zeabur service | `player-workspace-service` `6a9885bb573ada8b3bbe5f1f` |

## Model freeze

| Concept | Rule |
| ------- | ---- |
| GameAccount | **SOLO ONLY** |
| Team | **MULTI-USER COLLABORATION** (`player-workspace-service`) |
| Canonical Identity Character | **PROFILE / LFG / ACTIVITY** |
| Team Character Board | **TEAM PLANNING RESOURCE** |
| Optional link | `linkedPlayerCharacterId` |

## Blocker

Zeabur: service created; Dockerfile content deploy built then **CRASHED** without `PLAYER_WORKSPACE_DATABASE_URL` (variable GraphQL list did not expose Activity DB URL for auto-wire). Manual Owner/ops: set DB URL + inbound JWT env, restart, prove health/ready.

## Owner acceptance

005/006: **PENDING**

## Out of scope

EQ / Sets / Trackers / Notifications / Discord Team reminders / Task 007 — **NOT STARTED**
