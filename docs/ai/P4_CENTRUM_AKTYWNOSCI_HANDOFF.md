# P4 Centrum Aktywności — Handoff

- **Task ID:** `P4-FINAL-SPEC-CLOSURE-001` (closed)
- **Status:** `P4_SPEC_APPROVED — waiting for READY_FOR_CURSOR (P4.1)`
- **PR:** **#18 merged** → `main` @ `8c1b0959ae51d131e62ed587d81be1aae5012d37`
- **Owner marker:** `FINAL_P4_SPEC_AUDIT_APPROVED` (spec HEAD `c5c492c`)
- **ADR-0014:** **Accepted**
- **Service:** `activity-service` / DB `activity`
- **Implements code:** **NO** (P4.1 waits for brief)

## Closed in spec closure

| ID                       | Status                                          |
| ------------------------ | ----------------------------------------------- |
| P4-D3                    | OWNER_ACCEPTED — activity-service               |
| P4-D5                    | OWNER_ACCEPTED — HTTP + outbox/lease; RMQ later |
| P4-D6                    | OWNER_ACCEPTED — nonce + adopt reconcile        |
| P4-D7                    | OWNER_ACCEPTED — final permission catalog       |
| RSVP model               | confirmationState + StatusDef.behavior          |
| Transactional invariants | locks + Clock; no `now()+14d` CHECK             |
| Discord form             | one logical V2 form; modals ≤5                  |
| Issue #12                | does **not** block P4.2a test guild             |

## Post-merge hygiene (2026-08-16)

Aligned PR #18 Bugbot findings with Accepted spec (docs only):

- hub `custom_id` includes `panelId`;
- „Zgłoś” is not a hub action;
- Discord hub actions do not require WWW login.

## Still open / blocked

| Item                                   | Status                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| P4.1 implementation brief              | **missing** — needs `READY_FOR_CURSOR` in `CHATGPT_TO_CURSOR.md`                          |
| P4-D8 assets                           | OWNER_DECISION_REQUIRED (prod visual sign-off)                                            |
| Screenshot visual interaction contract | **`REFERENCE_IMAGE_REQUIRED`** — not a P4.1 blocker; required before P4.2 visual sign-off |
| P4 implementation                      | not started                                                                               |

## SoT docs

- `docs/architecture/CENTRUM_AKTYWNOSCI.md`
- `docs/architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md`
- `docs/product/CENTRUM_AKTYWNOSCI.md`
- `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`
- `docs/ai/P4_TEST_TRACEABILITY.md`
- `docs/ai/PENDING_DECISIONS.md`
