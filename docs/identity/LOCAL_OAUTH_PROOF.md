# Local OAuth proof — Identity Service (P2)

Manual live gate for the Better Auth proof slice. Automated CI already proves
config, storage model, linking policy, revoke, and the Discord `email=null` path
without any real OAuth. This checklist covers the **manual** Discord sign-in
that cannot run in CI.

> **Owner decision (PR #11):** P2 active OAuth is Discord only. A second provider
> remains deferred; V2 User UUID, ExternalIdentity ports, and Account linking
> architecture stay multi-provider-ready.
>
> Secrets never go into chat, issues, PRs, screenshots, logs, or query strings.
> Use a local, git-ignored `.env`. Rotate or delete the OAuth apps after testing.

## 1. Prerequisites

- Docker infrastructure available (PostgreSQL + Redis) via `pnpm infra:up`.
- Node 24 + pnpm 10 (repo standard).
- A local `.env` (git-ignored). Copy the identity block from `.env.example`.

## 2. Create local OAuth credentials

### Discord

1. https://discord.com/developers/applications → New Application (V2 app only;
   do not reuse credentials from another project).
2. OAuth2 → add redirect URI:
   `http://127.0.0.1:4200/api/auth/callback/discord`
3. Scopes for user login only: `identify`, `email`. **Do not** add bot scopes or
   guild permissions.
4. Copy Client ID and Client Secret.

## 3. Configure the local `.env`

Copy the identity block from the monorepo root `.env.example` into the **root**
`.env` (git-ignored):

```
cp .env.example .env   # then fill identity values below
```

`pnpm --dir services/identity-service migrate` and `dev` call
`loadIdentityEnvFiles()` which loads, without overriding existing shell/CI vars:

1. `.env` in the process cwd
2. `../../.env` (monorepo root when cwd is `services/identity-service`)
3. `services/identity-service/.env` when started from the monorepo root

After `cp .env.example .env` at the repo root, `pnpm --dir services/identity-service …`
picks up that root file via step 2.

Set (never commit real values):

```
IDENTITY_AUTH_ENABLED=true
IDENTITY_DATABASE_URL=postgresql://identity:identity_dev_password@127.0.0.1:5432/identity
IDENTITY_REDIS_URL=redis://127.0.0.1:6379/1
IDENTITY_AUTH_BASE_URL=http://127.0.0.1:4200
IDENTITY_AUTH_BASE_PATH=/api/auth
IDENTITY_TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
IDENTITY_COOKIE_PREFIX=v2.identity
IDENTITY_PROOF_UI_ENABLED=true
IDENTITY_BETTER_AUTH_SECRET=<generate 32+ random bytes, e.g. `openssl rand -base64 48`>
IDENTITY_DISCORD_CLIENT_ID=<discord id>
IDENTITY_DISCORD_CLIENT_SECRET=<discord secret>
```

Google / other OAuth providers are **not** required and are not active in P2.

## 4. Migrate and start

```
pnpm infra:up
pnpm --dir services/identity-service migrate   # applies migrations/001_better_auth.sql (idempotent)
pnpm --dir services/identity-service dev
```

The migrate command prints, for each file, its status and
`sha256=<checksum>`. For `001_better_auth.sql` the normalized (LF) checksum is:

```
353ca51869aa7cd23f6125d39e54dd16509b23969a6d0c918a9f2c8213d5e30e
```

Health checks:

- `GET http://127.0.0.1:4200/health/live` → `{"status":"ok"}`
- `GET http://127.0.0.1:4200/health/ready` → `{"status":"ok"}` once DB, Redis, and
  migration `001` are all present.

## 5. Open the proof UI

`http://127.0.0.1:4200/identity/proof` (only when `IDENTITY_PROOF_UI_ENABLED=true`
and `NODE_ENV!=production`; otherwise 404).

Use **Sign in with Discord** on that page (server redirect sets the OAuth state
cookie). Do not open the Discord authorize URL from another tool — that skips
the cookie and causes `state_mismatch`.

