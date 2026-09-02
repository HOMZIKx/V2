# Migration safety (current P4 + 006B)

No new architecture. Current SQL migrations are immutable once applied
(checksum in `*_schema_migrations`).

| Area          | Repeatable               | Transaction           | Locks / long ops                         | Backward compatible                       | Startup                                                                                          |
| ------------- | ------------------------ | --------------------- | ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| identity      | skip if checksum matches | per file              | `pg_advisory_lock(872014, 1)` + additive | older APP may miss columns after new file | Docker `scripts/docker-entrypoint.mjs` runs `migrate-prod` **before** listen; ready = full chain |
| authorization | skip if checksum matches | per file              | `pg_advisory_lock(872014, 2)` + additive | same                                      | same                                                                                             |
| activity      | skip if checksum matches | per file BEGIN/COMMIT | `pg_advisory_lock(872014, 3)` + additive | same                                      | same; `016` includes `CREATE EXTENSION btree_gist`                                               |

## Deploy model (006B control)

1. **Who migrates:** the service container itself at process start (entrypoint), not a human shell.
2. **When:** every start/restart/redeploy, before the Nest/HTTP listener.
3. **Pending migrations:** detected via inventory table vs `migrations/*.sql` on the image.
4. **Failure:** entrypoint exits non-zero → process does not serve traffic (fail closed). Ready stays unhealthy if somehow skipped.
5. **Re-run:** idempotent NOOP when inventory matches checksums.
6. **Concurrency:** session advisory lock serializes parallel migrators; one applies, others wait then skip.
7. **Break-glass only:** `V2_SKIP_STARTUP_MIGRATE=1` skips migrate (emergency). Do not set on normal Zeabur deploys.
8. **Manual `migrate-prod.mjs`:** still available for recovery/ops; **not** required for healthy tip deploys after 006B.

Do **not** edit applied SQL in place. Keep deploy order awareness for multi-service schema contracts, but each DB-owning service self-migrates its own database.

Current risk accepted: **forward-only**. See `ROLLBACK.md`.
