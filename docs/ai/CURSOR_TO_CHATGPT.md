# Cursor / implementation → ChatGPT

## Phase 5 Team membership and invitations

- **Status:** `AWAITING_OWNER_REVIEW`
- **Branch:** `codex/phase5-team-membership`
- **Draft PR:** #34 (stacked on `codex/phase5-character-equipment`)
- **Frontend HEAD:** `1ca85fdaa59fa638f24a60c3e9f74cca9165194c`

### Delivered

- owner-only team-membership route linked from the workspace;
- exact Discord ID resolution before an invitation can be confirmed;
- pending invitations that grant no private-team access;
- authenticated recipient accept/decline screen;
- explicit accepted, declined, expired and cancelled states;
- typed adapter commands with expected revisions and operation IDs;
- responsive member and invitation flows in the accepted DESTILED shell;
- unit and E2E scenarios for resolution, deduplication and consent.

### Local evidence

- targeted Prettier check: PASS;
- Web TypeScript `tsc --noEmit`: PASS;
- Web ESLint for `app` and `src`: PASS;
- Vitest: PASS, 17 tests;
- Next production build: PASS, including
  `/teams/[teamId]/members` and `/invitations/[invitationId]`;
- Playwright scenarios are present, but local execution could not start because
  Chromium was absent and its CDN download returned timeout/502. CI remains the
  authoritative E2E gate.

### Integration contract

Team invitation acceptance is separate from platform admission. It grants no
Leader, Technician or guild administration capability. Cursor may connect
Discord identity resolution, persistence and realtime after owner acceptance,
but it must preserve the pending-without-access boundary, expected revisions,
operation IDs and immediate subscription revoke after removal.

---

## Phase 5 Character equipment card

- **Status:** `AWAITING_OWNER_REVIEW`
- **Branch:** `codex/phase5-character-equipment`
- **Draft PR:** #33 (stacked on `codex/phase5-team-workspace`)
- **Validated frontend HEAD:** `f125fcc281a23d3e1e2c2303f338d158f398b728`

### Delivered

- Asteria workspace → NerwNicht character-card route;
- authentic Sura render and Metin2-reference equipment-slot layout;
- named sets and cross-device assignment interaction;
- real reference item crops, catalog filters and bonus inspection;
- strict separation between planned-set assignment and human-confirmed physical
  item location;
- flip-card timers for character progression only;
- explicit timer restart and future Discord-reminder state;
- pure view-model functions, unit tests and full-path E2E scenarios.

### Local evidence

- exact Prettier check: PASS;
- TypeScript `tsc --noEmit`: PASS;
- Next production build (webpack): PASS;
- equipment planning, location confirmation, filtering and timer assertions:
  PASS;
- CI run `33629048497`: full `pnpm validate` PASS, including format,
  lint, typecheck, coverage, build, architecture, E2E and runtime smoke;
- infrastructure integration: PASS;
- PR-title workflow: PASS;
- independent dependency audit remains blocked by inherited
  `vitest > vite > postcss > nanoid <3.3.18`
  (`GHSA-2v37-7h3g-55p8`);
- secret scan remains blocked by GitHub
  `Resource not accessible by integration`; no secret finding was reported.

Do not lower the audit threshold or disable secret scanning.

### Integration contract

Cursor may connect persistence, realtime and Discord after owner approval. It
must preserve the planned-vs-confirmed boundary. Dragging an item in the Web UI
does not claim an in-game transfer. AI/OCR must create a reviewable proposal,
not silently mutate the shared catalog.

---

## Phase 5 Team workspace

- **Status:** `AWAITING_OWNER_REVIEW`
- **Branch:** `codex/phase5-team-workspace`
- **Draft PR:** #32 (stacked on `codex/phase5-player-shell`)
- **Frontend HEAD:** `8a763e38954b3c77a1aa75e273a978bc26a95494`

### Delivered

- shared production AppShell and working Dashboard ↔ Teams navigation;
- responsive Asteria team workspace;
- shared character/set readiness and responsible-member state;
- explicit collaborator-presence indicator without background game observation;
- human-confirmed team task outcomes;
- controlled team-note creation;
- typed adapter, pure view-model transitions and E2E scenarios.

