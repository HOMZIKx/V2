# Admin (React + Vite + React Router 8)

Panel administracyjny V2. P4.3 dodaje **Centrum Aktywności** Admin UI.

## Dev

```bash
pnpm --dir apps/admin dev
```

Default: http://127.0.0.1:3001

## Auth (P4.3 pragmatic)

- **Local/dev:** set `VITE_ADMIN_DEV_ACTOR_DISCORD_ID` (sent as `X-Actor-Discord-User-Id`).
- Optional guild list: `VITE_ADMIN_DEV_GUILDS` JSON array of `{ "id", "name" }`.
- Optional org for ensure-defaults: `VITE_ADMIN_DEV_ORG_ID`.
- **Production:** Identity session cookie via API gateway. All fetches use
  `credentials: 'include'`. No password login in this app.

A DEV actor banner is shown when the actor env var is set.

## API

Local (direct activity-service):

```bash
VITE_API_BASE_URL=http://127.0.0.1:4400
```

Preferred browser path (api-gateway BFF proxy, no private service topology):

```bash
VITE_API_BASE_URL=http://127.0.0.1:4000
```

Gateway forwards `/activity/v1/*` to `ACTIVITY_SERVICE_BASE_URL` and preserves
cookies + `X-Actor-Discord-User-Id`.

Client paths:

- Admin: `/activity/v1/admin/guilds/:guildId/...`
- Ensure defaults: `POST /activity/v1/guilds/:guildId/ensure-defaults`

Mutations send `Idempotency-Key` (UUID).

## Routes

| Path                       | Screen               |
| -------------------------- | -------------------- |
| `/`                        | Bootstrap status     |
| `/activity`                | Overview / readiness |
| `/activity/types`          | Activity types       |
| `/activity/statuses`       | Status defs          |
| `/activity/fields`         | Field catalog        |
| `/activity/channels`       | Publish channels     |
| `/activity/pings`          | Ping roles           |
| `/activity/limits`         | Limits               |
| `/activity/notifications`  | DM + reminders       |
| `/activity/report-reasons` | Report reasons       |
| `/activity/events`         | Events list          |
| `/activity/events/:id`     | Event detail         |
| `/activity/projections`    | Projection problems  |
| `/activity/reports`        | Reports              |
| `/activity/audit`          | Audit log            |
| `/activity/hub`            | Hub channel          |

## Quality

```bash
pnpm --dir apps/admin typecheck
pnpm --dir apps/admin test
pnpm --dir apps/admin build
```
