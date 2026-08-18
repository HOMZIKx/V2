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
