# PROJECT_STATE

## Status

`V2-RUNTIME-DEPLOY-SAFETY-AND-MIGRATION-HARDENING-006B` — **migration deploy safety control complete**; Owner 005/006 acceptance still **PENDING**

Product / merge: **NOT APPROVED** · **NOT MERGED**

**STOP Task 007 / deferred product modules.**

## Ownership (binding)

| Party               | Responsibility                                                                |
| ------------------- | ----------------------------------------------------------------------------- |
| **Cursor**          | Backend + integrations + Zeabur/runtime; integrate Owner-approved frontend    |
| **Owner + ChatGPT** | Product, UX, production member WWW (`codex/phase5-*`, `preview/destiled-web`) |

SoT: `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (**D-050**).

## Current execution

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| CURRENT_TASK       | `V2-RUNTIME-DEPLOY-SAFETY-AND-MIGRATION-HARDENING-006B`              |
| ACTIVE_BRANCH / PR | `cursor/p4-1-activity-domain` / **#19**                              |
| MERGED_MAIN        | `8c1b0959ae51d131e62ed587d81be1aae5012d37`                           |
| LOCAL_VALIDATE     | full `pnpm validate` **PASS**                                        |
| RUNTIME_CONTROL    | startup migrate via Docker entrypoint (identity/authz/activity)      |
| NEXT               | Owner live acceptance 005+006; then Player Toolkit (#29) under scope |

## Closed incident

`MISSING_PROD_MIGRATION_ON_DEPLOY` — permanent control in entrypoint + advisory locks. Runbook: `docs/ops/INCIDENT_RUNBOOK.md` / `docs/deploy/MIGRATION_SAFETY.md`.

## Deferred — DO NOT TOUCH (product)

- Task 007 Trackers / Biolog / Elixirs / EQ / Marketplace / Reservations / G8 / Guild Control / finances / Community / Music
- Competing redesign of member WWW

## Checkpoint ledger (selected)

| Marker                                  | SHA                                        | Class             |
| --------------------------------------- | ------------------------------------------ | ----------------- |
| MERGED_MAIN                             | `8c1b0959ae51d131e62ed587d81be1aae5012d37` | main tip          |
| **ADMIN_CONTROL_CENTER_UX_V1_SHA**      | `4df7a948876a0ff3a2959ea8140aff3e02e1ab98` | 005 code          |
| **PLAYER_TOOLKIT_CORE_V1_SHA**          | `2af092ff4b326c3c4b47d39a2ddad75847ee8ed2` | 006 foundation    |
| **CURRENT_HEAD_STABILIZATION_006A_SHA** | `8a6afd6015d93466871801fa5c03a96080820277` | 006A validate     |
| TIP_DEPLOYED_RUNTIME (pre-006B image)   | `e00185ecca2f0a1278950dd72c8ba3fe7ede2594` | prior healthy tip |

## Last updated

2026-09-02 — 006B: startup migrate entrypoint + advisory locks + localhost fail-closed; full validate PASS.
