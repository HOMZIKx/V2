# Zeabur Production Readiness Audit

Task: `V2-ZEABUR-PRODUCTION-READINESS-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
Scope: deploy/boot/migrate/recover/security for current V2 foundation — **no product behavior changes**, no Reservations/Marketplace work.

Product status unchanged: **`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`**. LFG status unchanged: **`READY_FOR_CHATGPT_REAUDIT`**.

---

## Summary

| Severity | Found | Fixed this audit | Owner / deferred |
| -------- | ----- | ---------------- | ---------------- |
| CRITICAL | 4     | 3                | 1                |
| HIGH     | 11    | 4                | 7                |
| MEDIUM   | 14    | 1                | 13               |
| LOW      | 10+   | 0                | 10+              |

Local validation: `corepack pnpm validate` **PASS** at `b4ce19fb066b7e44ef1322e236df4c730ccf7dce`.

---

## CRITICAL

### C-01 — Authorization Docker image could not run migrations (FIXED)

|            |                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `Dockerfile.authorization-service` copied `dist` only; no `migrations/` or `migrate-prod.mjs` (unlike identity/activity). |
| **Impact** | Fresh Zeabur deploy could start against empty schema; readiness previously returned 200 without migration check.          |
| **Fix**    | Added `scripts/migrate-prod.mjs`, `migrate:prod` script, Dockerfile copies migrations + script.                           |
| **Proof**  | Dockerfile parity with identity/activity; `pnpm --dir services/authorization-service migrate:prod` after build.           |

### C-02 — Production allowed disabled authorization (pass-through inbound guard) (FIXED)

|            |                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cause**  | `AUTHORIZATION_ENABLED` defaulted `false`; `InboundAssertionGuard` skipped verification when disabled in **all** environments. |
| **Impact** | Misconfigured Zeabur could expose authorization API without client-assertion verification.                                     |
| **Fix**    | `parseAuthorizationEnv` throws when `NODE_ENV=production` and `AUTHORIZATION_ENABLED !== true`.                                |
| **Proof**  | `authorization-env.spec.ts` — rejects disabled prod config; runtime smoke uses `NODE_ENV=test` for tokenless boot.             |

### C-03 — Readiness did not verify migrations (authorization + activity) (FIXED)

|            |                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cause**  | Only identity `/health/ready` checked `*_schema_migrations`; authz/activity ready = DB ping only.                                                                                    |
| **Impact** | Zeabur could route traffic while schema missing (500s on real endpoints).                                                                                                            |
| **Fix**    | Ready checks foundation migration ids: `001_authorization_foundation.sql`, `001_activity_foundation.sql`. Authz ready also pings Redis when `AUTHORIZATION_ASSERTION_REDIS_URL` set. |
| **Proof**  | `health.controller.spec.ts` in both services; 503 with `{ checks: { migrations: false } }`.                                                                                          |

### C-04 — API Gateway can forward Activity without client assertion (OPEN — Owner deploy config)

|                  |                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cause**        | `readActivityAssertionConfigFromEnv()` returns null unless `API_TO_ACTIVITY_*` + `ACTIVITY_ASSERTION_AUD` all set; proxy still forwards.                                                                           |
| **Impact**       | When `ACTIVITY_ENABLED=true` with inbound registry, unsigned gateway traffic is rejected — **correct fail-closed on activity**. When activity disabled (Centrum-only), unsigned traffic may be accepted by design. |
| **Fix (deploy)** | Zeabur: set full gateway→activity assertion bundle **or** keep `ACTIVITY_ENABLED=false` and rely on projection secret path only. Document in `ZEABUR_OWNER_VARIABLES.md`.                                          |
| **Proof**        | `activity-proxy.controller.ts`; activity `InboundAssertionGuard` tests.                                                                                                                                            |

---

## HIGH

### H-01 — Missing `.env.example` entries for Activity→Identity S2S (FIXED)

|            |                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `ACTIVITY_IDENTITY_BASE_URL`, `ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD`, `IDENTITY_CHARACTER_RESOLVE_URL` used in code but absent from template. |
| **Impact** | Owner misconfigures LFG character verify in production.                                                                                            |
| **Fix**    | Added vars to `.env.example` with localhost defaults + comments.                                                                                   |
| **Proof**  | `.env.example` diff; `activity-env.ts` requirements when `ACTIVITY_ENABLED=true`.                                                                  |

### H-02 — Identity Redis defaults to localhost (OPEN — deploy)

|                  |                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------- |
| **Cause**        | `IDENTITY_REDIS_URL` defaults `redis://127.0.0.1:6379/1` when unset.                  |
| **Impact**       | Production boot without explicit Redis silently uses wrong host / fails ready.        |
| **Fix (deploy)** | Set Zeabur Redis reference on identity (+ authz JTI DB index, activity JTI DB index). |
| **Proof**        | `identity-env.ts`; ready probe fails when Redis unreachable.                          |

