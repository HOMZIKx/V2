# TEST Discord — Live Runtime Report

Task: `V2-TEST-DISCORD-LIVE-DEPLOY-AND-VISIBILITY-001`  
Related remediation: `V2-CHATGPT-INTEGRATED-REVIEW-REMEDIATION-001`  
Guild: `1534228693017432124` (TEST Discord)

**No secrets in this document.**

---

## Summary

| Field              | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **RUNTIME_STATUS** | `NOT_TEST_DISCORD_RUNTIME_VERIFIED`                                                                |
| **Blocker**        | Discord Web UI login required for interactive LFG/menu smoke; automation session not authenticated |
| **Partial proof**  | `discord-gateway` public health `ready` on target guild; deploy smoke after upload redeploy        |

---

## Git / deploy

| Field                              | Value                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| REMOTE_HEAD (pre-remediation push) | `c4e8d0f7429db178bb3cc2b1516c44a67c96284a`                                                    |
| REMEDIATION_COMMIT                 | _(pinned after push — see `CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA` in `PROJECT_STATE.md`)_ |
| BRANCH                             | `cursor/p4-1-activity-domain`                                                                 |
| PR                                 | #19 — **do not merge**                                                                        |

---

## Running revision (Zeabur public health — snapshot before remediation SHA deploy)

| Service               | URL                                      | `gitCommitSha`                             | State                                          |
| --------------------- | ---------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| api-gateway           | `https://v2-api.zeabur.app/health/live`  | `2c2b3e972c9177b7a157ed1d4ddc9dba96bff859` | `ok` (live)                                    |
| api-gateway ready     | `https://v2-api.zeabur.app/health/ready` | —                                          | **503** (activity upstream unhealthy in probe) |
| discord-gateway       | `https://v22.zeabur.app/health/live`     | `8babc89784820c6fab9b627ce8425049abf52819` | `ok`                                           |
| discord-gateway ready | `https://v22.zeabur.app/health/ready`    | —                                          | `ok`, `discordState: ready`                    |
| activity-service      | internal only                            | `upload` (OCI deploy label)                | RUNNING per Zeabur deploy script               |

**SHA note:** Live health SHAs above predate **`CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`**. Post-push redeploy of `activity-service` + `discord-gateway` required; re-check health after build completes.

---

## Discord target

| Field                | Value                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GUILD_ID             | `1534228693017432124`                                                                                              |
| HUB_CHANNEL_ID       | `1534228693449179146` (configured hub channel; from gateway tooling defaults)                                      |
| HUB_MESSAGE_ID       | **UNCONFIRMED LIVE** — historical artifact `1534482713606881381` shows legacy LAB panel, not verified at this pass |
| COMMAND_REGISTRATION | Not re-verified live this pass (bot `ready` only)                                                                  |

---

## Health

| Check                           | Result                                                 |
| ------------------------------- | ------------------------------------------------------ |
| discord-gateway `/health/live`  | PASS                                                   |
| discord-gateway `/health/ready` | PASS (`discordEnabled: true`, `discordState: ready`)   |
| api-gateway `/health/live`      | PASS                                                   |
| api-gateway `/health/ready`     | FAIL 503                                               |
| activity-service migrations     | Not probed externally (internal); prior deploy RUNNING |

---

## HUB_AUTO_RECONCILE

| Check                                  | Result                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Startup reconcile code path            | Present (`hub-startup-reconcile.ts`, wired in bootstrap)                             |
| Live log proof this pass               | **NOT CAPTURED** — Zeabur runtime log API token path unavailable in automation shell |
| Manual `/centrum-reconcile` dependency | **Must not be required** — not used in this pass                                     |

**Status:** `UNVERIFIED` — bot ready implies gateway up; Centrum message content and auto-reconcile success not proven without Discord UI or operator token log scrape.

---

## LFG_LIVE_SMOKE

| Step                           | Result                                    |
| ------------------------------ | ----------------------------------------- |
| V2 Centrum visible on channel  | **NOT VERIFIED** — Discord Web login wall |
| Aktywności → Szukam ekipy flow | **NOT VERIFIED**                          |
| Ephemeral / DM feedback        | **NOT VERIFIED**                          |

---

## DM_LIVE_SMOKE

| Step                          | Result           |
| ----------------------------- | ---------------- |
| LFG match / intent DM buttons | **NOT VERIFIED** |

---

## AUTO_SYNC_SMOKE

| Step                                                     | Result           |
| -------------------------------------------------------- | ---------------- |
| Hub updates in place after deploy without manual `/sync` | **NOT VERIFIED** |

---

## Owner / operator actions to close runtime gap

1. Log into Discord Web (or desktop) on guild `1534228693017432124`.
2. Confirm **V2 Centrum** panel in channel `1534228693449179146`; record live `HUB_MESSAGE_ID`.
3. Click **Aktywności → Szukam ekipy** and profile sections (**Mój profil**, **Dla mnie**, **Moje**, **Powiadomienia**) per foundation status.
4. After remediation push: confirm `https://v22.zeabur.app/health/live` + activity deploy SHA prefix matches `CHATGPT_INTEGRATED_REVIEW_REMEDIATION_SHA`.
5. Fix api-gateway `/health/ready` 503 (activity upstream probe) if blocking WWW/Admin flows.

---

## Validation (code — separate from runtime)

| Check                        | Result                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `corepack pnpm validate`     | **PASS** (post-remediation, local)                                           |
| Targeted security specs      | **PASS** (`rate-limit`, `guild-organization-scope`, `lfg.use-cases`)         |
| CRITICAL / HIGH (code audit) | **0 / 0** after remediation (see `FOUNDATION_ADVERSARIAL_SECURITY_AUDIT.md`) |

---

## Last updated

2026-08-24 — remediation pass; runtime UI smoke blocked on Discord authentication.
