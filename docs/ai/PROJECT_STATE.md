# PROJECT_STATE

## Status

`READY_FOR_CHATGPT_P4_0_DELTA_AUDIT` — rolling checkpoint after P4 fixup + Hub assets.

**P4.5 planning started** (`P4_5_SCOPE_LOCK.md`); implementation blocked on
`OD-P4.5-001` (shared vs split participant lists) for product-visible multi-guild UX.
RabbitMQ scaffolding may proceed independently.

Not APPROVED. Not merged.

## Immutable checkpoints

| Marker | SHA | Notes |
| --- | --- | --- |
| FIXUP_START_SHA | `1290df92681ee1e98fde3e0efaf231f7d110f6db` | P4-COMBINED-AUDIT-FIXUP-001 start |
| FIXUP_CHECKPOINT_SHA | `7f9e15e8020305db5e1b5bd3fb8f00532412a2c8` | Six audit findings code fix (deployed) |
| HUB_ASSETS_SHA | `63ed51e303c2b42e6e17e6ca9dce3ff903f6873d` | Owner Activity Hub icons |
| **P4_0_AUDIT_CHECKPOINT_SHA** | *(set on push — docs commit after 63ed51e)* | Technical P4.0 closure + handoff |

| P4_5_PLAN_CHECKPOINT_SHA | pending | Scope lock doc committed with P4.0 |
| P4_5_IMPLEMENTATION_CHECKPOINT_SHA | — | Not started |

## Current task

`P4-0-SELF-AUDIT-AND-CONTINUOUS-HANDOFF-001`

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- HEAD: see git (`63ed51e` + pending docs commit)

## Six combined-audit findings — verified CLOSED (current code)

| # | Finding | Status |
| --- | --- | --- |
| A | WWW OAuth production loopback | CLOSED — `public-origin.ts`, Dockerfile.web, runtime-doctor |
| B | API real readiness | CLOSED — `health-probes.ts` probes identity + activity |
| C | Admin real Discord diagnostics | CLOSED — `runtime-status.ts` uses gateway `discord.state` |
| D | Admin production runtime | CLOSED — `serve-static.mjs`, not vite preview |
| E | Projection guild/channel boundary | CLOSED — `projection-channel-scope.ts` |
| F | SoT Issue #26 | CLOSED — technical CI/validate; Owner UX deferred |

## Activity Hub assets — verified

- Registry: `activity-hub-assets.ts`
- 5 Owner icons under `apps/discord-gateway/assets/*.webp`
- Thumbnails + `attachment://` + `files` on publish/edit/reconcile
- Docker copy in `Dockerfile.discord-gateway`
- Signed Secondary buttons unchanged

## Local validation (HEAD 63ed51e)

- `pnpm validate:quick` — PASS (prior run)
- `pnpm test:e2e` — PASS (after `playwright install`)
- `pnpm test:runtime-smoke` — PASS (after `pnpm --dir apps/web build`)
- `pnpm audit --audit-level=high` — PASS (0 high; 1 moderate)
- Docker image verify — BLOCKED_EXTERNAL (local Docker daemon unavailable)

## Explicit gates

- **NO MERGE** (until existing project merge gates)
- Issues #20 #21 #22 #23 #24 **NOT IMPLEMENTED**
- P4.6 **NOT STARTED**

## Owner roadmap (#26)

Full manual Owner UX deferred to Core Foundation Integrated Review.
Technical CI / security / Zeabur / runtime remain required.

## Live Zeabur (prior FIXUP checkpoint)

Still on `7f9e15e` until redeploy after `63ed51e` push.
Redeploy pending after CI green on new SHA.

## OPEN_CRITICAL / OPEN_HIGH

- OPEN_CRITICAL: **0**
- OPEN_HIGH: **0**

## OWNER_DECISIONS_REQUIRED

- **OD-P4.5-001** — shared vs separate participant lists for multi-guild publish
  (see `docs/ai/P4_5_SCOPE_LOCK.md`)

## Last updated

2026-08-19 — P4.0 rolling audit checkpoint + P4.5 scope lock
