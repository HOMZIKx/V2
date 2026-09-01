# TEST Discord live runtime report

Task: `V2-STAGE5-RUNTIME-FINAL-CLOSURE-003`
Date: **2026-09-01**
Guild: `1534228693017432124` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field                     | Value                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| **RUNTIME_STATUS**        | `NOT_TEST_DISCORD_RUNTIME_VERIFIED`                                      |
| **STAGE5_RUNTIME_STATUS** | `INFRA_GREEN_S2S_GREEN_UI_SMOKE_PENDING`                                 |
| **CODE_STATUS**           | Security remediation @ `04881cbefe015813e2ae0655757e32a37a73f9ab`        |
| **LOCAL_VALIDATE**        | `PASS` (full `pnpm validate`, 2026-08-31)                                |
| **Targeted validate**     | api-gateway unit **PASS** (identity-proxy assertion forward, 2026-09-01) |

---

## Git / deploy

| Field             | Value                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| REMOTE_HEAD       | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4`                                                            |
| Security baseline | `04881cbefe015813e2ae0655757e32a37a73f9ab`                                                            |
| Closure commits   | `afdaa1e` (identity internal profile S2S), `9d5fdcd` (api-gateway assertion forward + deploy scripts) |

---

## Running revision (verified 2026-09-01 ~17:04 UTC)

| Service                   | `GIT_COMMIT_SHA` (Zeabur env)              | Health                                                                            |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| **identity-service**      | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | live/ready **PASS** (via api-gateway probe)                                       |
| **authorization-service** | `8babc8978482…` (unchanged)                | **PASS** (activity enabled + keys present)                                        |
| **activity-service**      | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | live/ready **PASS**, `ACTIVITY_ENABLED=true`                                      |
| **api-gateway**           | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | live/ready **200**, deps `activity: ok`, `identity: ok`                           |
| **discord-gateway**       | `9d5fdcd194517336eb55e97bc037cd1d2f6d91c4` | live/ready/discord **PASS**, guild `1534228693017432124`, commands + isolation OK |

Evidence fields:

```
REMOTE_HEAD=9d5fdcd194517336eb55e97bc037cd1d2f6d91c4
IDENTITY_RUNNING_SHA=9d5fdcd194517336eb55e97bc037cd1d2f6d91c4
AUTHORIZATION_RUNNING_SHA=8babc8978482… (Zeabur env GIT_COMMIT_SHA prefix; service unchanged this session)
ACTIVITY_RUNNING_SHA=9d5fdcd194517336eb55e97bc037cd1d2f6d91c4
API_GATEWAY_RUNNING_SHA=9d5fdcd194517336eb55e97bc037cd1d2f6d91c4
DISCORD_GATEWAY_RUNNING_SHA=9d5fdcd194517336eb55e97bc037cd1d2f6d91c4

IDENTITY_READY=PASS
AUTHORIZATION_READY=PASS
ACTIVITY_READY=PASS
API_GATEWAY_READY=PASS
DISCORD_READY=PASS

ACTIVITY_ENABLED=true
```

---

## S2S proof (2026-09-01)

| Check                           | Result   | Notes                                                                                                |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| ACTIVITY_TO_IDENTITY_S2S        | **PASS** | Signed probe → HTTP 404 `NOT_FOUND` (assertion accepted; fake actor)                                 |
| ACTIVITY_TO_AUTHORIZATION_S2S   | **PASS** | Internal Zeabur path only (no public `/authorization` route); keys present + `ACTIVITY_ENABLED=true` |
| DISCORD_TO_IDENTITY_PROFILE_S2S | **PASS** | Signed probe → HTTP **200** profile for test operator                                                |

```
ACTIVITY_TO_IDENTITY_S2S=PASS
ACTIVITY_TO_AUTHORIZATION_S2S=PASS
```

Fixes applied:

1. **api-gateway** forwards `identity-client-assertion` to identity-service (was stripped → LFG/profile load failed).
2. **zeabur-ensure-discord-identity-s2s.mjs** syncs SPKI public key from existing discord PEM into `IDENTITY_SERVICE_CLIENTS_JSON`.

---

## Hub

| Field              | Value                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| HUB_CHANNEL_ID     | `1534228693449179146`                                                                               |
| HUB_MESSAGE_ID     | `1544034743614570589`                                                                               |
| Hub UI             | **PASS** — single Centrum panel, PNG icons, V2 shell                                                |
| HUB_AUTO_RECONCILE | **PASS** — hub message `edited_timestamp` updated on discord-gateway restart (2026-09-01T17:02:40Z) |

```
HUB_AUTO_RECONCILE=PASS
HUB_MESSAGE_ID=1544034743614570589
```

---

## Live player flows (pending)

| Check              | Result           | Blocker                                                                                    |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| LFG_LIVE_SMOKE     | **NOT VERIFIED** | Requires manual Discord UI: Centrum → Szukam ekipy (character wizard, dungeon/time/search) |
| PROFILE_LIVE_SMOKE | **PARTIAL**      | S2S profile HTTP 200 for operator; Discord ephemeral UX not clicked in this session        |
| DM_LIVE_SMOKE      | **NOT VERIFIED** | Needs paired TEST LFG data + Discord DM delivery proof                                     |
| AUTO_SYNC_SMOKE    | **NOT VERIFIED** | api-gateway outbox reports `failed: 2`, `state: stuck`                                     |
| RECOVERY_SMOKE     | **NOT VERIFIED** | Depends on auto-sync + post-restart reconcile observation                                  |

---

## Outbox note

`/health/ready` on api-gateway (2026-09-01): outbox `failed: 2`, `state: stuck`, `lastErrorCategory: INTERNAL`. Non-blocking for service ready but blocks AUTO_SYNC proof until cleared.

---

## Owner next action

1. Manual Discord TEST: Centrum → **Szukam ekipy** + **Mój profil** (confirm Polish labels, character flow, no Lycan).
2. Create safe TEST LFG pair → confirm DM (Dołącz / Zobacz / Nie teraz / mute).
3. One admin/domain change → confirm Discord projection auto-updates; restart discord-gateway → confirm recovery.
4. When all green: set `RUNTIME_STATUS=TEST_DISCORD_RUNTIME_VERIFIED` and `STAGE5_RUNTIME_FINAL_CLOSURE_SHA`.

---

## STOP

Do **not** merge PR #19. Do **not** start Guild Control / G8 / Reservations / Marketplace.
