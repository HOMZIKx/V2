# Cursor → ChatGPT handoff

## Task

`P4.1` + `P4.2` + `P4.3` delivery train — Centrum Aktywności domain, Discord, Admin.

## Status

`READY_FOR_FULL_AUDIT_P4_1_TO_P4_3`

## Branch

`cursor/p4-1-activity-domain` (single PR; **do not merge**)

## Scope delivered

### P4.1

activity-service foundation: DB, migrations, domain, lifecycle, draft, RSVP, waitlist, reconfirm, Authz, idempotency, outbox (no RabbitMQ).

### P4.2

Discord hub/event Components V2, create/LFG/draft/preview/publish, RSVP, More/report, inbox, projection dispatcher/retry/reconcile/adopt.

### P4.3

Admin API + Admin UI + readiness + config versioning + projection repair/audit + gateway BFF proxy. Seed superseded by Admin as primary config path (seed no-op overwrite when admin-owned).

## Explicitly not done (deferred)

- P4.4 WWW user portal
- Desktop companion
- RabbitMQ
- P4.5 multi-guild publication
- P4.6 series / attendance / stats
- Zeabur production deploy
- Final V2 branding
- Merge to `main`

## Live tests

`MANUAL_OWNER_TEST_REQUIRED` for live Discord + Admin→Discord end-to-end on test guild.

## Verification commands

```text
npm exec --yes pnpm@10.14.0 -- --dir services/activity-service typecheck
npm exec --yes pnpm@10.14.0 -- --dir services/activity-service test
npm exec --yes pnpm@10.14.0 -- --dir apps/discord-gateway test
npm exec --yes pnpm@10.14.0 -- --dir apps/admin typecheck
npm exec --yes pnpm@10.14.0 -- --dir apps/admin test
npm exec --yes pnpm@10.14.0 -- --dir apps/admin build
npm exec --yes pnpm@10.14.0 -- --dir apps/api-gateway typecheck
npm exec --yes pnpm@10.14.0 -- --dir apps/api-gateway test
npm exec --yes pnpm@10.14.0 -- architecture:check
npm exec --yes pnpm@10.14.0 -- format:check
npm exec --yes pnpm@10.14.0 -- validate
```

## Marker

`READY_FOR_FULL_AUDIT_P4_1_TO_P4_3`
