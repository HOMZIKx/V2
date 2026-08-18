# Cursor → ChatGPT handoff

## Status

Task: `P4-COMBINED-AUDIT-FIXUP-001`

`READY_FOR_CHATGPT_P4_0_DELTA_AUDIT` requires green GitHub Actions and
Zeabur of the same SHA. This commit is the code checkpoint.

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 / #24 **NOT IMPLEMENTED**

FIXUP_START_SHA: `1290df92681ee1e98fde3e0efaf231f7d110f6db`

FIXUP_CHECKPOINT_SHA: _(git rev-parse of this commit)_

Owner roadmap **#26**: full manual Owner UX/product acceptance of the
transitional Activity Centrum is **deferred** to Core Foundation Integrated
Review. Technical CI / security / runtime / Zeabur / ChatGPT audit remain
mandatory.

## AUDIT FINDINGS

### 1. WEB_DISCORD_OAUTH_PRODUCTION_LOCALHOST_REDIRECT

STATUS: FIXED (code + tests; live proof after WWW rebuild)

CODE EVIDENCE:

- `apps/web/src/lib/public-origin.ts` + `env.ts`: production requires https
  public origins; no localhost / 127.0.0.1 / ::1 fallback.
- `Dockerfile.web` validates `NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_IDENTITY_URL`, `NEXT_PUBLIC_WEB_ORIGIN` at image build.
- `isLoginConfiguredFromOrigins()` rejects loopback in production.
- Doctor: `WEB_IDENTITY_BASE`, `WEB_PUBLIC_ORIGIN`, `OAUTH_START`,
  `OAUTH_LOOPBACK`, `WEB_LOGIN_ORIGIN`.

TEST EVIDENCE: `public-origin.spec.ts`, `login.spec.ts`,
`callback-url.spec.ts`, `runtime-doctor.test.ts`.

LIVE EVIDENCE: pending Zeabur rebuild of this SHA.

### 2. API_GATEWAY_REAL_READINESS

STATUS: FIXED

CODE EVIDENCE: `apps/api-gateway/src/health-probes.ts` probes
`/health/ready` (not `/health/live`). 503 / timeout / malformed →
unhealthy → gateway ready 503. Live stays cheap. Disabled vs
not_configured vs ok are machine-readable.

TEST EVIDENCE: `health-probes.spec.ts`, `health.controller.spec.ts`.

### 3. ADMIN_REAL_DISCORD_DIAGNOSTICS

STATUS: FIXED

CODE EVIDENCE: Admin reads `ready.discord.state` from public api-gateway.
Gateway probes internal discord-gateway `/health/ready`. Guild list is not
used for “Czy Discord działa?” / “Czy bot jest połączony?”. Unknown →
“Nie wiadomo”, not “Tak”.

TEST EVIDENCE: `runtime-status.spec.ts`, `audit-closure.spec.ts`.

### 4. ADMIN_PRODUCTION_STATIC_RUNTIME

STATUS: FIXED

CODE EVIDENCE: `apps/admin/scripts/serve-static.mjs`; Dockerfile.admin CMD
`node ./scripts/serve-static.mjs`. Validator fails `vite preview` CMD.
Local smoke uses the static server.

TEST EVIDENCE: `serve-static.spec.ts`; Admin image `/`, `/login`, `/health`,
stop PASS.

### 5. DISCORD_PROJECTION_GUILD_CHANNEL_SCOPE

STATUS: FIXED

CODE EVIDENCE: `projection-channel-scope.ts` calls
`validateActivityPublishChannel` against `DISCORD_TEST_GUILD_ID` before
publish/edit/hub. Wrong guild / DM / unsupported / missing permissions
return controlled errors.

TEST EVIDENCE: `projection-channel-scope.spec.ts`,
`activity-projection.controller.spec.ts` (including idempotent duplicate).

### 6. SOT_OWNER_REVIEW_POLICY

STATUS: FIXED

CODE EVIDENCE: `OWNER_P4_1_TO_P4_4_REVIEW.md`, `PROJECT_STATE.md`, this
file. Manual UX checklists labeled **DEFERRED OWNER UX REVIEW / CORE
FOUNDATION INTEGRATED REVIEW**.

## Local validation

- format:check PASS
- unit/architecture/static doctor PASS
- web e2e 14 passed
- runtime-smoke PASS
- audit --audit-level=high PASS (1 moderate)
- production images 7/7 PASS

CI: pending push of this SHA

## Out of scope (respected)

NO MERGE. NO P4.5. NO P4.6. NO RabbitMQ. NO #20–#24. No new microservice.
