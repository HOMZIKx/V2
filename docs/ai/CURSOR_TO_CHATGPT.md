# Cursor → ChatGPT handoff

## Continuous handoff snapshot

| Field | Value |
| --- | --- |
| **CURRENT_TASK** | `P4-0-SELF-AUDIT-AND-CONTINUOUS-HANDOFF-001` |
| **CURRENT_HEAD** | `63ed51e303c2b42e6e17e6ca9dce3ff903f6873d` (+ pending docs commit) |
| **LAST_IMMUTABLE_CHECKPOINT** | `63ed51e` (Hub assets) |
| **P4_0_AUDIT_CHECKPOINT_SHA** | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` |
| **P4_5_PLAN_CHECKPOINT_SHA** | `0bdb254b4d6c0a84463a6331f2d830f642cbeeea` |
| **P4_5_IMPLEMENTATION_CHECKPOINT_SHA** | — |
| **CURRENT_CI** | pending after push |
| **OPEN_CRITICAL** | 0 |
| **OPEN_HIGH** | 0 |
| **OWNER_DECISIONS_REQUIRED** | OD-P4.5-001 (multi-guild participant list mode) |
| **ZEABUR_STATE** | prior deploy `7f9e15e`; redeploy pending |
| **NEXT_WORK** | Push → CI → Zeabur redeploy → P4.5 RabbitMQ adapter scaffolding |

---

## FINAL STATUS (P4.0)

**READY_FOR_CHATGPT_P4_0_DELTA_AUDIT**

NO MERGE · NO P4.6 · Issues #20–#24 NOT IMPLEMENTED

---

## Checkpoint SHAs

| Label | SHA |
| --- | --- |
| FIXUP_START_SHA | `1290df92681ee1e98fde3e0efaf231f7d110f6db` |
| FIXUP_CHECKPOINT_SHA | `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8` |
| HUB_ASSETS_SHA | `63ed51e303c2b42e6e17e6ca9dce3ff903f6873d` |

---

## Six audit findings — CLOSED

### A. WWW OAuth production loopback — CLOSED

Code: `apps/web/src/lib/public-origin.ts`, `env.ts`, `Dockerfile.web`  
Tests: `public-origin.spec.ts`, `login.spec.ts`, `runtime-doctor.test.ts`

### B. API real readiness — CLOSED

Code: `apps/api-gateway/src/health-probes.ts`, `health.controller.ts`  
Tests: `health-probes.spec.ts`

### C. Admin real Discord diagnostics — CLOSED

Code: `apps/admin/src/api/runtime-status.ts`  
Tests: `runtime-status.spec.ts`, `audit-closure.spec.ts`

### D. Admin production runtime — CLOSED

Code: `Dockerfile.admin`, `apps/admin/scripts/serve-static.mjs`  
Tests: `serve-static.spec.ts`, `validate-registry.mjs`

### E. Projection guild/channel boundary — CLOSED

Code: `projection-channel-scope.ts`, `activity-projection.controller.ts`  
Tests: `projection-channel-scope.spec.ts`, `activity-projection.controller.spec.ts`

### F. SoT Issue #26 — CLOSED

Technical gates in CI/`pnpm validate`; Owner UX checklist deferred per #26.

---

## Activity Hub assets — CLOSED (63ed51e)

| Check | Result |
| --- | --- |
| ASSETS_FOUND | 5/5 |
| HUB_HEADER_ICON | PASS |
| CREATE / LFG / MINE / NOTIFICATIONS icons | PASS |
| attachment:// thumbnails + alt | PASS |
| BUTTON_SECURITY_UNCHANGED | PASS |
| publish / edit / reconcile files payload | PASS |
| NO_DUPLICATE_ATTACHMENTS (builder) | PASS |
| ASSETS_IN_DOCKER (Dockerfile) | PASS (file copy); image build BLOCKED_EXTERNAL locally |

---

## Validation (local, 63ed51e)

```text
pnpm format:check          PASS
pnpm lint                  PASS
pnpm typecheck             PASS
pnpm test                  PASS (178 discord-gateway; full monorepo green)
pnpm test:coverage         PASS (via validate run before e2e fix)
pnpm architecture:check    PASS
pnpm runtime:doctor        PASS
pnpm build                 PASS
pnpm test:e2e              PASS (after playwright install)
pnpm test:runtime-smoke    PASS (after apps/web build)
pnpm audit --audit-level=high  PASS (0 high)
```

Docker daemon unavailable locally — compose config validated in `validate:quick`.

---

## P4.5 scope lock

See `docs/ai/P4_5_SCOPE_LOCK.md`.

**Accepted:** RabbitMQ from P4.5, PG outbox retained, multi-guild publish permission,
broker-agnostic domain, extend existing services.

**UNRESOLVED:** OD-P4.5-001 shared vs split participant lists — blocks
product-visible multi-guild RSVP semantics; does not block RMQ adapter design.

---

## Zeabur

Prior live proof on `7f9e15e`. Redeploy after CI on new SHA required for Hub icons live.

---

## Out of scope (respected)

No merge. No P4.6. No #20–#24 product features. No history rewrite.
