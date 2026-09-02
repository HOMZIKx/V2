# CURSOR → ChatGPT

## Status

**MODE:** `V2-SOT-REALIGNMENT-OWNER-FRONTEND-SPLIT-001` — documentation / audit only  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge  
CURRENT_HEAD: `b6153335e8de256bcda74054ca9a2086596845f7`

## Ownership split (Owner directive 2026-09-02) — ACCEPTED SoT

| Role                | Owns                                                                                                                                                | Must not                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Cursor**          | Backend, domains, API, Identity, Authz, Discord Gateway, integrations, storage, realtime, security, Zeabur/runtime; **integrate** approved frontend | Redesign competing member WWW; invent product screens; start Task 007 / deferred modules |
| **Owner + ChatGPT** | Product, UX, production member WWW frontend track (`codex/phase5-*`, `preview/destiled-web`)                                                        | Expect Cursor to invent replacement WWW visual product                                   |

Canonical workflow: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (**D-050** on this branch; **D-037** ID on frontend-track Decision Log — ID collision documented in `DECISION_LOG.md`).

## Process truth (005 / 006)

| Task                            | Status                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **005 Admin Control Center UX** | Code at `ADMIN_CONTROL_CENTER_UX_V1_SHA`; **not Owner-accepted**; live admin still behind tip        |
| **006 Player Toolkit Core**     | Code at `PLAYER_TOOLKIT_CORE_V1_SHA` (premature vs 005 acceptance); architecture boundary documented |
| **007 Trackers**                | **NOT STARTED** — blocked until 005/006 ordered + Issue #29 / approved Player Toolkit scope          |

History not rewritten. Premature code preserved.

## SHAs

| Marker                                | SHA                                        |
| ------------------------------------- | ------------------------------------------ |
| `main` (merged)                       | `8c1b0959ae51d131e62ed587d81be1aae5012d37` |
| CURRENT_HEAD (PR #19 tip)             | `b6153335e8de256bcda74054ca9a2086596845f7` |
| `ADMIN_CONTROL_CENTER_UX_V1_SHA`      | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` |
| `PLAYER_TOOLKIT_CORE_V1_SHA`          | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` |
| `CURRENT_HEAD_STABILIZATION_006A_SHA` | `8a6afd6015d93466871801fa5c03a96080820277` |
| `preview/destiled-web` tip            | `b7271a07f12c4d772097b05f46d8e3ba01c13372` |
| `codex/phase5-player-shell` tip       | `adbd4a03d925bd1973bfda9d00ade15e3d225a30` |

## Runtime snapshot (Zeabur TESTOWY, probed during realignment)

| Surface         | Evidence                                                      | Status                                                     |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| API tip         | `/health/ready` shows `d098cc3…`                              | **503** — `identity=unhealthy`                             |
| Backends deploy | Zeabur status RUNNING @ `d098cc3` for identity/activity/api/… | Tip image present; identity not healthy                    |
| Web live        | `/health` → `510b262…`                                        | **behind tip** (build previously FAILED; redeploy RUNNING) |
| Admin live      | `/health` → `8babc897…`                                       | **behind tip** (redeploy RUNNING)                          |
| Local validate  | prior 006A `pnpm validate` PASS                               | code gate OK                                               |
| Task 007        | —                                                             | **forbidden until 005/006 closure**                        |

## Known blockers

1. Identity unhealthy on tip → API ready 503.
2. Web/Admin tip not live yet (builds / prior Docker failures fixed in `0eec6af` / `d098cc3`).
3. Owner live acceptance for Admin 005 + Player Core 006 still pending after tip is healthy.
4. `gh` CLI often unauthenticated locally — Actions status may need Owner UI.

## Owner action required

1. After tip healthy: Admin OAuth smoke for 005 UX.
2. After tip healthy: Discord-auth Member session for 006 `/profil` proof (or confirm integration against approved frontend track when wired).
3. Treat `codex/phase5-*` / `preview/destiled-web` as the member WWW design track — do not ask Cursor to redesign it.

## STOP

No Task 007. No Trackers/Biolog/Elixirs/EQ/Marketplace/Guild Control/Reservations/Music product expansion.
No competing member WWW redesign by Cursor.