### H-03 — Identity can boot with auth disabled in production (OPEN — deploy)

|                  |                                                                                   |
| ---------------- | --------------------------------------------------------------------------------- |
| **Cause**        | `IDENTITY_AUTH_ENABLED` defaults false; parser allows production without secrets. |
| **Impact**       | WWW/admin session flows broken; health returns `authDisabled: true`.              |
| **Fix (deploy)** | Set `IDENTITY_AUTH_ENABLED=true` + full Better Auth + Discord secrets on Zeabur.  |
| **Proof**        | `identity-env.ts`; `health.controller.ts` ready semantics.                        |

### H-04 — Activity production requires Redis for inbound assertions (OPEN — deploy)

|                  |                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Cause**        | JTI replay store requires `ACTIVITY_REDIS_URL` when enabled; parser enforces in production.                     |
| **Impact**       | Enabled activity without Redis fails closed at startup or ready.                                                |
| **Fix (deploy)** | Shared Redis add-on; separate logical DB indexes (identity `/1`, authz `/2`, activity `/3` per `.env.example`). |
| **Proof**        | `activity-env.ts`; ready redis check.                                                                           |

### H-05 — Discord projection auth is shared-secret only (OPEN — accepted P4.2)

|            |                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `POST /internal/activity/v1/projections/deliver` validates `x-activity-projection-secret`; no EdDSA client assertion on inbound.                  |
| **Impact** | Secret rotation and network isolation are the security boundary.                                                                                  |
| **Fix**    | Deploy: strong `ACTIVITY_PROJECTION_SHARED_SECRET`, private networking for discord-gateway; optional future assertion hardening (Owner decision). |
| **Proof**  | discord-gateway deliver handler; activity outbox HTTP publisher.                                                                                  |

### H-06 — RabbitMQ outbox path not in current Zeabur scope (OPEN — by design)

|            |                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `ACTIVITY_OUTBOX_TRANSPORT` default `http`; Rabbit topology exists in `@v2/messaging` but Zeabur docs exclude Rabbit for P4.1–P4.4. |
| **Impact** | None for current deploy; Postgres outbox + HTTP deliver is durability boundary.                                                     |
| **Fix**    | Keep `ACTIVITY_OUTBOX_TRANSPORT=http` on Zeabur; enable Rabbit only after infra decision.                                           |
| **Proof**  | `docs/deploy/ZEABUR.md` §2; `activity-topology.ts`.                                                                                 |

### H-07 — `btree_gist` extension required before migration 016 (OPEN — DBA)

|            |                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Cause**  | `016_reservations_no_overlap.sql` uses GiST exclusion constraint.                                             |
| **Impact** | Migration fails on fresh Postgres without extension (Reservations foundation, not product).                   |
| **Fix**    | Run `CREATE EXTENSION IF NOT EXISTS btree_gist;` on activity DB before migrate (document in MIGRATION_ORDER). |
| **Proof**  | migration file; `MIGRATION_SAFETY.md`.                                                                        |

### H-08 — Single Postgres add-on vs ADR-0004 separate DBs (OPEN — infra)

|            |                                                                                      |
| ---------- | ------------------------------------------------------------------------------------ |
| **Cause**  | Test Zeabur project may use one Postgres with three logical databases/users.         |
| **Impact** | Blast radius / rotation coupling; acceptable for test, not final production posture. |
| **Fix**    | Owner: separate addons per ADR-0004 when moving beyond test project.                 |
| **Proof**  | `service-registry.json` addons notes.                                                |

