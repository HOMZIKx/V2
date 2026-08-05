# Cursor → ChatGPT

## 1. Status

`READY_FOR_LIVE_TEST`

Automated proof + code complete on `cursor/p2-identity-proof-slice`. Not
`READY_FOR_REVIEW` yet: pending (a) CI green on final HEAD and (b) the manual
live OAuth gate (Discord + Google) confirmed by the owner.

## 2. Task ID

`P2-IDENTITY-PROOF-001`

## 3. Branch / PR / HEAD

- Branch: `cursor/p2-identity-proof-slice`
- PR: existing draft PR for this task (no new PR opened, no merge).
- Final HEAD: recorded in the PR comment after the last push.

## 4. Pinned new dependencies (exact)

Direct deps of `@v2/identity-service`:

- `better-auth` = 1.6.25
- `@better-auth/redis-storage` = 1.6.25
- `ioredis` = 5.11.1
- `@fastify/cors` = 11.3.0
- `pg` = 8.22.0
- dev: `auth` = 1.6.25, `@types/pg` = 8.15.5

No community Nest Better Auth adapter. No Better Auth 1.7 beta/RC. No extra
runtime crypto or ORM added.

## 5. Layer schema and ports

```
domain/         errors, synthetic-email, identity-models (no BA/framework imports)
application/    ports/identity.ports.ts, use-cases/identity.use-cases.ts (framework-free)
infrastructure/ config/identity-env.ts, auth/create-better-auth.ts, auth/mount-better-auth.ts,
                adapters/better-auth-identity.adapter.ts, db/run-migrations.ts
interface/      app.module, auth-bootstrap.service (thin BA mount), health/identity/proof-ui
                controllers, identity-exception.filter, request-headers, main.ts
```

`IdentitySessionPort` methods: `getMe`, `listAccounts`, `startLink`,
`unlinkAccount`, `logoutCurrent`, `logoutAll`, `revokeAllSessionsForUser`
(system revoke — port/use-case only, no public admin endpoint).

Architecture test (`tools/architecture/architecture.test.ts`) updated to forbid
`better-auth`, `@better-auth/*`, `ioredis`, and `pg` imports in domain/application
(now checks import specifiers, not raw substrings, so provider-name literals such
as `'discord'` in domain types are not false-positives). `pnpm architecture:check`
is green.

## 6. Migrations and checksum

- `services/identity-service/migrations/001_better_auth.sql` — `user`, `account`,
  `verification`, and `identity_schema_migrations`. **No `session` table** (Redis
  is the session SoT).
- Unique index `account_provider_account_uidx (providerId, accountId)` enforces
  provider-subject uniqueness at the DB level.
- Runner `run-migrations.ts` is idempotent, records a line-ending-normalized
  SHA-256, and detects checksum drift. Invoked via
  `pnpm --dir services/identity-service migrate`; never on normal service start.
- `001_better_auth.sql` normalized (LF) SHA-256:
  `353ca51869aa7cd23f6125d39e54dd16509b23969a6d0c918a9f2c8213d5e30e`

## 7. PostgreSQL and Redis model

- PostgreSQL: `user`, `account` (with token columns present but written `NULL`),
  `verification`, `identity_schema_migrations`. No usable session token in PG.
- Redis: `secondaryStorage` via `@better-auth/redis-storage` (ioredis), key
  prefix `v2:identity:auth:`. Active sessions live only here.
- `storeSessionInDatabase: false`, `session.cookieCache.enabled: false`,
  stateless session not enabled → revoke is immediate.

## 8. Cookie configuration (no secret values)

- Prefix `v2.identity` (`IDENTITY_COOKIE_PREFIX`).
- `HttpOnly`, `SameSite=Lax`, host-only, `Secure` when
  `advanced.useSecureCookies` (production). Opaque session id, no JWT, no browser
  token storage. CORS via `@fastify/cors` with `credentials: true` restricted to
  the trusted-origin allowlist.

## 9. Provider tokens — storage proof

- Primary path: `databaseHooks.account.create.before` and `.update.before` null
  out `accessToken`, `refreshToken`, `idToken`, and both expiry columns before
  persistence. V2 calls no provider API after login.
- Belt-and-suspenders: `account.encryptOAuthTokens: true`.
- Unit proof: `stripProviderTokens` test. Integration proof:
  `better-auth.integration.spec.ts` links an account with tokens and asserts the
  DB columns are `NULL`.

## 10. Test evidence

Unit (run in `pnpm test`, 68 passing, 5 integration skipped without infra):

