# PROJECT_STATE

## Status

`READY_FOR_3_PROMPT_CHECKPOINT_P4` — P4.5 multi-guild + RabbitMQ projection
transport closed on PR #19 (`cursor/p4-1-activity-domain`). Await owner/ChatGPT
3-prompt checkpoint before P4.6.

## Active phase

P4.5 complete (Activity multi-guild isolation + transactional outbox → RabbitMQ
→ Discord projection consumer). Do not start P4.6 until checkpoint APPROVED.

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19

## P4.5 delivered

### Transport topology

- Exchange `activity.events` (topic) + DLX `activity.events.dlx`
- Queue `activity.projection.discord` (quorum) + DLQ
  `activity.projection.discord.dlq`
- Bindings: `activity.activity.#`, `activity.panel.#`
- Flow: domain TX → PG outbox → dispatcher claim → RabbitMQ publish (confirm)
  → consumer → idempotent projection apply (by `outboxId`)
- HTTP `/internal/activity/v1/projections/deliver` = operator / reconcile /
  diagnostic only when `ACTIVITY_OUTBOX_TRANSPORT=http` (not the normal path
  when RabbitMQ is configured)

### Contracts

- `@v2/contracts`: `ActivityProjectionDeliveryV1Schema` + topology constants

### Multi-guild

- Guild-scoped config, types, statuses, hubs, activities, participants, inbox,
  reports, outbox `guildId`
- RSVP rejects cross-guild statusDef IDs
- Discord strict guild isolation on activity custom_id
  (`DISCORD_STRICT_GUILD_ISOLATION`)
- Automated fixtures: guilds `111…` / `222…`

### Env

- `ACTIVITY_OUTBOX_TRANSPORT`, `ACTIVITY_OUTBOX_WORKER_ENABLED`, `RABBITMQ_URL`
- `DISCORD_ACTIVITY_PROJECTION_CONSUMER_ENABLED` (default true when activity +
  URL)

## Explicitly not done

- Merge to `main`
- Zeabur
- P4.6 (reservations / series / attendance / stats / Desktop)
- Second live Discord test guild (automated 2-guild tests only)
- Durable cross-replica projection idempotency (process-local Map)
- Full Discord render DTO inside `projection_requested` outbox payload
  (consumer rejects incomplete apply → DLQ; Discord publish still primarily
  via interaction handler)

## Last updated

2026-08-16 — P4.5 multi-guild + RabbitMQ transport checkpoint
