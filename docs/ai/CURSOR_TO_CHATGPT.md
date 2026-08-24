# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG code: **`READY_FOR_CHATGPT_APPROVAL`** (`LFG_CODE_STATUS`)  
LFG runtime: **not verified in this task** (separate Discord deployment task)

Task: `V2-LFG-FINAL-CODE-CLOSURE-AND-RESERVATIONS-DISCOVERY-008`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Final source reaudit

Checkpoint: **`DUNGEON_LFG_V1_FINAL_SOURCE_AUDIT_SHA`** — (recorded after commit)

Base: `d596a9f6a25e89e4afb0f844f7a4f15922db5590`

### Result

| Severity | Open                                  |
| -------- | ------------------------------------- |
| CRITICAL | 0                                     |
| HIGH     | 0                                     |
| MEDIUM   | 0 (4 lifecycle items fixed this pass) |
| LOW      | 2 (non-blocking)                      |

Full report: `docs/ai/DUNGEON_LFG_V1_AUDIT.md` → section **FINAL_SOURCE_REAUDIT**.

### MEDIUM lifecycle fixes (this pass)

| Issue                                     | Fix                                                   |
| ----------------------------------------- | ----------------------------------------------------- |
| Active intent SQL ignored `window_end_at` | `listActiveLfgIntents` adds `window_end_at > now`     |
| Cancel on fulfilled intent                | `cancelLfgIntent` SQL requires `fulfilled_at IS NULL` |
| Edit paused/expired intent                | `updateLfgIntent` guards paused + TTL expired         |
| Join after search window ended            | `joinLfgActivity` rejects `windowEndAt <= now`        |

**Tests:** `lfg.use-cases.spec.ts` (+4 cases).

### Prior HIGH fixes — still verified

- **H-MUTE-01:** `mutedActivityTypeKeys` (not `mutedInterestKeys`) — SHA `94e71fe`
- **H-WATCH-02:** `fullGroupWatchId` join → fulfill exact watch — SHA `94e71fe`
- **Durable DM context:** SHA `d781c2b`

## Reservations discovery

Owner pack: **`docs/ai/RESERVATIONS_OWNER_DECISIONS.md`** (7 decisions, A/B/C + recommended)  
**RESERVATIONS_STATUS = OWNER_DISCOVERY_READY** — not Accepted, no implementation.

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate`       |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace implementation. Await ChatGPT **code approval**. Live Discord runtime is a separate task.
