# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-OBSERVABILITY-OPERABILITY-INCIDENT-READINESS-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Operability and incident readiness audit

Checkpoint: **`OPERABILITY_INCIDENT_READINESS_SHA`** — `b64952fd107feb4a1e5bb45f58d315d501219614`

Base: `179be84ee645cf2a3709a403798349407a60db56` (PERFORMANCE_SCALABILITY_AUDIT_SHA)

### Result

| Area | Status |
| ---- | ------ |
| Correlation (HTTP + S2S outbox deliver) | DONE |
| Normalized error categories (10) | DONE |
| Outbox visibility (ready + Admin diagnostics) | DONE |
| Health live/ready (no fake-ready) | VERIFIED |
| Discord diagnostics | VERIFIED (`/health/discord`) |
| Incident runbooks | DONE (8 new/expanded scenarios) |
| Fault-injection tests | DONE (429/503/ECONNREFUSED + category maps) |

Full report: `docs/ai/OPERABILITY_INCIDENT_READINESS_AUDIT.md`

### Key changes

1. **Shared correlation** — `registerFastifyRequestCorrelation` on identity, authorization, activity, discord-gateway; outbox deliver forwards `x-correlation-id`.
2. **Error taxonomy** — `VALIDATION` … `INTERNAL`; API responses include `category`, no stack to clients.
3. **Outbox operator surface** — `oldestPendingAgeSeconds`, `lastErrorCategory`; gateway ready forwards snapshot; Admin `GET /activity/v1/admin/diagnostics/outbox`.
4. **Structured outbox logs** — `outbox_deliver_success|retry|permanent|exhausted` with safe domain ids.
5. **Runbooks** — projection/notification backlog, identity/authorization down, migration failure.

### Proof

- `packages/observability/src/index.test.ts` — category + delivery error classification
- `outbox-dispatcher.spec.ts` — correlation header, 429/503/ECONNREFUSED retry paths
- `health-probes.spec.ts` — `readOutboxReadySnapshot`
- `pnpm validate` — PASS

## Validation

| Check          | Result                                    |
| -------------- | ----------------------------------------- |
| LOCAL_VALIDATE | **PASS**                                  |
| CI_STATUS      | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace implementation.
