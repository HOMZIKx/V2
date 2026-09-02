# PROJECT_STATE

## Status

`V2-RUNTIME-005-006-TIP-DEPLOY-AND-ACCEPTANCE` — **technical runtime closure complete**; **Owner live acceptance pending**

Product / merge: **NOT APPROVED** · **NOT MERGED**

**STOP Task 007 / Trackers / deferred modules** until Owner accepts 005 + 006 on tip.

## Ownership (binding)

| Party               | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| **Cursor**          | Backend + integrations + Zeabur/runtime; integrate Owner-approved frontend    |
| **Owner + ChatGPT** | Product, UX, production member WWW (`codex/phase5-*`, `preview/destiled-web`) |

SoT: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (**D-050**).  
`apps/web` on PR #19 is **technical material**, not accepted final member product design.

## Current execution

| Field              | Value                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| CURRENT_TASK       | `V2-RUNTIME-005-006-TIP-DEPLOY-AND-ACCEPTANCE`                                                 |
| ACTIVE_BRANCH / PR | `cursor/p4-1-activity-domain` / **#19**                                                        |
| MERGED_MAIN        | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                                                     |
| TIP_CODE_REVISION  | `e00185ecca2f0a1278950dd72c8ba3fe7ede2594` (deployed; verify `git rev-parse HEAD` for docs tip) |
| REVIEW_POSTURE     | Runtime healthy on tip; Owner acceptance for 005/006 required                                  |
| CODE_005           | Implemented — `ADMIN_CONTROL_CENTER_UX_V1_SHA`=`4df7a94…` — **Owner acceptance pending**       |
| CODE_006           | Implemented — `PLAYER_TOOLKIT_CORE_V1_SHA`=`2af092f…` — **Owner acceptance pending**           |
| LOCAL_VALIDATE     | `pnpm validate --quick` **PASS**                                                               |
| RUNTIME_STATUS     | Identity ready PASS after migrate `003`; API ready PASS; web/admin on tip                      |
| NEXT               | Owner live acceptance 005+006 → then Player Toolkit (#29) under approved scope                 |

## Runtime root cause (resolved)

Identity `/health/ready` failed solely on **`migrations: false`** (DB+Redis OK). Prod inventory lacked `003_player_game_accounts.sql`. Applied via controlled `migrate-prod.mjs` in Identity container. No destructive DB reset. No service redeploy required for the migrate itself (images already on tip).

## Deferred — DO NOT TOUCH (product)

- Full Guild Control / G8 / extended voice attendance / broad Discord monitoring
- Guild finance / Marketplace / Reservations / Community / Music
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
| **PLAYER_TOOLKIT_CORE_V1_SHA**          | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` | 006 foundation                           |
| **ADMIN_CONTROL_CENTER_UX_V1_SHA**      | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` | 005 code checkpoint                      |
| **CURRENT_HEAD_STABILIZATION_006A_SHA** | `8a6afd6015d93466871801fa5c03a96080820277` | local validate / infra isolation PASS    |
| TIP_DEPLOYED_RUNTIME                    | `e00185ecca2f0a1278950dd72c8ba3fe7ede2594` | Zeabur services running this revision    |
| SoT realignment (D-050)                 | `b6153335e8de256bcda74054ca9a2086596845f7` | ownership docs                           |
| preview/destiled-web                    | `b7271a07f12c4d772097b05f46d8e3ba01c13372` | Owner+ChatGPT frontend track             |
| codex/phase5-player-shell               | `adbd4a03d925bd1973bfda9d00ade15e3d225a30` | Owner+ChatGPT frontend track             |

## Last updated

2026-09-02 — Identity migrate `003` restored API ready; tip web/admin healthy; Owner acceptance gate open for 005/006.
