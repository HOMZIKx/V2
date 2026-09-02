# CURSOR → ChatGPT

## Status

**MODE:** `V2-PLAYER-WORKSPACE-TEAM-CHARACTER-BOARD-FOUNDATION-001`  
**RESULT:** **COMPLETE**  
**FULL_VALIDATE:** PASS  
PR #19: **NOT_APPROVED** · **NOT_MERGED**  
Stacked PR: **NOT_CREATED_AUTH_UNAVAILABLE** (`gh` needs `GH_TOKEN`)

## SHAs

| Marker | SHA |
| ------ | --- |
| BASE (006C docs) | `84716b3ca40a831a04580a5b2e0e943a4ebe4af8` |
| CURRENT_HEAD | `d28fe7c7877a5136adc5a3ef3f84bbbc50c6e832` |
| Feature tip | `461a766c6bbd94410800d9cbd32b5749fe5f6bdb` |
| BRANCH | `cursor/player-workspace-team-character-board-foundation` |

## Decisions

- **D-051** Identity Character ≠ Team Character Board; optional `linkedPlayerCharacterId`; LFG uses Identity IDs only
- **D-052** `player-workspace-service` owns Team/membership/invites/boards; GameAccount **SOLO**

## Zeabur TEST

| Service | SHA | Notes |
| ------- | --- | ----- |
| player-workspace-service | `461a766c` | RUNNING; auto-migrate; restart NOOP |
| api-gateway | `d28fe7c` | proxy live; unauth teams → 401 |
| identity-service | `d28fe7c` | ownership S2S AUD https |

## Out of scope confirmed

EQ / Sets / Trackers / Notifications / Discord Team reminders / Task 007 — **NOT STARTED**

## Acceptance

005/006 Owner: **PENDING**

## Recommended next (do not start here)

Controlled frontend adapter wiring against this API contract when Owner+ChatGPT track is ready — still no EQ/Sets/Trackers.
