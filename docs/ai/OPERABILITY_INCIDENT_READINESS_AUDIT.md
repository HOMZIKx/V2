# Operability and Incident Readiness Audit

Task: `V2-OBSERVABILITY-OPERABILITY-INCIDENT-READINESS-001`  
Base: `179be84ee645cf2a3709a403798349407a60db56` (PERFORMANCE_SCALABILITY_AUDIT_SHA)  
Checkpoint: **`OPERABILITY_INCIDENT_READINESS_SHA`** = `b64952fd107feb4a1e5bb45f58d315d501219614`

Mode: operability hardening — **no product changes**.

---

## Executive summary

| Area                       | Status       | Notes                                                                                                                        |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Correlation (S2S + HTTP)   | **DONE**     | Shared `registerFastifyRequestCorrelation`; gateway proxy forwards `x-correlation-id`; outbox deliver propagates correlation |
| Domain identifiers in logs | **DONE**     | `guildId`, `activityId`, `outboxId`, `inboxItemId`, `aggregateId` in outbox + exception logs; secrets redacted               |
| Error classification       | **DONE**     | Normalized 10 categories; user responses include `category`, no stack                                                        |
| Outbox visibility          | **DONE**     | Ready probe + Admin `GET /activity/v1/admin/diagnostics/outbox`; oldest age + last error category                            |
| Health (live/ready)        | **VERIFIED** | No fake-ready; migrations + deps gate ready; gateway aggregates outbox                                                       |
| Discord diagnostics        | **VERIFIED** | `/health/discord` + gateway ready snapshot; existing Hub reconcile on startup                                                |
| Incident runbooks          | **DONE**     | `docs/ops/INCIDENT_RUNBOOK.md` expanded (8 scenarios)                                                                        |
| Fault-injection tests      | **DONE**     | Outbox 429/503/ECONNREFUSED + category mapping tests                                                                         |

**LOCAL_VALIDATE:** PASS (`NODE_ENV=test`, `pnpm validate`)

---

## 1. Correlation

| Service                           | Mechanism                                                                |
| --------------------------------- | ------------------------------------------------------------------------ |
| api-gateway                       | `applyRequestCorrelation` on ingress; proxies forward `x-correlation-id` |
| identity-service                  | `registerFastifyRequestCorrelation`                                      |
| authorization-service             | `registerFastifyRequestCorrelation`                                      |
| activity-service                  | `registerFastifyRequestCorrelation`                                      |
| discord-gateway                   | `registerFastifyRequestCorrelation`                                      |
| activity outbox → discord-gateway | `x-correlation-id` on projection/notification deliver POST               |

Operator flow: take `x-correlation-id` from api-gateway response → grep all services with same id.

---

## 2. Domain identifiers (safe)

Logged where relevant:

- `correlationId`, `requestId`
- `guildId`, `activityId`, `organizationId` (via aggregate/payload)
- `outboxId`, `inboxItemId`, `eventType`, `aggregateType`, `aggregateId`
- `attemptCount`, `category`, `httpStatus`

**Never logged:** JWT, cookies, Discord token, DB URLs, PEM keys, projection secret, payload bodies in operator diagnostics.

---

## 3. Error classification

Normalized categories (`packages/observability/src/operational-error.ts`):

`VALIDATION` | `UNAUTHENTICATED` | `FORBIDDEN` | `NOT_FOUND` | `CONFLICT` | `RATE_LIMITED` | `UPSTREAM_FAILURE` | `TIMEOUT` | `RETRY_EXHAUSTED` | `INTERNAL`

Applied in:

- activity / identity / authorization exception filters
- outbox `lastErrorCategory` and deliver retry logs
- API error JSON: `{ error: { code, message, category } }` — no stack to clients

---

## 4. Outbox visibility

| Surface                                           | Fields                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| activity `/health/ready`                          | `outbox.{pending,claimed,failed,delivered,retrying,state,oldestPendingAgeSeconds,lastErrorCategory}` |
| api-gateway `/health/ready`                       | forwards activity outbox snapshot when probe succeeds                                                |
| Admin `GET /activity/v1/admin/diagnostics/outbox` | same counts for authorized operators                                                                 |

States: `idle` | `working` | `backlogged` | `retrying` | `stuck`

Outbox worker logs: `outbox_tick`, `outbox_deliver_success`, `outbox_deliver_retry`, `outbox_deliver_permanent`, `outbox_deliver_exhausted`

---

## 5. Health

| Endpoint        | Behavior                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/health/live`  | Process up + SHA; no dependency probes                                                                                    |
| `/health/ready` | DB + migrations (+ Redis when configured); activity includes outbox; gateway probes activity + identity + discord runtime |

Ready returns 503 when dependencies fail — platform probes should prefer `/health/live` for process-only checks.

---

## 6. Discord diagnostics

| Check                | Where                                                         |
| -------------------- | ------------------------------------------------------------- |
| Bot connected?       | discord-gateway `/health/discord` → `state`, `pingMs`         |
| Correct guild?       | `guildId`, `isolationOk`                                      |
| Current SHA?         | `gitCommitSha` on live/ready/discord                          |
| Hub message known?   | Startup reconcile (existing); projection table in activity DB |
| Projection failures? | activity outbox `failed`, projection `status=failed`          |
| DM rate limits?      | outbox `lastErrorCategory=RATE_LIMITED`, deliver retry logs   |

---

## 7. Incident runbooks

Updated: `docs/ops/INCIDENT_RUNBOOK.md`

Scenarios: Discord down, Activity DB down, Redis down, Identity down, Authorization down, projection backlog, notification backlog, bad deploy, migration failure (+ existing secret/session runbooks).

Each includes: symptoms, diagnosis, safe actions, what NOT to do, recovery proof.

---

## 8. Tests

| Test file                                                         | Coverage                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/observability/src/index.test.ts`                        | Category mapping + delivery error classification + redaction |
| `services/activity-service/.../activity-exception.filter.spec.ts` | No stack leak; category in response                          |
| `services/activity-service/.../outbox-dispatcher.spec.ts`         | Correlation header, 429/503/ECONNREFUSED retry, max attempts |
| `apps/api-gateway/src/health-probes.spec.ts`                      | `readOutboxReadySnapshot` parsing                            |

---

## Operator quick reference

**What broke?** → HTTP status + `error.category` + service logs `event=request_failed`  
**For which user/guild/activity?** → `correlationId` + `guildId` / `activityId` / `aggregateId` in logs  
**Which service?** → logger `service` field + gateway ready `checks`  
**Was it retried?** → outbox `retrying`, `attemptCount`, `outbox_deliver_retry` logs  
**Did it recover?** → outbox `state` idle/working, `delivered` count up, ready 200

---

## Limitations / follow-up

- RabbitMQ-only outbox transport still requires delivery receipt (documented; use `http` or `dual`).
- Hub reconcile timestamp not yet exposed as a dedicated metric (use discord startup logs + projection rows).
- Centralized log aggregation (Datadog/Loki) is deployment-side — structure is JSON-ready.
