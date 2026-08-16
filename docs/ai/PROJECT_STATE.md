# PROJECT_STATE

## Status

`P4_SPEC_APPROVED — waiting for READY_FOR_CURSOR (P4.1)`

Visual screenshot contract: `REFERENCE_IMAGE_REQUIRED` (deferred; **not** a
P4.1 blocker; required before P4.2 production visual sign-off).

## Active phase

P4 Centrum Aktywności — specification **closed and merged**.
P0–P3 completed. P4.1 implementation **not started**.

## Last closed task

- Task ID: `P4-FINAL-SPEC-CLOSURE-001`
- PR: **#18 merged** 2026-08-06
- Merge commit: `8c1b0959ae51d131e62ed587d81be1aae5012d37`
- Spec HEAD audited: `c5c492cc0c1b19e002f892d5bc8091bf9b2a1453`
- Owner marker: `FINAL_P4_SPEC_AUDIT_APPROVED`
- ADR-0014: **Accepted**
- Service: **`activity-service`** / DB **`activity`**

## Closed blockers

P4-D3, P4-D5, P4-D6 (nonce/adopt), P4-D7 permissions, RSVP confirmationState,
transactional invariants, one logical Discord form, Issue #12 non-blocking for
P4.2a test.

Post-merge spec hygiene (this branch): Bugbot findings from PR #18 aligned —
hub `custom_id` includes `panelId`; „Zgłoś” is event/Więcej-only; Discord
actions use Discord User ID without WWW login (ADR-0014 / P3-D3).

## Open

- P4.1 implementation brief = **missing** (`CHATGPT_TO_CURSOR.md` is still the
  historical P2 Identity proof brief). Cursor will not start P4.1 code until
  `READY_FOR_CURSOR`.
- P4-D8 assets = OWNER_DECISION_REQUIRED (prod visual sign-off)
- Screenshot-based `CENTRUM_AKTYWNOSCI_VISUAL_INTERACTION_CONTRACT.md` —
  `REFERENCE_IMAGE_REQUIRED` (image still unavailable; not designed from memory)

## Out of scope until P4.1 brief

Code, migrations, Discord publish, Zeabur, merge of this hygiene PR by Cursor.

## Last updated

2026-08-16 — Cursor (post-merge status + Bugbot spec alignment)
