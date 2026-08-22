# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-POST-OVERBUILD-TECHNICAL-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
HEAD: `25552dc75a5551f7185d77a8c02bbca5999bee89` (`POST_OVERBUILD_TECHNICAL_AUDIT_SHA`)

## Audit delivered

Report: `docs/ai/POST_OVERBUILD_TECHNICAL_AUDIT.md`  
Range: `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA` (`90fc384…`) → audit tip.

### CRITICAL fixed (3)

1. LFG private activity disclosure + missing READ authz
2. Reservation double-booking race → migration `016` exclusion constraint
3. Notification outbox false-complete on DM rate limit / upstream error

### HIGH fixed (7)

- Guild-scoped `requirePermission` on LFG/Reservations/Marketplace/prefs
- Notification fingerprint refresh on dedupe collision + DM retry
- Reservation spot scope validation from DB
- Marketplace match notification cap (50)
- LFG cancel NOT_FOUND, party-role/window validation, org filter on notify

### OPEN (documented, no product expansion)

- LFG `countParticipationsByPartyRole` stub
- `notifyLfgIntentsForActivity` unwired
- Notification producer mute-key audit, inbox-backed DM recipient verify
- Full module Owner Discovery gates unchanged

## Fresh facts

| Field                  | Value                                          |
| ---------------------- | ---------------------------------------------- |
| CURRENT_PRODUCT_STATUS | `CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED` |
| CI_STATUS              | **RED** — GitHub billing blocker               |
| LOCAL_VALIDATE         | **PASS** on audit tip                          |

## Ledger

| Marker                                       | SHA          |
| -------------------------------------------- | ------------ |
| `POST_OVERBUILD_TECHNICAL_AUDIT_SHA`         | `25552dc…`   |
| `OWNER_DISCOVERY_GOVERNANCE_REMEDIATION_SHA` | `9a6ab22…`   |
| `DEEP_POLISH_AND_AUTO_SYNC_CHECKPOINT_SHA`   | `90fc384…`   |

## STOP

Not READY. No merge. No Stage 8. No WIP product expansion.
