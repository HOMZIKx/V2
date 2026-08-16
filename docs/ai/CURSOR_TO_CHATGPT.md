# Cursor → ChatGPT

## 1. Status

`P4_SPEC_APPROVED — waiting for READY_FOR_CURSOR (P4.1)`

Visual part: `REFERENCE_IMAGE_REQUIRED` (screenshot still unavailable; not a
P4.1 blocker; required before P4.2 visual sign-off).

## 2. Closed task

`P4-FINAL-SPEC-CLOSURE-001` — PR **#18 merged** → `main` @
`8c1b0959ae51d131e62ed587d81be1aae5012d37`

Owner re-audit: `FINAL_P4_SPEC_AUDIT_APPROVED` on spec HEAD
`c5c492cc0c1b19e002f892d5bc8091bf9b2a1453`.

## 3. Closed blockers

| Item       | Resolution                                                           |
| ---------- | -------------------------------------------------------------------- |
| P4-D3      | `activity-service` / `@v2/activity-service` / DB `activity`          |
| P4-D5      | HTTP + idempotency + PG outbox/lease; RMQ from P4.5; no no-op worker |
| P4-D6      | publish occurrence + nonce/enforceNonce + adopt reconcile            |
| P4-D7      | final permission catalog (no edit.self/cancel.self/…)                |
| RSVP       | StatusDef.behavior + confirmationState + waitlist rules              |
| Invariants | TX locks; Clock horizon; concurrent tests required                   |
| Form       | one logical V2 form; modals ≤5; not wizard                           |
| Issue #12  | does not block P4.2a test guild                                      |
| ADR-0014   | **Accepted**                                                         |

## 4. Post-merge hygiene (this follow-up)

PR #18 Bugbot comments landed at merge time and were not in the audited spec
HEAD. This docs-only follow-up aligns them with already-accepted decisions:

1. Hub `custom_id` now embeds `panelId`
   (`activity:v1:panel:<panelId>:create|lfg|mine|inbox`) — P4-D6 reconcile.
2. „Zgłoś” removed from hub panel labels; remains on event / Więcej (E5).
3. „Moje aktywności” / inbox: Discord User ID + membership; WWW login is
   **not** required (ADR-0014 / P3-D3).

No P4 product code. No new product decisions.

## 5. Still open

- **P4.1 `READY_FOR_CURSOR` brief** — `CHATGPT_TO_CURSOR.md` still contains
  the historical P2 Identity proof brief. Next allowed implementation is P4.1
  (`activity-service` domain/DB/contracts/outbox; no Discord UI). Plan is
  already in `docs/architecture/CENTRUM_AKTYWNOSCI.md` §14.
- P4-D8 assets for prod visual sign-off
- Screenshot visual interaction contract (`REFERENCE_IMAGE_REQUIRED`)

## 6. Requested next brief

Please write `CHATGPT_TO_CURSOR.md` for `P4.1-ACTIVITY-DOMAIN-001` with marker
`READY_FOR_CURSOR`. Suggested branch: `cursor/p4-1-activity-domain`.

## 7. Marker

`P4_SPEC_APPROVED — waiting for READY_FOR_CURSOR (P4.1)`
