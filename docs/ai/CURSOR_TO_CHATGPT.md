# Cursor → ChatGPT handoff

## Task

`P4.5-ACTIVITY-MULTIGUILD-TRANSPORT-001` on PR #19.

## Status

`READY_FOR_3_PROMPT_CHECKPOINT_P4`

**STOP** — do not start P4.6; await owner/ChatGPT control of the next three
prompts.

## Branch

`cursor/p4-1-activity-domain` — do not merge without owner approval.

## What landed

### Transport

```text
domain TX → PG outbox → dispatcher → RabbitMQ (activity.events)
  → discord-gateway consumer (activity.projection.discord)
  → ActivityProjectionDeliveryService (idempotent by outboxId)
```

- Shared contracts: `packages/contracts/src/events/activity/`
- Publisher: `services/activity-service/.../messaging/rabbitmq-*.ts`
- Consumer: `apps/discord-gateway/.../activity-projection-rabbitmq.consumer.ts`
- Retry: `x-retry-count` republish; ≥5 → DLQ+ack; permanent failures → DLQ+ack
- HTTP deliver retained as operator/reconcile/diagnostic path only

### Multi-guild

- `activity-multiguild.spec.ts` — config, hubs, activities, participants/RSVP,
  inbox, reports, outbox routing, cross-guild IDOR
- Discord interaction refuses wrong-guild custom_id when isolation enabled

## Verify (local)

```text
corepack pnpm --dir apps/discord-gateway test
corepack pnpm --dir services/activity-service test
corepack pnpm validate
```

## Known blockers / limits

- Idempotency Map is process-local (single replica OK for P4.5)
- No second live Discord guild configured — automated two-guild tests only
- Live smoke depends on local stack (RabbitMQ + worker + consumer enabled)
- `projection_requested` outbox payload is still a thin pointer (ids/schedule),
  not a full Discord render DTO — consumer rejects incomplete apply payloads
  to DLQ. Discord hub/event publish remains primarily via interaction handler;
  enriching the SoT outbox payload is follow-up (not P4.6 product scope)

## Explicitly not done

Merge, Zeabur, P4.6+, WWW creator, palette rebrand.
