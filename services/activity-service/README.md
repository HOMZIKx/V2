# activity-service

P4.1–P4.2 Centrum Aktywności — domain SoT for events, RSVP, limits, outbox, Discord projections, and panel state.

- Package: `@v2/activity-service`
- Database: `activity`
- Port: `4400`
- HTTP: `/activity/v1`
- Authorization: S2S HTTP to `authorization-service` (no local RBAC)
- Outbox worker: **off by default** (`ACTIVITY_OUTBOX_WORKER_ENABLED=false`)
  - Enable only when `ACTIVITY_DISCORD_PROJECTION_BASE_URL` points at discord-gateway deliver

## Local

```bash
pnpm --dir services/activity-service migrate
pnpm --dir services/activity-service dev
```

Keep `ACTIVITY_ENABLED=false` for tokenless local/tests (AllowAll Authorization client + `X-Actor-Discord-User-Id` headers).
Set `ACTIVITY_ALLOW_TEST_SEED=true` (non-production) to use `POST /activity/v1/test/seed-guild`.
