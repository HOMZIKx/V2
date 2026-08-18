# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_COMBINED_OWNER_CHATGPT_AUDIT` — task
`P4-PRODUCTION-RECOVERY-OBSERVABILITY-AND-DEPLOY-SAFETY-001`

ROLLING AUDIT MODE: **ACTIVE**

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 / #24 **NOT IMPLEMENTED**

START_SHA: `6b57d2d78050c44db0e84df6a0028f3bc25700f7`  
SECURITY_BASE_SHA: `bbef5f6d4997743a1d4d9788d76b46a9d4fe31fe`  
OPERABILITY_CHECKPOINT_SHA: filled in the docs commit immediately after the
implementation commit.

Previous HIGH findings from
`P4-ADVERSARIAL-SECURITY-AND-RESILIENCE-001` are **fixed in code** at
`bbef5f6`. Remaining HIGH is live Zeabur still on `9a3e922` until owner
redeploy — not an unfixed code path. Work continued.

## 2. Combined P4 matrix

START_SHA: `6b57d2d78050c44db0e84df6a0028f3bc25700f7`

SECURITY_BASE_SHA: `bbef5f6d4997743a1d4d9788d76b46a9d4fe31fe`

OPERABILITY_CHECKPOINT_SHA: (see follow-up docs commit)

CI: pending push of this checkpoint (local `pnpm validate` PASS)

PRODUCTION BUILDS:

authorization: PASS

identity: PASS

activity: PASS

api-gateway: PASS

discord: PASS

admin: PASS

web: PASS

RUNTIME:

authorization: BLOCKED_EXTERNAL (internal)

identity: BLOCKED_EXTERNAL (internal)

activity: BLOCKED_EXTERNAL (internal)

api: PASS (live `/health/live` 200; `/version` 404 until redeploy)

discord: BLOCKED_EXTERNAL (no public health URL supplied)

admin: PASS

web: PASS

REVISION CONSISTENCY: FAIL (live `gitCommitSha=9a3e922` vs branch tip)

DISCORD RECOVERY: NOT_TESTED (live bot restart). Code: startup Hub reconcile

- discord.js `stop()` on SIGTERM. Duplicate Hub not re-tested live.

DB RECOVERY: NOT_TESTED live. Unit: ready 503 when ping fails. Pool reconnect
defaults unchanged.

REDIS RECOVERY: NOT_TESTED live. Activity ready pings Redis when URL is set.
JTI store `enableOfflineQueue: false`, `maxRetriesPerRequest: 3`.

OUTBOX RECOVERY: PASS (code). Expired lease reclaim in `claimOutbox`. Ready
exposes `idle|working|backlogged|retrying|stuck`. Infra integration test
added (runs in CI `RUN_INFRA_TESTS`).

BACKUP: KNOWN (Zeabur addon snapshots / owner `pg_dump`; names only)

RESTORE PROOF: PASS (isolated local `activity` dump → `activity_restore_proof`
→ marker row → drop). Not production Zeabur.

ROLLBACK PROCEDURE: READY (`docs/deploy/ROLLBACK.md`; migrations forward-only)

RUNTIME DOCTOR: PASS (static; fail=0 warn=0)

RUNTIME SMOKE: FAIL live (`VERSION_DRIFT` vs `9a3e922`). Local
`pnpm test:runtime-smoke` PASS via `pnpm validate`. Live read path
`GET /activity/v1/admin/guilds` → 401 PASS. Admin/WWW HTTP 200 PASS.

SECURITY REGRESSIONS: PASS (`tools/security/p4-current-controls.test.ts` +
service specs)

KNOWN WARNINGS:

- Live Zeabur image SHA `9a3e922` until owner redeploy of this checkpoint.
- Current Zeabur project may still use one Postgres addon (ADR-0004 wants
  separate DBs).
- Production Dockerfiles run as image default user (no `USER` directive).
- Guild activity lists capped at 200 rows (safety, not a product pager).
- Identity Redis still uses `maxRetriesPerRequest: null` (Better Auth).
- `pnpm audit --audit-level=high`: 1 moderate, 0 high/critical.
- Discord restart, live DB/Redis failover: not exercised on Zeabur.

OWNER_ACTION_REQUIRED:

1. Redeploy this checkpoint SHA to all seven APPs; set `GIT_COMMIT_SHA` to
   that SHA on each APP (and rebuild Admin/WWW so `VITE_*` / `NEXT_PUBLIC_*`
   match).
2. Discord Developer Portal redirect URI exact:
   `https://v2-api.zeabur.app/api/auth/callback/discord`
3. Keep `ACTIVITY_TRUST_ACTOR_HEADERS=false`,
   `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`,
   `ACTIVITY_ALLOW_TEST_SEED=false`.
4. Enable `ACTIVITY_ENABLED=true` only with authorization-service + inbound
   clients + Redis JTI (else Admin writes stay 403 after DenyAll).

OWNER_VISUAL_REVIEW_REQUIRED:

- Admin dashboard **Diagnostyka** (Czy API/Activity/Discord/bot/wersje).
- Admin guild config complete + Hub published badges.
- Discord Hub: amber `#D48632`, DZIAŁAJ/TWOJE, no purple, no duplicate panel
  after restart/reconcile.
- WWW + Admin: unavailable / 401 / 403 / 409 / 503 copy — no raw
  `Failed to fetch`, `ECONNREFUSED`, or stack.

FINAL STATUS:

READY_FOR_COMBINED_OWNER_CHATGPT_AUDIT

## 3. Operability evidence (this task)

Registry: `tools/runtime/service-registry.json` (7 APPs + postgres aliases +
redis). CI: `pnpm architecture:check`.

Health: `docs/deploy/HEALTH.md`. Live cheap; ready fails closed.

Logs: `@v2/observability` JSON + redaction + correlation headers.

Docs: `docs/deploy/{HEALTH,PUBLIC_EXPOSURE,ROLLBACK,BACKUP_RESTORE,MIGRATION_SAFETY}.md`,
`docs/ops/INCIDENT_RUNBOOK.md`.

## 4. Security checkpoint (unchanged code at bbef5f6)

See previous handoff on `6b57d2d` / `6f52cfc`. CRITICAL none. HIGH 1–2 fixed
in repo; live lag until redeploy.

## 5. Out of scope (respected)

NO MERGE. NO P4.5. NO P4.6. NO RabbitMQ. NO #20–#24. No new microservice.