- `synthetic-email.spec.ts` — deterministic synthetic email + detection.
- `identity-env.spec.ts` — disabled boot, enabled fail-fast (short secret,
  missing provider, missing DB, prod https), secret redaction.
- `create-better-auth.spec.ts` — Discord `email=null` → synthetic email,
  `emailVerified=false`; token stripping.
- `better-auth-identity.adapter.spec.ts` — getMe (real vs synthetic email vs
  null), accounts, link, unlink (row-id → provider-id resolution, NOT_FOUND),
  logout/logout-all, system revoke, and error mapping
  (`FAILED_TO_UNLINK_LAST_ACCOUNT` → CANNOT_UNLINK_LAST,
  `SOCIAL_ACCOUNT_ALREADY_LINKED` → ACCOUNT_ALREADY_LINKED,
  `FAILED_TO_GET_SESSION` → UNAUTHENTICATED, unknown → VALIDATION_FAILED).
- `identity.controller.spec.ts` — routes, validation, AUTH_DISABLED path.
- `identity-exception.filter.spec.ts` — stable-code → HTTP mapping.
- `proof-ui.controller.spec.ts` — 404 when disabled/prod, HTML when dev-enabled.
- `health.controller.spec.ts` — live, authDisabled, ready up/down.

Integration (gated by `RUN_INFRA_TESTS=true`, run in the CI infra job):

- `src/infrastructure/better-auth.integration.spec.ts` — migrate idempotent, no
  `session` table in PG, provider tokens `NULL` on account rows, session stored
  in Redis and immediately revoked via `revokeAllSessionsForUser`, stable V2 UUID
  for Discord `email=null` via synthetic email.
- `tools/infra/identity-auth.integration.test.ts` — migrate + checksum,
  `(providerId, accountId)` uniqueness, Redis session-key roundtrip (self-contained
  RESP client, no cross-project import).

Coverage: 70.85% statements / 83.52% branch / 89.28% funcs / 70.85% lines
(thresholds 60/50/60/60).

## 11. Local command results

- `pnpm --dir services/identity-service typecheck` — PASS.
- `pnpm exec vitest run --config services/identity-service/vitest.config.ts` —
  PASS (68 passed, 5 skipped).
- coverage run — PASS (above thresholds).
- `nx run identity-service:lint` — PASS.
- `pnpm architecture:check` — PASS.
- `pnpm format:check` — PASS.
- `pnpm --dir services/identity-service build` — PASS.
- Better Auth construction smoke — PASS (`auth.handler`, `auth.api.getSession`,
  `linkSocialAccount`, `revokeSessions`, `internalAdapter.deleteUserSessions` all
  present).

Not runnable locally (no Docker on this machine): the PostgreSQL/Redis
integration tests and full `pnpm validate` infra step — these run in CI.

## 12. CI

`.github/workflows/ci.yml` infra job now runs, after "Verify database isolation":
`migrate` (identity DB) then the identity integration suite with
`RUN_INFRA_TESTS=true`, `IDENTITY_AUTH_ENABLED=true`, and CI-only non-secret
placeholder OAuth ids/secrets (≥32-char secret). No real Discord/Google calls.
Workflow run ids on the final HEAD to be recorded in the PR comment.

## 13. Live checklist

Pending owner execution — see `docs/identity/LOCAL_OAUTH_PROOF.md`. The mandatory
Discord `email=null` behaviour is covered by an automated test regardless of
whether a real no-email Discord account is available.

## 14. Risks, deviations, tech debt

- `create-better-auth.ts` factory body, `mount-better-auth.ts`, `run-migrations.ts`,
  and `auth-bootstrap.service.ts` are covered by integration tests (infra job),
  not unit tests, so they show low unit-coverage; overall threshold still met.
- Logout endpoints revoke the session server-side (Redis) immediately; forwarding
  Better Auth's cookie-clearing `Set-Cookie` from the port-mediated calls is not
  wired (revocation correctness does not depend on it). Minor tech debt.
- Architecture test changed from raw-substring to import-specifier matching:
  strictly more precise, still forbids the same engines plus the new ones.

## 15. Recommended next slice (not implemented)

Internal service-to-service auth: short-lived asymmetric JWT (TTL ≤ 5 min,
`iss/aud/sub/jti/iat/exp/kid`) minted by Identity, plus the internal contract for
other services to resolve the current V2 user — without RBAC in the token. Keep
guild-scoped policy and Admin MFA out of scope until P3.

## Last updated

2026-08-05 — Cursor
