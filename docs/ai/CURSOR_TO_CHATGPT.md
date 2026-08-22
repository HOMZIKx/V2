# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

LFG: **`READY_FOR_CHATGPT_REAUDIT`** (unchanged)

Task: `V2-ZEABUR-TIP-REDEPLOY-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Zeabur tip redeploy

Live proof before redeploy:

| Endpoint | Running SHA | vs tip |
| -------- | ----------- | ------ |
| `https://v2-api.zeabur.app/health/live` | `2c2b3e9` | 36 commits behind |
| `https://v2-admin.zeabur.app/health` | `2c2b3e9` | 36 behind |
| `https://v2-web.zeabur.app/health` | `22ba38b` | 71 behind |

`appVersion` was `0.0.0-dev` (default). Discord `/status` uses the same revision fields.

### Code fix (this push)

1. Bake `V2_IMAGE_GIT_COMMIT_SHA` from Zeabur `ZEABUR_GIT_COMMIT_SHA` in all app Dockerfiles.
2. `readRuntimeRevision` (+ Discord/web/admin health) **prefers image bake** over stale manual `GIT_COMMIT_SHA` Variable.
3. Script `tools/scripts/zeabur-redeploy.mjs` / `pnpm zeabur:redeploy` updates vars + redeploys all APP services.

### Blocker

Redeploy from agent requires Owner secrets: `ZEABUR_TOKEN` and `ZEABUR_ENV_ID`.
Requested via environment setup actions. Without them CLI cannot call Zeabur API.

## Prior Zeabur audit

Checkpoint: `ZEABUR_PRODUCTION_READINESS_AUDIT_SHA` — `b4ce19fb066b7e44ef1322e236df4c730ccf7dce`

## STOP

Not APPROVED. No merge. No Reservations/Marketplace product work.
Await Owner Zeabur token (or manual panel redeploy) then verify health SHA = tip.
