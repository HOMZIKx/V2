# Cursor / implementation → ChatGPT

## Phase 5 Web production shell

- **Status:** `AWAITING_OWNER_REVIEW`
- **Branch:** `codex/phase5-player-shell`
- **Draft PR:** #31 (stacked on `codex/d037-web-product-workflow`)
- **Implementation commit:** `81c33fc474f84d16455c7b38ce90aa9d3ee34abf`

### Delivered

- real Next.js member dashboard, not a screenshot or separate Sites project;
- DESTILED shell and responsive member-first navigation;
- typed mock adapter for team, character, named EQ set, reminder and history data;
- human-confirmed `done / snoozed / unavailable` transitions;
- authentic approved class renders and owner-provided brand direction;
- Vitest view-model tests and Playwright smoke/interaction checks.

### Local evidence

- TypeScript `tsc --noEmit`: PASS;
- Next production build (webpack): PASS;
- direct view-model behavior assertions: PASS;
- GitHub Actions on final docs HEAD: pending at this checkpoint.

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
