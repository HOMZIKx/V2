# activity-service

P4.1 Centrum Aktywności — domain SoT for events, RSVP, limits, outbox, and panel state.

- Package: `@v2/activity-service`
- Database: `activity`
- Port: `4400`
- HTTP: `/activity/v1`
- Authorization: S2S HTTP to `authorization-service` (no local RBAC)
- Outbox worker: **off by default** (`ACTIVITY_OUTBOX_WORKER_ENABLED=false`)

## Local

```bash
pnpm --dir services/activity-service migrate
pnpm --dir services/activity-service dev
```

Keep `ACTIVITY_ENABLED=false` for tokenless local/tests (AllowAll Authorization client + `X-Actor-Discord-User-Id` headers).
