# P4 Centrum Aktywności — Handoff

- **Active implementation task:** `P4-CLOSURE-REMEDIATION-001`
- **Status:** `READY_FOR_REVIEW_P4_1_TO_P4_4_CLOSURE`
- **Branch / PR:** `cursor/p4-1-activity-domain` / **#19**
- **ADR-0014:** **Accepted**
- **Service:** `activity-service` / DB `activity`
- **Implements code:** **YES** (P4.1–P4.4 + closure remediation)

> Historical note: this file previously tracked spec-only closure on PR #18
> (`READY_FOR_FINAL_P4_SPEC_REAUDIT`). Spec work remains Accepted; active
> engineering status lives in `PROJECT_STATE.md`.

## Closed decisions (spec)

| ID           | Status                                            |
| ------------ | ------------------------------------------------- |
| P4-D3        | OWNER_ACCEPTED — activity-service                 |
| P4-D5        | OWNER_ACCEPTED — HTTP + outbox/lease; RMQ later   |
| P4-D6        | OWNER_ACCEPTED — nonce + adopt reconcile          |
| P4-D7        | OWNER_ACCEPTED — final permission catalog         |
| Discord form | Owner Amendment — single form → preview → publish |
| Issue #12    | does **not** block functional P4.2a               |

## Still open / owner gates

| Item                         | Status                     |
| ---------------------------- | -------------------------- |
| P4-D8 assets                 | OWNER_DECISION_REQUIRED    |
| Discord / Admin / WWW live   | MANUAL_OWNER_TEST_REQUIRED |
| Merge / Zeabur / P4.5 / P4.6 | NOT STARTED                |

## SoT docs

- `docs/architecture/CENTRUM_AKTYWNOSCI.md`
- `docs/architecture/decisions/ADR-0014-centrum-aktywnosci-boundary.md`
- `docs/product/CENTRUM_AKTYWNOSCI.md`
- `docs/ux/CENTRUM_AKTYWNOSCI_DISCORD.md`
- `docs/ai/P4_TEST_TRACEABILITY.md`
- `docs/ai/PENDING_DECISIONS.md`
