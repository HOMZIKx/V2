# Incident runbook (current P4)

No secret values in this file. Contain → identify → recover → verify.

## Discord token compromised

1. **Contain:** Discord Developer Portal → Reset Token. Disable the bot in
   the test guild if needed (`DISCORD_ENABLED=false` + redeploy).
2. **Identify:** Zeabur discord-gateway logs (no token printed). Who had
   portal access.
3. **Recover:** paste new token into discord-gateway Variables only. Redeploy.
   Confirm `/health/discord` `state: ready`. Reconcile Hub.
4. **Verify:** bot online, Hub single message, no unexpected guilds.

## Service secret compromised (JWT, projection, DB URL)

1. **Contain:** rotate the named Variable in Zeabur. Do not commit the new
   value. If a PEM leaked, generate a new key pair and update both issuer and
   audience services together.
2. **Identify:** which APP Variable, which SHA was running.
3. **Recover:** redeploy dependents (activity + discord for projection secret;
   activity + authorization for authz keys; identity for Better Auth secret).
4. **Verify:** health ready, one Admin mutation, one Discord button.

## Browser sessions need invalidation

1. **Contain:** rotate `IDENTITY_BETTER_AUTH_SECRET` (logs everyone out) and/or
   run identity system-revoke for the user. Flush identity Redis DB if
   sessions live there.
2. **Identify:** user id / time window from identity audit if present.
3. **Recover:** users sign in through Discord again.
4. **Verify:** old cookie is 401 on `/session/me`.

## activity-service down

1. **Contain:** Admin/WWW will show unavailable copy. Discord Hub buttons fail
   closed. Do not post a second Hub.
2. **Identify:** `/health/live` vs `/health/ready`, outbox `state`, Zeabur logs.
3. **Recover:** Postgres/Redis, then activity APP. Restart discord-gateway if
   projections stalled; outbox reclaims expired leases.
4. **Verify:** ready 200, outbox `idle` or `working`, Admin guild list.

## Discord gateway down

1. **Contain:** HTTP health may still be up. Users cannot click Hub.
2. **Identify:** `/health/discord` state, lastError (no tokens).
3. **Recover:** redeploy discord-gateway. Startup Hub reconcile should update
   the existing message.
4. **Verify:** `state: ready`, one Hub, amber renderer, no purple.

## DB unavailable

1. **Contain:** ready 503. Live should stay 200. Platform probe must use live.
2. **Identify:** which addon (`postgres-activity` vs identity vs authorization).
3. **Recover:** wait/restart addon. Service reconnects via pool. If data loss,
   restore to a **new** database (`BACKUP_RESTORE.md`).
4. **Verify:** ready 200, no crash loop.

## Redis unavailable

1. **Contain:** identity sessions and activity assertion JTI fail closed.
2. **Identify:** identity/activity ready `checks.redis`.
3. **Recover:** restart Redis addon. Do not disable JTI in production.
4. **Verify:** login works; a replayed assertion is rejected.

## Identity down

1. **Contain:** api-gateway `/health/ready` 503 when identity probe is `unhealthy`.
   Web login and session refresh fail closed.
2. **Identify:** gateway ready `checks.identity`, identity-service logs with
   `correlationId`, category `UPSTREAM_FAILURE` or ready `checks.database`.
3. **Recover:** restore identity Postgres/Redis, redeploy identity-service.
   Do not rotate Better Auth secret unless sessions must be invalidated.
4. **Verify:** identity `/health/ready` 200, gateway ready 200, `/session/me`
   works after login.

## Authorization down

1. **Contain:** activity admin mutations and entitlement checks fail closed
   (`AUTHORIZATION_UNAVAILABLE` / category `UPSTREAM_FAILURE`).
2. **Identify:** authorization ready 503, activity logs `category`:
   `UPSTREAM_FAILURE`, correlation id from failing Admin request.
3. **Recover:** restore authorization Postgres, redeploy authorization-service.
   Sync guild inventory after recovery if reconcile was in flight.
4. **Verify:** authorization ready 200, Admin guild list loads, one
   `activity_read` and one `activity_mutate` succeeds.

## Projection backlog (Discord panels stale)

1. **Contain:** Hub/event panels may lag; do not post duplicate Hub messages.
2. **Identify:** activity ready `outbox.state` (`backlogged`, `retrying`,
   `stuck`), `oldestPendingAgeSeconds`, `lastErrorCategory`. Admin
   `GET /activity/v1/admin/diagnostics/outbox`. Discord `/health/discord`
   for bot state. Filter logs: `event=outbox_deliver_retry`.
3. **Recover:** fix discord-gateway if disconnected; restore projection secret
   alignment; let outbox worker reclaim expired leases. Restart activity only
   if worker stuck — leases expire in ~30s.
4. **Verify:** outbox `state` returns to `idle` or `working`, projection
   rows show `delivered`, Hub updates in place.

## Notification backlog (DMs delayed)

1. **Contain:** inbox items remain unread; users may get delayed LFG match DMs.
2. **Identify:** outbox counts for `activity.notification.deliver.v1`,
   `lastErrorCategory` `RATE_LIMITED` vs `UPSTREAM_FAILURE`. Discord gateway
   logs for DM rate limits (no token values).
3. **Recover:** wait for Discord 429 backoff (Retry-After honored). If
   `failed` > 0 with category `RETRY_EXHAUSTED`, inspect dead letters in
   outbox — do not replay payloads manually in production without runbook
   owner approval.
4. **Verify:** pending notification outbox drains, sample DM received,
   outbox `failed` stable at 0.

## Migration failure

1. **Contain:** service ready 503 with `checks.migrations: false`. Do not
   serve traffic that assumes new schema.
2. **Identify:** startup logs, `migration-readiness` manifest vs DB
   `activity_schema_migrations` count. Which migration id is missing.
3. **Recover:** fix migration SQL offline, redeploy with corrected forward
   migration only. **Never** down-migrate production. Restore from backup
   to a **new** database if data is corrupt (`BACKUP_RESTORE.md`).
4. **Verify:** ready 200, `countSchemaMigrations` matches manifest,
   smoke read path on affected tables.

## Bad deploy

1. **Contain:** stop rolling further APPs. Keep previous image if still up.
2. **Identify:** SHA from `/health/live` vs intended Git SHA.
3. **Recover:** `ROLLBACK.md` — same SHA everywhere, no DB down-migrate.
4. **Verify:** doctor `VERSION_DRIFT` MATCH, smoke read path.

## Mixed revisions

1. **Contain:** avoid Admin writes that new API does not understand.
2. **Identify:** Admin `VITE_GIT_COMMIT_SHA` vs API `gitCommitSha` vs Discord
   `/health/live`.
3. **Recover:** redeploy all APPs to one SHA, including Admin/WWW rebuild.
4. **Verify:** dashboard “wersje spójne” MATCH or UNKNOWN with documented
   missing SHA, not MISMATCH.

## Suspected data leak

1. **Contain:** rotate leaked secrets; restrict Zeabur/GitHub access; do not
   paste dumps into chat.
2. **Identify:** which table/log/Variable. Preserve logs.
3. **Recover:** rotate, restore if needed, session invalidation.
4. **Verify:** secret scan, owner walkthrough of Admin/WWW.

## Suspected unauthorized admin activity

1. **Contain:** revoke the actor session; remove CONFIG_MANAGE in
   authorization-service; disable `ACTIVITY_ENABLED` only as last resort.
2. **Identify:** activity audit entries (`correlation_id`), identity session.
3. **Recover:** restore config from last known good revision if corrupted.
4. **Verify:** actor is 403; Hub/config match owner intent.
