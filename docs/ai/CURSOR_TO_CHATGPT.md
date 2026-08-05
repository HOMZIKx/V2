# Cursor → ChatGPT

## 1. Status

`READY_FOR_REVIEW`

Identity-side P3 integration on `cursor/p3-authorization-foundation` (Issue #15).
**No merge by Cursor.**

## 2. Task ID

`P3-AUTHORIZATION-FOUNDATION-001` (Identity slice)

## 3. Branch / PR / source of truth

- Branch: `cursor/p3-authorization-foundation`
- Issue: #15 (OPEN, PLAN_APPROVED)
- PR: draft when opened (GitHub SoT for tip HEAD, CI)

## 4. What landed (Identity)

| Area | Change |
| --- | --- |
| Assertion verifier | `expectedAudience: string` parameter (issue flow still uses `IDENTITY_INTERNAL_JWT_ISSUE_URL`) |
| System revoke | `POST /identity/v1/system/revoke-sessions` — `Identity-Client-Assertion` only; body `v2_user_id`/`reason`/`correlation_id`; aud = `IDENTITY_SYSTEM_REVOKE_URL`; jti replay; `revokeAllSessionsForUser` |
| Login gate (P3-D19) | Better Auth `databaseHooks.session.create.before` → Discord account lookup → Authz identity-links + authorize (`permission.platform.login.www` sensitive); deny aborts session; user row kept |
| AuthorizationClient | Signs Identity→Authz system assertions; skipped when `IDENTITY_AUTHORIZATION_ENABLED=false` |
| Clients JSON | Test/docs register `v2.authorization-service` with revoke URL in `allowed_audiences` |

## 5. New env (see `.env.example`)

- `IDENTITY_SYSTEM_REVOKE_URL` (default local revoke URL)
- `IDENTITY_AUTHORIZATION_ENABLED` / `BASE_URL` / `ASSERTION_AUD`
- `IDENTITY_TO_AUTHZ_CLIENT_ID` (default `v2.identity-service`) + `PRIVATE_KEY_PEM` + `ACTIVE_KID`

## 6. Validation commands

```bash
pnpm --filter @v2/identity-service lint
pnpm --filter @v2/identity-service typecheck
pnpm --filter @v2/identity-service test
RUN_INFRA_TESTS=true pnpm --filter @v2/identity-service test
```

## 7. Notes / debt

- Authz HTTP routes for `/authorization/v1/identity-links` and `/authorize` are called by contract; mock Authz in Identity infra tests when Authz HTTP is not up.
- Admin UI not in this PR.

## Last updated

2026-08-05 — Cursor (Identity-side P3 integration, commit `1ffa39e`)