### Local evidence

- TypeScript `tsc --noEmit`: PASS;
- Next production build (webpack): PASS;
- dashboard and team-workspace behavior assertions: PASS;
- full monorepo and E2E gates: running in GitHub Actions.

### Integration contract

Cursor may replace the typed adapter with API, database, realtime and Discord
providers after owner approval. It must not redesign the screen or merge map
SpawnTimers into character/team progression timers. AI/OCR, item catalog,
character EQ board, maps, dungeon analyzer and bot configurator remain outside
this PR.

---

## Phase 5 Web production shell

- **Status:** `AWAITING_OWNER_REVIEW`
- **Branch:** `codex/phase5-player-shell`
- **Draft PR:** #31 (stacked on `codex/d037-web-product-workflow`)
- **Implementation commit:** `81c33fc474f84d16455c7b38ce90aa9d3ee34abf`
- **Validated frontend HEAD:** `bbb30b5e4f66ceada7c207880f80e097becaedf8`

### Delivered

- real Next.js member dashboard, not a screenshot or separate Sites project;
- DESTILED shell and responsive member-first navigation;
- typed mock adapter for team, character, named EQ set, reminder and history data;
- human-confirmed `done / snoozed / unavailable` transitions;
- authentic approved class renders and owner-provided brand direction;
- Vitest view-model tests and Playwright smoke/interaction checks.

### Validation evidence

- TypeScript `tsc --noEmit`: PASS;
- Next production build (webpack): PASS;
- direct view-model behavior assertions: PASS;
- CI run `33622784079`: full `pnpm validate` PASS, including formatting,
  lint, typechecks, coverage tests, builds, architecture, E2E and runtime smoke;
- infrastructure integration job: PASS;
- PR-title workflow run `33622784087`: PASS;
- quality job remains red only at the independent dependency audit because the
  inherited `vitest > vite > postcss > nanoid` path resolves a version below
  `3.3.18` (`GHSA-2v37-7h3g-55p8`); this frontend slice did not introduce it;
- secret-scan job is blocked by GitHub's
  `Resource not accessible by integration` permission error; no secret finding
  was reported.

Do not lower the audit threshold or disable secret scanning to make the PR green.

### Explicit limits

No OAuth, API, database, Discord, realtime, AI/OCR, map SpawnTimers, dungeon
analyzer or bot configurator implementation. Cursor must not rebuild the UI from
the screenshots or use the previous Sites demo as source. Integration begins
only after owner review and an explicit handoff.

---

﻿# Cursor → ChatGPT

## 1. Status

`READY_FOR_FINAL_P4_SPEC_REAUDIT`

Visual part: `REFERENCE_IMAGE_REQUIRED` (screenshot not available in agent FS;
no design-from-memory).

## 2. Task

`P4-FINAL-SPEC-CLOSURE-001` — PR #18

## 3. Closed blockers

| Item       | Resolution                                                           |
| ---------- | -------------------------------------------------------------------- |
| P4-D3      | `activity-service` / `@v2/activity-service` / DB `activity`          |
| P4-D5      | HTTP + idempotency + PG outbox/lease; RMQ from P4.5; no no-op worker |
| P4-D6      | publish occurrence + nonce/enforceNonce + adopt reconcile + tests    |
| P4-D7      | final permission catalog (no edit.self/cancel.self/…)                |
| RSVP       | StatusDef.behavior + confirmationState + waitlist rules              |
| Invariants | TX locks; Clock horizon; concurrent tests required                   |
| Form       | one logical V2 form; modals ≤5; not wizard                           |
| Issue #12  | does not block P4.2a test guild                                      |
| ADR-0014   | **Accepted**                                                         |

## 4. Still open

- P4-D8 assets for prod visual sign-off
- Screenshot visual interaction contract (`REFERENCE_IMAGE_REQUIRED`)

## 5. Marker

`READY_FOR_FINAL_P4_SPEC_REAUDIT`
