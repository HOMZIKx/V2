# TEST Discord live runtime report

Task: `V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002`
Date: **2026-09-01**
Guild: `1534228693017432124` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field | Value |
| ----- | ----- |
| **RUNTIME_STATUS** | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` |
| **CODE_STATUS** | Security remediation @ `04881cbefe015813e2ae0655757e32a37a73f9ab` |
| **LOCAL_VALIDATE** | `PASS` (full `pnpm validate`, 2026-08-31) |
| **Security CRITICAL/HIGH** | **0 / 0** |
| **Partial proof** | discord-gateway @ tip `8306f3e`; Hub Centrum visible (PNG, single panel, Owner screenshot 2026-09-01) |
| **Hard blockers for VERIFIED** | api-gateway ready **503** (`activity` + `identity` unhealthy); LFG/profile/DM smokes not proven |

---

## Git / deploy

| Field | Value |
| ----- | ----- |
| BRANCH | `cursor/p4-1-activity-domain` |
| PR | #19 — **do not merge** |
| RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA | `04881cbefe015813e2ae0655757e32a37a73f9ab` |
| Docs tip | `8306f3e17591622922510804b1098b713b76b8d6` |

---

## Running revision (verified 2026-09-01)

| Service | URL / source | `gitCommitSha` | State |
| ------- | ------------ | ---------------- | ----- |
| **DISCORD_GATEWAY_RUNNING_SHA** | `https://v22.zeabur.app/health/live` | `8306f3e17591622922510804b1098b713b76b8d6` | **MATCH docs tip**; live/ready/discord **PASS** |
| discord bot | `/health/discord` | same | `ready`, guild match, `commandsRegistered: true`, `panelRenderer: components-v2-container` |
| **api-gateway** | `https://v2-api.zeabur.app/health/live` | `7e30b4da4e812d14ad8abbb5016382c2edd291a8` | live ok; **STALE** vs branch tip |
| api-gateway ready | `/health/ready` | — | **503** — `activity: unhealthy`, `identity: unhealthy` |
| **activity-service** | api-gateway ready probe | _(private)_ | **unhealthy** |
| **identity-service** | api-gateway ready probe | _(private)_ | **unhealthy** |

---

## Discord target

| Field | Value |
| ----- | ----- |
| GUILD_ID | `1534228693017432124` |
| HUB_CHANNEL_ID | `1534228693449179146` |
| HUB_MESSAGE_ID | `1544034743614570589` (prior paint; panel **(edytowane)** on live — Owner visual confirm 2026-09-01) |
| COMMAND_REGISTRATION | **PASS** |
| Hub UI | **PASS** — V2 Centrum shell, PNG icon, select menu, no stale „Mapa V2” |

---

## Security boundary (live-relevant)

| Item | Status |
| ---- | ------ |
| Production Authz AllowAll | **REMOVED** in code @ remediation SHA |
| Production Identity PassThrough | **REMOVED** in code @ remediation SHA |
| Hub projection inbound op | `activity_hub_projection` configured |
| Product/LFG without real Authz/Identity | **fail-closed** (expected until `ACTIVITY_ENABLED=true` + healthy S2S) |

---

## HUB / LFG / profile

| Check | Result |
| ----- | ------ |
| Hub visible (single Centrum, PNG) | **PASS** (Owner screenshot + gateway @ tip) |
| Hub reconcile / direct paint | **PARTIAL** — panel present; startup reconcile not log-verified this pass |
| Duplicate Centrum | **PASS** (single message observed) |
| LFG / profile / DM smokes | **NOT VERIFIED** — activity/identity unhealthy blocks product paths |
| Mój profil / Szukam ekipy clicks | **NOT VERIFIED** this pass |

---

## Post-deploy evidence

| Field | Value |
| ----- | ----- |
| ACTIVITY_ENABLED | _(pending identity/activity healthy — do not claim true without probe)_ |
| Identity S2S env | configured in prior Zeabur session; services not yet passing ready |
| RUNTIME_STATUS | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` — Hub shell only; product stack unhealthy |

---

## Owner / operator next actions

1. Restore **identity-service** + **activity-service** to healthy (boot logs — likely INTERNAL_JWT / env load).
2. Redeploy **api-gateway** to tip when Owner can sync Dockerfile.
3. After S2S proof: `ACTIVITY_ENABLED=true` + redeploy activity; re-smoke LFG/profile/DM.
4. Only then set `RUNTIME_STATUS=TEST_DISCORD_RUNTIME_VERIFIED`.
