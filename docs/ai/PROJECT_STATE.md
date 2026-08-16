# PROJECT_STATE

## Status

`READY_FOR_REVIEW_P4_1_ACTIVITY_DOMAIN`

## Active phase

P4.1 — activity-service domain / data / contracts / outbox core (implementation complete, awaiting audit).

## Active task

- Task ID: `P4.1-ACTIVITY-DOMAIN-001`
- Branch: `cursor/p4-1-activity-domain`
- PR title: `feat(activity): add P4.1 activity backend foundation`
- Service: `@v2/activity-service` / DB `activity` / port `4400`
- Out of scope (deferred): P4.2 Discord UI, RabbitMQ, runtime outbox publisher, Admin/WWW UI

## Delivered in P4.1

- NestJS 11 + Fastify service bootstrap, health, validated env, graceful shutdown, observability
- Domain invariants: lifecycle, StatusDef behaviors, capacity/`occupiesSlot`, waitlist FIFO, reconfirm, max-4, 14-day horizon, Clock port
- PostgreSQL foundation migration + transactional outbox (claim/lease/retry) + idempotency store
- Application use-cases for draft → publish → RSVP/waitlist → lifecycle → reschedule/reconfirm → panel state → outbox ops
- Authorization via S2S HTTP to P3 (AllowAll stub when `ACTIVITY_ENABLED=false`); exact P4-D7 permission IDs
- HTTP `/activity/v1` + OpenAPI `openapi/activity-v1.yaml`
- Architecture boundaries isolating `scope:activity`; postgres role/DB `activity`; CI migrate + infra tests
- Unit + OpenAPI contract tests; PG concurrency/idempotency/outbox infra tests (CI `RUN_INFRA_TESTS=true`)

## Open / deferred

- P4.2 Discord Components V2 panel / gateway adapter
- Runtime outbox worker + RabbitMQ (P4.5+)
- Global maintenance scanners beyond HTTP maintenance endpoints
- P4-D8 assets / screenshot visual contract (does not block P4.1)

## Last updated

2026-08-16 — Cursor (`P4.1-ACTIVITY-DOMAIN-001`)
