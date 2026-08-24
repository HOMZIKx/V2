# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_REAUDIT`** (unchanged)

Task: `V2-DURABILITY-RECOVERY-AND-AUTO-SYNC-AUDIT-002`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Durability / recovery audit

Report: `docs/ai/DURABILITY_RECOVERY_AUDIT.md`  
Checkpoint: `DURABILITY_RECOVERY_AUDIT_SHA` — _(set after commit)_

### CRITICAL/HIGH fixed (no product expansion)

1. Admin repair/scan → full `PROJECTION_REQUESTED` via `enqueueEventProjection`
2. `PANEL_PROJECTION_REPAIRED` audit-only (no thin Discord deliver)
3. Block `rabbitmq`/`dual` outbox transport until receipts exist
4. Max outbox attempts + projection `failed` + auto-repair worker
5. Projection claim/list exclude healthy `pending`
6. LFG watch/suppress/full-group Idempotency-Key wiring
7. Notification DM in-process `outboxId` dedupe

### Remaining (MEDIUM — architecture)

- Durable cross-restart delivery receipts for Discord create-before-ack
- Watch re-scan of existing groups = product decision (not implemented)
- Profile/interest Discord role apply loop = identity foundation only

## Prior audits

- `CROSS_SERVICE_CONTRACT_AUDIT_SHA` — `b7cf78fa258ac6e431a0510e21c13651271acb1b`
- `ZEABUR_PRODUCTION_READINESS_AUDIT_SHA` — `b4ce19fb066b7e44ef1322e236df4c730ccf7dce`

## LFG (prior — unchanged)

Remediation: `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` — `3c3009991f656e4369d3f600fcb05266683ede50`  
Await ChatGPT re-audit.

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | _(pending — run after fixes)_             |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace product work.