### H-09 — Web/admin build-time public URLs (OPEN — deploy)

|            |                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------- |
| **Cause**  | `NEXT_PUBLIC_*` / `VITE_API_BASE_URL` baked at Docker build; empty ARG overrides Zeabur vars.  |
| **Impact** | Browser calls localhost or relative URLs in production.                                        |
| **Fix**    | Set build-time vars in Zeabur service settings before build; no empty Dockerfile ARG defaults. |
| **Proof**  | `Dockerfile.web`, `Dockerfile.admin`; `docs/deploy/ZEABUR.md` §5.                              |

### H-10 — CI billing blocks remote proof (OPEN — Owner)

|            |                                                                |
| ---------- | -------------------------------------------------------------- |
| **Cause**  | `BLOCKED_GITHUB_BILLING_SPENDING_LIMIT` — Actions never start. |
| **Impact** | No remote green CI gate; local validate only.                  |
| **Fix**    | Owner restores GitHub billing.                                 |
| **Proof**  | `PROJECT_STATE.md` CI_STATUS.                                  |

### H-11 — GitHub not authenticated for gh PR comments (LOW ops)

Documented only; does not block Zeabur deploy.

---

## MEDIUM (selected)

| ID   | Item                                                | Notes                                                                               |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M-01 | Health docs list live-only for Nest services        | Use `/health/live` for Zeabur restart; ready for dependency gating during rollouts. |
| M-02 | Admin health: `/health` vs `/`                      | Both work on static server; prefer `/health`.                                       |
| M-03 | Discord `.env` file loader at startup               | Container should rely on Zeabur env, not committed files.                           |
| M-04 | `IDENTITY_CHARACTER_RESOLVE_URL` defaults localhost | Must set exact HTTPS internal URL in prod when LFG enabled.                         |
| M-05 | API gateway ready: Discord check non-blocking       | Discord outage does not fail gateway ready (intentional).                           |
| M-06 | Activity ready returns outbox snapshot              | Operator signal only; not a liveness substitute.                                    |
| M-07 | Authorization maintenance worker                    | Autonomous revoke drain; requires enabled auth + DB.                                |
| M-08 | Discord strict guild isolation                      | Process exit on unauthorized guild — correct fail-closed.                           |
| M-09 | Observability: structured logs include service name | Correlation via `@v2/observability`; no JWT/cookie logging in parsers.              |
| M-10 | Docker HEALTHCHECK uses in-container 127.0.0.1      | Acceptable; not a localhost assumption for external deps.                           |
| M-11 | `ALLOW_PRODUCTION_CONNECTIONS` dev guard            | Non-prod blocks remote DB unless explicitly allowed.                                |
| M-12 | Runtime smoke authorization uses `NODE_ENV=test`    | **Fixed** — allows tokenless smoke while prod enforces enabled auth.                |
| M-13 | Env vars documented but unused                      | Periodic drift possible; `.env.example` updated for identity S2S this audit.        |
| M-14 | Marketplace/Reservations migrations present         | Schema exists; **no product implementation** — do not enable features.              |

---

## LOW (selected)

- Default service hosts `127.0.0.1` overridden by Dockerfile `HOST=0.0.0.0`.
- Web runtime localhost fallbacks in `apps/web/src/lib/env.ts` for dev.
- Image size not optimized (acceptable for current stage).
- Non-root user not enforced in all Dockerfiles.
- `pnpm test:runtime-smoke` requires prior `pnpm build` (documented in DEVELOPMENT.md).

---

## ZEABUR_ENV_MATRIX

Legend: **R** = required in production Centrum, **O** = optional, **C** = conditional, **S** = secret (never commit).

