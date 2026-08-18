# PROJECT_STATE

## Status

`SECURITY_HARDENING_COMPLETE_FOR_CURRENT_P4` —
`P4-ADVERSARIAL-SECURITY-AND-RESILIENCE-001`

Not APPROVED. Not merged. P4 not complete. Do not start P4.5.

## Explicit gates

- **NO MERGE**
- **NO P4.5 / P4.6 / RabbitMQ**
- Issues #20 #21 #22 #23 #24 **NOT IMPLEMENTED**

## Active branch / PR

- Branch: `cursor/p4-1-activity-domain`
- PR: #19
- SECURITY_START_SHA: `467cd5cf13ae39d26d6d17d1421c6f96d5ddb6e1`
- SECURITY_CHECKPOINT_SHA: recorded in `docs/ai/CURSOR_TO_CHATGPT.md` after the
  additive security commit on this branch.

## What this task changed (repo, current P4 only)

Production fail-closed:

- `ACTIVITY_ENABLED=false` uses **DenyAll** authorization in production
  (AllowAll remains local/test only).
- `ACTIVITY_ALLOW_TEST_SEED` cannot be true in production.
- Inbound client assertions in production require Redis JTI storage.
- Duplicate `Activity-Client-Assertion` / actor headers are rejected.
- Assertion `sub` must equal `iss`; `jti` must be a UUID; `aud` cannot be an
  array; actor claims must be strings.
- API gateway never forwards browser `X-Actor-*` in production, even if
  `API_GATEWAY_FORWARD_ACTOR_HEADERS=true`.
- Admin `VITE_ADMIN_DEV_*` cannot enable `dev-actor` in production builds.
- Projection shared-secret compare is constant-time; malformed payloads no
  longer leak Zod internals.

Regression suite: package unit tests plus `tools/security/p4-current-controls.test.ts`
(included in `pnpm architecture:check`).

## Live Zeabur until this SHA is redeployed

Public stack still runs the previous image. Logged-in Admin can still pass
`CONFIG_MANAGE` while `ACTIVITY_ENABLED=false` **until redeploy**. That is
deployment lag, not an unfixed code path.

Production flags that must stay false after redeploy:

- `ACTIVITY_TRUST_ACTOR_HEADERS=false`
- `API_GATEWAY_FORWARD_ACTOR_HEADERS=false`
- `ACTIVITY_ALLOW_TEST_SEED=false`

`ACTIVITY_ENABLED=true` with a real authorization-service hop is
**OWNER_ACTION_REQUIRED** before privileged Admin/WWW mutations should work
in production.

## Validation (local, CI-equivalent)

- `pnpm format:check` — pass
- `pnpm validate` — pass (live `V2_SMOKE_*` unset so doctor stays static,
  matching CI)
- `pnpm audit --audit-level=high` — pass (1 moderate, 0 high/critical)

## Owner next

1. Redeploy this checkpoint SHA to Zeabur.
2. Set `GIT_COMMIT_SHA` per APP to the image SHA.
3. Keep unsafe DEV flags false. Enable `ACTIVITY_ENABLED=true` only with
   authorization-service + inbound clients + Redis JTI.
4. Confirm logged-in Admin is 403 until real authz allows `CONFIG_MANAGE`.
5. Walk Discord Hub create/preview/publish/RSVP as a real user.

## Last updated

2026-08-18 — P4 adversarial security hardening (current P4.1–P4.4 only)
