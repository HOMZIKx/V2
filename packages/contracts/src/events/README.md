# Event contracts

Versioned async transport envelopes live under this tree. Producers own
semantics and versioning; consumers validate with the shared Zod schemas.

## Activity (P4.5)

- `activity/activity-projection-delivery.v1.ts` — outbox → projection delivery envelope
- `activity/topology.ts` — RabbitMQ exchange/queue/binding name constants
