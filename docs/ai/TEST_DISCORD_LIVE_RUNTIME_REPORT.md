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
| **Partial proof** | discord-gateway @ tip `8306f3e`; Hub Centrum visible (PNG, single panel) |
| **Hard blockers for VERIFIED** | api-gateway ready **503** after upstream URL fix; LFG/profile/DM not proven |

---

## Running revision (verified 2026-09-01)

| Service | `gitCommitSha` / probe | State |
| ------- | ---------------------- | ----- |
| **discord-gateway** | `8306f3e…` @ `v22.zeabur.app` | live/ready/discord **PASS** |
| **activity-service** | Zeabur RUNNING; boot clean; **`ACTIVITY_ENABLED=true`** | listens **:8080**; api-gateway probe **unhealthy** |
| **identity-service** | Zeabur RUNNING; boot clean; `authEnabled: true` | listens **:8080**; api-gateway probe **unhealthy** |
| **api-gateway** | `7e30b4d…` @ `v2-api.zeabur.app` | live **200**; ready **503** (`activity` + `identity` unhealthy) |

---

## Discord target

| Field | Value |
| ----- | ----- |
| GUILD_ID | `1534228693017432124` |
| HUB_CHANNEL_ID | `1534228693449179146` |
| HUB_MESSAGE_ID | `1544034743614570589` |
| Hub UI | **PASS** — V2 Centrum shell, PNG, single panel |

---

## Runtime diagnosis (2026-09-01)

1. **Not** an Identity INTERNAL_JWT boot crash — both services start cleanly.
2. **`ACTIVITY_ENABLED=true`** already set on activity-service (no flip needed).
3. **api-gateway upstream URLs** were likely stale (`:4400` vs live **`:8080`**). Applied fix via `tools/scripts/zeabur-fix-api-gateway-upstream.mjs` — keys `ACTIVITY_SERVICE_BASE_URL`, `IDENTITY_SERVICE_BASE_URL` → internal service DNS **:8080** + restart.
4. **After fix:** `/health/ready` still **503** — likely upstream `/health/ready` returns **503** (database / redis / migrations checks) or api-gateway pod has not fully recycled. Owner: confirm ready response bodies in Zeabur console for activity + identity.

---

## HUB / LFG / profile

| Check | Result |
| ----- | ------ |
| Hub visible | **PASS** |
| LFG / profile / DM | **NOT VERIFIED** — gateway ready not green |

---

## Owner next action

1. Zeabur console → **activity-service** + **identity-service** → curl/log **`GET /health/ready`** — inspect `checks` (database, redis, migrations).
2. Redeploy **api-gateway** to tip if env restart did not recycle pod.
3. Re-smoke LFG/profile when ready **200**.
