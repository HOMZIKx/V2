# PROJECT_STATE

## Status

`READY_FOR_COMBINED_OWNER_CHATGPT_AUDIT` —
`P4-PRODUCTION-RECOVERY-OBSERVABILITY-AND-DEPLOY-SAFETY-001`

Not APPROVED. Not merged. P4 not complete. Do not start P4.5.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 #24 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- START_SHA: `6b57d2d78050c44db0e84df6a0028f3bc25700f7`
- SECURITY_BASE_SHA: `bbef5f6d4997743a1d4d9788d76b46a9d4fe31fe`
- OPERABILITY_CHECKPOINT_SHA: recorded in the follow-up docs commit after this
  implementation lands.

## What this task changed (current P4 only)

- One deployable topology registry (`tools/runtime/service-registry.json`)
  with drift CI (`revisionCapability`, no `VITE_*` secrets, no tsx CMD).
- Safe revision contract: `/health/live` plus api-gateway `/version`;
  doctor `MATCH` / `MISMATCH` / `UNKNOWN`.
- Ready probes fail closed on critical deps (DB/Redis/upstreams). Live stays
  cheap. Activity ready exposes outbox `idle|working|backlogged|retrying|stuck`.
- Correlation IDs (`x-correlation-id` / `x-request-id`) generated at
  api-gateway and Admin; structured logs redact secrets.
- Operational error categories in activity logs/JSON; no stack to browsers.
- Bounded SIGTERM (15s) on Nest APPs; Redis JTI `enableOfflineQueue: false`;
  outbox reclaim of expired leases; list queries `LIMIT 200`; proxy timeouts.
- Admin Diagnostyka answers API/Activity/Discord/bot/config/Hub/revision
  questions in Polish.
- Operator docs: health, public exposure, rollback, backup/restore, migration
  safety, incident runbook.

## Validation (local)

- `pnpm format:check` — pass
- `pnpm validate` — pass (`V2_SMOKE_*` unset)
- `pnpm audit --audit-level=high` — pass (1 moderate, 0 high/critical)
- Production Dockerfiles (7/7) — pass (`v2-*:operability`)
- `pnpm runtime:doctor` static — pass
- Local activity `pg_dump` → isolated `pg_restore` — `RESTORE_PROOF: PASS`

## Live Zeabur until this SHA is redeployed

Public stack still reports `gitCommitSha=9a3e922`. `/version` 404 until
api-gateway is redeployed. That is deployment lag.

## Owner next

1. Redeploy this checkpoint SHA to all seven APPs. Set `GIT_COMMIT_SHA` per APP.
2. Discord Portal redirect URI:
   `https://v2-api.zeabur.app/api/auth/callback/discord`
3. Keep `ACTIVITY_TRUST_ACTOR_HEADERS=false`,
   `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`,
   `ACTIVITY_ALLOW_TEST_SEED=false`.
4. `ACTIVITY_ENABLED=true` only with authorization-service + inbound clients +
   Redis JTI.
5. Combined visual review: Admin Diagnostyka, Hub amber `#D48632`, WWW/Admin
   failure copy (no raw `Failed to fetch`).

## Last updated

2026-08-18 — P4 production recovery / observability / deploy safety
