# PROJECT_STATE

## Status

`READY_FOR_FINAL_P4_SPEC_REAUDIT`

Visual screenshot contract: `REFERENCE_IMAGE_REQUIRED` (not designed from memory).

## Owner directive — WWW product (2026-09-02)

- Decisions: **D-037–D-054**; D-050 remains a design baseline for owner review.
- Cursor keeps existing Web/Admin code, but it is **not** a visual or product
  reference for the new interface.
- Cursor must not independently design or extend Web/Admin layout, information
  architecture, graphics, copy, animations or user-facing page content until an
  approved frontend slice exists.
- The previous Sites demo and legacy UI are not requirements or default visual
  direction.
- Backend, API, database, Discord, Identity, Authorization, tests and
  infrastructure may continue only without inventing Web/Admin UX assumptions.
- Any technical choice that changes user-facing behavior is
  `OWNER_DECISION_REQUIRED`.
- Product/access/team inventory and the initial map are captured.
- Active first slice: `Member dashboard -> My teams -> Team workspace ->
  Character board -> Equipment / timers / notes -> Change history`.
- Current next Web/Admin step: owner coherence review of responsive, empty,
  denied, unavailable and simultaneous-use states, then Phase 5 production shell
  with mock adapters.
- Maps, market, AI import, dungeon analytics and bot-admin Web UI do not expand
  until the first player slice is stable.
- Active game context is **Project Hard**. Game definitions are configurable,
  sourced and effective-dated because server rules and drops change.
- Later accepted slice: private-team Project Hard dungeon journal/analyzer with
  participants, characters, duration, screenshot-assisted loot, prices, costs,
  frozen value snapshots and team analytics.
- AI/OCR proposes data for human review; it never silently commits game data and
  the product never claims background observation of the game client.
- DESTILED never stores Project Hard/email login secrets, passwords, PINs,
  authorization/recovery codes, cookies or client tokens.
- This directive does not cancel approved Discord-specific P4 contracts; it
  freezes independent Web/Admin product design.

## Web product design checkpoint

- Draft PR: **#30** on `codex/d037-web-product-workflow`.
- Active brand: DESTILED; owner-provided cracked metallic `D`; balanced deep
  crimson/electric blue on black with metallic silver structure.
- Authentic owner-approved Metin2 class/item references; no random AI character
  substitutions.
- First player slice and realtime/concurrency behavior:
  [PLAYER_VERTICAL_SLICE_AND_COLLABORATION](../product/PLAYER_VERTICAL_SLICE_AND_COLLABORATION.md).
- Later Project Hard dungeon analyzer contract:
  [PROJECT_HARD_DUNGEON_RUN_ANALYZER](../product/PROJECT_HARD_DUNGEON_RUN_ANALYZER.md).
- Current previews validate the member dashboard, team workspace and
  character/equipment/timer surface; they are not yet production repository
  code.
- Cursor remains on `HOLD_CURSOR_WEB_PRODUCT_UI` until production frontend code
  and adapters are explicitly handed off.

## Active phase

P4 Centrum Aktywności — final specification closure (docs only).
P0–P3 completed. P4 implementation not started.

## Active task

- Task ID: `P4-FINAL-SPEC-CLOSURE-001`
- Branch: `cursor/p4-centrum-aktywnosci-spec-v2`
- Draft PR: **#18**
- Base: `main` @ `1f23635c64ba1c0c4369cdaca9b043ea39f15e4e`
- ADR-0014: **Accepted**
- Service name: **`activity-service`** / DB **`activity`**

## Closed blockers

P4-D3, P4-D5, P4-D6 (nonce/adopt), P4-D7 permissions, RSVP confirmationState,
transactional invariants, one logical Discord form, Issue #12 non-blocking for
P4.2a test.

## Open

- P4-D8 assets = OWNER_DECISION_REQUIRED (prod visual sign-off)
- Screenshot-based `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` blocked —
  image file unavailable in agent environment

## Out of scope

Code, migrations, Discord publish, merge, Actions, new PR, reopen #17.

## Last updated

2026-09-02 — ChatGPT/owner Web product track; Cursor P4 status retained.
