# PROJECT_STATE

## Status

`V2-SOT-REALIGNMENT-OWNER-FRONTEND-SPLIT-001` — Source of Truth realigned (no new product features)

Product / merge: **NOT APPROVED** · **NOT MERGED** · **NOT FULLY RUNTIME VERIFIED**

**STOP Task 007 / Trackers / deferred modules.** First close 005/006 tip deploy + Owner acceptance. Then Player Toolkit per Issue #29 under approved scope.

## Ownership (binding)

| Party               | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| **Cursor**          | Backend + integrations + Zeabur/runtime; integrate Owner-approved frontend    |
| **Owner + ChatGPT** | Product, UX, production member WWW (`codex/phase5-*`, `preview/destiled-web`) |

SoT: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (**D-050**).  
`apps/web` on PR #19 is **technical material**, not accepted final member product design.

## Current execution

| Field              | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| CURRENT_HEAD       | `b6153335e8de256bcda74054ca9a2086596845f7`                                              |
| CURRENT_TASK       | `V2-SOT-REALIGNMENT-OWNER-FRONTEND-SPLIT-001`                                           |
| ACTIVE_BRANCH / PR | `cursor/p4-1-activity-domain` / **#19**                                                 |
| MERGED_MAIN        | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                                              |
| REVIEW_POSTURE     | SoT realigned; runtime tip partial; Owner acceptance pending                            |
| CODE_005           | Implemented — `ADMIN_CONTROL_CENTER_UX_V1_SHA`=`4df7a94…` — **not Owner-accepted**      |
| CODE_006           | Implemented prematurely — `PLAYER_TOOLKIT_CORE_V1_SHA`=`2af092f…` — boundary doc exists |
| LOCAL_VALIDATE     | PASS at 006A (`8a6afd6` lineage); tip includes Docker/web typecheck deploy fixes        |
| RUNTIME_STATUS     | API tip live but **identity unhealthy** (503); web/admin **behind tip**                 |
| NEXT_SAFE_TASK     | `V2-RUNTIME-005-006-TIP-DEPLOY-AND-ACCEPTANCE` (do not start 007)                       |

## Contradictions fixed in this realignment

1. Stale `CHATGPT_TO_CURSOR.md` still pointed at `P4-CLOSURE-REMEDIATION-001` as active task.
2. Docs implied Cursor owns full WWW product design; Owner directive assigns production member WWW to Owner+ChatGPT (D-050).
3. `CURSOR_TO_CHATGPT.md` / `PROJECT_STATE` still said Zeabur token blocked after token was restored — runtime narrative updated to identity unhealthy + web/admin lag.
4. Task 007 risk: explicit **STOP** until 005/006 ordered.
5. Decision Log ID collision: P4 Discord **D-037** vs frontend-track **D-037** → frontend ownership recorded as **D-050** on this branch.

## Deferred — DO NOT TOUCH (product)

- Full Guild Control / G8 / extended voice attendance / broad Discord monitoring
- Guild finance
- Marketplace
- Reservations (beyond existing discovery packs)
- Broad Community modules / Music
- Task 007 Trackers / Biolog product expansion
- Competing redesign of member WWW vs `preview/destiled-web` / `codex/phase5-*`

## Governance

Every **new product function** still requires IDEA → Owner+ChatGPT Discovery → Options → Owner Decisions → Accepted SoT → implementation prompt.

Frontend delivery gates: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md`.

Player Toolkit boundary: `docs/ai/PLAYER_TOOLKIT_ARCHITECTURE_BOUNDARY.md`.

## Checkpoint ledger (selected)

| Marker                                  | SHA                                        | Class                                    |
| --------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| MERGED_MAIN                             | `8c1b0959ae51d131e62ed587d81be1aae5012d37` | main tip                                 |
| **PLAYER_TOOLKIT_CORE_V1_SHA**          | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` | 006 foundation (premature vs acceptance) |
| **ADMIN_CONTROL_CENTER_UX_V1_SHA**      | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` | 005 code checkpoint                      |
| **CURRENT_HEAD_STABILIZATION_006A_SHA** | `8a6afd6015d93466871801fa5c03a96080820277` | local validate / infra isolation PASS    |
| CURRENT_HEAD (PR #19)                   | `b6153335e8de256bcda74054ca9a2086596845f7` | SoT realignment (D-050)                  |
| preview/destiled-web                    | `b7271a07f12c4d772097b05f46d8e3ba01c13372` | Owner+ChatGPT frontend track             |
| codex/phase5-player-shell               | `adbd4a03d925bd1973bfda9d00ade15e3d225a30` | Owner+ChatGPT frontend track             |

## Last updated

2026-09-02 — SoT realignment: Owner+ChatGPT member WWW track; Cursor backend/integration; STOP 007; next = tip deploy + 005/006 acceptance.
