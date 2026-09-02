# CURSOR → ChatGPT

## Status

**MODE:** `V2-RUNTIME-DEPLOY-SAFETY-AND-MIGRATION-HARDENING-006B`  
**RESULT:** technical control shipped — Owner acceptance 005/006 still **PENDING**  
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Branch: `cursor/p4-1-activity-domain` · PR **#19** — do not merge

## Incident closed (technical)

| Field             | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Class             | `MISSING_PROD_MIGRATION_ON_DEPLOY`                                                                      |
| Root cause        | Tip image had SQL migrations; prod DB lagged; service started without migrate → ready FAIL → API 503    |
| Permanent control | Docker `scripts/docker-entrypoint.mjs` runs `migrate-prod` before listen (identity / authz / activity)  |
| Locking           | `pg_advisory_lock(872014, {1\|2\|3})` serializes concurrent migrators                                   |
| Recovery          | Prefer redeploy (entrypoint). Manual `migrate-prod` = recovery only. See `docs/ops/INCIDENT_RUNBOOK.md` |

## Localhost / production bundles

| Surface                      | Classification                       | Action                                    |
| ---------------------------- | ------------------------------------ | ----------------------------------------- |
| Admin `getApiBaseUrl`        | was PRODUCTION_ACTIVE fallback risk  | DEV-only fallback; prod throws if unset   |
| Web `env.ts` / middleware    | PRODUCTION_ACTIVE risk if missing    | fail-closed empty / no localhost in prod  |
| Remaining bundle `localhost` | loopback hostname helpers / auth URL | DEV_ONLY / BUILD_TIME_DEAD — not API base |

## Gates

| Gate                   | Result                                       |
| ---------------------- | -------------------------------------------- |
| `pnpm validate` (full) | **PASS**                                     |
| Migration matrix A–G   | **PASS** (identity infra integration)        |
| GitHub Actions         | **UNVERIFIED** (private repo / no `gh` auth) |

## Owner acceptance

| Task       | Code | Runtime | Owner       |
| ---------- | ---- | ------- | ----------- |
| 005 Admin  | PASS | PASS    | **PENDING** |
| 006 Player | PASS | PASS    | **PENDING** |

## STOP

No Task 007 / Player Toolkit start. No PR #19 merge. No competing WWW redesign (D-050).
