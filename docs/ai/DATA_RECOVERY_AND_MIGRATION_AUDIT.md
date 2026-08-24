# Data Recovery and Migration Audit

Task: `V2-DATA-INTEGRITY-MIGRATION-BACKUP-RECOVERY-AUDIT-001`  
Base: `3fa568e6996e31575c677847ed79545239967c36` (PR #19)  
Checkpoint: **`DATA_RECOVERY_AUDIT_SHA`** (recorded after this pass)

Mode: data safety / disaster recovery — **no product behavior changes** (operational readiness hardening only).

---

## Executive summary

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 1     | 1     | 0    |
| MEDIUM   | 3     | 0     | 3    |
| LOW      | 2     | 0     | 2    |

**LOCAL_VALIDATE:** PASS (includes static migration inventory)  
**FRESH_DB_PROOF (live):** BLOCKED_LOCAL_DOCKER — Docker daemon unavailable on audit host  
**RESTORE_PROOF (live):** READY via `RUN_INFRA_TESTS=true pnpm test:infra` when Postgres + pg_dump available

---

## HIGH — fixed

### H-DR-01 — Readiness checked foundation migration only (partial deploy blind spot)

| Field      | Detail                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Root cause | `/health/ready` verified only `001_*_foundation.sql`, not full migration chain                                                        |
| Impact     | App could report ready after partial migrate (e.g. 001 applied, 018 failed) → runtime errors on missing columns/tables                |
| Fix        | `migration-readiness.ts` + generated manifest; ready requires foundation + latest + `count === manifest.count` for all three services |
| Proof/test | `migration-readiness.spec.ts`, updated health controller specs                                                                        |
| SHA        | this checkpoint                                                                                                                       |

---

## MIGRATION_MATRIX

| Service       | Count | Foundation                         | Latest                                | Tracking table                    | Extensions (in SQL)                  |
| ------------- | ----- | ---------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------------ |
| identity      | 2     | `001_better_auth.sql`              | `002_player_profile_foundation.sql`   | `identity_schema_migrations`      | —                                    |
| authorization | 5     | `001_authorization_foundation.sql` | `005_activity_permission_catalog.sql` | `authorization_schema_migrations` | —                                    |
| activity      | 18    | `001_activity_foundation.sql`      | `018_lfg_audit_suppressions.sql`      | `activity_schema_migrations`      | `pgcrypto` (001), `btree_gist` (016) |

**Ordering:** Lexicographic filename sort (`001`…`018`). No duplicate numeric prefixes within a service.

**Tooling:** `tools/scripts/migration-inventory.mjs` (static audit + `--write` manifests). Wired into `pnpm validate`.

**Per-file transaction:** Each SQL file runs in `BEGIN`/`COMMIT`; failure rolls back that file only.

**Idempotency:** Re-run skips applied files; checksum drift throws (immutable migrations).

**Dangerous ops inventory (activity):**

| Migration | Flags                                       | Data risk assessment                                |
| --------- | ------------------------------------------- | --------------------------------------------------- |
| 007       | SET NOT NULL, DROP CONSTRAINT (PK reshape)  | Forward-only; backfill via UPDATE before NOT NULL   |
| 008       | DROP INDEX + recreate scoped unique indexes | No row deletion; participation uniqueness preserved |
| 016       | CREATE EXTENSION, EXCLUDE                   | No data loss; adds overlap constraint               |
| 017       | DROP CONSTRAINT (party role check replace)  | Check replaced immediately                          |

No `TRUNCATE`, `DROP TABLE`, or `DELETE FROM` in any migration file.

---

## BACKUP_MATRIX

See `docs/deploy/BACKUP_RESTORE.md` (updated this audit).

| DB            | Backup command pattern        | Restore                                | Redis coupling                     |
| ------------- | ----------------------------- | -------------------------------------- | ---------------------------------- |
| identity      | `pg_dump -Fc` → identity.dump | `pg_restore --no-owner` + migrate skip | Sessions in Redis — optional flush |
| authorization | same                          | same                                   | JTI optional flush                 |
| activity      | same                          | same                                   | Outbox continues from DB state     |

---

## RESTORE_PROOF

| Step                           | Result (this audit)                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Static inventory               | PASS — 2 + 5 + 18 migrations, manifests generated                                     |
| Idempotency (unit/integration) | PASS — existing specs + `migration-readiness`                                         |
| Fresh empty DB migrate         | **BLOCKED_LOCAL_DOCKER** — no local Postgres on audit host                            |
| pg_dump → drop → restore       | **Automated** in `tools/infra/migration-recovery.test.ts` when `RUN_INFRA_TESTS=true` |
| Historical manual proof        | PASS 2026-08-18 (activity) — noted in `BACKUP_RESTORE.md`                             |

**Commands when Docker available:**

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
pnpm --dir services/authorization-service migrate
pnpm --dir services/identity-service migrate
pnpm --dir services/activity-service migrate
RUN_INFRA_TESTS=true pnpm test:infra
```

---

## ROLLBACK_MATRIX

| Scenario                              | Safe app rollback? | DB action                                         |
| ------------------------------------- | ------------------ | ------------------------------------------------- |
| New app, no new migration             | Yes                | None                                              |
| New app + new migration applied       | **No**             | Keep DB; roll forward or restore backup to new DB |
| Migration failed mid-file             | N/A                | Transaction rolled back; fix SQL, redeploy        |
| Old app after new migration           | **No**             | Missing columns → crash; do not downgrade app     |
| Partial deploy (migrate ok, app fail) | Redeploy same SHA  | Ready probe now fails until full chain applied    |

**KNOWN_FORWARD_ONLY_MIGRATIONS:**

| ID    | Migration                          | Why forward-only                                    |
| ----- | ---------------------------------- | --------------------------------------------------- |
| F-007 | `007_p45_projections_multi.sql`    | PK changed from `activity_id` to UUID `id`          |
| F-008 | `008_p45_participations_scope.sql` | Unique index semantics changed for separate mode    |
| F-016 | `016_reservations_no_overlap.sql`  | Adds GiST EXCLUDE — dropping loses safety invariant |
| F-017 | `017_lfg_v1.sql`                   | New LFG tables/columns — old app unaware            |

No DOWN migrations provided (by design). See `docs/deploy/ROLLBACK.md`.

---

## CONSTRAINTS (correctness-critical)

| Invariant                       | DB enforcement                                   | App layer also |
| ------------------------------- | ------------------------------------------------ | -------------- |
| Tenant participation uniqueness | Partial unique indexes (008)                     | Yes            |
| Notification dedupe             | `PRIMARY KEY (recipient, dedupe_key)` (012)      | Yes            |
| LFG notify dedupe               | PK on `(recipient, activity, fingerprint)` (013) | Yes            |
| LFG intent suppress             | PK `(intent, activity, fingerprint)` (017)       | Yes            |
| LFG actor suppress              | PK `(recipient, activity, fingerprint)` (018)    | Yes            |
| Reservation overlap             | GiST EXCLUDE (016)                               | Yes (domain)   |
| Outbox idempotency              | Application idempotency table (001)              | Yes            |
| Idempotency API                 | PK on scope/actor/operation/key (001)            | Yes            |
| LFG overlapping intents         | Index only (017) — **not EXCLUDE**               | App (MEDIUM)   |

---

## PARTIAL FAILURE SCENARIOS

| Scenario                                 | Behavior after audit                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| Migrate succeeds, app deploy fails       | Ready=false if traffic hits unmigrated or partial chain         |
| New app against old schema               | Crash on missing objects — deploy order: migrate before traffic |
| Old app after new migration              | Unsafe — do not roll back app without DB restore/forward fix    |
| Service restart during outbox processing | Outbox reclaim/retry; at-least-once with idempotent handlers    |
| DB restart mid-transaction               | Migration file rolls back; partial file not recorded            |
| Concurrent migrate from two instances    | One waits on lock; second skips via checksum                    |

**Deploy order (unchanged):** authorization → identity → activity migrate → app services.

---

## MEDIUM (open)

| ID      | Item                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| M-DR-01 | LFG overlapping intents — no DB EXCLUDE; relies on app + index lookup         |
| M-DR-02 | Live fresh/restore proof blocked when Docker unavailable on CI/agent          |
| M-DR-03 | Marketplace/Reservations schema present — must stay disabled at product layer |

---

## LOW (open)

| ID      | Item                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------- |
| L-DR-01 | `manifest.json` + generated TS must be regen when adding migrations (`migration-inventory.mjs --write`) |
| L-DR-02 | Zeabur production restore drill remains owner-operated                                                  |

---

## Validation

```
node tools/scripts/migration-inventory.mjs — PASS
corepack pnpm validate — PASS (includes inventory step)
tools/infra/migration-inventory.test.ts — PASS (in test:coverage)
RUN_INFRA_TESTS=true pnpm test:infra — skipped without Postgres (by design)
```

---

## Recommendation

Operational readiness improved (full-chain ready probe). Run **`RUN_INFRA_TESTS=true pnpm test:infra`** on any agent with Docker Postgres before production migration deploys. Regenerate manifests after adding migration files.
