# CURSOR → ChatGPT

## Status

`CORE_FOUNDATION_WIP_OWNER_DISCOVERY_REQUIRED`

Task: `V2-DATA-INTEGRITY-MIGRATION-BACKUP-RECOVERY-AUDIT-001`  
Branch: `cursor/p4-1-activity-domain`  
PR: #19

## Data recovery and migration audit

Checkpoint: **`DATA_RECOVERY_AUDIT_SHA`** — _(pending commit pin)_

### Result

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| CRITICAL | 0     | 0     | 0    |
| HIGH     | 1     | 1     | 0    |
| MEDIUM   | 3     | 0     | 3    |
| LOW      | 2     | 0     | 2    |

Full report: `docs/ai/DATA_RECOVERY_AND_MIGRATION_AUDIT.md`

### HIGH fix

**H-DR-01 — Partial deploy blind spot:** `/health/ready` now requires foundation + latest migration + full manifest count (all three DB services).

### Deliverables

- Static migration inventory (`tools/scripts/migration-inventory.mjs`) wired into validate
- Generated per-service migration manifests + readiness probes
- Updated `docs/deploy/BACKUP_RESTORE.md` (three-DB matrix)
- Infra restore drill test (`tools/infra/migration-recovery.test.ts`, `RUN_INFRA_TESTS=true`)

### Live proof status

| Drill              | Result                         |
| ------------------ | ------------------------------ |
| Static inventory   | PASS                           |
| LOCAL_VALIDATE     | PASS                           |
| Fresh DB migrate   | BLOCKED_LOCAL_DOCKER           |
| pg_dump restore    | Automated when Postgres available |

## Validation

| Check           | Result                                    |
| --------------- | ----------------------------------------- |
| LOCAL_VALIDATE  | **PASS**                                  |
| CI_STATUS       | **BLOCKED_GITHUB_BILLING_SPENDING_LIMIT** |

## STOP

Not APPROVED. No merge. No Reservations/Marketplace implementation.
