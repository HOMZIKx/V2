# Local OAuth proof — Identity Service (P2)

Manual live gate for the Better Auth proof slice. Automated CI already proves
config, storage model, linking policy, revoke, and the Discord `email=null` path
without any real OAuth. This checklist covers the **manual** Discord + Google
sign-in that cannot run in CI.

> Secrets never go into chat, issues, PRs, screenshots, logs, or query strings.
> Use a local, git-ignored `.env`. Rotate or delete the OAuth apps after testing.

## 1. Prerequisites

- Docker infrastructure available (PostgreSQL + Redis) via `pnpm infra:up`.
- Node 24 + pnpm 10 (repo standard).
- A local `.env` (git-ignored). Copy the identity block from `.env.example`.

## 2. Create local OAuth credentials

### Discord

1. https://discord.com/developers/applications → New Application.
2. OAuth2 → add redirect URI:
   `http://127.0.0.1:4200/api/auth/callback/discord`
3. Scopes for user login only: `identify`, `email`. **Do not** add bot scopes or
   guild permissions.
4. Copy Client ID and Client Secret.

### Google

1. https://console.cloud.google.com/ → APIs & Services → Credentials → OAuth
   client ID (Web application).
2. Authorized redirect URI:
   `http://127.0.0.1:4200/api/auth/callback/google`
3. Scopes: `openid`, `email`, `profile` only. **Do not** add Drive/Calendar/Gmail.
4. Copy Client ID and Client Secret.

## 3. Configure the local `.env`

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
IDENTITY_GOOGLE_CLIENT_ID=<google id>
IDENTITY_GOOGLE_CLIENT_SECRET=<google secret>
```

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

## 6. Live checklist

1. Discord sign-in with a normal account.
2. Discord sign-in with a profile without email if available. (A missing test
   account does not replace the mandatory automated `email=null` test — see
   `src/infrastructure/better-auth.integration.spec.ts`.)
3. Google sign-in.
4. Same verified email on both providers does **not** implicitly merge accounts
   (`disableImplicitLinking`).
5. Explicit link Google ↔ Discord from an active session.
6. Unlink must refuse to remove the last remaining login method
   (`CANNOT_UNLINK_LAST`).
7. `GET /identity/me` never exposes a synthetic email as a contact address
   (`email` is `null`, `emailSynthetic` is `true`).
8. `POST /identity/logout` invalidates the current session immediately.
9. `POST /identity/logout-all` and the system revoke invalidate the old cookie
   immediately (no cookie-cache window).
10. Inspect PostgreSQL/Redis to confirm the storage model:
    - active session lives in Redis under `v2:identity:auth:*`;
    - there is **no** `session` table in PostgreSQL;
    - `account.accessToken` / `refreshToken` / `idToken` are `NULL`.
11. No raw provider tokens appear in the database or logs.

### Storage inspection helpers

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
- Delete or rotate the Discord and Google OAuth credentials.
- Remove secrets from the local `.env`.

## 8. Cookie summary (no secret values)

- Name prefix: `v2.identity` (configurable via `IDENTITY_COOKIE_PREFIX`).
- `HttpOnly`, `SameSite=Lax`, host-only, `Secure` outside localhost
  (`useSecureCookies` follows `NODE_ENV=production`).
- Opaque session id only — no JWT in the cookie, no tokens in
  `localStorage`/`sessionStorage`.
- Cookie cache and stateless session are disabled, so revoke is immediate.
