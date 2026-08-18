# Health model (current P4)

Platform health probes must use **liveness**, not readiness. Readiness may
return 503 when a critical dependency is down; that must not restart the
process in a loop.

| Service               | Live           | Ready fails when                                         | Critical deps                       | Non-critical                                     |
| --------------------- | -------------- | -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| authorization-service | `/health/live` | enabled and database ping fails                          | PostgreSQL                          | —                                                |
| identity-service      | `/health/live` | auth enabled and db, Redis, or migrations fail           | PostgreSQL, Redis                   | Discord OAuth provider                           |
| activity-service      | `/health/live` | database ping fails, or Redis ping fails when URL is set | PostgreSQL, Redis (when configured) | Discord gateway, authorization hop for mutations |
| api-gateway           | `/health/live` | configured identity or activity `/health/live` fails     | identity-service, activity-service  | Discord                                          |
| discord-gateway       | `/health/live` | Discord enabled and gateway not `ready` / isolation fail | activity-service (projections)      | Discord API (required only when enabled)         |
| admin                 | `GET /`        | process cannot serve the SPA                             | api-gateway (browser origin)        | —                                                |
| web                   | `/health`      | process cannot serve WWW                                 | api-gateway (browser origin)        | —                                                |

Live returns `{ status, gitCommitSha, appVersion }` and is cheap (no DB).

Public identity: `GET /version` on api-gateway (and Nest apps that expose it).
Compare running `gitCommitSha` to the image SHA (`MATCH` / `MISMATCH` / `UNKNOWN`).

Activity `/health/ready` also returns an `outbox` snapshot when the database
is reachable: `idle` | `working` | `backlogged` | `retrying` | `stuck`.
