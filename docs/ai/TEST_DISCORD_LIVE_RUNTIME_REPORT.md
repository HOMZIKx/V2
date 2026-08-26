# TEST Discord — Live Runtime Report

Task: `V2-TEST-DISCORD-LIVE-DEPLOY-AND-VISIBILITY-001`  
Related remediation: `V2-CHATGPT-INTEGRATED-REVIEW-REMEDIATION-001`  
Guild: `1534228693017432124` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field              | Value                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **RUNTIME_STATUS** | `NOT_TEST_DISCORD_RUNTIME_VERIFIED`                                                                                                  |
| **CODE_STATUS**    | `READY_FOR_CHATGPT_REAUDIT` (independent)                                                                                            |
| **Partial proof**  | `discord-gateway` live SHA = tip; bot `ready`; commands registered                                                                   |
| **Hard blockers**  | (1) `ACTIVITY_ENABLED=false` → hub reconcile **403**; (2) Discord Web login for UI smoke; (3) missing Activity→Identity S2S env keys |

---

## Git / deploy

| Field                                     | Value                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| REMOTE_HEAD / tip                         | `debd87ef41f93f2fdeae446de94afbafc5bf128d`                   |
| CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA | `24ca822dcb4af77569074dba955f790d80cf0836`                   |
| BRANCH                                    | `cursor/p4-1-activity-domain`                                |
| PR                                        | #19 — **do not merge**                                       |
| Zeabur redeploy (2026-08-26)              | `activity-service` + `discord-gateway` upload deploy RUNNING |

---

## Running revision (verified 2026-08-26)

| Service                          | URL / source                                                | `gitCommitSha`                                 | State                                                                     |
| -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| **DISCORD_GATEWAY_RUNNING_SHA**  | `https://v22.zeabur.app/health/live`                        | `debd87ef41f93f2fdeae446de94afbafc5bf128d`     | **MATCH tip**                                                             |
| discord-gateway ready            | `/health/ready`                                             | —                                              | `ok`, `discordState: ready`                                               |
| discord bot                      | `/health/discord`                                           | same tip                                       | `ready`, `guildId` match, `commandsRegistered: true`, `isolationOk: true` |
| **ACTIVITY_SERVICE_RUNNING_SHA** | Zeabur deploy `6a8f191b…` + env `GIT_COMMIT_SHA` set to tip | tip via env (upload build has empty commitSHA) | RUNNING; log: `activityEnabled:false`                                     |
| api-gateway                      | `https://v2-api.zeabur.app/health/live`                     | `2c2b3e9…` **STALE**                           | live ok; dockerfile sync **Permission denied**                            |
| api-gateway ready                | `/health/ready`                                             | —                                              | **503**                                                                   |

---

## Discord target

| Field                | Value                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| GUILD_ID             | `1534228693017432124`                                                                           |
| HUB_CHANNEL_ID       | `1534228693449179146` (startup reconcile used this channel)                                     |
| HUB_MESSAGE_ID       | **UNCONFIRMED** — auto-reconcile failed before publish/edit                                     |
| COMMAND_REGISTRATION | **PASS** (`commandsRegistered: true` on `/health/discord`; log: guild commands auto-registered) |

---

## Health / migrations

| Check                              | Result                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| discord-gateway live/ready/discord | PASS                                                                                        |
| activity-service boot              | PASS (`Activity Service started`, outbox worker started)                                    |
| activity product mode              | **FAIL for product** — `ACTIVITY_ENABLED=false`                                             |
| MIGRATION_STATE                    | Not separately probed; service booted (implies migrations applied or not required at start) |
| api-gateway ready                  | FAIL 503                                                                                    |

---

## HUB_AUTO_RECONCILE

| Check                                 | Result                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Attempted on startup                  | **YES** (auto, no manual `/sync`)                                                                                           |
| Outcome                               | **FAIL**                                                                                                                    |
| Log evidence                          | `Startup hub reconcile failed; use /centrum-reconcile if the panel looks stale` — `Activity service rejected request (403)` |
| activity-service contemporaneous logs | multiple `FORBIDDEN` / `request_failed`                                                                                     |
| Root cause (honest)                   | Production fail-closed authorize stub while `ACTIVITY_ENABLED=false`                                                        |

**Status:** `FAILED` — runtime must not depend on manual reconcile, but auto path currently cannot succeed until Activity is fully enabled.

---

## LFG_LIVE_SMOKE / DM / AUTO_SYNC

| Smoke                                                | Result                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| LFG_LIVE_SMOKE (Centrum → Aktywności → Szukam ekipy) | **NOT VERIFIED** — Discord Web login wall + hub reconcile broken |
| DM_LIVE_SMOKE                                        | **NOT VERIFIED**                                                 |
| AUTO_SYNC_SMOKE                                      | **FAILED** (see hub reconcile)                                   |
| Mój profil / Dla mnie / Moje / Powiadomienia         | **NOT VERIFIED**                                                 |

---

## Activity enablement gap (OWNER_ACTION_REQUIRED)

`activity-service` env **keys present** include authz, redis, inbound clients, discord projection secret.  
**Missing keys required for `ACTIVITY_ENABLED=true`:**

- `ACTIVITY_IDENTITY_BASE_URL`
- `ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD`
- `ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM`
- `ACTIVITY_TO_IDENTITY_ACTIVE_KID`

Also: two malformed env **key names** look like accidental PEM fragments (should be deleted by Owner).

Until Identity S2S vars are set and `ACTIVITY_ENABLED=true` redeployed, Centrum/LFG product paths stay fail-closed (403).

---

## Owner / operator actions to close runtime gap

1. **Activity Identity S2S:** add the four missing `ACTIVITY_*IDENTITY*` variables; remove accidental PEM-as-key entries; set `ACTIVITY_ENABLED=true`; redeploy `activity-service`.
2. Confirm hub auto-reconcile log: `Startup hub reconcile completed` with `messageId`.
3. Log into Discord Web on guild `1534228693017432124` and click Centrum → LFG / profile sections; record `HUB_MESSAGE_ID`.
4. Redeploy `api-gateway` (Owner permission for Dockerfile sync / variables) so rate-limit trust fix + ready probe catch tip SHA.
5. Re-check `https://v22.zeabur.app/health/live` still matches tip after next push.

---

## Validation (code — separate from runtime)

| Check                    | Result                      |
| ------------------------ | --------------------------- |
| `corepack pnpm validate` | **PASS** (at remediation)   |
| Targeted security specs  | **PASS**                    |
| CRITICAL / HIGH (code)   | **0 / 0** after remediation |

---

## Last updated

2026-08-26 — tip redeploy verified; hub reconcile 403 + Discord UI login still block `TEST_DISCORD_RUNTIME_VERIFIED`.
