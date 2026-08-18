# Cursor → ChatGPT handoff

## Status

Task: `P4-COMBINED-AUDIT-FIXUP-001`

FINAL STATUS:

READY_FOR_CHATGPT_P4_0_DELTA_AUDIT

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ  
ISSUE #20 / #21 / #22 / #23 / #24 **NOT IMPLEMENTED**

FIXUP_START_SHA: `1290df92681ee1e98fde3e0efaf231f7d110f6db`

FIXUP_CHECKPOINT_SHA: `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8`

Owner roadmap **#26**: full manual Owner UX of the transitional Centrum is
deferred to Core Foundation Integrated Review. Technical CI / security /
runtime / Zeabur / ChatGPT audit remain mandatory.

## AUDIT FINDINGS

### 1. WEB_DISCORD_OAUTH_PRODUCTION_LOCALHOST_REDIRECT

STATUS: FIXED

CODE EVIDENCE: `apps/web/src/lib/public-origin.ts`, `env.ts`,
`Dockerfile.web` fail-closed https public origins; doctor OAUTH_* /
WEB_* checks.

TEST EVIDENCE: `public-origin.spec.ts`, `login.spec.ts`,
`callback-url.spec.ts`, `runtime-doctor.test.ts`.

LIVE EVIDENCE: OAuth start Location
`https://discord.com/api/oauth2/authorize?...&redirect_uri=https%3A%2F%2Fv2-api.zeabur.app%2Fapi%2Fauth%2Fcallback%2Fdiscord`.
WWW login JS: `readPublicOrigin("https://v2-api.zeabur.app", "http://127.0.0.1:4200")` —
production uses the public origin, loopback is only the unused local fallback
string. Login HTML contains no loopback href.

### 2. API_GATEWAY_REAL_READINESS

STATUS: FIXED

CODE EVIDENCE: probes `/health/ready`; 503/timeout/malformed → 503.
Live remains cheap.

TEST EVIDENCE: `health-probes.spec.ts`.

LIVE EVIDENCE: `GET https://v2-api.zeabur.app/health/ready` → 200
`checks.activity=disabled`, `checks.identity=ok`, `discord.state=ready`.

### 3. ADMIN_REAL_DISCORD_DIAGNOSTICS

STATUS: FIXED

CODE EVIDENCE: Admin maps `ready.discord.state`; guild list is not used
for Discord/bot flags.

TEST EVIDENCE: `runtime-status.spec.ts`, `audit-closure.spec.ts`.

LIVE EVIDENCE: api-gateway `discord.state=ready` after internal
`DISCORD_GATEWAY_BASE_URL`. Unknown would render „Nie wiadomo”, not „Tak”.

### 4. ADMIN_PRODUCTION_STATIC_RUNTIME

STATUS: FIXED

CODE EVIDENCE: `serve-static.mjs`; Dockerfile CMD is not vite preview.

LIVE EVIDENCE: `GET https://v2-admin.zeabur.app/health` 200 with
`gitCommitSha=7f9e15e…`; SPA `/activity/types` returns the shell.

### 5. DISCORD_PROJECTION_GUILD_CHANNEL_SCOPE

STATUS: FIXED

CODE EVIDENCE: `projection-channel-scope.ts` before publish/edit/hub.

TEST EVIDENCE: wrong guild / DM / unsupported / missing permissions /
valid / idempotent duplicate.

### 6. SOT_OWNER_REVIEW_POLICY

STATUS: FIXED

Issue #26 deferred UX checklists remain in
`OWNER_P4_1_TO_P4_4_REVIEW.md`. CI is recorded as PASS, not pending.

## CI

PASS — https://github.com/HOMZIKx/V2/actions/runs/32180546956

Quality gates PASS · Secret scan PASS · Infrastructure integration PASS

## ZEABUR REVISION (image commitSHA + live gitCommitSha)

authorization: `7f9e15e` RUNNING
identity: `7f9e15e` RUNNING
activity: `7f9e15e` RUNNING
api: `7f9e15e` RUNNING (live MATCH)
discord: `7f9e15e` RUNNING
admin: `7f9e15e` RUNNING (live MATCH)
web: `7f9e15e` RUNNING (live MATCH)

REVISION CONSISTENCY: PASS

## Out of scope (respected)

NO MERGE. NO P4.5. NO P4.6. NO RabbitMQ. NO #20–#24.
