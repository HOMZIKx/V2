# RabbitMQ local development

`rabbitmq.conf` makes quorum queues the default type for queues declared
without an explicit type. It does not declare business exchanges, queues,
bindings, retry policies, dead-letter queues, or streams.

When the Compose stack is running, the management UI is available only on the
local machine at <http://localhost:15672>. Use the development-only credentials
configured in `infrastructure/docker/docker-compose.yml`.

## Activity P4.5 — projection delivery

Runtime topology is asserted by `activity-service` (publisher) on connect.
Shared name constants live in `@v2/contracts` (`events/activity/topology`).

| Resource | Name                              | Notes                                                                   |
| -------- | --------------------------------- | ----------------------------------------------------------------------- |
| Exchange | `activity.events`                 | topic, durable                                                          |
| DLX      | `activity.events.dlx`             | topic, durable                                                          |
| Queue    | `activity.projection.discord`     | quorum; DLX → `activity.events.dlx`                                     |
| DLQ      | `activity.projection.discord.dlq` | quorum; bound to DLX with routing key `activity.projection.discord.dlq` |

Bindings on `activity.events` → `activity.projection.discord`:

- `activity.activity.projection_requested.v1`
- `activity.panel.projection_repaired.v1`

Publish routing key = outbox `eventType` (e.g.
`activity.activity.projection_requested.v1`). Non-projection domain events are
not bound to this queue.

Flow: domain TX → PG outbox → dispatcher claim → RabbitMQ publish (confirm) →
outbox `delivered`. HTTP `/internal/activity/v1/projections/deliver` remains for
`ACTIVITY_OUTBOX_TRANSPORT=http` (reconcile / diagnostic / legacy).
