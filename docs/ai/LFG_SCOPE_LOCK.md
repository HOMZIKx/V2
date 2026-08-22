# Activity 2.0 + Dungeon LFG — Scope Lock (Stage 5)

## Status

| Flag                  | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| **Product direction** | Issue **#20** (incl. Owner Amendment: DM-first matchmaking)        |
| **Implementation**    | `FOUNDATION_WIP` — not Accepted Stage 5 DoD                        |
| **Governance**        | Issue #26 amendment — continuous resume does not replace discovery |

Full Discord multi-step discovery UX, team-space, Admin/WWW parity, and complete DoD
tests remain **open**.

Historical WIP: `ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA` (`24828b7`).

## Governance matrix (Issue #20 + branch reality)

| Topic                                  | Status                      | Notes                         |
| -------------------------------------- | --------------------------- | ----------------------------- |
| Matching, not public post board        | **ACCEPTED**                | Hub copy + `rankLfgMatch`     |
| DM-first match delivery                | **ACCEPTED** (direction)    | Copy/flows still Owner review |
| Characters + class/spec                | **ACCEPTED** (model)        | Picker UX open                |
| Party roles TANK/BUFF/DPS/FLEX         | **ACCEPTED**                | Class/spec ≠ party role       |
| Discovery-first (match before create)  | **ACCEPTED** (principle)    | Wizard step order open        |
| Waiting intent / watch pool            | **FOUNDATION_WIP**          | `lfg_intents` + API           |
| Discord multi-step LFG wizard          | **OWNER_DECISION_REQUIRED** | Partial implementation        |
| Team-space after match                 | **OWNER_DECISION_REQUIRED** | Not built                     |
| No public role-ping spam as primary UX | **ACCEPTED** (forbidden)    | Do not add                    |
| Match score display / reasons UX       | **OWNER_DECISION_REQUIRED** | Engine is **TECHNICAL_ONLY**  |
| Anti-spam / rate limits                | **OWNER_DECISION_REQUIRED** | Minimal today                 |
| Admin / WWW LFG surfaces               | **OWNER_DECISION_REQUIRED** | Not built                     |

Full gap rows: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

## Cursor rules

- Do **not** invent remaining user-facing LFG behavior.
- Do **not** call Stage 5 Accepted for Core Foundation review.
- Safe work inside **ACCEPTED** direction only; expand UX only after Owner decisions.

## Checkpoint

Accepted Stage 5 checkpoint: **pending** gap closure + Owner/ChatGPT audit.
