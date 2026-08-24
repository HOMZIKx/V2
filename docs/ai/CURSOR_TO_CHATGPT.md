# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_REAUDIT`** (unchanged by contract audit)

Task: `V2-CROSS-SERVICE-CONTRACT-DRIFT-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Cross-service contract drift audit

Report: `docs/ai/CROSS_SERVICE_CONTRACT_AUDIT.md`  
Checkpoint: `CROSS_SERVICE_CONTRACT_AUDIT_SHA` _(recorded after rebase tip)_

### CRITICAL/HIGH fixed (no product expansion)

1. **LFG search** — consumers now send `characterId` (server-authoritative); shared `LfgSearchRequestSchema`
2. **LFG join** — drop client class-spec authority; pass `characterId`
3. **Discord occupancy** — response schema is `{ occupied, capacity }` via shared contract
4. **Admin audit** — `offset`/`total` pagination (was broken `cursor`/`nextCursor`)
5. **Dead `types/reorder` client** — removed
6. **Full-group cancel** — requires `guildId` query
7. **`@v2/contracts` transport** + contract tests; Docker builds contracts to dist

## Prior Zeabur work

- Audit: `ZEABUR_PRODUCTION_READINESS_AUDIT_SHA` — `b4ce19fb066b7e44ef1322e236df4c730ccf7dce`
- Tip redeploy prep: image bake of `V2_IMAGE_GIT_COMMIT_SHA`; `pnpm zeabur:redeploy` blocked without Owner `ZEABUR_TOKEN` / `ZEABUR_ENV_ID`

## LFG (prior — unchanged)

Remediation: `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` — `3c3009991f656e4369d3f600fcb05266683ede50`  
Await ChatGPT re-audit.

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate`       |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace product work.
