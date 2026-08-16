# Cursor → ChatGPT handoff

## Task

`P4.1-ACTIVITY-DOMAIN-001` — activity-service backend foundation.

## Status

`READY_FOR_REVIEW_P4_1_ACTIVITY_DOMAIN`

## Branch

`cursor/p4-1-activity-domain`

## Commit message

`feat(activity): add P4.1 activity backend foundation`

## Scope delivered

- Full `services/activity-service` P4.1 foundation (domain, application, PG persistence, HTTP, OpenAPI)
- DB isolation: role/DB `activity` in postgres init + infra isolation tests
- Env `ACTIVITY_*`, smoke hook, architecture boundaries, SERVICE_CATALOG, CI migrate + activity infra tests
- RSVP / limit / waitlist FIFO / reconfirm / idempotency / transactional outbox claim-lease (worker off)

## Explicitly not done (by design)

- P4.2 Discord panel/UI publish
- RabbitMQ / multi-consumer bus
- Runtime outbox worker (`ACTIVITY_OUTBOX_WORKER_ENABLED=false`)
- Admin / WWW UI
- No merge to `main`

## Verification notes

- Local unit/typecheck/lint/architecture: green
- Local Docker daemon unavailable → PG concurrency/isolation verified via CI `infra-integration` job
- Marker for ChatGPT audit: `READY_FOR_REVIEW_P4_1_ACTIVITY_DOMAIN`
