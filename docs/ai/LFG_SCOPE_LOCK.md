# Activity 2.0 + Dungeon LFG — Scope Lock (Stage 5)

## Status

| Flag                  | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| **Product direction** | Issue **#20** (Owner-delegated discovery closure 2026-08-22)       |
| **Implementation**    | **`READY_FOR_CHATGPT_AUDIT`**                                         |
| **Governance**        | Issue #26 amendment — continuous resume does not replace discovery |

Owner Issue #20 closure comment (2026-08-22): **DISCOVERY STATUS: CLOSED FOR DUNGEON LFG v1. IMPLEMENTATION AUTHORIZED.**

Historical WIP: `ACTIVITY_2_LFG_IMPLEMENTATION_WIP_SHA` (`24828b7`).

## Governance matrix (Issue #20 + implementation reality)

| Topic                                  | Status                               | Notes                                              |
| -------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Matching, not public post board        | **IMPLEMENTED**                      | Hub ephemeral + `rankLfgMatch` + WWW search        |
| DM-first match delivery                | **IMPLEMENTED**                      | DISCOVERY notifications, coalesce, Nie teraz, mute |
| Characters + class/spec                | **IMPLEMENTED**                      | Profile foundation + quick change / inline add     |
| Party roles TANK/BUFF/DPS/FLEX         | **IMPLEMENTED**                      | Session roles ≠ profile mutation                   |
| Discovery-first (match before create)  | **IMPLEMENTED**                      | Matches → Join/View → Znajdź mi ekipę → create     |
| Waiting intent / watch pool            | **IMPLEMENTED**                      | `lfg_intents` pause/resume/cancel/fulfill + dedupe |
| Discord multi-step LFG wizard          | **IMPLEMENTED** (v1)                 | Mobile-first ephemeral Hub flow                    |
| Team-space after match                 | **OWNER_DECISION_REQUIRED**          | Not in v1 scope                                    |
| No public role-ping spam as primary UX | **ACCEPTED** (forbidden)             | Not used                                           |
| Match score display / reasons UX       | **IMPLEMENTED** (human-readable)     | No raw ranking numbers in UX                       |
| Anti-spam / rate limits                | **IMPLEMENTED** (baseline)           | Intent/join abuse guards; ChatGPT audit may tune   |
| Admin / WWW LFG surfaces               | **IMPLEMENTED** (v1 parity baseline) | Composition templates + `/szukam-ekipy`            |

Full gap rows: `docs/ai/OWNER_DISCOVERY_GAPS.md`.

## Cursor rules

- Do **not** expand into Reservations or Marketplace product work.
- Do **not** claim Stage 5 **Accepted** until Owner + ChatGPT audit closes.
- Team-space and post-match party UX remain Owner Discovery.

## Checkpoint

| Marker                              | SHA                                        |
| ----------------------------------- | ------------------------------------------ |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` | `976b89cf4740ef9b3948dd83a82e32659e4eeb07` |

Recorded in `PROJECT_STATE.md` at `976b89cf4740ef9b3948dd83a82e32659e4eeb07`.
