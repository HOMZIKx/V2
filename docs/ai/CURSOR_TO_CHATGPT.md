# Cursor to ChatGPT handoff

## Continuous handoff snapshot

| Field                             | Value                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| **CURRENT_STAGE**                 | 3 — V2 Hub Core (discovery gate) + product blocker hotfix  |
| **CURRENT_TASK**                  | `V2-ADMIN-DISCORD-GUILD-INVENTORY-503-ROOT-CAUSE-FIX-001`  |
| **FINAL_STATUS**                  | `IN_PROGRESS` (hotfix); P4.6 still `READY_FOR_CHATGPT_P4_6_ASYNC_AUDIT` |
| **CURRENT_HEAD**                  | _(pending after commit)_                                   |
| **PR**                            | #19                                                        |
| **P4_0_EFFECTIVE_CHECKPOINT_SHA** | `2fd4635c3b0aca118a3554e3439acc089558f3d9`                 |
| **P4_5_PLAN_CHECKPOINT_SHA**      | `8834559e38f5d55160eb5de8510420651b26b829`                 |
| **P4_5_FINAL_CHECKPOINT_SHA**     | `e3c694fcc3980cd309843cac2c42c346083c8cb1`                 |
| **P4_6_FINAL_CHECKPOINT_SHA**     | `6d80ea7716b439ec6827141707a6bf7ec5974147`                 |
| **OPEN_CRITICAL**                 | 1 (Admin guild inventory until LIVE PASS)                  |
| **OPEN_HIGH**                     | 0                                                          |
| **BANNER_STATUS**                 | OWNER_ASSET_REQUIRED                                       |
| **ACTION_EMOJI_STATUS**           | OWNER_ASSET_UPLOAD_REQUIRED                                |

## Issue #26

OWNER AMENDMENT continuous execution (2026-08-20). ChatGPT audits async.

## AUDIT_QUEUE

- P4.0 visual delta @ `2fd4635c3b0aca118a3554e3439acc089558f3d9`
- P4.5 plan @ `8834559e38f5d55160eb5de8510420651b26b829`
- P4.5 final @ `e3c694fcc3980cd309843cac2c42c346083c8cb1`
- P4.6 final @ `6d80ea7716b439ec6827141707a6bf7ec5974147`

## Hotfix — Admin guild inventory 503

**Observed:** Admin `CONFIG_INVALID · HTTP 503` / „Nie udało się pobrać serwerów z Discorda.” while coarse diagnostics looked green.

**Verified:**

- Public Discord metadata `GET /internal/activity/v1/guilds` + matching projection secret → **200**, 1 guild (bot can be `degraded` and still serve cache).
- `ACTIVITY_PROJECTION_SHARED_SECRET` hash match activity↔discord.
- Authz inbound kid/public key fingerprint match activity private key.
- Activity Discord base URL was `http://service-<discord-id>:8080`; API Discord probe already used `http://discord-gateway.zeabur.internal:8080`.
- Tip activity Docker build failed: missing `@v2/messaging` in `Dockerfile.activity-service` (kept Zeabur on old `955fa8…`).

**Fix (this PR tip):**

- Align Zeabur `ACTIVITY_DISCORD_*` URLs to `discord-gateway.zeabur.internal:8080`.
- Classify inventory failures (`CONFIGURATION_INVALID`, `DISCORD_GATEWAY_UNAVAILABLE`, `DISCORD_METADATA_UNAVAILABLE`, `AUTHORIZATION_UNAVAILABLE`).
- Admin diagnostics: Discord Gateway / Bot / Activity→Discord / Authorization / Lista serwerów (no inference).
- Dockerfile activity + discord-gateway include `@v2/messaging`.

Live guild inventory PASS still required after redeploy + Owner Discord login.