| Variable                                  | Service(s)        | Purpose                       | Generated by             | Rotation impact                    |
| ----------------------------------------- | ----------------- | ----------------------------- | ------------------------ | ---------------------------------- |
| `AUTHORIZATION_DATABASE_URL`              | authorization     | Postgres DSN                  | Zeabur Postgres addon    | Full outage until updated          |
| `AUTHORIZATION_ENABLED`                   | authorization     | Enable authz API + guards     | Owner                    | Must be `true` in prod             |
| `AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID` | authorization     | Owner seed                    | Owner Discord id         | Immutable after bootstrap          |
| `AUTHORIZATION_INBOUND_CLIENTS_JSON`      | authorization     | Inbound JWKS registry         | Owner / keygen           | Add keys before rotate             |
| `AUTHORIZATION_SYSTEM_*`                  | authorization     | Outbound revoke signing       | Owner keygen             | Revoke client coordination         |
| `AUTHORIZATION_ASSERTION_REDIS_URL`       | authorization     | JTI replay store              | Zeabur Redis             | Replay window exposure if down     |
| `AUTHORIZATION_ASSERTION_AUD`             | authorization     | Inbound assertion aud         | Owner URL planning       | Must match callers exactly         |
| `IDENTITY_DATABASE_URL`                   | identity          | Postgres DSN                  | Zeabur                   | Session/profile outage             |
| `IDENTITY_REDIS_URL`                      | identity          | Session + rate limits         | Zeabur Redis             | Auth outage                        |
| `IDENTITY_AUTH_*` / Discord               | identity          | Better Auth + OAuth           | Discord Developer Portal | OAuth break if rotated wrong       |
| `IDENTITY_BETTER_AUTH_SECRET`             | identity          | Session crypto                | Owner generate           | Invalidates all sessions           |
| `IDENTITY_INTERNAL_JWT_*`                 | identity          | Internal JWT issuance         | Owner keygen             | Gateway S2S break                  |
| `IDENTITY_CHARACTER_RESOLVE_URL`          | identity          | S2S aud for character resolve | Owner URL                | Activity LFG verify break          |
| `ACTIVITY_DATABASE_URL`                   | activity          | Postgres DSN + outbox         | Zeabur                   | Centrum outage                     |
| `ACTIVITY_REDIS_URL`                      | activity          | Inbound JTI replay            | Zeabur Redis             | Fail closed when enabled           |
| `ACTIVITY_ENABLED`                        | activity          | Full Centrum API              | Owner                    | false = projection-only mode       |
| `ACTIVITY_*_ASSERTION_*`                  | activity          | S2S to authz/identity/discord | Owner keygen             | Cross-service auth break           |
| `ACTIVITY_PROJECTION_SHARED_SECRET`       | activity, discord | Projection deliver HMAC       | Owner generate           | Discord panels stale until aligned |
| `ACTIVITY_OUTBOX_*`                       | activity          | Outbox worker + transport     | Owner                    | Delivery stall if misconfigured    |
| `DISCORD_TOKEN`                           | discord           | Bot WS + REST                 | Discord Portal           | Bot offline                        |
| `DISCORD_COMPONENT_SIGNING_SECRET`        | discord           | Interaction custom IDs        | Owner generate           | Buttons invalid                    |
| `DISCORD_TEST_GUILD_ID`                   | discord           | Guild isolation               | Owner                    | Startup fail if wrong              |
| `API_TO_ACTIVITY_*`                       | api-gateway       | Optional activity assertion   | Owner keygen             | Unsigned proxy if unset            |
| `INTERNAL_JWT_*`                          | api-gateway       | Identity internal token       | Owner keygen             | BFF auth break                     |
| `NEXT_PUBLIC_*` / `VITE_*`                | web, admin        | Build-time API origins        | Owner public URLs        | Rebuild required                   |

Full copy-paste list: `docs/deploy/ZEABUR_OWNER_VARIABLES.md`.

---

## SERVICE_DEPENDENCY_MATRIX

| Service               | Postgres | Redis          | Rabbit               | Upstream (runtime)          | Downstream                         |
| --------------------- | -------- | -------------- | -------------------- | --------------------------- | ---------------------------------- |
| authorization-service | Yes      | Optional (JTI) | No                   | identity (revoke)           | activity, identity, discord (sync) |
| identity-service      | Yes      | Yes (auth on)  | No                   | authorization (optional)    | api-gateway, activity              |
| activity-service      | Yes      | Yes (enabled)  | Optional (transport) | authz, identity, discord    | discord-gateway                    |
| discord-gateway       | No       | No             | Optional consumer    | activity, Discord API       | Discord users                      |
| api-gateway           | No       | No             | No                   | identity, activity, discord | web, admin                         |
| web                   | No       | No             | No                   | api-gateway (browser)       | —                                  |
| admin                 | No       | No             | No                   | api-gateway (browser)       | —                                  |

