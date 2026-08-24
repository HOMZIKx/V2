# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_FINAL_REAUDIT`**

Task: `V2-LFG-DURABLE-DM-CONTEXT-FINAL-REMEDIATION-006`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19  
Audited remote HEAD (prior): `02b5f4ffd7e9ea11732e53039d286075137f3317`

## Durable DM context remediation (ChatGPT re-audit blocker)

Checkpoint: `DUNGEON_LFG_V1_DURABLE_DM_CONTEXT_SHA` — _(recorded after push)_  
Report: `docs/ai/DUNGEON_LFG_V1_AUDIT.md` (§ durable DM context)

### Root cause

Activity `deliveryActions` already carried `intentId`, `intentOpaqueId`, `eligiblePartyRoles`, `suggestedPartyRole`, `fullGroupWatchId`, etc., but Discord gateway dropped most of it: DM buttons encoded only `activityOpaqueId + guildId`; join used profile default character; suppress omitted `intentId`.

### Fix summary

1. **Compact signed durable context** in `lfg-dm-context.ts`: `i.{intentOpaque}.{guildId}[.{role}]`, `w.{watchOpaque}.{guildId}[.{role}]`, legacy ephemeral `e.{guildId}`.
2. **DM renderer** (`buildDeliveryActionComponents`): one join button per eligible role; suppress/view carry intent/watch opaque ids.
3. **Interaction handler**: intent join passes `intentId` only (backend uses intent character); watch join resolves stored `characterId`; Nie teraz resolves intent opaque → exact `intentId` suppress.
4. **Activity service**: `intentOpaqueId` / `fullGroupWatchOpaqueId` in notify payloads; resolve-by-opaque GET routes; `joinLfgActivity` always uses `intent.characterId` when `intentId` present.
5. **Regression tests**: E2E path notification → buttons → handler → Activity client; CHARACTER_A default vs CHARACTER_B intent; multi-intent fulfill-one; stale role; watch join.

### CRITICAL/HIGH

**0 open** in durable DM context scope.

### Contracts preserved

`@v2/contracts` LFG transport unchanged: `characterId` / `intentId` based; no client-authoritative `characterClassSpecKey` / `characterSupportedRoles`.

## Prior audits

- `DURABILITY_RECOVERY_AUDIT_SHA` — `be86063726947930a02c06eab38dad947a4243cc`
- `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` — `3c3009991f656e4369d3f600fcb05266683ede50`
- `CROSS_SERVICE_CONTRACT_AUDIT_SHA` — `b7cf78fa258ac6e431a0510e21c13651271acb1b`

## Validation

| Check          | Result                                        |
| -------------- | --------------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate`           |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT**     |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace product work. Await ChatGPT **final** re-audit.
