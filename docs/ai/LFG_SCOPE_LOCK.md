# Activity 2.0 + Dungeon LFG — Scope Lock (Stage 5)

## Status

`OWNER_ACCEPTED` via `V2-CORE-FOUNDATION-CONTINUOUS-RESUME-004` / Issue #20
(including Owner Amendment: DM-first matchmaking / characters / party roles).

GitHub issue body not fetchable without auth in this agent session; this file
mirrors the continuous task Accepted requirements.

## Core concept

LFG is a **matching system on top of Activity**, not a Discord post board.

## Primary flow

Szukam ekipy → dungeon/activity → character → session party role(s) → time window
→ show matching groups → Dołącz/Zobacz → if none: Znajdź mi ekipę / Powiadom mnie
→ only then: Utwórz nową ekipę.

Discovery-first is mandatory.

## Invariants

- Class/spec ≠ party role (catalogs from `@v2/hub-core`).
- No public `#azrael` / role-ping spam as primary discovery.
- Backend SoT; auto Discord/WWW sync; Notifications Core for DM/Inbox.
- Waiting pool intents with TTL; cancel in Moje poszukiwania.

## Checkpoint

`ACTIVITY_2_LFG_CHECKPOINT_SHA`
