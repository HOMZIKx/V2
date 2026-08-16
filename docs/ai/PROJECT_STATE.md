# PROJECT_STATE

## Status

`READY_FOR_FULL_AUDIT_P4_1_TO_P4_3`

## Active phase

P4.1 + P4.2 + P4.3 complete on a single delivery train. **STOP** — awaiting ChatGPT full audit.
Do not start P4.4 / WWW portal / merge.

## Active branch / PR train

- Branch: `cursor/p4-1-activity-domain`
- Same PR for P4.1–P4.3 (no merge)

## Delivered package

### P4.1 — activity-service domain

- NestJS service `@v2/activity-service` (port 4400), DB `activity`
- Migrations `001_activity_foundation.sql`
- Lifecycle, draft, RSVP, waitlist FIFO, reconfirm, Clock, idempotency, transactional outbox (no RabbitMQ)
- HTTP `/activity/v1` + Authz S2S (fail-closed; AllowAll only when `ACTIVITY_ENABLED=false`)

### P4.2 — Discord Centrum

- Discord Gateway Components V2 hub + event posts, signed custom IDs with `panelId`
- Projection deliver, outbox dispatcher, reconcile/adopt, operator `centrum-*` commands
- Migration `002_p42_discord_support.sql`

### P4.3 — Admin Centrum

- Migration `003_p43_admin_config.sql` (config revision, channels/pings/limits/reminders/retention/hub, M2M, field/report extensions)
- Admin API `/activity/v1/admin/guilds/:guildId/...` (config, readiness, types, statuses, fields, channels, pings, events, projections, reports, audit, hub)
- Optimistic concurrency via `config_revision` / `expectedRevision` / `If-Match` → 409
- `apps/admin` Centrum UI (bookmarkable routes, guild selector, readiness dashboard)
- `api-gateway` BFF proxy `/activity/v1/*` → `ACTIVITY_SERVICE_BASE_URL`
- Test seed no longer overwrites admin-owned channel config

## Verification (local agent)

- activity-service: typecheck green; unit 53 passed (7 infra skipped without Docker)
- discord-gateway: 84 passed
- admin: typecheck/test/build green
- api-gateway: typecheck/test green (incl. activity proxy)
- architecture:check green

## Live Discord / Admin

`MANUAL_OWNER_TEST_REQUIRED` — agent session has no live Discord token / Identity OAuth operator session.

## Last updated

2026-08-16 — Cursor (`P4.3-ACTIVITY-ADMIN-001` end of 3/3 train)
