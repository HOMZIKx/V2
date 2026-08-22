# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_REAUDIT`** (unchanged by Zeabur audit)

Task: `V2-ZEABUR-PRODUCTION-READINESS-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Zeabur production readiness audit

Report: `docs/ai/ZEABUR_PRODUCTION_READINESS_AUDIT.md`  
Checkpoint: `ZEABUR_PRODUCTION_READINESS_AUDIT_SHA` *(recorded after commit)*

### Safe fixes (no product behavior)

1. **Authorization migrations in Docker** — `migrate-prod.mjs`, Dockerfile copies `migrations/`
2. **Production fail-closed** — `AUTHORIZATION_ENABLED` must be `true` when `NODE_ENV=production`
3. **Readiness migration gates** — authz + activity ready verify foundation migrations; authz pings Redis when configured
4. **Env template** — `ACTIVITY_IDENTITY_*`, `IDENTITY_CHARACTER_RESOLVE_URL` in `.env.example`
5. **Runtime smoke** — authorization uses `NODE_ENV=test` for tokenless boot (prod Zeabur still requires enabled auth)

### Open deploy items (Owner)

- Full identity/auth/activity secret matrix on Zeabur
- `btree_gist` before activity migration 016
- API gateway→activity assertion bundle when `ACTIVITY_ENABLED=true`
- CI billing restore

## LFG (prior task — unchanged)

Remediation: `DUNGEON_LFG_V1_CHATGPT_REMEDIATION_SHA` — `3c3009991f656e4369d3f600fcb05266683ede50`  
Await ChatGPT re-audit; no E2E contract remediation SHA yet.

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS** — `corepack pnpm validate`       |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace product work.
