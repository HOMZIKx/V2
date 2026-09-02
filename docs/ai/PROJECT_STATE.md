# PROJECT_STATE

## Status

`READY_FOR_FINAL_P4_SPEC_REAUDIT`

Visual screenshot contract: `REFERENCE_IMAGE_REQUIRED` (not designed from memory).

Web product track: `IN_PROGRESS_PHASE_5_PRODUCTION_SHELL_REVIEW`.

## Owner directive — WWW product (2026-09-02)

- Decisions: **D-037–D-059**; D-050 remains an active collaboration baseline.
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
Character board -> Equipment / named sets / progression timers / lightweight
team actions / notes -> Change history`.
- The owner accepted the first-player coherence review, one-member/shared
  workspace model and invitation acceptance.
- Phase 5 production shell is implemented on `codex/phase5-player-shell` in
  draft PR **#31**. Current checkpoint: responsive member dashboard with typed
  mock adapter, human-confirmed reminder actions, team summary, authentic class
  renders and change history.
- The owner accepted continuation after the member-dashboard checkpoint.
- Team workspace is implemented on `codex/phase5-team-workspace` in draft PR
  **#32**: shared AppShell/navigation, responsive team overview, character/set
  readiness, collaborator presence, explicit task outcomes and team notes.
- Character card and Metin2-reference EQ board are implemented on
  `codex/phase5-character-equipment` in draft PR **#33**: named sets, authentic
  reference item icons, catalog/bonus filtering, cross-device assignment,
  flip-card progression timers and explicit physical-location confirmation.
- Current next Web step after character-card review: refine slot geometry and
  item-card detail from owner feedback, then complete team invitations and
  persistence contracts. Do not start API/Discord integration before the
  frontend contract is accepted.
- Phase 5 CI evidence at validated frontend HEAD `bbb30b5`: full
  `pnpm validate`, infrastructure integration and PR-title checks PASS.
- Two repository-level blockers remain outside the frontend slice: inherited
  transitive `nanoid <3.3.18` audit advisory
  (`GHSA-2v37-7h3g-55p8`) and GitHub's
  `Resource not accessible by integration` error in the secret-scan job. Do
  not bypass either control; no secret finding was reported.
- Named sets, manual last-confirmed item locations, character progression
  timers and lightweight assigned team actions clarify the active first slice.
- Map hunt SpawnTimers are a separate later domain with their own maps,
  participants, configuration, permissions and notification policies.
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
- Complete first-player path and accepted state review:
  [FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW](../product/FIRST_PLAYER_JOURNEY_COHERENCE_REVIEW.md).
- Set, item-catalog, reminder and timer-domain contract:
  [TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES](../product/TEAM_LOADOUTS_PROGRESSION_AND_TIMER_BOUNDARIES.md).
- Later Project Hard dungeon analyzer contract:
  [PROJECT_HARD_DUNGEON_RUN_ANALYZER](../product/PROJECT_HARD_DUNGEON_RUN_ANALYZER.md).
- Earlier previews validate the wider member flow. The member dashboard is
  production repository code in PR #31, team workspace in PR #32 and the
  character/equipment/timer detail in PR #33.
- Cursor remains on `HOLD_CURSOR_WEB_PRODUCT_UI` until PR #31 is reviewed and
  the production frontend code/adapters are explicitly handed off.
- D-060 fixes the later Technician configurator as a real versioned bot-config
  command surface (validate/apply/audit/rollback), never decorative toggles.

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

2026-09-02 — Phase 5 member dashboard in PR #31, team workspace in PR #32 and character equipment card in PR #33; Cursor P4 status retained.
