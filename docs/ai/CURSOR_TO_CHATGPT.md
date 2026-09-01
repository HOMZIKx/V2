# CURSOR → ChatGPT

## Status

**MODE:** Task 004 checkpoint — `READY_FOR_OWNER_LIVE_ACCEPTANCE`
Product / merge: **`NOT_APPROVED`** · **`NOT_MERGED`**

Task: `V2-CURRENT-PRODUCT-LIVE-ACCEPTANCE-AND-REPAIR-004`
Branch: `cursor/p4-1-activity-domain`
PR: **#19** — do not merge
Tip: see `CURRENT_PRODUCT_LIVE_ACCEPTANCE_SHA`

---

## This session (2026-09-01 ~22:45 UTC+2)

### Delivered

| Area         | Result                                                  |
| ------------ | ------------------------------------------------------- |
| CI infra     | DB isolation readiness + timeout (`84ba31c`)            |
| CI quality   | Identity authz tests + coverage ≥62% + eslint fixes     |
| Web deploy   | hub-core in Docker; all member routes 200               |
| WWW LFG      | `NEXT_PUBLIC_ACTIVITY_ORGANIZATION_ID` + Dockerfile ARG |
| Runtime core | OUTBOX=0, AUTO_SYNC, PROFILE, LFG hub, RECOVERY PASS    |
| WWW member   | Session smoke all 6 routes with data/empty states       |
| Zeabur       | Full stack redeploy via `zeabur-sync-and-deploy.mjs`    |

### Owner-only remaining

| Gate             | Action                                                                     |
| ---------------- | -------------------------------------------------------------------------- |
| DM_LIVE_SMOKE    | PanaPas3k LFG watch + KurczakAp published Azrael party → verify DM buttons |
| ADMIN cold OAuth | Fresh Discord login → auto authz link (no manual repair)                   |

### Validate

Local `corepack pnpm validate` — **all gates PASS except `VERSION_DRIFT`** (api-gateway health SHA `9d5fdcd` vs repo tip until api-gateway image rebuild completes).

### Zeabur GitHub deploy

`.github/workflows/zeabur-deploy.yml` is **blocked by external configuration**: GitHub Actions secret `ZEABUR_TOKEN` is empty/missing. No insecure workarounds; local `zeabur-sync-and-deploy.mjs` remains the supported manual path until Owner adds the secret in repo settings.

---

## STOP

No Guild Control · No merge of PR #19