## 6. Live checklist

1. Discord sign-in with a normal account.
2. Discord sign-in with a profile without email if available. (A missing test
   account does not replace the mandatory automated `email=null` test — see
   `src/infrastructure/better-auth.integration.spec.ts`.)
3. Explicit link / unlink of Discord from an active session (cannot remove the
   last login method — `CANNOT_UNLINK_LAST`).
4. `GET /identity/me` never exposes a synthetic email as a contact address
   (`email` is `null`, `emailSynthetic` is `true`).
5. `POST /identity/logout` invalidates the current session immediately.
6. `POST /identity/logout-all` and the system revoke invalidate the old cookie
   immediately (no cookie-cache window).
7. Inspect PostgreSQL/Redis to confirm the storage model:
   - active session lives in Redis under `v2:identity:auth:*`;
   - there is **no** `session` table in PostgreSQL;
   - `account.accessToken` / `refreshToken` / `idToken` are `NULL`.
8. No raw provider tokens appear in the database or logs.

Same-email no-implicit-link and multi-account-row linking are covered by
automated infra tests (no live second OAuth provider required).

## 6b. Live gate result (owner, 2026-08-05)

### Manually confirmed by owner — PASSED

Discord-only live OAuth on draft PR #11 (proof UI):

| Step                            | Result                        |
| ------------------------------- | ----------------------------- |
| Sign in with Discord            | OK                            |
| `GET /identity/me`              | 200 (V2 user + Discord email) |
| `GET /identity/accounts`        | Discord account present       |
| `POST /identity/logout`         | 200 `{ "status": "ok" }`      |
| `GET /identity/me` after logout | 401 `UNAUTHENTICATED`         |

### Not manually confirmed

The following were **not** executed or attested by the owner in the live gate.
They remain covered by automated CI/infra tests and/or the checklist for a
future optional re-run — **do not treat them as manually passed**:

- `POST /identity/logout-all`
- system revoke (`revokeAllSessionsForUser`)
- PostgreSQL storage inspection (no `session` table; token columns NULL)
- Redis session-key inspection (`v2:identity:auth:*`)
- Live confirmation that provider tokens are absent from the database

Proof UI logout/logout-all must POST `body: '{}'` with
`Content-Type: application/json` (Fastify rejects empty JSON bodies —
regression covered in `proof-ui.controller.spec.ts`).

### Storage inspection helpers (optional; not part of the owner-passed subset)

```
# No session table (expect empty result):
psql "$IDENTITY_DATABASE_URL" -c "SELECT to_regclass('public.session');"

# Account token columns must be NULL:
psql "$IDENTITY_DATABASE_URL" -c 'SELECT "providerId","accessToken","refreshToken","idToken" FROM "account";'

# Active session keys in Redis:
redis-cli -n 1 --scan --pattern 'v2:identity:auth:*'
```

## 7. Clean up

- Stop the service and `pnpm infra:down`.
- Delete or rotate the Discord OAuth credentials.
- Remove secrets from the local `.env`.

## 8. Cookie summary (no secret values)

- Name prefix: `v2.identity` (configurable via `IDENTITY_COOKIE_PREFIX`).
- `HttpOnly`, `SameSite=Lax`, host-only, `Secure` outside localhost
  (`useSecureCookies` follows `NODE_ENV=production`).
- Opaque session id only — no JWT in the cookie, no tokens in
  `localStorage`/`sessionStorage`.
- Cookie cache and stateless session are disabled, so revoke is immediate.

## 9. DESTILED web entry (apps/web)

After this Identity proof works, use the product UI:

- [WEB_DISCORD_LOGIN.md](./WEB_DISCORD_LOGIN.md)
- Public env: NEXT_PUBLIC_IDENTITY_AUTH_BASE_URL=http://127.0.0.1:4200
- Real OAuth is the default; NEXT_PUBLIC_DISCORD_AUTH_SIMULATE=true only for the state simulator
- Run Identity :4200 + Web :3000 (prefer 127.0.0.1 on both hosts)

