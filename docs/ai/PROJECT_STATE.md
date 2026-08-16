# PROJECT_STATE

## Status

`READY_FOR_OWNER_ZEABUR_AND_DISCORD_LIVE_TEST`

## Explicit gates

- **NO MERGE**
- **NO P4.5**
- **NO P4.6**
- **NO RABBITMQ** in this deploy
- Issue #20 **NOT IMPLEMENTED**
- **OWNER LIVE TESTS REQUIRED** (Zeabur + Discord `/centrum-reconcile`)

## Active phase

`P4-DEPLOY-CLOSURE-002` — production Docker runtime, projection secret
contract, gateway CORS/cookie hardening, Zeabur owner checklist, WWW 401 UI,
Discord modal ACK timing, HORIZON Polish copy.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- Baseline HEAD: `bb8c17773aed229881f60adbdc07f8c52cd36f8e`

## Delivered in this delta

- Projection: outbox always sends `x-activity-projection-secret`; fail-fast
  without secret; consumer reject missing/wrong; boot fail when activity on
  without secret
- API gateway: CORS OPTIONS ends cleanly; Identity Cookie not forwarded to
  activity-service
- WWW: `UnauthorizedState` for 401 (no blank screen)
- Discord: showModal before HTTP; modal submit defer before network;
  HORIZON_EXCEEDED always Polish
- Production Dockerfiles: `node dist/...` (no `pnpm run dev` / tsx runtime)
- Docker smoke: discord-gateway, activity-service, api-gateway health/live OK
- Docs: `ZEABUR_OWNER_VARIABLES.md` owner-friendly mapping + migrations

## Owner next

1. Top up Zeabur credit if SUSPENDED (`$0.00` blocks deploy)
2. Follow `docs/deploy/ZEABUR_OWNER_VARIABLES.md` (branch
   `cursor/p4-1-activity-domain`, `ZBPACK_DOCKERFILE_NAME` = suffix only)
3. Migrate activity DB; redeploy `activity-service` + `discord-gateway`
4. Confirm `APP_VERSION` / `GIT_COMMIT_SHA` = tip SHA
5. Discord: `/centrum-reconcile` (in-place update, no duplicate panel)

## Explicitly not done

- Merge to `main`
- Live Zeabur green (owner Variables + credit)
- P4.5 / P4.6 / RabbitMQ / Issue #20

## Last updated

2026-08-16 — P4-DEPLOY-CLOSURE-002
