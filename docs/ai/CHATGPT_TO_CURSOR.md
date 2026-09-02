# ChatGPT → Cursor

## Status

`READY_FOR_CURSOR` — **SoT REALIGNMENT ACTIVE** (no new product feature)

> Previous active pointer `P4-CLOSURE-REMEDIATION-001` is **historical / superseded as task pointer**.
> P4 work continues only as runtime/acceptance closure on PR #19, not as a license to redesign member WWW.

## Task ID

`V2-SOT-REALIGNMENT-OWNER-FRONTEND-SPLIT-001`

## Goal

Align repository Source of Truth with Owner directive (2026-09-02):

1. Cursor owns backend, domains, API, Identity, Authorization, Discord Gateway, integrations, storage, realtime, security, Zeabur/runtime.
2. Owner + ChatGPT own production **member WWW** (and approved frontend slices) — see D-050 / `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md`.
3. Cursor **integrates** approved frontend to real API / Identity / Authz / Discord / Zeabur — does **not** redesign competing WWW UI.
4. Do **not** start Task 007 / Trackers / deferred modules until 005/006 runtime+acceptance is ordered.
5. After current runtime/acceptance: next product priority = **Player Toolkit** (Issue #29) under approved scope — still **not** started in this realignment.

## Branch / PR

- Repo: `HOMZIKx/V2`
- Cursor active branch: `cursor/p4-1-activity-domain`
- Cursor PR: **#19** (do not merge without Owner)
- Frontend track (Owner + ChatGPT): `codex/phase5-*`, `preview/destiled-web`, `codex/d037-web-product-workflow` (PR #30 direction)
- Merged `main`: `8c1b0959ae51d131e62ed587d81be1aae5012d37`

## Hard stops for Cursor

- No Task 007 / Trackers / Biolog product implementation yet.
- No competing member WWW redesign; no treating legacy/`apps/web` UI as final product design.
- No deferred modules: full Guild Control, guild finance, G8/voice attendance, broad Discord monitoring, Marketplace, Reservations, broad Community, Music — unless required as existing code dependency.
- Do not delete premature 005/006 code; classify and prove runtime instead.

## Reading order

1. `AGENTS.md`
2. `docs/ai/PROJECT_STATE.md`
3. `docs/ai/CURSOR_TO_CHATGPT.md`
4. `docs/product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md` (D-050)
5. `docs/ai/PLAYER_TOOLKIT_ARCHITECTURE_BOUNDARY.md`
6. Issue #29 (Player Toolkit) when starting that work later

## Next safe task (do not start here)

`V2-RUNTIME-005-006-TIP-DEPLOY-AND-ACCEPTANCE` — finish tip deploy (esp. web/admin + identity healthy), then Owner live acceptance for Admin 005 and Player Core 006. Only then Player Toolkit per #29.
