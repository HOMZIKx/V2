# CURSOR → ChatGPT

## Status

**MODE:** `V2-RUNTIME-005-006-TIP-DEPLOY-AND-ACCEPTANCE`  
**RESULT:** `OWNER_ACCEPTANCE_REQUIRED`  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge

## Ownership split (unchanged — D-050)

| Role                | Owns                                                                                         | Must not                                              |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Cursor**          | Backend / Identity / Authz / Discord / API / Zeabur; integrate approved frontend             | Redesign competing member WWW; start Task 007         |
| **Owner + ChatGPT** | Product, UX, production member WWW (`codex/phase5-*`, `preview/destiled-web`)                | Expect Cursor to invent replacement WWW visual product |

## Root cause (closed)

API `/health/ready` returned **503** with `identity=unhealthy` because Identity readiness check **`migrations: false`**.

- DB: OK · Redis: OK · Migrations: only `001` + `002` applied on prod Identity DB
- Tip image already contained `003_player_game_accounts.sql` but **Dockerfile does not auto-migrate**
- Controlled fix: `node scripts/migrate-prod.mjs` inside Identity container → applied `003` only (no DB reset)

After migrate: Identity ready **200**; API ready **200** with `identity=ok`.

## Runtime (Zeabur TESTOWY) — tip `e00185e…`

| Service                 | Deployed SHA   | Health / readiness                                      |
| ----------------------- | -------------- | ------------------------------------------------------- |
| identity-service        | `e00185e…`     | ready **PASS** (db+redis+migrations)                    |
| authorization-service   | `e00185e…`     | ready **PASS**                                          |
| activity-service        | `e00185e…`     | ok via API checks                                       |
| api-gateway             | `e00185e…`     | `/health/ready` **200** `activity=ok identity=ok`       |
| discord-gateway         | `e00185e…`     | bot ready                                               |
| web                     | `e00185e…`     | `/health` **200**                                       |
| admin                   | `e00185e…`     | `/health` **200**                                       |

Identity migrations inventory: `001_better_auth.sql`, `002_player_profile_foundation.sql`, `003_player_game_accounts.sql`.

## Process truth (005 / 006)

| Task                            | Code | Runtime | Owner acceptance |
| ------------------------------- | ---- | ------- | ---------------- |
| **005 Admin Control Center UX** | PASS (`4df7a94…`) | PASS tip | **PENDING** |
| **006 Player Toolkit Core**     | PASS (`2af092f…`) | PASS tip | **PENDING** |
| **007 Trackers**                | — | — | **NOT STARTED** |

## Local / CI

| Gate                         | Result                                      |
| ---------------------------- | ------------------------------------------- |
| `pnpm validate --quick`      | **PASS** at tip lineage                     |
| Full `pnpm validate` (e2e+)  | Prior 006A PASS; not re-run this closure    |
| GitHub Actions               | **UNVERIFIED** (`gh` not authenticated)     |

## Owner action required — minimal live tests

### OWNER TEST 005 — Admin

1. Open `https://v2-admin.zeabur.app/`
2. Click **Zaloguj przez Discord** (if shown) and complete Discord OAuth
3. Confirm guild selector loads at least one manageable guild (not a permanent API error)
4. Open **Pulpit** (`/`) — dashboard renders without Identity/API 503
5. Open **Discord → Centrum** (`/discord/centrum`) — page loads (config may be empty; no crash)

Expected: authenticated Admin shell on tip; no “identity unhealthy” / blank hard failure from API readiness.

### OWNER TEST 006 — Member

1. Open `https://v2-web.zeabur.app/profil`
2. Sign in with Discord if prompted (same V2 Discord app / test guild as existing runtime)
3. Confirm `/profil` shows signed-in member profile surface (not permanent UNAUTHENTICATED error after login)

Expected: session cookie path works WWW→API; profile route usable for acceptance of existing 006 surface.

### Discord live smoke (only if login fails)

Confirm Discord Developer Portal redirect includes `https://v2-api.zeabur.app/api/auth/callback/discord` and bot is online on the test guild. Do not redesign WWW.

## STOP

No Task 007. No Player Toolkit implementation start. No PR #19 merge. No competing member WWW redesign.
