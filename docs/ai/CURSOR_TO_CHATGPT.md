# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_REAUDIT`**

Task: `V2-DUNGEON-LFG-V1-CHATGPT-AUDIT-REMEDIATION-003`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
Prior audit: `DUNGEON_LFG_V1_AUDIT_SHA` (`53e7d3ab8597f4a021abae96bdf3e6d1faad60a4`)  
Remediation: `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` — `3c3009991f656e4369d3f600fcb05266683ede50`

## ChatGPT remediation delivered

Report: `docs/ai/DUNGEON_LFG_V1_AUDIT.md` (ChatGPT remediation section)

### HIGH addressed (11)

1. **Actionable match DM** — signed `lfgdm` buttons; `deliveryActions` payload; Inbox fallback preserved
2. **Server-verified character** — Identity S2S resolve; activity rejects forged class/roles
3. **Quick-add** — no default all-role assignment; user selects party roles
4. **Multi-role join** — eligible role resolution; deterministic pick or role picker
5. **Custom time** — Wybierz czas modal; validated window for search + intent
6. **Moje poszukiwania edit** — PATCH watch; suppressions cleared on edit
7. **Full-group watch UX** — member create/cancel + reopen notify with revalidation
8. **Admin composition** — guild activity types; FLEX; explicit preferred flags
9. **Background membership** — JOIN authorize before discovery notify (not hardcoded membershipOk)
10. **Security adversarial tests** — foreign char, forged roles, membership lost, multi-role join
11. **Issue #20 UX closure** — Hub + DM/Inbox hybrid re-checked against implementation

### Reservations (no product implementation)

Prep: `docs/ai/RESERVATIONS_DISCOVERY_PREP.md` — **`RESERVATIONS_DISCOVERY_PREP_READY`**

## Validation

| Check          | Result                                                |
| -------------- | ----------------------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate` (remediation tip) |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT**             |

## Ledger

| Marker                                   | SHA        |
| ---------------------------------------- | ---------- |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA`      | `976b89c…` |
| `DUNGEON_LFG_V1_AUDIT_SHA`               | `53e7d3a…` |
| `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` | _(commit)_ |

## STOP

Not APPROVED. No merge. Marketplace unchanged. Await ChatGPT **re-audit**.
