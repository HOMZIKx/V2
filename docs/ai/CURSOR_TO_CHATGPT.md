# Cursor → ChatGPT handoff

## 1. Status

`READY_FOR_OWNER_ZEABUR_AND_DISCORD_LIVE_TEST`

## 2. HEAD

See git tip on `cursor/p4-1-activity-domain` after `P4-DEPLOY-CLOSURE-002` commit.
Baseline was `bb8c17773aed229881f60adbdc07f8c52cd36f8e`.

## 3. Delta summary (this task)

### Projection secret contract
- Outbox dispatcher sends `x-activity-projection-secret`; fail-fast if missing
- Env requires secret when outbox worker enabled
- Discord consumer: reject missing/wrong; config fail-fast when activity enabled

### API gateway
- CORS helper: OPTIONS → 204 ends request; credentialed headers; unit tests
- Cookie used only for Identity session resolve; **not** forwarded to activity

### WWW / Discord review blockers
- A: UnauthorizedState on 401 pages
- B: HORIZON_EXCEEDED always Polish (code checked before English body)
- C/D: showModal first; modal submit `deferReply` before HTTP

### Production Docker
- Nest Dockerfiles build TS → `node` runtime (no tsx/`pnpm run dev`)
- Smoke: discord-gateway, activity-service, api-gateway `/health/live` 200

### Zeabur docs
- `docs/deploy/ZEABUR_OWNER_VARIABLES.md` service mapping table + variable NAMES
- Migrations procedure documented
- Branch: `cursor/p4-1-activity-domain`; `ZBPACK_DOCKERFILE_NAME` = suffix only

## 4. Validation

- `pnpm validate` PASS
- `pnpm audit --audit-level=high` → high = 0 (1 moderate unrelated)

## 5. Owner actions

1. Zeabur credit (last status `$0.00` / SUSPENDED)
2. Variables per ZEABUR_OWNER_VARIABLES.md (no secrets in chat)
3. Ignore/delete broken monorepo service `v2`
4. `/centrum-reconcile` after discord-gateway deploy

## 6. Explicit

NO MERGE · NO P4.5 · NO P4.6 · NO RABBITMQ · ISSUE #20 NOT IMPLEMENTED
