# PROJECT_STATE

## Status

Web / DESTILED track: `DESTILED_FIRST_SLICE_FIX_IMPLEMENTED` (D-061).

Quality audit completed; P0/P1 first-slice repairs landed on
`cursor/destiled-cursor-handoff-dfe5` (PR **#48**). Awaiting owner review.

## Owner decision — Cursor takes DESTILED Web (2026-09-03)

- **Decision:** **D-061** — OWNER ACCEPTED.
- **Reason:** ChatGPT cost; further DESTILED application work moves to Cursor.
- **Working / deploy ref:** `preview/destiled-web`.
- **Handoff branch (docs):** `cursor/destiled-cursor-handoff-dfe5` — draft PR **#48**.
- `HOLD_CURSOR_WEB_PRODUCT_UI` is **lifted**.
- Product contracts **D-038–D-060** remain in force (access, teams, EQ, timers,
  brand DESTILED, Project Hard secret boundary, map domain separation, etc.).
- D-037 / D-022 are **SCOPE REVISED**: owner remains product authority; Cursor
  is the primary implementation agent for DESTILED Web; ChatGPT is optional.
- Cursor must not invent architecture/security/data-ownership changes; conflicts
  go to `docs/ai/PENDING_DECISIONS.md`.
- Next concrete coding task: **awaiting owner priority** (stabilize first-player
  path, sets/items/timer edit flows, or other named fix).

## Owner directive — WWW product (2026-09-02, revised by D-061)

- Decisions: **D-037–D-061**; D-050 remains an active collaboration baseline.
- Active brand: DESTILED (D-051) — crimson / electric blue / silver on black;
  authentic Metin2 class and item references only.
- Active first slice: `Member dashboard -> My teams -> Team workspace ->
Character board -> Equipment / named sets / progression timers / lightweight
team actions / notes -> Change history`.
- Codex/ChatGPT delivered stacked frontend work (draft PRs **#30–#37**) and
  later merges into `preview/destiled-web` (PRs **#38–#47**, including
  account-first dashboard, map hunt sessions, Centrum preview, respawn catalog,
  Wyprawa map/timers/party and review fixes).
- Zeabur frontend-preview readiness exists; stable deployment ref remains
  `preview/destiled-web`. Preview is not authorization for production
  Discord/database/bot integration.
- Do not start API/Discord integration until the owner asks.
- Maps, market, AI import, dungeon analytics and bot-admin Web UI expand only
  when the owner prioritizes them.
- Active game context is **Project Hard**. DESTILED never stores Project Hard
  login secrets (D-054).
- This does not cancel approved Discord-specific P4 contracts.

## Web product design checkpoint

- Workflow SoT: [WEB_PRODUCT_DESIGN_AND_DELIVERY](../product/WEB_PRODUCT_DESIGN_AND_DELIVERY.md)
  (updated for D-061).
- First player slice:
  [PLAYER_VERTICAL_SLICE_AND_COLLABORATION](../product/PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).
- Coherence review:
  [FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW](../product/FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW.md).
- Loadouts / timers:
  [TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](../product/TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).
- Later dungeon analyzer:
  [PROJECT_HARD_DUNGEON_RUN_ANALYZER](../product/PROJECT_HARD_DUNGEON_RUN_ANALYZER.md).

## Active phase

1. **DESTILED Web (primary):** Cursor-owned delivery on `preview/destiled-web`
   under D-061; next task from owner.
2. **P4 Centrum Aktywności (Discord):** docs closure retained; implementation
   still gated by prior P4 readiness rules.

## Active task

- Task ID: `DESTILED-CURSOR-HANDOFF-001`
- Branch: `cursor/destiled-cursor-handoff-dfe5`
- Draft PR: **#48**
- Base: `preview/destiled-web`
- Scope of this commit: documentation / decision handoff only (no app code).

## Open

- Owner confirms P0 fix priority from
  `docs/ai/DESTILED_WEB_QUALITY_AUDIT_2026-09-03.md`.
- P4-D8 assets = OWNER_DECISION_REQUIRED (prod visual sign-off for Discord).
- Screenshot-based `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` still
  blocked without the reference image.
- Inherited transitive `nanoid` audit advisory and GitHub secret-scan permission
  limits remain repository-level; do not bypass.

## Last updated

2026-09-03 — DESTILED first-slice repair implemented on Cursor (store, Discord
entry, home, workspace/EQ/history honesty); D-061 handoff.
