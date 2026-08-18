# Migration safety (current P4)

No new architecture. Current SQL migrations are immutable once applied
(checksum in `*_schema_migrations`).

| Area          | Repeatable               | Transaction           | Locks / long ops                    | Backward compatible                       | Startup                                                       |
| ------------- | ------------------------ | --------------------- | ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| identity      | skip if checksum matches | per file              | additive Better Auth tables/indexes | older APP may miss columns after new file | `migrate` / `migrate:prod` before/at deploy                   |
| authorization | skip if checksum matches | per file              | additive grants/leases              | same                                      | same                                                          |
| activity      | skip if checksum matches | per file BEGIN/COMMIT | additive ALTER COLUMN / indexes     | same                                      | `migrate:prod` in image; concurrent start OK if checksum skip |

Do **not** edit applied SQL in place. Concurrent service start: first instance
applies, others skip. There is no online expand/contract for current P4 files.

If two APPs boot against a database mid-migration, one waits on the
transaction. Keep deploy order: migrate then traffic.

Current risk accepted: **forward-only**. See `ROLLBACK.md`.
