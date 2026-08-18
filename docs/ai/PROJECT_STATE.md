# PROJECT_STATE

## Status

`READY_FOR_CHATGPT_P4_0_DELTA_AUDIT` pending green CI + Zeabur of this
fixup SHA — task `P4-COMBINED-AUDIT-FIXUP-001`.

Not APPROVED. Not merged. Do not start P4.5.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 #24 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- FIXUP_START_SHA: `1290df92681ee1e98fde3e0efaf231f7d110f6db`
- FIXUP_CHECKPOINT_SHA: _(this commit after push)_
- SECURITY_BASE_SHA: `bbef5f6d4997743a1d4d9788d76b46a9d4fe31fe`
- OPERABILITY_CHECKPOINT_SHA: `fea6a020599a50d4727e28f2e4d6e2b225351b02`

## Owner roadmap (#26)

Before **Core Foundation Integrated Review**, P4.1–P4.4 technical closure
requires CI, security, ChatGPT audit, Zeabur, runtime smoke, health, and
revision proof.

It does **not** require a full manual Owner UX walkthrough of the current
transitional Discord / Admin / WWW surfaces. That review is deferred.

## Combined-audit findings (code)

1. WWW production origins fail-closed (no localhost OAuth bake).
2. api-gateway `/health/ready` probes upstream `/health/ready`.
3. Admin Discord/bot flags use gateway Discord runtime state, not guild list.
4. Admin production image serves `serve-static.mjs` (not vite preview).
5. Discord projections validate guild/channel before write.
6. SoT aligned with Issue #26 deferred UX policy.

## Validation (local)

- `pnpm format:check` — pass
- lint / typecheck / unit tests / architecture / static `runtime:doctor` — pass
- `apps/web` e2e — 14 passed (loopback session gate + member cookies)
- production Dockerfiles 7/7 — pass (`v2-*:operability`)
- Admin image proof: `/`, `/login`, `/health`, stop — pass
- `pnpm test:runtime-smoke` — pass
- `pnpm audit --audit-level=high` — pass (1 moderate, 0 high/critical)

CI and live Zeabur of this SHA are recorded after push.

## Last updated

2026-08-18 — P4-COMBINED-AUDIT-FIXUP-001 code checkpoint