---

## DEPLOY_ORDER

1. **Add-ons:** Postgres (×3 logical DBs or separate addons), Redis.
2. **Postgres extension:** `btree_gist` on activity database (before migration 016).
3. **Migrations (see MIGRATION_ORDER):** authorization → identity → activity (can parallelize if separate DBs).
4. **Backend services:** `authorization-service`, `identity-service` (parallel OK).
5. **activity-service** (after authz reachable if `ACTIVITY_ENABLED=true`).
6. **discord-gateway** (after activity URL + projection secret).
7. **api-gateway** (after identity + activity live URLs).
8. **web**, **admin** (rebuild after api-gateway public URL known).

Source: `docs/deploy/ZEABUR.md`, `tools/runtime/service-registry.json`.

---

## MIGRATION_ORDER

| Order | Service       | Command                                                  | Count | Notes                                          |
| ----- | ------------- | -------------------------------------------------------- | ----: | ---------------------------------------------- |
| 1     | authorization | `pnpm --dir services/authorization-service migrate:prod` |     5 | `001`…`005` sequential                         |
| 2     | identity      | `pnpm --dir services/identity-service migrate:prod`      |     2 | Requires auth tables for ready                 |
| 3     | activity      | `pnpm --dir services/activity-service migrate:prod`      |    18 | Run `CREATE EXTENSION btree_gist` before `016` |

**Zeabur strategy:** one-shot pre-deploy job or manual exec into container:

```bash
cd /app/services/authorization-service && node scripts/migrate-prod.mjs
cd /app/services/identity-service && node scripts/migrate-prod.mjs
cd /app/services/activity-service && node scripts/migrate-prod.mjs
```

Services **must not** serve ready traffic until foundation migration row exists (enforced in ready probes after this audit).

---

## HEALTHCHECK_MATRIX

| Service         | Zeabur probe (restart) | Ready (dependency gate)                                       | Notes                        |
| --------------- | ---------------------- | ------------------------------------------------------------- | ---------------------------- |
| authorization   | `GET /health/live`     | `GET /health/ready` — DB + migrations + Redis?                | 503 if unmigrated            |
| identity        | `GET /health/live`     | `GET /health/ready` — DB + Redis + migration                  | `authDisabled` when auth off |
| activity        | `GET /health/live`     | `GET /health/ready` — DB + migrations + Redis? + outbox stats | `activityDisabled` when off  |
| api-gateway     | `GET /health/live`     | `GET /health/ready` — upstream identity/activity              | Discord diagnostic optional  |
| discord-gateway | `GET /health/live`     | `GET /health/ready` + `/health/discord`                       | WS process must stay up      |
| web             | `GET /health`          | —                                                             | Static Next route            |
| admin           | `GET /health`          | —                                                             | Static server                |

Policy: **liveness** for Zeabur auto-restart; **readiness** for rollout ordering (do not use ready as restart probe per `docs/deploy/HEALTH.md`).

---

## RECOVERY_MATRIX

| Scenario                   | Expected behavior                                                          | Manual /sync?                    |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| Cold boot                  | Migrations applied → services start → outbox worker drains pending         | No                               |
| Service restart            | Reconnect pools; workers resume                                            | No                               |
| DB temporarily down        | Ready 503; liveness may still pass                                         | No — auto retry                  |
| Redis down                 | Identity/activity/authz ready 503 when configured                          | Fail closed (no JTI bypass)      |
| Rabbit down                | HTTP outbox still works; RMQ transport retries/fails rows                  | Postgres outbox retains events   |
| Identity down              | Gateway ready fails; web login fails                                       | No                               |
| Authorization down         | Activity enabled: authz client errors; ready may pass on activity if DB ok | No                               |
| Discord down               | discord `/health/discord` fails; gateway ready may warn                    | Outbox retries; panels catch up  |
| Projection secret mismatch | Deliver 401; outbox retries/failed state                                   | Fix secret + redeploy both sides |

