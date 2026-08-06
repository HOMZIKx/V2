# P4 Centrum Aktywności — Handoff

- **Task ID:** `P4-FINAL-SPEC-CLOSURE-001`
- **Status:** `READY_FOR_FINAL_P4_SPEC_REAUDIT` (visual screenshot: `REFERENCE_IMAGE_REQUIRED`)
- **Branch / PR:** `cursor/p4-centrum-aktywnosci-spec-v2` / **#18**
- **Base:** `main` @ `1f23635` (PR #16)
- **ADR-0014:** **Accepted**
- **Service:** `activity-service` / DB `activity`
- **Implements code:** **NO**

## Closed in this closure

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

## Still open / blocked

| Item                                   | Status                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P4-D8 assets                           | OWNER_DECISION_REQUIRED (prod visual sign-off)                                                              |
| Screenshot visual interaction contract | **`REFERENCE_IMAGE_REQUIRED`** — image not available in agent FS; not designed from memory; doc not created |
| P4 implementation                      | not started                                                                                                 |

## SoT docs

- `docs/architecture/CENTRUM_AKTYWNOSCI.md`
- `docs/architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md`
- `docs/product/CENTRUM_AKTYWNOSCI.md`
- `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`
- `docs/ai/P4_TEST_TRACEABILITY.md`
- `docs/ai/PENDING_DECISIONS.md`
