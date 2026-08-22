# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_AUDIT`**

Task: `V2-DUNGEON-LFG-V1-DEEP-AUDIT-002`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
Implementation base: `DUNGEON_LFG_V1_IMPLEMENTATION_SHA` (`976b89c…`)  
Audit tip: `DUNGEON_LFG_V1_AUDIT_SHA` — pending push

## Deep audit delivered

Report: `docs/ai/DUNGEON_LFG_V1_AUDIT.md`

### CRITICAL fixed (2)

1. Discord join missing `statusDefId` — all Hub joins failed validation
2. Nie teraz suppress required `intentId` — search-only flow broken

### HIGH fixed (6)

- Join fail-closed on full slot (no silent waitlist)
- Party role fill revalidation at join
- Intent guild/org scope check on join
- Duplicate participation rejected
- Full-group reopen notifications wired
- Resume blocked for expired / past-window intents

### MEDIUM open (non-blocking)

- Identity S2S character ownership verify (UUID format mitigates casual abuse)
- Full-group watch member UX surface
- Docker integration concurrency suite

## Validation

| Check          | Result |
| -------------- | ------ |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate` (audit tip) |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## Ledger

| Marker                               | SHA        |
| ------------------------------------ | ---------- |
| `DUNGEON_LFG_V1_IMPLEMENTATION_SHA`  | `976b89c…` |
| `DUNGEON_LFG_V1_AUDIT_SHA`           | pending    |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace. Await ChatGPT audit.
