# Cursor → ChatGPT

## 1. Status

`READY_FOR_RE-AUDIT`

Addressed all six items from the owner review „CHANGES REQUIRED — przed live
OAuth” on draft PR #11. Still **no** live OAuth and **no** merge. Not
`READY_FOR_REVIEW` / `READY_FOR_LIVE_TEST` until re-audit passes.

## 2. Task ID

`P2-IDENTITY-PROOF-001`

## 3. Branch / PR / HEAD

- Branch: `cursor/p2-identity-proof-slice`
- PR: #11 (existing draft; no new PR, no merge)
- Final HEAD: `7ded4c81b9a52f4acbf525e685409a2d2195c379`

## 4. Pinned new dependencies (exact)

Direct deps of `@v2/identity-service`:

- `better-auth` = 1.6.25
- `@better-auth/redis-storage` = 1.6.25
- `ioredis` = 5.11.1
- `@fastify/cors` = 11.3.0
- `pg` = 8.22.0
- dev: `@types/pg` = 8.15.5

No `auth` package as a repo dependency. Schema SQL was generated once with the
pinned CLI and committed:

```
pnpm dlx auth@1.6.25 generate --config <path-to-better-auth-config> --output services/identity-service/migrations/001_better_auth.sql
```

(then hand-adjusted: no `session` table; Redis is session SoT). Re-run only when
intentionally refreshing the committed migration.

No community Nest Better Auth adapter. No Better Auth 1.7 beta/RC. No extra
runtime crypto or ORM added.

## 5. Layer schema and ports

```
domain/         errors, synthetic-email, identity-models (no BA/framework imports)
application/    ports/identity.ports.ts, use-cases/identity.use-cases.ts (framework-free)
infrastructure/ config/identity-env.ts, config/load-env-file.ts, config/callback-url.ts,
                auth/create-better-auth.ts, auth/mount-better-auth.ts,
                adapters/better-auth-identity.adapter.ts, db/run-migrations.ts
interface/      app.module, auth-bootstrap.service (thin BA mount), health/identity/proof-ui
                controllers, identity-exception.filter, request-headers, main.ts
```

`IdentitySessionPort` methods: `getMe`, `listAccounts`, `startLink`,
`unlinkAccount`, `logoutCurrent` / `logoutAll` → `LogoutResult` (`setCookieHeaders`),
`revokeAllSessionsForUser` (system revoke — port/use-case only, no public admin
endpoint).

Architecture test forbids `better-auth`, `@better-auth/*`, `ioredis`, and `pg`
imports in domain/application (import-specifier matching).

## 6. Migrations and checksum

- `services/identity-service/migrations/001_better_auth.sql` — `user`, `account`,
  `verification`, and `identity_schema_migrations`. **No `session` table** (Redis
  is the session SoT).
- Unique index `account_provider_account_uidx (providerId, accountId)` enforces
  provider-subject uniqueness at the DB level.
- Runner `run-migrations.ts` is idempotent. Invoked via
  `pnpm --dir services/identity-service migrate` (loads root `.env` via
  `loadIdentityEnvFiles()`); never on normal service start.
- `001_better_auth.sql` normalized (LF) SHA-256:
  `353ca51869aa7cd23f6125d39e54dd16509b23969a6d0c918a9f2c8213d5e30e`

## 7. PostgreSQL and Redis model

Unchanged: PG for user/account/verification; Redis secondary storage for
sessions; `storeSessionInDatabase: false`; cookie cache off; immediate revoke.

## 8. Cookie configuration (no secret values)

Prefix `v2.identity`. Logout endpoints now forward Better Auth clearing
`Set-Cookie` headers (`signOut` / `revokeSessions`+`signOut` with
`returnHeaders: true`).

## 9. Provider tokens — storage proof

Unchanged: hooks null tokens; `encryptOAuthTokens: true`; integration proof.

## 10. Review fixes (six points)

1. **Local `.env`:** `loadIdentityEnvFiles()` in `main.ts` and `migrate.mts`
   loads cwd `.env`, `../../.env` (root when run via `--dir`), and
   `services/identity-service/.env`. Unit/smoke in `load-env-file.spec.ts`.
   Docs updated in `LOCAL_OAUTH_PROOF.md`.
2. **Nest/Fastify HTTP:** `identity-http.integration.spec.ts` (infra-gated) —
   mounted BA GET/POST, multi Set-Cookie, session cookie → `/identity/me`,
   logout cookie clear + Redis revoke, foreign Origin/callback rejection,
   runtime close.
3. **Logout cookies:** port returns `LogoutResult.setCookieHeaders`; controller
   applies them on `/identity/logout` and `/identity/logout-all`.
4. **Engine policies (no external OAuth):** mapper→`createOAuthUser` for
   `email=null` + `getMe` null view; same-email separate users; explicit second
   provider different email; occupied provider subject reject; unlink last →
   `CANNOT_UNLINK_LAST`.
5. **Security validation:** strict booleans (typo cannot silently disable auth);
   production rejects HTTP/localhost base URL and trusted origins; callback URL
   must match base/trusted origin; controller + CORS tests for foreign
   Origin/callback.
6. **Cleanup/report:** remove tracked `.local-start.*` err artifacts; gitignore
   `.local-start.err|.log|.log.err`; report no longer claims `auth` as
   devDependency — documents `pnpm dlx auth@1.6.25 …`.

## 11. Test evidence

Unit (local, infra skipped): 81 passed, 14 skipped.

Integration (CI infra job, `RUN_INFRA_TESTS=true`):

- `better-auth.integration.spec.ts` — storage + policy suite
- `identity-http.integration.spec.ts` — Nest/Fastify HTTP suite
- `tools/infra/identity-auth.integration.test.ts` — migrate/checksum/uniqueness

## 12. Local command results

- `pnpm validate` — passed format/lint/typecheck/coverage/architecture/build/e2e/
  web+admin build/runtime-smoke. Local failure only: `docker compose … config`
  (Docker CLI missing on this Windows host). Infra covered by CI.
- Identity unit: 81 passed, 14 skipped without `RUN_INFRA_TESTS`.

## 13. CI

- CI run `31004726485` on HEAD `7ded4c81…` — **success**
- Infrastructure integration job — **success**
- PR Title workflow — success on the same HEAD (see PR comment)

## 14. Live checklist

Still pending owner execution **after** re-audit — see
`docs/identity/LOCAL_OAUTH_PROOF.md`. Do not run live OAuth in this pass.

## 15. Risks / tech debt

- HTTP/policy integration tests require Docker/PostgreSQL/Redis (CI infra).
- Working-tree cleanup of a locked `.local-start.err` on Windows may leave a
  local unreadable file; it is gitignored and removed from the index when
  possible.

## 16. Recommended next slice (not implemented)

Internal service-to-service JWT — unchanged from prior report.

## Last updated

2026-08-05 — Cursor (re-audit fixes)
