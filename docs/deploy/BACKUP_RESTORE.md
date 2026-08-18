# Backup and restore readiness

**Do not destroy production data to test this.**

## What exists today

Zeabur Postgres add-ons (logical aliases `postgres-authorization`,
`postgres-identity`, `postgres-activity`) are the data stores. Redis is
ephemeral cache/JTI/session material — restore Redis is not required to
recover Activity rows.

Who creates backups: **Zeabur addon snapshots / owner-triggered dump**. This
repository does not store credentials or run production dumps.

Retention: whatever the Zeabur project plan provides. Confirm in the Zeabur
UI; do not assume infinite retention.

## Restore procedure (names only)

1. Provision a **new** Postgres (or local Docker `activity` / `identity` /
   `authorization` databases).
2. Restore the dump with `pg_restore` / `psql` using the addon **admin**
   credential available only in Zeabur Variables — never paste values into
   git or chat.
3. Point the matching service `*_DATABASE_URL` at the restored database.
4. Run that service `migrate:prod` (checksum skip if already applied).
5. Restart the APP. Keep Redis as-is or flush JTI/session keys if sessions
   must be invalidated (see incident runbook).

Stop or set read-only only if you are restoring **over** a live database.
Prefer restore into a new addon and switch the URL.

## RESTORE_PROOF

Local proof uses `infrastructure/docker/docker-compose.yml` databases, not
Zeabur production.

`RESTORE_PROOF: PASS` (2026-08-18): `pg_dump` custom format of local
`activity` → `CREATE DATABASE activity_restore_proof` → `pg_restore` →
`activity_schema_migrations` marker row present → database dropped.
Production Zeabur restore remains owner-operated.