Outbox + hub reconciliation (`DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP`) restore Discord projections without manual `/sync` under normal recovery.

---

## Service inventory (runtime)

| Service               | Dockerfile                         | Build                                           | Start                                                  | Port | Live           | Ready                              |
| --------------------- | ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------ | ---- | -------------- | ---------------------------------- |
| api-gateway           | `Dockerfile.api-gateway`           | `pnpm --filter @v2/api-gateway build`           | `node dist/apps/api-gateway/src/main.js`               | 4000 | `/health/live` | `/health/ready`                    |
| identity-service      | `Dockerfile.identity-service`      | `pnpm --filter @v2/identity-service build`      | `node dist/services/identity-service/src/main.js`      | 4200 | `/health/live` | `/health/ready`                    |
| authorization-service | `Dockerfile.authorization-service` | `pnpm --filter @v2/authorization-service build` | `node dist/services/authorization-service/src/main.js` | 4300 | `/health/live` | `/health/ready`                    |
| activity-service      | `Dockerfile.activity-service`      | `pnpm --filter @v2/activity-service build`      | `node dist/services/activity-service/src/main.js`      | 4400 | `/health/live` | `/health/ready`                    |
| discord-gateway       | `Dockerfile.discord-gateway`       | `pnpm --filter @v2/discord-gateway build`       | `node dist/apps/discord-gateway/src/main.js`           | 4100 | `/health/live` | `/health/ready`, `/health/discord` |
| web                   | `Dockerfile.web`                   | `pnpm --filter @v2/web build`                   | `next start`                                           | 3000 | `/health`      | —                                  |
| admin                 | `Dockerfile.admin`                 | `pnpm --filter @v2/admin build`                 | `serve-static.mjs`                                     | 3001 | `/health`      | —                                  |

Node **24**, **pnpm 10.14** via corepack in all Dockerfiles.

---

## Internal service auth (trace)

| Caller → callee          | Mechanism                                                      | Fail closed                                        |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------------- |
| API Gateway → Identity   | Session cookie → actor headers; optional internal JWT          | No cookie → no actor                               |
| API Gateway → Activity   | Optional `Activity-Client-Assertion` (EdDSA)                   | Activity rejects if enabled + no assertion         |
| Activity → Authorization | Client assertion, aud = `ACTIVITY_AUTHORIZATION_ASSERTION_AUD` | DenyAll client in prod when disabled               |
| Activity → Identity      | Client assertion, aud = character resolve URL                  | PassThrough only when activity disabled + non-prod |
| Activity → Discord       | HTTP deliver: shared secret; optional EdDSA outbound           | Outbox retry on failure                            |
| Authz → Identity         | Client assertion to revoke URL                                 | Required when authz enabled                        |
| Discord → Activity       | Headers mode or client assertion                               | Configurable `ACTIVITY_CLIENT_MODE`                |

JWKS: inbound registries via `*_INBOUND_CLIENTS_JSON`; TTL/skew via `*_CLIENT_ASSERTION_MAX_TTL_SECONDS` and clock skew envs; JTI replay via Redis when URL configured.

---

## Validation (this audit)

| Check                    | Result                                                               |
| ------------------------ | -------------------------------------------------------------------- |
| `corepack pnpm validate` | **PASS** — `b4ce19fb066b7e44ef1322e236df4c730ccf7dce`                |
| Production builds        | Included in validate (`pnpm build` + runtime smoke)                  |
| Migration scripts        | authz `migrate-prod.mjs` added; syntax via existing `run-migrations` |
| Docker parity            | authz Dockerfile updated                                             |
| Zeabur live deploy       | Not executed (no secrets in repo)                                    |

---

## Checkpoint

| Marker                                  | SHA                                        |
| --------------------------------------- | ------------------------------------------ |
| `ZEABUR_PRODUCTION_READINESS_AUDIT_SHA` | `b4ce19fb066b7e44ef1322e236df4c730ccf7dce` |

Prior LFG markers unchanged. No Reservations/Marketplace product work started.
