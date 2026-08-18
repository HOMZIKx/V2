# Rollback (current P4 applications)

## Identify last known good SHA

1. GitHub PR #19 commit that had green Quality gates + Secret scan.
2. Zeabur deploy history per APP (image / Git SHA).
3. Running `gitCommitSha` from `GET https://v2-api.zeabur.app/health/live`
   and discord-gateway `/health/live` or `/version`.

`MATCH` / `MISMATCH` / `UNKNOWN` come from `V2_EXPECTED_SHA` vs running SHA
(`pnpm runtime:doctor` with `V2_SMOKE_*` set).

## Redeploy that SHA

Zeabur → each APP → deploy the **same Git SHA**. Set `GIT_COMMIT_SHA` to that
SHA on every APP before or during the deploy. Rebuild Admin/WWW so
`VITE_API_BASE_URL` / `NEXT_PUBLIC_*` still point at production API.

Order: authorization → identity → activity → api-gateway → discord-gateway →
admin → web.

## Database migrations

Current identity/authorization/activity migrations are **forward-only**,
checksum-tracked, and applied in a transaction per file.

**Do not promise DB rollback.** If a release added a migration, rolling the
APP back to an older SHA can crash on missing columns. In that case keep the
database, roll forward with a fix, or restore from backup into a new database
(see `BACKUP_RESTORE.md`).

## Mixed revisions

Symptoms: Admin SHA ≠ API `gitCommitSha`; Discord hub renderer/fields disagree
with activity-service; 404/validation on new fields.

Fix: redeploy **all** APPs to one SHA. Discord-gateway stale → Hub may stay on
an old message until reconcile (in-place, no second Hub).

## Discord-gateway stale

Redeploy discord-gateway, confirm `/health/discord` `state: ready`, then Admin
→ Reconcile Hub. Duplicate Hub is a defect; report it rather than posting a
new panel.
