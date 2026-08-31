# TEST Discord live runtime report

Task: `V2-RUNTIME-SECURITY-BOUNDARY-REMEDIATION-002`
Date: **2026-08-31**
Related: prior integrated review remediation, hub PNG paint
Guild: `1534228693017432124` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field | Value |
| ----- | ----- |
| **RUNTIME_STATUS** | `NOT_TEST_DISCORD_RUNTIME_VERIFIED` |
| **CODE_STATUS** | Security remediation committed @ `04881cbefe015813e2ae0655757e32a37a73f9ab` |
| **LOCAL_VALIDATE** | `PASS` (full `pnpm validate`, 2026-08-31) |
| **Security CRITICAL/HIGH** | **0 / 0** |
| **Partial proof (pre-tip deploy)** | discord-gateway live @ `cbd67aa` — bot ready, commands registered, health ok |
| **Hard blockers for VERIFIED** | Tip SHA not yet on Zeabur; full Hub+LFG/profile smoke not re-proven after remediation |

---

## Git / deploy

| Field | Value |
| ----- | ----- |
| BRANCH | `cursor/p4-1-activity-domain` |
| PR | #19 — **do not merge** |
| RUNTIME_SECURITY_BOUNDARY_REMEDIATION_SHA | `04881cbefe015813e2ae0655757e32a37a73f9ab` |
| REMOTE tip (at report write) | push pending / see post-deploy section |
| Pre-deploy DISCORD_GATEWAY_RUNNING_SHA | `cbd67aaf996d7920a7cc6bb36bc29e6ff9e34beb` |

---

## Running revision (verified 2026-08-31 pre-redeploy)

| Service | URL / source | `gitCommitSha` | State |
| ------- | ------------ | ---------------- | ----- |
| **DISCORD_GATEWAY_RUNNING_SHA** | `https://v22.zeabur.app/health/live` | `cbd67aaf996d7920a7cc6bb36bc29e6ff9e34beb` | live/ready/discord **PASS**; **not** remediation tip |
| discord bot | `/health/discord` | same | `ready`, guild match, `commandsRegistered: true`, `isolationOk: true` |
| **ACTIVITY_SERVICE_RUNNING_SHA** | pending tip redeploy | _(update post-deploy)_ | Identity S2S configured in prior work; `ACTIVITY_ENABLED` enable **after** identity+activity healthy on tip |
| Security bypasses | code @ remediation SHA | AllowAll / PassThrough **removed** in source | must be live after redeploy |

---

## Discord target

| Field | Value |
| ----- | ----- |
| GUILD_ID | `1534228693017432124` |
| HUB_CHANNEL_ID | `1534228693449179146` |
| HUB_MESSAGE_ID | `1544034743614570589` (from prior startup direct-paint log; **reconfirm after tip redeploy**) |
| COMMAND_REGISTRATION | **PASS** on pre-tip live |

---

## Security boundary (code)

| Item | Status |
| ---- | ------ |
| Production Authz AllowAll | **REMOVED** (fail-closed) |
| Production Identity PassThrough | **REMOVED** (requires S2S) |
| Hub projection inbound op | `activity_hub_projection` + Activity endpoints |
| Product/LFG without real Authz/Identity | **fail-closed** |

---

## HUB / LFG / profile (post-deploy — fill after tip live)

| Check | Result |
| ----- | ------ |
| Hub visible (single Centrum, PNG) | **PENDING** tip redeploy |
| Hub reconcile / direct paint | **PENDING** |
| Duplicate Centrum | **PENDING** |
| LFG / profile / DM smokes | **NOT VERIFIED** this pass |

---

## Post-deploy evidence

_(Updated in follow-up docs commit after Zeabur tip deploy + optional `ACTIVITY_ENABLED=true`.)_

| Field | Value |
| ----- | ----- |
| ACTIVITY_ENABLED | _(pending)_ |
| identity / activity / discord live SHAs | _(pending)_ |
| Hub message id confirmed | _(pending)_ |
| RUNTIME_STATUS | remains `NOT_TEST_DISCORD_RUNTIME_VERIFIED` until Hub visible + reconcile proven on tip |
