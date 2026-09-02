# Backup and restore readiness

**Do not destroy production data to test this.**

## Databases (logical separation)

| Logical alias            | Service               | Database name   | Owner role        | Tracking table                    |
| ------------------------ | --------------------- | --------------- | ----------------- | --------------------------------- |
| `postgres-identity`      | identity-service      | `identity`      | `identity`        | `identity_schema_migrations`      |
| `postgres-authorization` | authorization-service | `authorization` | `"authorization"` | `authorization_schema_migrations` |
| `postgres-activity`      | activity-service      | `activity`      | `activity`        | `activity_schema_migrations`      |

Redis is **ephemeral** (sessions, JTI replay, caches) — restore Postgres first; flush Redis only when invalidating sessions is required.

## Who creates backups

**Zeabur Postgres addon snapshots** and **owner-triggered logical dumps**. This repository documents patterns only — no credentials in git.

## Recommended pattern (per database)

```bash
# Custom format (preferred for pg_restore). Run from a trusted admin host.
pg_dump -Fc --no-owner -f identity.dump "$IDENTITY_DATABASE_URL"
pg_dump -Fc --no-owner -f authorization.dump "$AUTHORIZATION_DATABASE_URL"
pg_dump -Fc --no-owner -f activity.dump "$ACTIVITY_DATABASE_URL"
```

| Topic        | Guidance                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| Frequency    | Daily minimum for production; before every schema migration deploy       |
| Retention    | Match Zeabur plan + off-site copy (Owner policy)                         |
| Encryption   | Encrypt dumps at rest (disk/vault); never commit dumps to git            |
| Verification | Monthly restore drill into **disposable** DB; verify migration markers   |
| Pre-restore  | Stop traffic or point services read-only; restore to **new** addon first |

## Restore procedure

1. Provision a **new** Postgres database (Zeabur addon or local Docker).
2. Restore: `pg_restore --no-owner --dbname "$TARGET_URL" activity.dump` (or `psql` for plain SQL).
3. Point service `*_DATABASE_URL` at the restored database.
4. Run `pnpm --dir services/<service> migrate:prod` — idempotent skip when markers match.
5. Restart APP services. Confirm `/health/ready` shows `migrations: true` (full chain, not foundation-only).
6. Optional: flush Redis if sessions/JTI must be invalidated.

Prefer restore into a **new** addon and switch URLs — do not overwrite live DB unless incident requires it.

## Local disposable drill

With Docker Postgres (`infrastructure/docker/docker-compose.yml`):

```bash
# Start infra
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres

# Migrate all (order: authorization → identity → activity)
pnpm --dir services/authorization-service migrate
pnpm --dir services/identity-service migrate
pnpm --dir services/activity-service migrate

# Infra tests (fresh DB, idempotency, restore drill when pg_dump in PATH)
RUN_INFRA_TESTS=true pnpm test:infra
```

Automated drill: `tools/infra/migration-recovery.test.ts` (requires local Postgres + `pg_dump`/`pg_restore`).

## RESTORE_PROOF status

| Proof                          | Status               | Notes                                                                 |
| ------------------------------ | -------------------- | --------------------------------------------------------------------- |
| Historical local activity dump | PASS                 | 2026-08-18 — see prior note in git history                            |
| Automated migration-recovery   | READY                | `RUN_INFRA_TESTS=true pnpm test:infra` when Docker Postgres available |
| This audit run (2026-08-24)    | BLOCKED_LOCAL_DOCKER | Docker daemon unavailable on audit host — static + unit proofs only   |

Production Zeabur restore remains **owner-operated**.
