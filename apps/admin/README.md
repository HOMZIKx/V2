# Admin (React + Vite + React Router 8)

Panel administracyjny V2. P4.3 dodaje **Centrum Aktywności** Admin UI.

## Dev

```bash
pnpm --dir apps/admin dev
```

Default: http://127.0.0.1:3001

Vite loads `VITE_*` from the **monorepo root** `.env` (see `vite.config.ts` `envDir`).
Copy `.env.example` → `.env` at repo root and set at least:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4400
VITE_ADMIN_DEV_ACTOR_DISCORD_ID=<your-discord-user-id>
VITE_ADMIN_DEV_GUILDS=[{"id":"<guild-id>","name":"<human-readable name>"}]
```

For a real guild list (not only DEV fallback), also run `activity-service` with
`ACTIVITY_DISCORD_PROJECTION_BASE_URL=http://127.0.0.1:4100`,
`ACTIVITY_PROJECTION_SHARED_SECRET`, and local `ACTIVITY_TRUST_ACTOR_HEADERS=true`
(dev-only). Discord Gateway must be running with `DISCORD_ENABLED=true` and the
bot logged into the target guild.

## Auth (P4.3 pragmatic)

- **Local/dev:** set `VITE_ADMIN_DEV_ACTOR_DISCORD_ID` (sent as `X-Actor-Discord-User-Id`).
- Optional guild list: `VITE_ADMIN_DEV_GUILDS` JSON array of `{ "id", "name" }`.
  Used only in DEV actor mode, and only as a local fallback when
  `GET /activity/v1/admin/guilds` fails. Identity-cookie mode never reads it.
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
